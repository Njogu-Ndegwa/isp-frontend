const { test, expect } = require('@playwright/test');

// The admin dashboard frames this exact page (?preview=1, sandbox="allow-scripts")
// to show a reseller what customers will see. The page renders data the
// dashboard posts and must never reach the network: no plans fetch, no ad
// impression, no payment, no router.

const PORT = Number(process.env.PORTAL_TEST_PORT || 3000);

function payload(theme) {
    return {
        router: {
            router_id: 42, name: 'Test Router', identity: 'PREVIEW-TEST', auth_method: 'DIRECT_API',
            business_name: 'Preview ISP', payment_methods: ['mpesa'], payment_provider: 'mpesa',
            currency: 'KES', support_phone: '0712345678',
        },
        plans: [
            { id: 1, name: 'Daily', price: 50, speed: '5M', duration_value: 1, duration_unit: 'DAYS',
              connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 },
            { id: 2, name: 'Weekly', price: 300, speed: '5M', duration_value: 7, duration_unit: 'DAYS',
              connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 },
        ],
        ads: [],
        plan_flags: { has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
                      sharing_enabled: false, max_shared_users: 1 },
        portal_settings: { color_theme: theme, header_style: 'hero', welcome_title: 'Preview Cafe',
                           show_ads: false, show_plan_speed: true, portal_language: 'en' },
    };
}

// The stand-in dashboard (tests/fixtures/preview-host.html) is served from one
// local origin and frames the portal from the other, as the real dashboard
// frames it cross-origin.
async function openHost(page, hostHost, data) {
    const portalHost = hostHost === 'localhost' ? '127.0.0.1' : 'localhost';
    const apiCalls = [];
    page.on('request', req => {
        const url = req.url();
        if (/\/api\//.test(url) || /bitwavetechnologies\.(com|net)\/api/.test(url)) apiCalls.push(url);
    });
    // Nothing may leave the test, even if preview mode were broken.
    await page.route(/\/api\/|bitwavetechnologies\.(com|net)/, route => route.abort());
    await page.addInitScript(d => { window.previewData = d; }, data);
    const portal = encodeURIComponent(`http://${portalHost}:${PORT}/?preview=1`);
    await page.goto(`http://${hostHost}:${PORT}/tests/fixtures/preview-host?portal=${portal}`);
    return { apiCalls, frame: page.frameLocator('#f') };
}

test('renders the posted data with the real page and its theme', async ({ page }) => {
    const { apiCalls, frame } = await openHost(page, 'localhost', payload('emerald_green'));
    await expect(frame.locator('#plansGrid .plan-card')).toHaveCount(2);
    await expect(frame.locator('.hero-title')).toHaveText('Preview Cafe');
    const primary = await frame.locator('html').evaluate(
        el => getComputedStyle(el).getPropertyValue('--primary').trim());
    expect(primary.toUpperCase()).toBe('#10B981');
    await expect.poll(() => page.evaluate(() => window.events)).toContain('bw-portal-preview:rendered');
    expect(apiCalls).toEqual([]);
});

test('picking a plan and paying never reaches the API', async ({ page }) => {
    const { apiCalls, frame } = await openHost(page, 'localhost', payload('ocean_blue'));
    await frame.locator('#plansGrid .plan-card').first().click();
    await frame.locator('#phoneNumber').fill('0712345678');
    await frame.locator('#submitButton').click();
    await page.waitForTimeout(1500);
    expect(apiCalls).toEqual([]);
});

test('loyalty points render from the posted data, and checking a balance stays offline', async ({ page }) => {
    const data = payload('ocean_blue');
    data.loyalty = { enabled: true, earn_mode: 'per_kes', kes_per_point: 10, points_per_purchase: 1,
        plan_points: {}, expiry_days: 90, rewards: [{ plan_id: 1, points_cost: 50 }] };
    const { apiCalls, frame } = await openHost(page, 'localhost', data);
    await expect(frame.locator('#pointsSection')).toBeVisible();
    await expect(frame.locator('#plansGrid .plan-points-cost')).toHaveText('⭐ or 50 pts');
    await frame.locator('#pointsPhoneInput').fill('0712345678');
    await frame.locator('#pointsCheckBtn').click();
    await page.waitForTimeout(1500);
    expect(apiCalls).toEqual([]);
});

test('ignores data posted by a site that is not the dashboard', async ({ page }) => {
    const { apiCalls, frame } = await openHost(page, '[::1]', payload('ocean_blue'));
    await page.waitForTimeout(1500);
    await expect(frame.locator('#plansGrid .plan-card')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.events)).toEqual(['bw-portal-preview:ready']);
    expect(apiCalls).toEqual([]);
});

test('?preview=1 opened directly (not framed) is the normal portal', async ({ page }) => {
    let portalFetched = false;
    await page.route('**/api/public/portal/**', route => {
        portalFetched = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload('ocean_blue')) });
    });
    await page.goto('/?preview=1&mac=AA:BB:CC:DD:EE:FF&router=PREVIEW-TEST&gw=10.0.0.1');
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(2);
    expect(portalFetched).toBe(true);
    expect(await page.evaluate(() => typeof window.__portalPreview)).toBe('undefined');
});
