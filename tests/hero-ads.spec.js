const { test, expect } = require('@playwright/test');

// Hero ads: the reseller's photo hero rotates through the router's hero ads.
// Each ad slide has one Call button (works before the customer has internet),
// a view counts once the slide has been on screen for a second, and the
// beacons say where (placement) and on which hotspot and phone they happened.

const IDENTITY = 'HERO-TEST';
const MAC = '11:22:33:44:55:66';

const PLAN = {
    id: 7, name: 'Daily', price: 50, speed: '5M',
    duration_value: 1, duration_unit: 'DAYS',
    connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
};

const HERO_AD = {
    id: 9, title: 'Red onions', description: null,
    seller_name: 'Wanjiku Greens', seller_location: 'By the stage',
    phone_number: '0712 000 111', whatsapp_number: null,
    price: 'KSH 120 / kg', price_value: 120, category: 'produce',
    badge_type: null, badge_text: null,
    placement: 'hero', media_type: 'image', image_url: '/images/demo-ads/onions-land.webp',
    video_url: null, poster_url: null, image_fit: 'cover', bg_color: '#14532D', slot: 'platform',
};

function portal({ showAds = true, ads = [HERO_AD] } = {}) {
    return {
        router: {
            router_id: 42, name: 'Test Router', identity: IDENTITY,
            auth_method: 'DIRECT_API', business_name: 'Test ISP',
            payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: null,
        },
        plans: [PLAN],
        ads,
        plan_flags: {
            has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
            regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1,
        },
        portal_settings: { header_style: 'hero', show_ads: showAds },
    };
}

const isPortal = url => url.pathname.endsWith(`/public/portal/${IDENTITY}`);

function json(route, status, body) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function openPortal(page, body, beacons) {
    // Anything else ads.js might ask the API for: answer empty, never hang.
    // Registered first: Playwright tries the most recently added route first.
    await page.route(url => url.hostname === 'isp.bitwavetechnologies.com', route =>
        json(route, 200, { ads: [], pagination: {} }));
    await page.route(isPortal, route => json(route, 200, body));
    await page.route(url => /\/ads\/(impression|click)$/.test(url.pathname), route => {
        const kind = route.request().url().endsWith('/click') ? 'click' : 'impression';
        beacons.push({ kind, body: route.request().postDataJSON() });
        return json(route, 200, { success: true });
    });
    const query = new URLSearchParams({ router: IDENTITY, gw: '10.0.0.1', mac: MAC });
    await page.goto('/?' + query.toString());
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
}

test('a hero ad becomes a slide with one Call button, and the showcase stays hidden', async ({ page }) => {
    const beacons = [];
    await openPortal(page, portal(), beacons);

    const slide = page.locator('#portal-header .hero-slide--ad[data-ad-id="9"]');
    await expect(slide).toHaveCount(1);
    await expect(page.locator('#portal-header')).toHaveClass(/has-hero-ads/);
    const call = slide.locator('[data-hero-cta="call"]');
    await expect(call).toHaveCount(1);
    expect(await call.getAttribute('href')).toMatch(/^tel:/);
    // welcome + ad + "advertise here"
    await expect(page.locator('#portal-header .hero-seg')).toHaveCount(3);
    await expect(page.locator('#ads-section')).toBeHidden();
});

test('a view is counted once the ad has been on screen, with placement, hotspot and phone', async ({ page }) => {
    const beacons = [];
    await openPortal(page, portal(), beacons);

    await page.locator('#portal-header .hero-seg[data-go="1"]').click();
    await expect.poll(() => beacons.filter(b => b.kind === 'impression').length, { timeout: 5000 }).toBe(1);
    const view = beacons.find(b => b.kind === 'impression').body;
    expect(view.ad_ids).toEqual([9]);
    expect(view.placement).toBe('hero');
    expect(view.router_identity).toBe(IDENTITY);
    expect(view.mac_address).toBe(MAC);
});

test('tapping Call records a hero call tap', async ({ page }) => {
    const beacons = [];
    await openPortal(page, portal(), beacons);
    await page.locator('#portal-header .hero-seg[data-go="1"]').click();
    // Keep the browser from following tel: while the portal's own handler runs.
    await page.evaluate(() => document.addEventListener('click', e => {
        if (e.target.closest('a[href^="tel:"]')) e.preventDefault();
    }, true));

    await page.locator('#portal-header [data-hero-cta="call"]').click();
    await expect.poll(() => beacons.filter(b => b.kind === 'click').length, { timeout: 5000 }).toBe(1);
    const tap = beacons.find(b => b.kind === 'click').body;
    expect(tap).toMatchObject({ ad_id: 9, click_type: 'call', placement: 'hero', router_identity: IDENTITY, mac_address: MAC });
});

test('with ads switched off the hero stays a plain photo', async ({ page }) => {
    const beacons = [];
    await openPortal(page, portal({ showAds: false }), beacons);
    await page.waitForTimeout(1500);
    await expect(page.locator('#portal-header .hero-track')).toHaveCount(0);
    expect(beacons).toEqual([]);
});
