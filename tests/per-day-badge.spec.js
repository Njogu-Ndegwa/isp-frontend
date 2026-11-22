const { test, expect } = require('@playwright/test');

// The best-value regular plan carries an "Only KSH X/day" badge. It must never
// read "KSH 0/day" (a KSH 1 package valid for 30 days), and it must not invent
// a per-day figure for packages shorter than a day.

function plan({ id, name, price, value, unit }) {
    return {
        id,
        name,
        price,
        speed: '5M',
        duration_value: value,
        duration_unit: unit,
        connection_type: 'hotspot',
        plan_type: 'regular',
        is_hidden: false,
        max_shared_users: 1,
    };
}

function portalPayload(plans) {
    return {
        router: {
            router_id: 42,
            name: 'Test Router',
            identity: 'PERDAY-TEST',
            auth_method: 'DIRECT_API',
            business_name: 'Test ISP',
            payment_methods: ['mpesa'],
            payment_provider: 'mpesa',
            support_phone: null,
        },
        plans,
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

async function openPortal(page, plans) {
    await page.route('**/api/public/portal/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalPayload(plans)),
    }));
    await page.goto('/?mac=AA:BB:CC:DD:EE:FF&router=PERDAY-TEST&gw=10.0.0.1');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(plans.length);
}

test('a KSH 1 / 30-day package shows no "KSH 0/day" badge', async ({ page }) => {
    await openPortal(page, [
        plan({ id: 1, name: '20mins', price: 1, value: 30, unit: 'DAYS' }),
        plan({ id: 2, name: 'Daily', price: 50, value: 1, unit: 'DAYS' }),
    ]);
    await expect(page.locator('#plansGrid')).not.toContainText('/day');
    await expect(page.locator('#plansGrid')).not.toContainText('0/day');
});

test('a normal weekly best-value package still shows its per-day price', async ({ page }) => {
    await openPortal(page, [
        plan({ id: 1, name: 'Weekly', price: 200, value: 7, unit: 'DAYS' }),
        plan({ id: 2, name: 'Daily', price: 50, value: 1, unit: 'DAYS' }),
    ]);
    await expect(page.locator('#plansGrid .plan-value-msg')).toHaveText(['Only KSH 29/day']);
});

test('a package shorter than a day gets no per-day badge', async ({ page }) => {
    await openPortal(page, [
        plan({ id: 1, name: 'Hourly', price: 5, value: 1, unit: 'HOURS' }),
        plan({ id: 2, name: 'Daily', price: 200, value: 1, unit: 'DAYS' }),
    ]);
    await expect(page.locator('#plansGrid')).not.toContainText('/day');
});
