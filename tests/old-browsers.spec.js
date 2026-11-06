const { test, expect } = require('@playwright/test');
const { findProblems, parseError, inlineScripts } = require('../scripts/check-legacy');

// Smart TVs can't parse the modern scripts. They get compiled copies from legacy/,
// and nobody may be left looking at grey cards for ever.

const PORTAL = {
    router: {
        router_id: 42, name: 'Test Router', identity: 'OLD-TV-TEST',
        auth_method: 'DIRECT_API', business_name: 'Test ISP',
        payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: null,
    },
    plans: [{
        id: 7, name: 'Daily', price: 50, speed: '5M',
        duration_value: 1, duration_unit: 'DAYS',
        connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
    }],
    ads: [],
    plan_flags: {
        has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
        regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1,
    },
    portal_settings: {},
};

const portalApi = url => /\/(api|api\/bw)\/public\/portal\/OLD-TV-TEST$/.test(url.pathname);
const OPEN = '/?router=OLD-TV-TEST&gw=10.0.0.1&mac=11:22:33:44:55:66';

function scriptsLoaded(page) {
    return page.evaluate(() => [...document.scripts].map(s => s.getAttribute('src')).filter(Boolean));
}

test('the old-browser parse check passes on this tree', () => {
    expect(findProblems()).toEqual([]);
});

test('the parse check really rejects code old browsers cannot parse', () => {
    expect(parseError('var a = {}; a?.b;', 5)).toBeTruthy();
    expect(parseError('const a = () => 1;', 5)).toBeTruthy();
    expect(parseError('async function f() {}', 5)).toBeTruthy();
    expect(parseError('var a = {}; a.b;', 5)).toBeNull();
    expect(inlineScripts('<script>var a;</script><script src="x.js"></script>')).toEqual(['var a;']);
});

test('a modern browser loads only the modern scripts', async ({ page }) => {
    test.skip(process.env.PORTAL_TIER === 'legacy', 'this run forces the old tier');
    await page.route(portalApi, route => route.fulfill({ json: PORTAL }));
    await page.goto(OPEN);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    const scripts = await scriptsLoaded(page);
    expect(scripts).toEqual(['script.js?v=20', 'script003.js', 'spots.js?v=3', 'device-pairing.js?v=2', 'access-login.js']);
});

test('an old browser gets only the compiled scripts, and the plans show', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.addInitScript(() => { window.__forceLegacyPortal = true; });
    await page.route(portalApi, route => route.fulfill({ json: PORTAL }));
    await page.goto(OPEN);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    const scripts = await scriptsLoaded(page);
    expect(scripts.every(s => s.startsWith('legacy/'))).toBe(true);
    expect(scripts[0]).toContain('legacy/polyfills.js');
    expect(errors).toEqual([]);
});

test('grey cards turn into a plain message with a retry after 25 s', async ({ page }) => {
    await page.clock.install();
    // Nothing answers, and none of the scripts arrive: the worst case on a TV.
    await page.route(portalApi, () => {});
    await page.route(/\.js(\?|$)/, route => route.abort());
    await page.goto(OPEN);

    await expect(page.locator('#plansGrid .skeleton-card')).toHaveCount(4);
    await page.clock.runFor(15000);
    await expect(page.locator('#plansTimeoutMessage')).toHaveCount(0);

    await page.clock.runFor(12000);
    await expect(page.locator('#plansGrid .skeleton-card')).toHaveCount(0);
    await expect(page.locator('#plansTimeoutMessage')).toContainText('taking too long');
    await expect(page.locator('#plansTimeoutMessage')).toContainText('Or pay on a phone, then tap Connect a TV / Device');

    const reloaded = page.waitForEvent('load');
    await page.locator('#plansTimeoutRetry').click();
    await reloaded;
    await expect(page.locator('#plansGrid .skeleton-card')).toHaveCount(4);
});

test('plans that arrive after the message still replace it', async ({ page }) => {
    await page.clock.install();
    // A very slow link: script.js itself is still downloading when the limit passes.
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route(portalApi, route => route.fulfill({ json: PORTAL }));
    await page.route(url => url.pathname.endsWith('/script.js'), async route => {
        await held;
        return route.continue();
    });
    await page.goto(OPEN, { waitUntil: 'commit' });
    await expect(page.locator('#plansGrid .skeleton-card')).toHaveCount(4);
    await page.clock.runFor(26000);
    await expect(page.locator('#plansTimeoutMessage')).toBeVisible();

    release();
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    await expect(page.locator('#plansTimeoutMessage')).toHaveCount(0);
});

test('plans that load normally never trigger the message', async ({ page }) => {
    await page.clock.install();
    await page.route(portalApi, route => route.fulfill({ json: PORTAL }));
    await page.goto(OPEN);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    await page.clock.runFor(60000);
    await expect(page.locator('#plansTimeoutMessage')).toHaveCount(0);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
});

test("the plans error also points to paying on a phone", async ({ page }) => {
    await page.route(portalApi, route => route.fulfill({ status: 200, json: { ...PORTAL, plans: [] } }));
    await page.goto(OPEN);
    await expect(page.locator('#retryPlansBtn')).toBeVisible();
    await expect(page.locator('#plansGrid')).toContainText('Or pay on a phone, then tap Connect a TV / Device');
});
