const { test, expect } = require('@playwright/test');

function portalPayload(paymentProvider) {
    return {
        router: {
            router_id: 42,
            name: 'Test Router',
            identity: 'PAYMENT-TEST',
            auth_method: 'DIRECT_API',
            business_name: 'Test ISP',
            payment_methods: ['mpesa', 'voucher'],
            payment_provider: paymentProvider,
            support_phone: null,
        },
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

async function openPortal(page, provider) {
    await page.route('**/api/public/portal/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalPayload(provider)),
    }));
    await page.goto('/?mac=AA:BB:CC:DD:EE:FF&router=PAYMENT-TEST&gw=10.0.0.1');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
}

test('Fapshi router uses Cameroon phone rules and XAF throughout the portal', async ({ page }) => {
    if (process.env.CAPTURE_SCREENSHOTS) {
        await page.setViewportSize({ width: 390, height: 844 });
    }

    await openPortal(page, 'fapshi');

    await expect(page.locator('#phoneInputPrefix')).toHaveText('+237');
    await expect(page.locator('#phoneNumber')).toHaveAttribute('maxlength', '14');
    await expect(page.locator('#plansGrid .plan-card')).toContainText('XAF 500');
    await expect(page.locator('.device-phone-prefix')).toHaveText('+237');
    await expect(page.locator('.device-security-note')).toContainText('Mobile Money');

    const phoneRules = await page.evaluate(() => ({
        localValid: validatePhoneNumber('654874452'),
        internationalValid: validatePhoneNumber('237654874452'),
        normalized: formatPhoneForPaymentProvider('654874452'),
    }));
    expect(phoneRules).toEqual({
        localValid: true,
        internationalValid: true,
        normalized: '237654874452',
    });

    if (process.env.CAPTURE_SCREENSHOTS) {
        await page.screenshot({ path: 'test-results/fapshi-plans.png', fullPage: true });
    }

    await page.locator('#plansGrid .plan-card').click();
    await expect(page.locator('#submitButton .button-text')).toHaveText('Pay with Mobile Money');

    if (process.env.CAPTURE_SCREENSHOTS) {
        await page.screenshot({ path: 'test-results/fapshi-payment.png', fullPage: true });
    }
});

test('M-Pesa remains the default with the existing Kenya behavior', async ({ page }) => {
    await openPortal(page, 'mpesa');

    await expect(page.locator('#phoneInputPrefix')).toHaveText('+254');
    await expect(page.locator('#phoneNumber')).toHaveAttribute('maxlength', '10');
    await expect(page.locator('#plansGrid .plan-card')).toContainText('KSH 500/-');

    const phoneRules = await page.evaluate(() => ({
        valid: validatePhoneNumber('0712345678'),
        cameroonRejected: validatePhoneNumber('654874452'),
        normalized: formatPhoneForPaymentProvider('0712345678'),
    }));
    expect(phoneRules).toEqual({
        valid: true,
        cameroonRejected: false,
        normalized: '254712345678',
    });

    await page.locator('#plansGrid .plan-card').click();
    await expect(page.locator('#submitButton .button-text')).toHaveText('Pay with M-Pesa');
});
