const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

// A reseller's own photo as the hero background. The portal runs BEFORE the
// customer is authenticated, so these tests stand a simulated walled garden in
// front of the page: only the portal's origin and the backend host answer, as
// on a hotspot, and every other host is refused and recorded.

const IDENTITY = 'HERO-TEST';
const PHOTO_KEY = 'c/2026/11/r12-0123456789abcdef.jpg';
const PHOTO_URL = `https://isp.bitwavetechnologies.com/media/${PHOTO_KEY}`;
const SAME_ORIGIN_PATH = `/portal-media/${PHOTO_KEY}`;
const PHOTO_BYTES = fs.readFileSync(path.join(__dirname, '..', 'images', 'presets', 'nature.jpg'));

const PLAN = {
    id: 7, name: 'Daily', price: 50, speed: '5M',
    duration_value: 1, duration_unit: 'DAYS',
    connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
};

function portal(headerBg) {
    return {
        router: {
            router_id: 42, name: 'Test Router', identity: IDENTITY,
            auth_method: 'DIRECT_API', business_name: 'Test ISP',
            payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: null,
        },
        plans: [PLAN],
        ads: [],
        plan_flags: {
            has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
            regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1,
        },
        portal_settings: { header_style: 'hero', show_ads: false, header_bg_image_url: headerBg },
    };
}

const photo = route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: PHOTO_BYTES });
const refuse = route => route.abort('connectionrefused');
const hang = () => {};

/**
 * direct:     how the backend host answers the photo
 * sameOrigin: how the portal's own origin answers /portal-media/
 * apiDown:    the phone cannot reach the backend host at all (the DNS/SNI
 *             lottery api/bw.js exists for), so the API comes through /api/bw
 */
async function openPortal(page, headerBg, { direct = photo, sameOrigin = photo, apiDown = false } = {}) {
    const seen = { direct: 0, sameOrigin: 0, outsideGarden: [] };
    const body = JSON.stringify(portal(headerBg));
    const json = route => route.fulfill({ status: 200, contentType: 'application/json', body });
    const empty = route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ ads: [], pagination: {} }),
    });

    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') {
            if (url.pathname.startsWith('/api/bw')) {
                return url.pathname.includes('/public/portal/') ? json(route) : empty(route);
            }
            if (url.pathname.startsWith('/portal-media/')) {
                seen.sameOrigin += 1;
                return sameOrigin(route);
            }
            return route.fallback();
        }
        if (url.hostname === 'isp.bitwavetechnologies.com') {
            if (url.pathname.startsWith('/media/')) {
                seen.direct += 1;
                return direct(route);
            }
            if (apiDown) return refuse(route);
            return url.pathname.endsWith(`/public/portal/${IDENTITY}`) ? json(route) : empty(route);
        }
        seen.outsideGarden.push(url.href);
        return refuse(route);
    });

    await page.goto('/?' + new URLSearchParams({ router: IDENTITY, gw: '10.0.0.1', mac: '11:22:33:44:55:66' }));
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    return seen;
}

const heroImg = page => page.locator('#portal-header .hero-bg-img img');

async function expectPainted(page, srcPattern) {
    await expect(page.locator('#portal-header .hero-bg-img')).toHaveClass(/loaded/, { timeout: 10000 });
    await expect.poll(() => heroImg(page).evaluate(i => i.currentSrc || i.src), { timeout: 10000 }).toMatch(srcPattern);
    await expect.poll(() => heroImg(page).evaluate(i => i.naturalWidth), { timeout: 10000 }).toBeGreaterThan(0);
}

const imagesOutsideGarden = seen => seen.outsideGarden.filter(u => !/fonts\.g/.test(u));

test('an uploaded photo paints from the walled-garden host, with no other host involved', async ({ page }) => {
    const seen = await openPortal(page, PHOTO_URL);
    await expectPainted(page, /isp\.bitwavetechnologies\.com\/media\/c\//);
    expect(seen.direct).toBe(1);
    expect(seen.sameOrigin).toBe(0);
    expect(imagesOutsideGarden(seen)).toEqual([]);
    await expect(page.locator('#portal-header .hero-gradient-overlay')).toHaveCount(1);
});

test('a refused backend host falls back to the portal origin', async ({ page }) => {
    const seen = await openPortal(page, PHOTO_URL, { direct: refuse });
    await expectPainted(page, /\/portal-media\/c\//);
    expect(seen.sameOrigin).toBe(1);
});

test('a backend host that silently hangs falls back too', async ({ page }) => {
    const seen = await openPortal(page, PHOTO_URL, { direct: hang });
    await expectPainted(page, /\/portal-media\/c\//);
    expect(seen.sameOrigin).toBe(1);
});

test('when the API is already on the same-origin proxy the photo skips the backend host', async ({ page }) => {
    const seen = await openPortal(page, PHOTO_URL, { apiDown: true });
    await expectPainted(page, /\/portal-media\/c\//);
    expect(seen.direct).toBe(0);
});

test('with both routes dead the customer still gets a bundled preset and working plans', async ({ page }) => {
    await openPortal(page, PHOTO_URL, { direct: refuse, sameOrigin: refuse });
    await expectPainted(page, /images\/presets\/\w+\.jpg/);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
});

for (const [name, id] of [
    ['city', '1477959858617-67f85cf4f1df'],
    ['people', '1529156069898-49953e39b3ac'],
    ['nature', '1523805009345-7448845a9e53'],
    ['cafe', '1554118811-1e0d58224f24'],
    ['tech', '1518770660439-4636190af475'],
]) {
    test(`the ${name} preset still renders its bundled file and fetches nothing remote`, async ({ page }) => {
        const seen = await openPortal(page, `https://images.unsplash.com/photo-${id}?w=750&h=370&fit=crop&q=80`);
        await expectPainted(page, new RegExp(`images/presets/${name}\\.(webp|jpg)`));
        expect(seen.direct + seen.sameOrigin).toBe(0);
        expect(imagesOutsideGarden(seen)).toEqual([]);
    });
}

for (const stored of [
    null,
    'https://example.com/hero-bg.jpg',
    'https://isp.bitwavetechnologies.com/media/c/2026/11/clip.mp4',
    'https://isp.bitwavetechnologies.com/media/ads/2026/11/old.jpg',
    'https://isp.bitwavetechnologies.com/media/c/2026/11/x.jpg?y=1',
    'https://isp.bitwavetechnologies.com.evil.example/media/c/2026/11/x.jpg',
    'https://isp.bitwavetechnologies.com/media/c/2026/11/x.jpg" onerror="window.__xss=1',
]) {
    test(`stored value ${String(stored).slice(0, 60)} keeps the old preset behaviour`, async ({ page }) => {
        const seen = await openPortal(page, stored);
        // Any bundled file: the old keyword match reads "tech" in our own hostname.
        await expectPainted(page, /images\/presets\/\w+\.(webp|jpg)/);
        expect(seen.direct + seen.sameOrigin).toBe(0);
        expect(imagesOutsideGarden(seen)).toEqual([]);
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    });
}

test('vercel.json serves the same-origin route from the media host', () => {
    const { rewrites } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    expect(rewrites).toContainEqual({
        source: '/portal-media/:path*',
        destination: 'https://isp.bitwavetechnologies.com/media/:path*',
    });
});
