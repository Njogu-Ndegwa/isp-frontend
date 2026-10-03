const { test, expect } = require('@playwright/test');

// The plans request starts from <head> (index.html) instead of after every
// script has loaded, and is hedged: if the primary API host hasn't answered in
// 1.2 s the same-origin proxy is asked too, and the first good answer wins.

const PLAN = {
    id: 7, name: 'Daily', price: 50, speed: '5M',
    duration_value: 1, duration_unit: 'DAYS',
    connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
};

const PORTAL = {
    router: {
        router_id: 42, name: 'Test Router', identity: 'EARLY-TEST',
        auth_method: 'DIRECT_API', business_name: 'Test ISP',
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

const PRIMARY = url => url.hostname === 'isp.bitwavetechnologies.com' && url.pathname === '/api/public/portal/EARLY-TEST';
const PROXY = url => url.pathname === '/api/bw/public/portal/EARLY-TEST';

function json(route, status, body) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function open(page) {
    const query = new URLSearchParams({ router: 'EARLY-TEST', gw: '10.0.0.1', mac: '11:22:33:44:55:66' });
    return page.goto('/?' + query.toString(), { waitUntil: 'commit' });
}

test('the plans request leaves before script.js has even arrived', async ({ page }) => {
    const events = [];
    await page.route(PRIMARY, route => { events.push('portal-request'); return json(route, 200, PORTAL); });
    await page.route(PROXY, route => json(route, 200, PORTAL));
    // A slow script.js: the old code could not ask for plans until it ran.
    await page.route(url => url.pathname === '/script.js', async route => {
        await sleep(1500);
        events.push('script.js-served');
        return route.continue();
    });

    await open(page);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    expect(events.indexOf('portal-request')).toBeLessThan(events.indexOf('script.js-served'));
});

test('a slow primary host is hedged with the proxy; the first answer wins', async ({ page }) => {
    const calls = [];
    await page.route(PRIMARY, async route => {
        calls.push('primary');
        await sleep(4000); // slow, not dead
        return json(route, 200, PORTAL).catch(() => {});
    });
    await page.route(PROXY, route => { calls.push('proxy'); return json(route, 200, PORTAL); });

    const started = Date.now();
    await open(page);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    expect(Date.now() - started).toBeLessThan(3800);
    expect(calls).toEqual(['primary', 'proxy']);
    expect(await page.evaluate(() => window.__portalVia)).toBe('fallback');
    // Slow is not broken: later calls keep using the primary host.
    expect(await page.evaluate(() => window.__apiFallback.active)).toBe(false);
});

test('a fast primary answer never touches the proxy', async ({ page }) => {
    const calls = [];
    await page.route(PRIMARY, route => { calls.push('primary'); return json(route, 200, PORTAL); });
    await page.route(PROXY, route => { calls.push('proxy'); return json(route, 200, PORTAL); });

    await open(page);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    await sleep(1500); // past the hedge delay
    expect(calls).toEqual(['primary']);
    expect(await page.evaluate(() => window.__portalVia)).toBe('primary');
});

test('an unreachable primary switches the whole page to the proxy at once', async ({ page }) => {
    const calls = [];
    await page.route(PRIMARY, route => { calls.push('primary'); return route.abort('connectionrefused'); });
    await page.route(PROXY, route => { calls.push('proxy'); return json(route, 200, PORTAL); });

    await open(page);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    expect(calls).toEqual(['primary', 'proxy']);
    expect(await page.evaluate(() => window.__apiFallback.active)).toBe(true);
});

test('a real error from the primary (unknown router) is not retried through the proxy', async ({ page }) => {
    const calls = [];
    await page.route(PRIMARY, route => { calls.push('primary'); return json(route, 404, { detail: 'Router not found' }); });
    await page.route(PROXY, route => { calls.push('proxy'); return json(route, 200, PORTAL); });

    await open(page);
    // The page goes on to its legacy endpoints, as it always did after a 404.
    await page.waitForFunction(() => window.portalDataPromise !== undefined);
    await sleep(2000);
    expect(calls).toEqual(['primary']);
    expect(await page.evaluate(() => window.__apiFallback.active)).toBe(false);
});
