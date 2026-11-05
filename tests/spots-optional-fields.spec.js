const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

// Location, price, description, WhatsApp and the photo are optional on the ad
// form, and a photo can fail to load (walled garden, deleted upload). On every
// surface a missing value is simply left out: no "null", no broken picture, and
// one bad ad never stops the other ads or the plans.

const IDENTITY = 'OPTIONAL-TEST';
const ROOT = path.join(__dirname, '..');
const LEAKED = /\bnull\b|\bundefined\b|\[object/;
const GONE_PHOTO = '/images/gone-photo.jpg';
const PHOTO = '/images/demo-spots/onions-land.webp';

const FULL = {
    id: 21, title: 'Fresh onions', description: 'Sold by the kilo', placement: 'local',
    seller_name: 'Wanjiku', seller_location: 'By the stage, Kiambu', phone_number: '0712000111',
    whatsapp_number: '0712000222', price: 'KSH 120', category: 'produce', image_url: PHOTO,
};
const NO_LOCATION = { ...FULL, id: 22, title: 'No location', seller_location: null };
const NO_PRICE = { ...FULL, id: 23, title: 'No price', price: null };
const BROKEN = { ...FULL, id: 24, title: 'Broken photo', image_url: GONE_PHOTO };
const NO_PHOTO = { ...FULL, id: 25, title: 'No photo', image_url: null };
const BARE = {
    id: 26, title: 'Only required', seller_name: 'Kamau', phone_number: '0712000333', placement: 'local',
    description: null, seller_location: null, whatsapp_number: null, price: null, image_url: null,
    category: null, badge_type: null, badge_text: null,
};
const LOCALS = [FULL, NO_LOCATION, NO_PRICE, BROKEN, NO_PHOTO, BARE];

const HERO = {
    ...BARE, id: 31, title: 'Phone repair', seller_name: 'Otis Repairs', placement: 'hero',
    media_type: 'image', slot: 'platform', image_fit: 'cover', image_url: GONE_PHOTO, bg_color: '#14532D',
};

const portal = (ads, settings = {}) => ({
    router: { router_id: 42, identity: IDENTITY, auth_method: 'DIRECT_API', business_name: 'Test ISP',
        payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: '0712000999' },
    plans: [{ id: 7, name: 'Daily', price: 50, speed: '5M', duration_value: 1, duration_unit: 'DAYS',
        connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 }],
    ads, plan_flags: {}, portal_settings: { show_ads: true, ...settings },
});

async function open(page, body) {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = [];
    const images = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.resourceType() === 'image') images.push(new URL(r.url()).pathname); });
    await page.route(url => url.hostname === 'isp.bitwavetechnologies.com', r => r.fulfill({ json: { ads: [] } }));
    await page.route(url => url.pathname.endsWith(`/public/portal/${IDENTITY}`), r => r.fulfill({ json: body }));
    await page.goto(`/?router=${IDENTITY}&gw=10.0.0.1&mac=AA:BB:CC:DD:EE:FF`);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    return { errors, images };
}

const shot = (page, name) => process.env.CAPTURE_SCREENSHOTS
    ? page.screenshot({ path: `test-results/${name}.png`, fullPage: true })
    : null;

// Picture on screen: loaded, or the neutral inline tile. Never a broken icon.
const expectPictureShown = (img) => expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);

async function expectFitsPhone(page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

const card = (page, id) => page.locator(`.spot-card[data-spot-id="${id}"]`);

test('showcase: every optional field missing leaves a clean card, and all ads and plans still show', async ({ page }) => {
    const { errors, images } = await open(page, portal(LOCALS));
    await expect(page.locator('.spot-card')).toHaveCount(LOCALS.length);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    await expect(page.locator('#spots-section')).not.toContainText(LEAKED);

    await expect(card(page, 21).locator('.product-seller')).toHaveText('Wanjiku - By the stage');
    await expect(card(page, 22).locator('.product-seller')).toHaveText('Wanjiku');
    await expect(card(page, 22).locator('.product-price')).toHaveText('KSH 120');
    await expect(card(page, 23).locator('.product-price')).toHaveCount(0);
    await expect(card(page, 26).locator('.product-price')).toHaveCount(0);
    await expect(card(page, 26).locator('.product-name')).toHaveText('Only required');

    for (const id of [24, 25, 26]) {
        await expect(card(page, id).locator('img')).toHaveAttribute('src', /^data:image\/svg/);
        await expectPictureShown(card(page, id).locator('img'));
    }
    await expectPictureShown(card(page, 21).locator('img'));

    // A missing photo asks for nothing; a failed one never goes to the old sample pictures.
    expect(images.filter(p => /null|undefined|tomatoes|phone-cases|sukuma|watches|bananas/.test(p))).toEqual([]);
    await expectFitsPhone(page);
    expect(errors).toEqual([]);
    await shot(page, 'optional-showcase-mobile');
});

test('showcase: a photo the network refuses (walled garden) also ends on the neutral tile', async ({ page }) => {
    await page.route(url => url.hostname === 'media.example.test', r => r.abort('blockedbyclient'));
    await open(page, portal([{ ...FULL, id: 27, image_url: 'https://media.example.test/gone.jpg' }]));
    await expect(card(page, 27).locator('img')).toHaveAttribute('src', /^data:image\/svg/);
});

test('detail sheet: missing rows are left out, and the next full ad brings them back', async ({ page }) => {
    const { errors } = await open(page, portal(LOCALS));

    await card(page, 26).click();
    const sheet = page.locator('#spotSheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator('#spotSheetTitle')).toHaveText('Only required');
    await expect(page.locator('#spotSheetDescription')).toBeHidden();
    await expect(page.locator('#spotSheetSeller')).toHaveText('Kamau');
    await expect(page.locator('#spotSheetLocation')).toBeHidden();
    await expect(page.locator('.spot-sheet-price-section')).toBeHidden();
    await expect(page.locator('#spotSheetCallBtn')).toHaveAttribute('href', 'tel:0712000333');
    await expect(sheet).not.toContainText(LEAKED);
    await expectPictureShown(page.locator('#spotSheetImg'));
    await shot(page, 'optional-sheet-mobile');
    await page.locator('#spotSheetClose').click();

    await card(page, 24).click();
    await expect(page.locator('#spotSheetImg')).toHaveAttribute('src', /^data:image\/svg/);
    await expectPictureShown(page.locator('#spotSheetImg'));
    await page.locator('#spotSheetClose').click();

    await card(page, 21).click();
    await expect(page.locator('#spotSheetImg')).toHaveAttribute('src', PHOTO);
    await expect(page.locator('#spotSheetDescription')).toHaveText('Sold by the kilo');
    await expect(page.locator('#spotSheetLocation')).toHaveText('By the stage, Kiambu');
    await expect(page.locator('#spotSheetPrice')).toHaveText('KSH 120');
    await expect(page.locator('.spot-sheet-price-section')).toBeVisible();
    expect(errors).toEqual([]);
});

test('detail sheet: no phone number leaves out the Call button instead of failing to open', async ({ page }) => {
    const { errors } = await open(page, portal([{ ...BARE, phone_number: null }, FULL]));
    await card(page, 26).click();
    await expect(page.locator('#spotSheet')).toBeVisible();
    await expect(page.locator('#spotSheetCallBtn')).toBeHidden();
    await page.locator('#spotSheetClose').click();
    await card(page, 21).click();
    await expect(page.locator('#spotSheetCallBtn')).toBeVisible();
    expect(errors).toEqual([]);
});

test('payment row: tiles leave out a missing price and keep a clean picture', async ({ page }) => {
    const { errors } = await open(page, portal([NO_PRICE, BROKEN, BARE]));
    await page.locator('#plansGrid .plan-card').click();
    await expect(page.locator('#phoneNumber')).toBeVisible();

    const tiles = page.locator('#miniProducts .mini-product');
    await expect(tiles).toHaveCount(3);
    await expect(page.locator('#miniProducts')).not.toContainText(LEAKED);
    await expect(page.locator('#miniProducts .mini-product[data-spot-id="23"] span')).toHaveCount(0);
    await expect(page.locator('#miniProducts .mini-product[data-spot-id="24"] span')).toHaveText('KSH 120');
    for (const id of [24, 26]) {
        const img = page.locator(`#miniProducts .mini-product[data-spot-id="${id}"] img`);
        await expect(img).toHaveAttribute('src', /^data:image\/svg/);
    }
    await expectFitsPhone(page);
    expect(errors).toEqual([]);
    await shot(page, 'optional-payment-mobile');
});

test('success page: local row and details handle missing fields', async ({ page }) => {
    const { errors } = await open(page, portal([NO_PRICE, BROKEN, BARE]));
    await page.evaluate(() => window.testSuccessPage());
    await expect(page.locator('#successSection')).toBeVisible();

    await expect(page.locator('.done-spot-card')).toHaveCount(3);
    await expect(page.locator('.done-spots')).not.toContainText(LEAKED);
    await expect(page.locator('.done-spot-card[data-spot-id="23"] .done-spot-price')).toHaveCount(0);
    for (const id of [24, 26]) {
        await expect(page.locator(`.done-spot-card[data-spot-id="${id}"] img`)).toHaveAttribute('src', /^data:image\/svg/);
    }
    await page.locator('.done-spot-card[data-spot-id="26"]').click();
    await expect(page.locator('#spotSheet')).toBeVisible();
    await expect(page.locator('#spotSheetLocation')).toBeHidden();
    await expectFitsPhone(page);
    expect(errors).toEqual([]);
    await shot(page, 'optional-success-mobile');
});

test('hero: a broken photo leaves the slide colour and the bar, with nothing missing shown', async ({ page }) => {
    const contain = { ...HERO, id: 32, image_fit: 'contain', title: null, price: null, image_url: null };
    const { errors } = await open(page, portal([HERO, contain], { header_style: 'hero' }));

    const slide = page.locator('.hero-slide--spot[data-spot-id="31"]');
    await page.locator('#portal-header .hero-seg[data-go="1"]').click();
    await expect(slide.locator('img')).toHaveCount(0);
    await expect(slide.locator('.hero-spot-name')).toHaveText('Otis Repairs');
    await expect(slide.locator('.hero-spot-offer')).toHaveText('Phone repair');
    await expect(slide.locator('[data-hero-cta="call"]')).toHaveAttribute('href', 'tel:0712000333');
    await shot(page, 'optional-hero-mobile');

    const plain = page.locator('.hero-slide--spot[data-spot-id="32"]');
    await expect(plain.locator('.hero-spot-headline')).toHaveCount(0);
    await expect(plain.locator('.hero-spot-offer')).toHaveCount(0);
    await expect(page.locator('#portal-header')).not.toContainText(LEAKED);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    await expectFitsPhone(page);
    expect(errors).toEqual([]);
});

test('wait screen: a broken sponsor photo drops the picture but keeps the Ad label and the text', async ({ page }) => {
    const { errors } = await open(page, portal([HERO], { header_style: 'hero' }));
    await page.evaluate(() => window.testProcessingPage());

    const box = page.locator('.wait-spot');
    await expect(box).toBeVisible();
    await expect(box.locator('.spot-media')).toHaveCount(0);
    await expect(box.locator('.hero-spot-tag')).toHaveText('Ad');
    await expect(box.locator('.wait-spot-name')).toHaveText('Otis Repairs');
    await expect(box.locator('.wait-spot-offer')).toHaveText('Phone repair');
    await expect(box.locator('.wait-spot-cta')).toHaveAttribute('href', 'tel:0712000333');
    await expect(box).not.toContainText(LEAKED);
    await expectFitsPhone(page);
    expect(errors).toEqual([]);
    await shot(page, 'optional-wait-mobile');
});

test('wait screen: no sponsor photo at all, and no phone, still reads clean', async ({ page }) => {
    const { errors } = await open(page, portal([{ ...HERO, image_url: null, phone_number: null, title: null }], { header_style: 'hero' }));
    await page.evaluate(() => window.testProcessingPage());
    const box = page.locator('.wait-spot');
    await expect(box).toBeVisible();
    await expect(box.locator('.hero-spot-tag')).toHaveText('Ad');
    await expect(box.locator('.wait-spot-cta')).toHaveCount(0);
    await expect(box.locator('.wait-spot-offer')).toHaveCount(0);
    await expect(box).not.toContainText(LEAKED);
    expect(errors).toEqual([]);
});

test('success sponsor: WhatsApp falls back to the phone, and leaves out the button with neither', async ({ page }) => {
    const { errors } = await open(page, portal([HERO], { header_style: 'hero' }));
    await page.evaluate(() => window.testSuccessPage());
    const feature = page.locator('#doneFeature');
    await expect(feature).toBeVisible();
    await expect(feature.locator('.wait-spot-cta')).toHaveAttribute('href', 'https://wa.me/254712000333');
    await expect(feature.locator('.spot-media')).toHaveCount(0);
    await expect(feature.locator('.hero-spot-tag')).toHaveText('Ad');
    await expect(feature).not.toContainText(LEAKED);
    await shot(page, 'optional-sponsor-mobile');
    expect(errors).toEqual([]);

    await page.unrouteAll();
    const second = await open(page, portal([{ ...HERO, phone_number: null, whatsapp_number: null }], { header_style: 'hero' }));
    await page.evaluate(() => window.testSuccessPage());
    await expect(page.locator('#doneFeature')).toBeVisible();
    await expect(page.locator('#doneFeature .wait-spot-cta')).toHaveCount(0);
    expect(second.errors).toEqual([]);
});

test('one bad ad never stops the others or the plans', async ({ page }) => {
    const bad = [null, 'not an ad', 7, [], {}, { id: null, title: 'No id' }, { id: 41 },
        { id: 43, title: { oops: 1 }, seller_name: ['x'], image_url: {} },
        { id: 42, title: { oops: 1 }, seller_name: 'Kamau', seller_location: 5, price: 80, phone_number: 712000444, image_url: {} }];
    const { errors } = await open(page, portal([...bad, FULL, BARE]));

    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    await expect(page.locator('.spot-card')).toHaveCount(3);
    await expect(page.locator('#spots-section')).not.toContainText(LEAKED);
    await expect(card(page, 42).locator('.product-name')).toHaveCount(0);
    await expect(card(page, 42).locator('.product-seller')).toHaveText('Kamau - 5');
    await expect(card(page, 42).locator('.product-price')).toHaveText('80');
    await card(page, 42).click();
    await expect(page.locator('#spotSheetCallBtn')).toHaveAttribute('href', 'tel:712000444');
    expect(errors).toEqual([]);
});

test('a list with only bad ads shows nothing about ads, and the plans', async ({ page }) => {
    const { errors } = await open(page, portal([null, { id: 41 }]));
    await expect(page.locator('#spots-section')).toBeHidden();
    await expect(page.locator('.spot-card')).toHaveCount(0);
    await page.locator('#plansGrid .plan-card').click();
    await expect(page.locator('.pay-spot')).toBeHidden();
    expect(errors).toEqual([]);
});

test('an ads field that is not a list changes nothing for the plans', async ({ page }) => {
    const { errors } = await open(page, { ...portal([]), ads: { broken: true } });
    await expect(page.locator('#spots-section')).toBeHidden();
    expect(errors).toEqual([]);
});

test('the standalone list call (portal call failed) handles the same ads', async ({ page }) => {
    const { errors } = await open(page, portal([]));
    await page.route(url => url.pathname.endsWith('/public/spots'), r => r.fulfill({ json: { ads: [null, ...LOCALS] } }));
    await page.evaluate(() => window.refreshAds());
    await expect(page.locator('.spot-card')).toHaveCount(LOCALS.length);
    await expect(page.locator('#spots-section')).not.toContainText(LEAKED);
    expect(errors).toEqual([]);
});

test('offer text with quotes or markup stays text on every card', async ({ page }) => {
    const tricky = { ...FULL, id: 28, title: '"><b id="injected">x</b>', seller_name: '<i id="injected2">y</i>', price: '<u id="injected3">z</u>' };
    await open(page, portal([tricky]));
    await expect(page.locator('.spot-card')).toHaveCount(1);
    await page.locator('#plansGrid .plan-card').click();
    await expect(page.locator('#miniProducts .mini-product')).toHaveCount(1);
    await page.evaluate(() => window.testSuccessPage());
    await expect(page.locator('.done-spot-card')).toHaveCount(1);
    await expect(page.locator('#injected, #injected2, #injected3')).toHaveCount(0);
});

test('no file names an image that is not in the repo any more', async () => {
    const missing = file => {
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        return [...text.matchAll(/['"]\/?(images\/[^'"]+)['"]/g)]
            .map(m => m[1])
            .filter(p => !fs.existsSync(path.join(ROOT, p)));
    };
    expect(missing('spots.js')).toEqual([]);
    expect(missing('service-worker.js')).toEqual([]);
});

test('everything the service worker caches exists, so its install cannot fail on a 404', async ({ request }) => {
    const text = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    const list = text.slice(text.indexOf('ASSETS_TO_CACHE = ['), text.indexOf('];'));
    const assets = [...list.matchAll(/'(\/[^']*)'/g)].map(m => m[1]);
    expect(assets.length).toBeGreaterThan(5);
    for (const asset of assets) {
        expect((await request.get(asset)).status(), asset).toBe(200);
    }
});
