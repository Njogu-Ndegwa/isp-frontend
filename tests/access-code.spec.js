const { test, expect } = require('@playwright/test');

const MAC = '11:22:33:44:55:66';

function portalPayload() {
    return {
        router: {
            router_id: 42,
            name: 'Test Router',
            identity: 'CODE-TEST',
            auth_method: 'DIRECT_API',
            business_name: 'Test ISP',
            payment_methods: ['mpesa', 'voucher'],
            payment_provider: 'mpesa',
            support_phone: null,
        },
        plans: [{
            id: 7,
            name: 'Family Day',
            price: 100,
            speed: '5M',
            duration_value: 1,
            duration_unit: 'days',
            connection_type: 'hotspot',
            plan_type: 'regular',
            is_hidden: false,
            max_shared_users: 3,
        }],
        ads: [],
        plan_flags: {
            has_emergency_plans: false,
            has_special_offers: false,
            emergency_mode_active: false,
            regular_plans_hidden: false,
            sharing_enabled: true,
            max_shared_users: 3,
        },
        portal_settings: {},
    };
}

async function openPortal(page, { mac = MAC } = {}) {
    await page.route('**/api/public/portal/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalPayload()),
    }));
    const query = new URLSearchParams({ router: 'CODE-TEST', gw: '10.0.0.1' });
    if (mac) query.set('mac', mac);
    await page.goto('/?' + query.toString());
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    // Keep the page in place: success paths auto-navigate to dismiss the portal.
    await page.evaluate(() => {
        window.__autoBrowseCalls = 0;
        window.scheduleAutoStartBrowsing = () => { window.__autoBrowseCalls++; };
    });
}

function json(route, status, body) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('code box redeems any code through access-code/redeem and explains sharing', async ({ page }) => {
    await openPortal(page);

    await expect(page.locator('#voucherSection')).toBeVisible();
    await expect(page.locator('.voucher-header-title')).toHaveText('Have a Voucher or access code?');
    await expect(page.locator('#voucherVerifyBtn')).toHaveText(/Connect/);

    const bodies = [];
    await page.route('**/api/public/access-code/redeem', route => {
        bodies.push(route.request().postDataJSON());
        return json(route, 200, {
            success: true,
            outcome: 'plan_started',
            message: 'ok',
            plan_name: 'Family Day',
            expires_at: '2030-01-01T10:00:00Z',
            sharing_enabled: true,
            max_devices: 3,
            access_code: '48392910',
        });
    });

    await page.fill('#voucherCodeInput', '48392910');
    await page.click('#voucherVerifyBtn');

    await expect(page.locator('#successSection')).toBeVisible();
    await expect(page.locator('#connectionDetails')).toContainText('Use this same code on up to 3 devices');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ code: '48392910', router_id: 42, mac_address: MAC });
    expect(await page.evaluate(() => window.__autoBrowseCalls)).toBe(1);
});

test('device limit panel escapes names, removes a device and retries the redeem', async ({ page }) => {
    await openPortal(page);

    const hostile = '<img src=x onerror="window.__xss=1">';
    let redeemCalls = 0;
    await page.route('**/api/public/access-code/redeem', route => {
        redeemCalls++;
        if (redeemCalls === 1) {
            return json(route, 409, {
                detail: {
                    error: 'device_limit_reached',
                    message: 'Limit reached',
                    max_devices: 2,
                    devices: [
                        { pairing_id: null, is_main_device: true, device_mac: 'AA:AA:AA:AA:AA:01', device_name: null, device_type: 'other', is_this_device: false, added_at: null },
                        { pairing_id: 91, is_main_device: false, device_mac: 'AA:AA:AA:AA:AA:02', device_name: hostile, device_type: 'tv', is_this_device: false, added_at: null },
                    ],
                },
            });
        }
        return json(route, 200, {
            success: true, outcome: 'device_added', message: 'ok',
            plan_name: 'Family Day', expires_at: '2030-01-01T10:00:00Z',
            sharing_enabled: true, max_devices: 2,
        });
    });

    const disconnectBodies = [];
    await page.route('**/api/public/access-code/disconnect', route => {
        disconnectBodies.push(route.request().postDataJSON());
        return json(route, 200, { success: true, message: 'removed', cleanup_status: 'done' });
    });

    await page.fill('#voucherCodeInput', 'abc-def');
    await page.click('#voucherVerifyBtn');

    const panel = page.locator('#voucherResult');
    await expect(panel).toContainText('Device limit reached');
    await expect(panel.locator('.device-my-card')).toHaveCount(2);
    await expect(panel.locator('.device-my-card').first()).toContainText('Main device');
    await expect(panel.locator('.device-my-card').nth(1)).toContainText(hostile);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    await panel.locator('.device-my-card').nth(1).getByRole('button', { name: /Remove/ }).click();
    await expect(page.locator('.device-confirm-msg')).toContainText('will lose internet');
    await page.locator('.device-confirm-ok').click();

    await expect(page.locator('#successSection')).toBeVisible();
    await expect(page.locator('.success-subtext')).toHaveText('Connected. This device is now sharing the plan');
    expect(disconnectBodies).toEqual([{ code: 'ABC-DEF', router_id: 42, pairing_id: 91, mac_address: MAC }]);
    expect(redeemCalls).toBe(2);
});

test('reconnect sends receipts and access codes as voucher_code, phones as phone', async ({ page }) => {
    await openPortal(page);

    const bodies = [];
    await page.route('**/api/public/reconnect', route => {
        bodies.push(route.request().postDataJSON());
        return json(route, 200, {
            success: true, outcome: 'main_device', plan_name: 'Family Day',
            expires_at: '2030-01-01T10:00:00Z', sharing_enabled: true, max_devices: 3,
        });
    });

    await expect(page.locator('#reconnectHint')).toHaveText('Enter your M-Pesa phone number or code');

    await page.fill('#reconnectInput', 'SIG7X2AB12');
    await expect(page.locator('#reconnectHint')).toContainText('Code detected');
    await page.click('#reconnectBtn');
    await expect(page.locator('#reconnectResult')).toContainText("You're back online");

    await page.fill('#reconnectInput', '0712345678');
    await page.click('#reconnectBtn');
    await expect.poll(() => bodies.length).toBe(2);

    expect(bodies[0]).toEqual({ voucher_code: 'SIG7X2AB12', mac_address: MAC, router_id: 42 });
    expect(bodies[1]).toEqual({ phone: '254712345678', mac_address: MAC, router_id: 42 });
});

test('missing MAC shows a reconnect-to-WiFi error instead of sending a fake MAC', async ({ page }) => {
    let requests = 0;
    await page.route('**/api/public/access-code/redeem', route => { requests++; return json(route, 500, {}); });
    await openPortal(page, { mac: '' });

    await page.fill('#voucherCodeInput', 'ABC-DEF');
    await page.click('#voucherVerifyBtn');
    await expect(page.locator('#voucherResult')).toContainText("couldn't identify this device");
    expect(requests).toBe(0);
});

test('payment success polls with the MAC and shows the access code card', async ({ page }) => {
    await openPortal(page);

    const statusUrls = [];
    await page.route('**/api/hotspot/payment-status/**', route => {
        statusUrls.push(route.request().url());
        return json(route, 200, {
            status: 'active', plan_name: 'Family Day', expiry: '2030-01-01T10:00:00Z',
            access_code: 'ABC-DEF', max_devices: 3,
        });
    });

    await page.evaluate(() => {
        pollPaymentStatusAndLogin(555, '0712345678', { duration: '1 day', speed: '5M', price: 'KSH 100' });
    });

    const card = page.locator('.access-code-card');
    await expect(card).toContainText('ABC-DEF');
    await expect(card).toContainText('up to 3');
    expect(new URL(statusUrls[0]).searchParams.get('mac')).toBe(MAC);
    // The code must stay on screen, so no auto-navigation.
    expect(await page.evaluate(() => window.__autoBrowseCalls)).toBe(0);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bitwave_access_code')));
    expect(saved.code).toBe('ABC-DEF');

    // Later visit: the code box is prefilled.
    await page.reload();
    await expect(page.locator('#voucherCodeInput')).toHaveValue('ABC-DEF');
});
