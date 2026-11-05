const { test, expect } = require('@playwright/test');

// With no ad to show, the login page goes straight from the header to the steps:
// no heading, card, badge or gap, and nothing ever asks customers to advertise.

const IDENTITY = 'EMPTY-TEST';
const ASKS_TO_ADVERTISE = /advertise|your ad here|your business here|book this space|ad space/i;
const LOCAL = {
    id: 21, title: 'Fresh onions', description: 'Sold by the kilo', placement: 'local',
    seller_name: 'Wanjiku', seller_location: 'By the stage', phone_number: '0712000111',
    price: 'KSH 120', category: 'produce', image_url: '/images/demo-spots/onions-land.webp',
};
const HERO = { ...LOCAL, id: 22, placement: 'hero', media_type: 'image', slot: 'platform', image_fit: 'cover' };
const portal = (ads, settings = {}) => ({
    router: { router_id: 42, identity: IDENTITY, auth_method: 'DIRECT_API', business_name: 'Test ISP',
        payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: '0712000999' },
    plans: [{ id: 7, name: 'Daily', price: 50, speed: '5M', duration_value: 1, duration_unit: 'DAYS',
        connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 }],
    ads, plan_flags: {}, portal_settings: { show_ads: true, ...settings },
});
const shot = (page, name) => process.env.CAPTURE_SCREENSHOTS
    ? page.screenshot({ path: `test-results/${name}.png`, fullPage: true })
    : null;

async function open(page, body, { listFails = false } = {}) {
    await page.setViewportSize({ width: 390, height: 844 });
    let answer;
    const answered = new Promise(resolve => { answer = resolve; });
    await page.route(url => url.hostname === 'isp.bitwavetechnologies.com', r =>
        listFails ? r.abort('blockedbyclient') : r.fulfill({ json: { ads: [] } }));
    await page.route(url => url.pathname.endsWith(`/public/portal/${IDENTITY}`), async r => {
        await answered;
        return r.fulfill({ json: body });
    });
    await page.goto(`/?router=${IDENTITY}&gw=10.0.0.1&mac=AA:BB:CC:DD:EE:FF`, { waitUntil: 'domcontentloaded' });
    // Still loading: nothing about ads on screen, not even for a moment.
    await expect(page.locator('#spots-section')).toBeHidden();
    await expect(page.locator('.showcase-badge')).toBeHidden();
    answer();
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
}

async function expectNothingAboutAds(page) {
    await expect(page.locator('#spots-section')).toBeHidden();
    await expect(page.locator('.showcase-badge')).toBeHidden();
    await expect(page.locator('.scroll-hint')).toBeHidden();
    await expect(page.locator('.pay-spot')).toBeHidden();
    await expect(page.locator('.done-spots')).toBeHidden();
    await expect(page.locator('body')).not.toContainText(ASKS_TO_ADVERTISE);
    await expect(page.locator('#mpesaQuickSteps')).toBeVisible();
}

test('no ads: the whole section is gone, including while loading', async ({ page }) => {
    await open(page, portal([]));
    await expectNothingAboutAds(page);
    await shot(page, 'spots-empty-mobile');
});

test('no ads: the steps sit right under the header, with the same gap as ads switched off', async ({ page }) => {
    const gap = async () => page.evaluate(() =>
        document.getElementById('mpesaQuickSteps').getBoundingClientRect().top
        - document.getElementById('portal-header').getBoundingClientRect().bottom);
    await open(page, portal([]));
    const empty = await gap();
    await page.unrouteAll();
    await open(page, portal([], { show_ads: false }));
    expect(empty).toBe(await gap());
});

test('portal answer without ads and a failed list call: still nothing about ads', async ({ page }) => {
    const { ads, ...withoutAds } = portal([]);
    await open(page, withoutAds, { listFails: true });
    await expectNothingAboutAds(page);
});

test('payment form and success page ask nothing either when there are no ads', async ({ page }) => {
    await open(page, portal([]));
    await page.locator('#plansGrid .plan-card').click();
    await expect(page.locator('#phoneNumber')).toBeVisible();
    await expect(page.locator('.pay-spot')).toBeHidden();
    await expect(page.locator('body')).not.toContainText(ASKS_TO_ADVERTISE);
    await page.evaluate(() => window.testSuccessPage());
    await expect(page.locator('#successSection')).toBeVisible();
    await expect(page.locator('.done-spots')).toBeHidden();
    await expect(page.locator('#doneFeature')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(ASKS_TO_ADVERTISE);
    await shot(page, 'spots-empty-success-mobile');
});

test('ads present: section shows the deals heading and the AD label, never an ask', async ({ page }) => {
    await open(page, portal([LOCAL]));
    await expect(page.locator('#spots-section')).toBeVisible();
    await expect(page.locator('.showcase-title')).toHaveText('🛒 Soko Deals Today');
    await expect(page.locator('.showcase-badge')).toHaveText('AD');
    await expect(page.locator('.spot-card')).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText(ASKS_TO_ADVERTISE);
    await shot(page, 'spots-present-mobile');
});

test('hero ads: no slide asks customers to advertise, and the label stays', async ({ page }) => {
    await open(page, portal([HERO], { header_style: 'hero' }));
    await expect(page.locator('#portal-header .hero-slide--spot')).toHaveCount(1);
    await expect(page.locator('#portal-header .hero-seg')).toHaveCount(2);
    await expect(page.locator('#portal-header .hero-spot-tag')).toHaveText('Ad');
    await expect(page.locator('body')).not.toContainText(ASKS_TO_ADVERTISE);
    await page.locator('#portal-header .hero-seg[data-go="1"]').click();
    await shot(page, 'spots-hero-mobile');
});
