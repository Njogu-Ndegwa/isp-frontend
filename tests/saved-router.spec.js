const { test, expect } = require('@playwright/test');

// The installed PWA opens /index.html with no ?router= (manifest start_url).
// The page used to fall back to identity "MikroTik" (Bitwave's test router)
// and router id 2, so resellers' customers saw Bitwave's test plans. Now the
// last ?router= is remembered and reused, and with nothing saved no plans load.

const PLAN = {
    id: 7, name: 'Daily', price: 50, speed: '5M',
    duration_value: 1, duration_unit: 'DAYS',
    connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
};

function portal(identity) {
    return {
        router: {
            router_id: 42, name: 'Reseller Router', identity,
            auth_method: 'DIRECT_API', business_name: 'Reseller ISP',
            payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: null,
        },
        plans: [PLAN],
        ads: [],
        plan_flags: {
            has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
            regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1,
        },
        portal_settings: {},
    };
}

// Records every portal / plans / router-lookup request and answers the portal
// one for any identity.
async function mockApi(page) {
    const calls = [];
    await page.route(url => /\/public\/portal\/|\/public\/plans\/|\/routers\/by-identity\//.test(url.pathname), route => {
        const path = new URL(route.request().url()).pathname;
        calls.push(path);
        const m = path.match(/\/public\/portal\/([^/]+)$/);
        if (m) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(portal(decodeURIComponent(m[1]))) });
        }
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not found"}' });
    });
    return calls;
}

test('?router= loads that router and is remembered', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/?router=TDK-01&mac=11:22:33:44:55:66&gw=10.5.50.1');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    expect(calls.some(p => p.endsWith('/public/portal/TDK-01'))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('bitwave_last_router'))).toBe('TDK-01');
});

test('opened without ?router= (installed app) uses the saved router, never MikroTik', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/?router=TDK-01');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    calls.length = 0;

    await page.goto('/index.html');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    expect(calls.some(p => p.endsWith('/public/portal/TDK-01'))).toBe(true);
    expect(calls.filter(p => /MikroTik|\/plans\/2$|\/plans\/null/.test(p))).toEqual([]);
});

test('a new ?router= replaces the saved one', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/?router=TDK-01');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    await page.goto('/?router=OTHER-02');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    expect(await page.evaluate(() => localStorage.getItem('bitwave_last_router'))).toBe('OTHER-02');
    calls.length = 0;
    await page.goto('/index.html');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    expect(calls.some(p => p.endsWith('/public/portal/OTHER-02'))).toBe(true);
});

test('nothing saved and no ?router=: asks to connect, loads no plans', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/index.html');
    await expect(page.locator('#noRouterMessage')).toContainText('Connect to your WiFi hotspot to see packages');
    // Give any stray request time to leave.
    await page.waitForTimeout(1500);
    expect(calls).toEqual([]);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(0);
});

test('storage that throws does not break the normal ?router= portal', async ({ page }) => {
    await page.addInitScript(() => {
        const boom = () => { throw new Error('storage disabled'); };
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { return { getItem: boom, setItem: boom, removeItem: boom }; },
        });
    });
    await mockApi(page);
    await page.goto('/?router=TDK-01');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
});
