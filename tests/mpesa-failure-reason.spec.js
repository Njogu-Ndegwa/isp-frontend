const { test, expect } = require('@playwright/test');

// Feedback board post 3: a failed M-Pesa prompt (wrong PIN, cancelled, phone not
// reached) used to wait for the poll to time out and then show a generic
// "Payment Failed". When the backend says M-Pesa confirmed the failure, the
// portal stops waiting and says why and what to do.

async function mpesaPaymentPage(page, status) {
    const calls = { charges: 0, checks: 0 };
    let current = status;
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/')) return route.continue();
        return route.abort();
    });
    await page.route('**/api/public/portal/**', route => route.fulfill({ json: {
        router: { router_id: 42, identity: 'MPESA-FAIL-TEST', auth_method: 'DIRECT_API',
            business_name: 'Test ISP', payment_methods: ['mpesa'], payment_provider: 'mpesa' },
        plans: [{ id: 7, name: 'One day', price: 50, speed: '5M', duration_value: 1,
            duration_unit: 'days', connection_type: 'hotspot', plan_type: 'regular', max_shared_users: 1 }],
        ads: [], portal_settings: {}, plan_flags: {},
    }}));
    await page.route('**/api/hotspot/register-and-pay', route => {
        calls.charges++;
        return route.fulfill({ json: { customer_id: 321, gateway: 'mpesa', status: 'pending' } });
    });
    await page.route('**/api/hotspot/payment-status/321**', route => {
        calls.checks++;
        return route.fulfill({ json: current });
    });
    await page.goto('/?mac=AA:BB:CC:DD:EE:FF&router=MPESA-FAIL-TEST&gw=10.0.0.1');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    await page.clock.install();
    await page.locator('#plansGrid .plan-card').click();
    await page.locator('#phoneNumber').fill('0712345678');
    await page.getByRole('button', { name: 'Pay with M-Pesa' }).click();
    await expect(page.locator('#processingSection')).toBeVisible();
    return { calls, setStatus(value) { current = value; } };
}

test('a wrong M-Pesa PIN stops the wait and says what to do', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const flow = await mpesaPaymentPage(page, { status: 'pending', mpesa_failure: null });
    await page.clock.runFor(3000);
    await expect.poll(() => flow.calls.checks).toBe(1);
    await expect(page.locator('#errorSection')).toBeHidden();

    flow.setStatus({ status: 'inactive', mpesa_failure: { reason_key: 'wrong_pin',
        reason: 'The M-Pesa PIN was wrong.', next_step: 'Try again and enter your PIN carefully.' } });
    await page.clock.runFor(3000);

    await expect(page.locator('#errorSection')).toBeVisible();
    await expect(page.locator('#errorMessage')).toHaveText('The M-Pesa PIN was wrong. Try again and enter your PIN carefully.');
    expect(flow.calls.checks).toBe(2);
    expect(flow.calls.charges).toBe(1);
    await page.screenshot({ path: 'test-results/mpesa-wrong-pin-mobile.png', fullPage: true });
});

test('the reason is shown in Swahili when the portal is in Swahili', async ({ page }) => {
    const flow = await mpesaPaymentPage(page, { status: 'pending', mpesa_failure: { reason_key: 'cancelled',
        reason: 'The M-Pesa prompt was cancelled on your phone.', next_step: 'Try again when you are ready and enter your PIN.' } });
    await page.evaluate(() => applyLanguage('sw'));
    await page.clock.runFor(3000);
    await expect(page.locator('#errorMessage')).toContainText('lilighairiwa');
    expect(flow.calls.charges).toBe(1);
});

test('a reason the portal has no words for falls back to the backend text', async ({ page }) => {
    await mpesaPaymentPage(page, { status: 'inactive', mpesa_failure: { reason_key: 'something_new',
        reason: 'M-Pesa said no.', next_step: 'Try again later.' } });
    await page.clock.runFor(3000);
    await expect(page.locator('#errorMessage')).toHaveText('M-Pesa said no. Try again later.');
});

test('without a confirmed failure an inactive status keeps waiting', async ({ page }) => {
    const flow = await mpesaPaymentPage(page, { status: 'inactive', mpesa_failure: null });
    for (let i = 1; i <= 3; i++) {
        await page.clock.runFor(3000);
        await expect.poll(() => flow.calls.checks).toBe(i);
    }
    await expect(page.locator('#errorSection')).toBeHidden();
    await expect(page.locator('#processingSection')).toBeVisible();
});
