const { test, expect } = require('@playwright/test');

// "Paid" is not "online". The backend reports success before the router has
// added the device, so the auto "Start Browsing" must wait for the router
// delivery (payment-status delivery.delivery_status) before navigating;
// navigating early is intercepted by the hotspot and lands the customer back
// on the portal.

const MAC = '11:22:33:44:55:66';

const TRIAL = {
    id: 12, name: 'Free Taste', price: 0, speed: '2M',
    duration_value: 30, duration_unit: 'MINUTES',
    connection_type: 'hotspot', plan_type: 'free_trial', is_hidden: false,
    max_shared_users: 1, trial_once_per_customer: true,
};
const PAID = {
    id: 7, name: 'Daily', price: 50, speed: '5M',
    duration_value: 1, duration_unit: 'DAYS',
    connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
};

function json(route, status, body) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function delivery(status) {
    return { attempt_id: 55, delivery_status: status };
}

async function openPortal(page) {
    await page.route('**/api/public/portal/**', route => json(route, 200, {
        router: {
            router_id: 42, name: 'Test Router', identity: 'WAIT-TEST',
            auth_method: 'DIRECT_API', business_name: 'Test ISP',
            payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: null,
        },
        plans: [PAID, TRIAL],
        ads: [],
        plan_flags: {
            has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
            regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1,
        },
        portal_settings: {},
    }));
    await page.route(url => url.pathname.startsWith('/api/public/free-trial/42/'), route => json(route, 200, {
        success: true, router_id: 42,
        trials: [{ plan_id: 12, name: 'Free Taste', speed: '2M', duration_value: 30,
            duration_unit: 'MINUTES', trial_once_per_customer: true, eligible: true, reason: null }],
    }));
    await page.route('**/api/public/free-trial/claim', route => json(route, 200, {
        success: true, customer_id: 901, attempt_id: 55, auth_method: 'DIRECT_API',
        expiry: '2030-01-01T10:30:00Z', plan_name: 'Free Taste',
        delivery: delivery('activating'), message: 'ok',
    }));

    // Where "Start Browsing" goes; record it instead of leaving the test.
    const navigations = [];
    await page.route(url => url.hostname === 'google.com', route => {
        navigations.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>online</p>' });
    });

    const query = new URLSearchParams({ router: 'WAIT-TEST', gw: '10.0.0.1', mac: MAC });
    await page.goto('/?' + query.toString());
    await expect(page.locator('#freeTrialList .free-trial-btn')).toHaveCount(1);
    return navigations;
}

// payment-status/901 answers with each delivery status in turn (the last one repeats).
async function deliverySequence(page, statuses) {
    const seen = [];
    await page.route('**/api/hotspot/payment-status/901**', route => {
        const status = statuses[Math.min(seen.length, statuses.length - 1)];
        seen.push(status);
        return json(route, 200, {
            customer_id: 901, status: 'active', expiry: '2030-01-01T10:30:00Z',
            plan_id: 12, plan_name: 'Free Taste', delivery: delivery(status),
        });
    });
    return seen;
}

test('waits for the router before browsing, then goes', async ({ page }) => {
    const navigations = await openPortal(page);
    const seen = await deliverySequence(page, ['activating', 'activating', 'access_ready']);

    await page.locator('#freeTrialList .free-trial-btn').click();

    // Granted but not delivered: say so, and hold the button.
    await expect(page.locator('#successSection')).toBeVisible();
    await expect(page.locator('.success-headline')).toHaveText('Almost there…');
    await expect(page.locator('.connection-status .status-text')).toHaveText('Connecting…');
    await expect(page.locator('#startBrowsingBtn')).toHaveClass(/is-waiting/);
    await page.waitForTimeout(3000);
    expect(navigations).toEqual([]);

    // Router delivered: browse.
    await page.waitForURL(url => url.hostname === 'google.com', { timeout: 15000 });
    expect(seen.slice(0, 3)).toEqual(['activating', 'activating', 'access_ready']);
    expect(navigations).toHaveLength(1);
});

test('never trusts the delivery in the first response, always asks again', async ({ page }) => {
    const navigations = await openPortal(page);
    // Even a "ready" answer only counts once fetched after success was shown.
    const seen = await deliverySequence(page, ['online']);

    await page.locator('#freeTrialList .free-trial-btn').click();
    await page.waitForURL(url => url.hostname === 'google.com', { timeout: 15000 });
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(navigations).toHaveLength(1);
});

test('a failed delivery stays on the portal and tells the customer what to do', async ({ page }) => {
    const navigations = await openPortal(page);
    await deliverySequence(page, ['activating', 'needs_attention']);

    await page.locator('#freeTrialList .free-trial-btn').click();

    await expect(page.locator('.success-subtext')).toContainText('taking longer than usual', { timeout: 15000 });
    await expect(page.locator('#startBrowsingBtn')).not.toHaveClass(/is-waiting/);
    await page.waitForTimeout(2500);
    expect(navigations).toEqual([]);
});

test('M-Pesa: "active" alone does not send the customer browsing', async ({ page }) => {
    const navigations = await openPortal(page);
    // The payment poll and the delivery wait hit the same endpoint: active at
    // once, router done on the fourth answer.
    const seen = await deliverySequence(page, ['activating', 'activating', 'activating', 'online']);

    await page.evaluate(() => {
        pollPaymentStatusAndLogin(901, '0712345678', { duration: '1 day', speed: '5M', price: 'KSH 50' });
    });

    await expect(page.locator('.success-headline')).toHaveText('Almost there…', { timeout: 10000 });
    await page.waitForTimeout(2500);
    expect(navigations).toEqual([]);
    await page.waitForURL(url => url.hostname === 'google.com', { timeout: 15000 });
    expect(seen.length).toBeGreaterThanOrEqual(4);
});

test('with no customer id it waits a fixed time instead of going at once', async ({ page }) => {
    const navigations = await openPortal(page);
    await page.evaluate(() => {
        showSection(document.getElementById('successSection'));
        scheduleAutoStartBrowsing();
    });

    await page.waitForTimeout(5000);
    expect(navigations).toEqual([]);
    await page.waitForURL(url => url.hostname === 'google.com', { timeout: 15000 });
    expect(navigations).toHaveLength(1);
});
