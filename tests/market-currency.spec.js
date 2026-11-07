const { test, expect } = require('@playwright/test');

// The router payload carries the owner's market currency (`router.currency`).
// A Zambian reseller prices in Kwacha and sells vouchers only; Kenyan routers
// keep "KSH 50/-".

function portalPayload({ currency, paymentMethods = ['mpesa', 'voucher'], provider = 'mpesa' }) {
    const router = {
        router_id: 42,
        name: 'Test Router',
        identity: 'CURRENCY-TEST',
        auth_method: 'DIRECT_API',
        business_name: 'Test ISP',
        payment_methods: paymentMethods,
        payment_provider: provider,
        support_phone: null,
    };
    if (currency !== undefined) router.currency = currency;
    return {
        router,
        plans: [{
            id: 7,
            name: 'One Hour',
            price: 500,
            speed: '5M',
            duration_value: 1,
            duration_unit: 'hours',
            connection_type: 'hotspot',
            plan_type: 'regular',
            is_hidden: false,
            max_shared_users: 1,
        }],
        ads: [],
        plan_flags: {
            has_emergency_plans: false,
            has_special_offers: false,
            emergency_mode_active: false,
            regular_plans_hidden: false,
            sharing_enabled: false,
            max_shared_users: 1,
        },
        portal_settings: {},
    };
}

async function openPortal(page, options) {
    await page.route('**/api/public/portal/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalPayload(options)),
    }));
    await page.goto('/?mac=AA:BB:CC:DD:EE:FF&router=CURRENCY-TEST&gw=10.0.0.1');
}

test('Zambian router labels plan prices in ZMW', async ({ page }) => {
    await openPortal(page, { currency: 'ZMW' });
    const card = page.locator('#plansGrid .plan-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('ZMW 500');
    await expect(card).not.toContainText('KSH');
    await expect(card.locator('.currency-code')).toHaveText('ZMW');
});

test('Voucher-only Zambian router shows the code box and no M-Pesa', async ({ page }) => {
    await openPortal(page, { currency: 'ZMW', paymentMethods: ['voucher'] });
    await expect(page.locator('#voucherSection')).toBeVisible();
    await expect(page.locator('#voucherCodeInput')).toBeVisible();
    await expect(page.locator('#mpesaSection')).toBeHidden();
    await expect(page.locator('#paymentDivider')).toBeHidden();
    await expect(page.locator('#submitButton')).toBeHidden();
    expect(await page.evaluate(() => getPaymentCurrencyCode())).toBe('ZMW');
});

test('Voucher-only router asks for a code, not an M-Pesa number, to reconnect', async ({ page }) => {
    await openPortal(page, { currency: 'ZMW', paymentMethods: ['voucher'] });
    await expect(page.locator('#voucherSection')).toBeVisible();
    const reconnect = page.locator('#reconnectSection');
    await expect(page.locator('#reconnectHint')).toHaveText('Enter your voucher or access code');
    await expect(reconnect).not.toContainText(/m-?pesa|phone/i);
    await expect(page.locator('#reconnectInput')).toHaveAttribute('placeholder', 'Code e.g. 12345678 or ABC-DEF');
    // Visible text only: the hidden M-Pesa section still holds its markup.
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/m-?pesa/i);
});

test('M-Pesa router keeps the phone-or-code reconnect wording', async ({ page }) => {
    await openPortal(page, { currency: 'KES' });
    await expect(page.locator('#reconnectHint')).toHaveText('Enter your M-Pesa phone number or code');
});

test('Kenyan router keeps KSH 500/-', async ({ page }) => {
    await openPortal(page, { currency: 'KES' });
    await expect(page.locator('#plansGrid .plan-card')).toContainText('KSH 500/-');
    await expect(page.locator('#mpesaSection')).toBeVisible();
});

test('An API response without currency falls back to the gateway currency', async ({ page }) => {
    await openPortal(page, {});
    await expect(page.locator('#plansGrid .plan-card')).toContainText('KSH 500/-');
});
