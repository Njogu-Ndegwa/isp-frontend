const { test, expect } = require('@playwright/test');

// portal_settings.color_theme paints the whole portal through CSS variables
// set by applyTheme() in script.js. The admin app offers these six themes
// (isp-frontend-admin app/lib/portalThemes.ts) and the backend accepts them
// (isp-billing app/api/portal_routes.py OFFERED_THEMES). Bright Violet was
// offered by the admin app but rejected by the backend until 2026-10-23; this
// pins the portal side of that contract.

const EXPECTED_PRIMARY = {
    sunset_orange: '#E85D04',
    ocean_blue: '#3B82F6',
    emerald_green: '#10B981',
    bright_violet: '#8B5CF6',
    rose_gold: '#E11D48',
    slate_gray: '#475569',
};

function portalPayload(portalSettings) {
    return {
        router: {
            router_id: 42,
            name: 'Test Router',
            identity: 'THEME-TEST',
            auth_method: 'DIRECT_API',
            business_name: 'Test ISP',
            payment_methods: ['mpesa'],
            payment_provider: 'mpesa',
            support_phone: null,
        },
        plans: [{
            id: 1,
            name: 'Daily',
            price: 50,
            speed: '5M',
            duration_value: 1,
            duration_unit: 'DAYS',
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
        portal_settings: portalSettings,
    };
}

async function openPortal(page, portalSettings) {
    await page.route('**/api/public/portal/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalPayload(portalSettings)),
    }));
    await page.goto('/?mac=AA:BB:CC:DD:EE:FF&router=THEME-TEST&gw=10.0.0.1');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
}

function cssVar(page, name) {
    return page.evaluate(
        n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
    );
}

for (const [theme, primary] of Object.entries(EXPECTED_PRIMARY)) {
    test(`${theme} paints the portal with its own primary colour`, async ({ page }) => {
        await openPortal(page, { color_theme: theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect((await cssVar(page, '--primary')).toUpperCase()).toBe(primary);
        expect((await cssVar(page, '--p-primary')).toUpperCase()).toBe(primary);
    });
}

test('bright_violet is a violet portal, not the orange fallback', async ({ page }) => {
    await openPortal(page, { color_theme: 'bright_violet' });
    expect((await cssVar(page, '--primary')).toUpperCase()).toBe('#8B5CF6');
    expect(await cssVar(page, '--primary-rgb')).toBe('139, 92, 246');
});
