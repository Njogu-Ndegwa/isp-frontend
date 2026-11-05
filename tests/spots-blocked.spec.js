const { test, expect } = require('@playwright/test');

// A blocker may still kill the portal's offers (other filter lists, a stricter
// mode). Whatever it kills must fail quietly: plans, the phone form and the
// M-Pesa request keep working, and tapping an offer never leaves a dim, empty,
// scroll-locked screen.

const IDENTITY = 'SPOT-TEST';
const LOCAL = {
    id: 21, title: 'Fresh onions', description: 'Sold by the kilo', placement: 'local',
    seller_name: 'Wanjiku', seller_location: 'By the stage', phone_number: '0712000111',
    price: 'KSH 120', category: 'produce', image_url: '/images/demo-spots/onions-land.webp',
};
const portal = () => ({
    router: { router_id: 42, identity: IDENTITY, auth_method: 'DIRECT_API', business_name: 'Test ISP',
        payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: '0712000999' },
    plans: [{ id: 7, name: 'Daily', price: 50, speed: '5M', duration_value: 1, duration_unit: 'DAYS',
        connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 }],
    ads: [LOCAL], plan_flags: {}, portal_settings: { show_ads: true },
});
const isSpots = url => url.pathname.includes('/public/spots');

async function open(page, { body = portal(), block = [] } = {}) {
    const errors = [];
    const charges = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(url => url.hostname === 'isp.bitwavetechnologies.com', r => r.fulfill({ json: { ads: [] } }));
    await page.route(url => url.pathname.endsWith(`/public/portal/${IDENTITY}`), r => r.fulfill({ json: body }));
    await page.route('**/api/hotspot/register-and-pay', r => {
        charges.push(r.request().postDataJSON());
        return r.fulfill({ json: { customer_id: 123, status: 'pending' } });
    });
    await page.route('**/api/hotspot/payment-status/123**', r =>
        r.fulfill({ json: { status: 'pending', payment_status: 'pending' } }));
    for (const matcher of block) await page.route(matcher, r => r.abort('blockedbyclient'));
    await page.goto(`/?router=${IDENTITY}&gw=10.0.0.1&mac=AA:BB:CC:DD:EE:FF`);
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1, { timeout: 15000 });
    return { errors, charges };
}

async function pay(page, charges) {
    await page.locator('#plansGrid .plan-card').click();
    await page.locator('#phoneNumber').fill('0712345678');
    await page.getByRole('button', { name: 'Pay with M-Pesa' }).click();
    await expect(page.locator('#processingSection')).toBeVisible();
    expect(charges).toHaveLength(1);
}

test('the portal calls the neutral paths, never the old ones', async ({ page }) => {
    const paths = [];
    page.on('request', r => {
        if (r.url().includes('isp.bitwavetechnologies.com')) paths.push(new URL(r.url()).pathname);
    });
    await open(page);
    await expect.poll(() => paths).toContain('/api/public/spots/seen');
    await page.locator('.spot-card[data-spot-id="21"]').click();
    await expect.poll(() => paths).toContain('/api/public/spots/tap');
    expect(paths.filter(p => p.includes('/ads'))).toEqual([]);
});

test('view and tap calls blocked: the sheet still opens and buying still works', async ({ page }) => {
    const { errors, charges } = await open(page, { block: [isSpots] });
    await page.locator('.spot-card[data-spot-id="21"]').click();
    await expect(page.locator('#spotSheet')).toBeVisible();
    await page.locator('#spotSheetClose').click();
    await pay(page, charges);
    expect(errors).toEqual([]);
});

test('list call blocked too: no offers left hanging and buying still works', async ({ page }) => {
    // No "ads" key makes the page fall back to its own list call.
    const { ads, ...withoutAds } = portal();
    const { errors, charges } = await open(page, { body: withoutAds, block: [isSpots] });
    await expect(page.locator('.spot-card:not(.spot-cta-card)')).toHaveCount(0);
    await pay(page, charges);
    expect(errors).toEqual([]);
});

test('spots.js itself blocked: buying still works', async ({ page }) => {
    const { errors, charges } = await open(page, { block: [url => url.pathname.endsWith('/spots.js')] });
    await pay(page, charges);
    expect(errors).toEqual([]);
});

test('a hidden sheet never leaves a dim, empty, scroll-locked screen', async ({ page }) => {
    await open(page);
    await page.addStyleTag({ content: '#spotSheet { display: none !important; }' });
    await page.locator('.spot-card[data-spot-id="21"]').click();
    await expect(page.locator('#spotSheetOverlay')).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('the sheet opens normally, labelled as sponsored, and closes', async ({ page }) => {
    await open(page);
    await page.locator('.spot-card[data-spot-id="21"]').click();
    await expect(page.locator('#spotSheet')).toBeVisible();
    await expect(page.locator('#spotSheetOverlay')).toBeVisible();
    await expect(page.locator('#spotSheet .spot-sheet-tag')).toHaveText('SPONSORED');
    await expect(page.locator('#spotSheetTitle')).toHaveText('Fresh onions');
    await page.keyboard.press('Escape');
    await expect(page.locator('#spotSheetOverlay')).toBeHidden();
});
