const { test, expect } = require('@playwright/test');

// portal_settings.plan_sort_order lets a reseller decide how packages are
// listed. These assert on the DOM order of the rendered cards, because that is
// the only thing a customer standing at a hotspot actually experiences — the
// API payload order is not enough (the client re-sorts after filtering).

const PLANS = [
    plan({ id: 1, name: 'Weekly', price: 200, value: 7, unit: 'DAYS' }),
    plan({ id: 2, name: 'Hourly', price: 10, value: 1, unit: 'HOURS' }),
    plan({ id: 3, name: 'Daily', price: 50, value: 1, unit: 'DAYS' }),
];

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

function portalPayload(sortOrder) {
    return {
        router: {
            router_id: 42,
            name: 'Test Router',
            identity: 'SORT-TEST',
            auth_method: 'DIRECT_API',
            business_name: 'Test ISP',
            payment_methods: ['mpesa'],
            payment_provider: 'mpesa',
            support_phone: null,
        },
        // Deliberately NOT pre-sorted: the client must impose the order itself.
        plans: PLANS,
        ads: [],
        plan_flags: {
            has_emergency_plans: false,
            has_special_offers: false,
            emergency_mode_active: false,
            regular_plans_hidden: false,
            sharing_enabled: false,
            max_shared_users: 1,
        },
        portal_settings: sortOrder === undefined ? {} : { plan_sort_order: sortOrder },
    };
}

async function openPortal(page, sortOrder) {
    await page.route('**/api/public/portal/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalPayload(sortOrder)),
    }));
    await page.goto('/?mac=AA:BB:CC:DD:EE:FF&router=SORT-TEST&gw=10.0.0.1');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(PLANS.length);
}

async function renderedPrices(page) {
    const text = await page.locator('#plansGrid .plan-card').allInnerTexts();
    return text.map(t => Number(t.match(/KSH\s*([\d.]+)/)[1]));
}

test('price_asc lists the smallest package first', async ({ page }) => {
    await openPortal(page, 'price_asc');
    expect(await renderedPrices(page)).toEqual([10, 50, 200]);
});

test('price_desc lists the largest package first', async ({ page }) => {
    await openPortal(page, 'price_desc');
    expect(await renderedPrices(page)).toEqual([200, 50, 10]);
});

test('duration_asc lists the shortest package first', async ({ page }) => {
    await openPortal(page, 'duration_asc');
    await expect(page.locator('#plansGrid .plan-card').first()).toContainText('1 Hour');
    await expect(page.locator('#plansGrid .plan-card').last()).toContainText('7 Days');
});

test('a reseller who never set the option keeps the old high-to-low order', async ({ page }) => {
    await openPortal(page, undefined);
    expect(await renderedPrices(page)).toEqual([200, 50, 10]);
});

test('an unrecognised value falls back to the old order instead of breaking the list', async ({ page }) => {
    await openPortal(page, 'by_vibes');
    expect(await renderedPrices(page)).toEqual([200, 50, 10]);
});
