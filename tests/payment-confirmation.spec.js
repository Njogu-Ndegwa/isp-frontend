const { test, expect } = require('@playwright/test');

async function paymentPage(page, initialStatus = { status: 'pending', payment_status: 'pending' }) {
    const calls = { charges: 0, checks: 0, unexpected: [] };
    let current = initialStatus;
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/')) return route.continue();
        // No external request, including an unexpected real payment, can leave this test.
        calls.unexpected.push(url.pathname);
        return route.abort();
    });
    await page.route('**/api/public/portal/**', route => route.fulfill({ json: {
        router: { router_id: 42, identity: 'CONFIRMATION-TEST', auth_method: 'DIRECT_API',
            business_name: 'Test ISP', payment_methods: ['mpesa'], payment_provider: 'fapshi' },
        plans: [{ id: 7, name: 'One day', price: 520, speed: '5M', duration_value: 1,
            duration_unit: 'days', connection_type: 'hotspot', plan_type: 'regular', max_shared_users: 1 }],
        ads: [], portal_settings: {}, plan_flags: {},
    }}));
    await page.route('**/api/hotspot/register-and-pay', route => {
        calls.charges++;
        return route.fulfill({ json: { customer_id: 123, gateway: 'fapshi', status: 'pending' } });
    });
    await page.route('**/api/hotspot/payment-status/123**', route => {
        calls.checks++;
        return route.fulfill({ status: current.httpStatus || 200, json: current });
    });
    await page.goto('/?mac=AA:BB:CC:DD:EE:FF&router=CONFIRMATION-TEST&gw=10.0.0.1');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    await page.clock.install();
    await page.locator('#plansGrid .plan-card').click();
    await page.getByRole('textbox', { name: '6XXXXXXXX or 2376XXXXXXXX' }).fill('670000000');
    await page.getByRole('button', { name: 'Pay with Mobile Money' }).click();
    await expect(page.locator('#processingSection')).toBeVisible();
    return { calls, setStatus(value) { current = value; } };
}

async function exhaustChecks(page, calls) {
    const before = calls.checks;
    for (let i = 0; i < 40; i++) {
        await page.clock.runFor(3000);
        await expect.poll(() => calls.checks).toBeGreaterThanOrEqual(before + i + 1);
    }
}

test('late confirmation stays pending; checking status never submits a second payment', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const flow = await paymentPage(page);
    await exhaustChecks(page, flow.calls);
    await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
    await expect(page.locator('#processingSubtext')).toContainText('do not pay again');
    await expect(page.locator('#errorSection')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Check payment status' })).toBeEnabled();
    expect(flow.calls.charges).toBe(1);
    await page.screenshot({ path: 'test-results/fapshi-confirmation-pending-mobile.png', fullPage: true });
    flow.setStatus({ status: 'active', payment_status: 'successful', payment_fulfillment_status: 'delivered',
        access_code: 'TEST-01', max_devices: 2, plan_name: 'One day', expiry: '2026-11-04T12:00:00' });
    await page.getByRole('button', { name: 'Check payment status' }).click();
    await page.clock.runFor(3000);
    await expect(page.locator('#successSection')).toBeVisible();
    expect(flow.calls.charges).toBe(1);
    expect(flow.calls.checks).toBe(41);
});

test('provider outage does not become a failed payment or encourage another charge', async ({ page }) => {
    const { calls } = await paymentPage(page, { httpStatus: 503, detail: 'Unavailable' });
    await exhaustChecks(page, calls);
    await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
    await expect(page.locator('#errorSection')).toBeHidden();
    expect(calls.charges).toBe(1);
});

test('received money with unfinished router delivery is not presented as online', async ({ page }) => {
    const flow = await paymentPage(page, { status: 'active', payment_status: 'successful', payment_fulfillment_status: 'pending' });
    const { calls } = flow;
    await exhaustChecks(page, calls);
    await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
    await expect(page.locator('#processingSubtext')).toContainText('still connecting');
    await expect(page.locator('#successSection')).toBeHidden();
    expect(calls.charges).toBe(1);
    flow.setStatus({ httpStatus: 503 });
    await page.getByRole('button', { name: 'Check payment status' }).click();
    await exhaustChecks(page, calls);
    await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
    expect(calls.charges).toBe(1);
});

test('authoritative failure is distinguished from a confirmation timeout', async ({ page }) => {
    const { calls } = await paymentPage(page, { status: 'inactive', payment_status: 'failed' });
    await page.clock.runFor(3000);
    await expect(page.locator('#errorSection')).toBeVisible();
    await expect(page.locator('#errorMessage')).toContainText('provider confirmed');
    await expect(page.getByRole('button', { name: 'Check payment status' })).toHaveCount(0);
    expect(calls.charges).toBe(1);
});

test('an older held payment does not hide access already supplied by a later voucher', async ({ page }) => {
    const { calls } = await paymentPage(page, { status: 'active', payment_status: 'pending',
        payment_review_required: true, payment_fulfillment_status: 'review_required',
        access_code: 'TEST-01', max_devices: 2, plan_name: 'One day', expiry: '2026-11-04T12:00:00' });
    await page.clock.runFor(3000);
    await expect(page.locator('#successSection')).toBeVisible();
    await expect(page.locator('#errorSection')).toBeHidden();
    expect(calls.charges).toBe(1);
});
