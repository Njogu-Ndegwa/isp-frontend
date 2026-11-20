const { test, expect } = require('@playwright/test');

// portal_settings.company_logo_url replaces the Wi-Fi icon in the hero header,
// as the dashboard preview (isp-billing-admin PortalPreview.tsx) already shows.
// Only our own media host is used, since the walled garden lets it through
// before login. API and image calls are mocked; nothing reaches production.

const IDENTITY = 'LOGO-TEST';
const LOGO = 'https://isp.bitwavetechnologies.com/media/c/2026/11/r1-test.png';
// 1x1 PNG
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

function payload(portalSettings) {
    return {
        router: {
            router_id: 42, name: 'Test Router', identity: IDENTITY,
            auth_method: 'DIRECT_API', business_name: 'Fastnet Test',
            payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: null,
        },
        plans: [{
            id: 1, name: 'Daily', price: 50, speed: '5M', duration_value: 1, duration_unit: 'DAYS',
            connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
        }],
        ads: [],
        plan_flags: {
            has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
            regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1,
        },
        portal_settings: Object.assign({ header_style: 'hero', show_ads: false }, portalSettings),
    };
}

async function openPortal(page, portalSettings, { logoStatus = 200 } = {}) {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(url => url.hostname.indexOf('bitwavetechnologies') !== -1, route => {
        const url = new URL(route.request().url());
        if (url.pathname.indexOf('/media/') === 0) {
            return logoStatus === 200
                ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
                : route.fulfill({ status: logoStatus, body: 'nope' });
        }
        if (url.pathname.endsWith(`/public/portal/${IDENTITY}`)) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload(portalSettings)) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route(url => url.pathname.endsWith(`/public/portal/${IDENTITY}`), route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload(portalSettings)) }));
    await page.goto(`/?router=${IDENTITY}&gw=10.0.0.1&mac=11:22:33:44:55:66`);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    return errors;
}

test.describe('hero logo on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

    test('a logo on our media host replaces the Wi-Fi icon, sized and named', async ({ page }) => {
        const errors = await openPortal(page, { company_logo_url: LOGO });
        const logo = page.locator('#portal-header .hero-logo');
        await expect(logo).toHaveCount(1);
        await expect(logo).toHaveAttribute('src', LOGO);
        await expect(logo).toHaveAttribute('alt', 'Fastnet Test');
        await expect(page.locator('#portal-header .hero-wifi-icon')).toHaveCount(0);
        await expect.poll(() => logo.evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
        const box = await logo.boundingBox();
        expect(box.width).toBeLessThanOrEqual(64);
        expect(box.height).toBeLessThanOrEqual(64);
        const css = await logo.evaluate(el => {
            const s = getComputedStyle(el);
            return { radius: parseFloat(s.borderTopLeftRadius), fit: s.objectFit };
        });
        expect(css.radius).toBeGreaterThan(0);
        expect(css.fit).toBe('cover');
        expect(errors).toEqual([]);
    });

    test('no logo keeps the Wi-Fi icon', async ({ page }) => {
        await openPortal(page, { company_logo_url: null });
        await expect(page.locator('#portal-header .hero-wifi-icon')).toHaveCount(1);
        await expect(page.locator('#portal-header .hero-logo')).toHaveCount(0);
    });

    test('a logo on any other host is ignored', async ({ page }) => {
        await openPortal(page, { company_logo_url: 'https://example.com/logo.png' });
        await expect(page.locator('#portal-header .hero-wifi-icon')).toHaveCount(1);
        await expect(page.locator('#portal-header .hero-logo')).toHaveCount(0);
    });

    test('a logo that fails to load falls back to the Wi-Fi icon', async ({ page }) => {
        const errors = await openPortal(page, { company_logo_url: LOGO }, { logoStatus: 404 });
        await expect(page.locator('#portal-header .hero-wifi-icon')).toHaveCount(1);
        await expect(page.locator('#portal-header .hero-logo')).toHaveCount(0);
        expect(errors).toEqual([]);
    });
});

// portal_settings.header_bg_image_url: a photo the reseller uploaded replaces
// the bundled preset, under the same media-host rule as the logo.
const PHOTO = 'https://isp.bitwavetechnologies.com/media/c/2026/11/r1-shop.jpg';

test.describe('hero own header photo on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

    test('an uploaded photo on our media host is drawn behind the hero', async ({ page }) => {
        const errors = await openPortal(page, { header_bg_image_url: PHOTO });
        const img = page.locator('#portal-header .hero-bg-img img');
        await expect(img).toHaveAttribute('src', PHOTO);
        await expect(page.locator('#portal-header .hero-bg-img source')).toHaveCount(0);
        await expect(page.locator('#portal-header .hero-bg-img')).toHaveClass(/loaded/);
        expect(errors).toEqual([]);
    });

    test('a preset link keeps the bundled photo', async ({ page }) => {
        await openPortal(page, {
            header_bg_image_url: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=750&h=370&fit=crop&q=80',
        });
        await expect(page.locator('#portal-header .hero-bg-img img')).toHaveAttribute('src', 'images/presets/nature.jpg');
    });

    test('a photo on any other host is ignored', async ({ page }) => {
        await openPortal(page, { header_bg_image_url: 'https://example.com/shop.jpg' });
        await expect(page.locator('#portal-header .hero-bg-img img')).toHaveAttribute('src', /^images\/presets\//);
    });

    test('an uploaded photo that fails to load falls back to a bundled photo', async ({ page }) => {
        const errors = await openPortal(page, { header_bg_image_url: PHOTO }, { logoStatus: 404 });
        await expect(page.locator('#portal-header .hero-bg-img img')).toHaveAttribute('src', /^images\/presets\/city\.jpg$/);
        await expect(page.locator('#portal-header .hero-bg-img')).toHaveClass(/loaded/);
        expect(errors).toEqual([]);
    });
});
