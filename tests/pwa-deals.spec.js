const { test, expect } = require('@playwright/test');

// pwa.html, the installed app's speed test / support page. It only ever shows
// real offers: GET /api/public/spots answers { ads: [...], pagination }, and no
// offers or a failed call leave no trace of the section, never sample data.

const SAMPLE_WORDS = /Fresh Tomatoes|Mama Njeri|Phone Cases|Tech Hub|Sukuma Wiki|Green Grocers|0712345678/;
const SPOT = {
    id: 21, title: 'Fresh onions', description: 'Sold by the kilo', placement: 'local', media_type: 'image',
    seller_name: 'Wanjiku Greens', seller_location: 'By the stage', phone_number: '0722000111',
    whatsapp_number: '0722000111', price: 'KSH 120', category: 'produce', badge_type: 'hot', badge_text: 'HOT',
    image_url: '/images/demo-spots/onions-land.webp', video_url: null, poster_url: null,
};
const spotsAnswer = ads => ({ ads, pagination: { page: 1, per_page: 20, total: ads.length, total_pages: 1 } });

async function open(page, spots, { settings, path = '/pwa.html' } = {}) {
    await page.setViewportSize({ width: 390, height: 844 });
    const calls = [];
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (settings) {
        await page.addInitScript(s => localStorage.setItem('_cached_portal_settings', JSON.stringify(s)), settings);
    }
    await page.route(url => url.hostname === 'isp.bitwavetechnologies.com', route => {
        calls.push(new URL(route.request().url()).pathname);
        return spots(route);
    });
    await page.goto(path);
    return { calls, errors };
}

async function expectNoDeals(page) {
    await expect(page.locator('#deals')).toBeHidden();
    await expect(page.locator('.nav-item[data-section="deals"]')).toBeHidden();
    await expect(page.locator('.nav-item[data-section="speedtest"]')).toHaveClass(/active/);
    await expect(page.locator('.spot-card:visible')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(SAMPLE_WORDS);
    // The rest of the app is still there and usable.
    await expect(page.locator('#startSpeedTest')).toBeVisible();
}

test('uses the neutral route and shows nothing when there are no offers', async ({ page }) => {
    const { calls, errors } = await open(page, r => r.fulfill({ json: spotsAnswer([]) }));
    await expect.poll(() => calls).toContain('/api/public/spots');
    await expectNoDeals(page);
    expect(errors).toEqual([]);
    if (process.env.CAPTURE_SCREENSHOTS) await page.screenshot({ path: 'test-results/pwa-deals-empty-mobile.png', fullPage: true });
});

test('stays hidden while the answer is on its way', async ({ page }) => {
    let answer;
    const answered = new Promise(resolve => { answer = resolve; });
    await open(page, async r => { await answered; return r.fulfill({ json: spotsAnswer([SPOT]) }); });
    await expect(page.locator('#deals')).toBeHidden();
    await expect(page.locator('.nav-item[data-section="deals"]')).toBeHidden();
    answer();
    await expect(page.locator('#deals')).toBeVisible();
});

for (const [name, spots] of [
    ['a server error', r => r.fulfill({ status: 500, json: { detail: 'boom' } })],
    ['a blocked or failed call', r => r.abort('blockedbyclient')],
    ['an answer that is not JSON', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>captive</html>' })],
    ['JSON with no list in it', r => r.fulfill({ json: { error: 'Offline' } })],
]) {
    test(`fails quietly on ${name}`, async ({ page }) => {
        const { calls, errors } = await open(page, spots);
        await expect.poll(() => calls).toContain('/api/public/spots');
        await expectNoDeals(page);
        expect(errors).toEqual([]);
    });
}

test('real offers show with the API fields, and open with the seller real number', async ({ page }) => {
    const { errors } = await open(page, r => r.fulfill({ json: spotsAnswer([SPOT, { ...SPOT, id: 22, title: 'Phone repair',
        price: null, badge_type: null, badge_text: null, seller_location: null, image_url: null, description: null }]) }));

    const cards = page.locator('.spot-card');
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#deals')).toBeVisible();
    await expect(page.locator('.nav-item[data-section="deals"]')).toHaveClass(/active/);

    const first = cards.nth(0);
    await expect(first.locator('.product-name')).toHaveText('Fresh onions');
    await expect(first.locator('.product-seller')).toHaveText('Wanjiku Greens');
    await expect(first.locator('.product-price')).toHaveText('KSH 120');
    await expect(first.locator('.product-badge')).toHaveText('HOT');
    await expect(first.locator('img')).toHaveAttribute('src', SPOT.image_url);

    // Empty optional fields leave a clean card, not the words undefined or null.
    const second = cards.nth(1);
    await expect(second.locator('.product-name')).toHaveText('Phone repair');
    await expect(second.locator('.product-price')).toHaveCount(0);
    await expect(second.locator('.product-badge')).toHaveCount(0);
    await expect(second.locator('img')).toHaveAttribute('src', /^data:image\/svg/);
    await expect(page.locator('#deals')).not.toContainText(/undefined|null/);

    if (process.env.CAPTURE_SCREENSHOTS) await page.screenshot({ path: 'test-results/pwa-deals-mocked-mobile.png', fullPage: true });

    await first.click();
    await expect(page.locator('#spotSheetOverlay')).toBeVisible();
    await expect(page.locator('#spotSheetTitle')).toHaveText('Fresh onions');
    await expect(page.locator('#spotSheetSeller')).toHaveText('Wanjiku Greens');
    await expect(page.locator('#spotSheetLocation')).toHaveText('By the stage');
    await expect(page.locator('#spotSheetDescription')).toHaveText('Sold by the kilo');
    await expect(page.locator('#spotCallButton')).toHaveAttribute('href', 'tel:0722000111');
    await page.locator('#spotSheetClose').click();
    await expect(page.locator('#spotSheetOverlay')).toBeHidden();
    expect(errors).toEqual([]);
});

test('detail sheet leaves out what an offer does not have, and the next full offer brings it back', async ({ page }) => {
    const bare = { id: 23, title: 'Phone repair', seller_name: 'Otis', phone_number: null,
        price: null, seller_location: null, description: null, image_url: null, badge_type: null, badge_text: null };
    const { errors } = await open(page, r => r.fulfill({ json: spotsAnswer([bare, SPOT]) }));

    await page.locator('.spot-card[data-spot-id="23"]').click();
    const sheet = page.locator('#spotSheetOverlay');
    await expect(sheet).toBeVisible();
    await expect(page.locator('#spotSheetTitle')).toHaveText('Phone repair');
    await expect(page.locator('#spotSheetSeller')).toHaveText('Otis');
    await expect(page.locator('#spotSheetDescription')).toBeHidden();
    await expect(page.locator('#spotSheetLocation')).toBeHidden();
    await expect(page.locator('#spotSheetBadge')).toBeHidden();
    await expect(sheet.locator('.spot-sheet-price-section')).toBeHidden();
    await expect(page.locator('#spotCallButton')).toBeHidden();
    await expect(page.locator('#spotSheetImage')).toHaveAttribute('src', /^data:image\/svg/);
    await expect(sheet).not.toContainText(/undefined|null/);
    if (process.env.CAPTURE_SCREENSHOTS) {
        await page.waitForTimeout(600); // the sheet slides up first
        await page.screenshot({ path: 'test-results/pwa-sheet-bare-mobile.png' });
    }
    await page.locator('#spotSheetClose').click();

    await page.locator('.spot-card[data-spot-id="21"]').click();
    await expect(page.locator('#spotSheetDescription')).toHaveText('Sold by the kilo');
    await expect(page.locator('#spotSheetLocation')).toHaveText('By the stage');
    await expect(page.locator('#spotSheetBadge')).toHaveText('HOT');
    await expect(sheet.locator('.spot-sheet-price-section')).toBeVisible();
    await expect(page.locator('#spotCallButton')).toHaveAttribute('href', 'tel:0722000111');
    expect(errors).toEqual([]);
});

test('a broken photo falls back to the neutral tile on the card and in the sheet', async ({ page }) => {
    const { errors } = await open(page, r => r.fulfill({ json: spotsAnswer([{ ...SPOT, image_url: '/images/gone-photo.jpg' }]) }));
    const shown = img => expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);

    const image = page.locator('.spot-card img');
    await expect(image).toHaveAttribute('src', /^data:image\/svg/);
    await shown(image);
    await page.locator('.spot-card').click();
    await expect(page.locator('#spotSheetImage')).toHaveAttribute('src', /^data:image\/svg/);
    await shown(page.locator('#spotSheetImage'));
    expect(errors).toEqual([]);
});

test('one bad offer never stops the others', async ({ page }) => {
    const bad = [null, 'not an offer', 7, [], {}, { id: 41 }, { id: 42, title: { oops: 1 }, seller_name: 'Kamau', price: 80 }];
    const { errors } = await open(page, r => r.fulfill({ json: spotsAnswer([...bad, SPOT]) }));
    await expect(page.locator('.spot-card')).toHaveCount(2);
    await expect(page.locator('#deals')).toBeVisible();
    await expect(page.locator('#deals')).not.toContainText(/undefined|null|\[object/);
    await expect(page.locator('.spot-card[data-spot-id="42"] .product-name')).toHaveCount(0);
    await expect(page.locator('.spot-card[data-spot-id="42"] .product-price')).toHaveText('80');
    expect(errors).toEqual([]);
});

test('a list with only bad offers shows nothing', async ({ page }) => {
    const { calls, errors } = await open(page, r => r.fulfill({ json: spotsAnswer([null, { id: 41 }]) }));
    await expect.poll(() => calls).toContain('/api/public/spots');
    await expectNoDeals(page);
    expect(errors).toEqual([]);
});

test('offer text is shown as text, never run as markup', async ({ page }) => {
    await open(page, r => r.fulfill({ json: spotsAnswer([{ ...SPOT,
        title: '<img src=x onerror="window.__ran=1">Onions', seller_name: '"><b id="injected">x</b>' }]) }));
    await expect(page.locator('.spot-card .product-name')).toHaveText('<img src=x onerror="window.__ran=1">Onions');
    await expect(page.locator('#injected')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ran)).toBeUndefined();
});

test('a reseller who switched offers off sees none, and the call is not even made', async ({ page }) => {
    const { calls } = await open(page, r => r.fulfill({ json: spotsAnswer([SPOT]) }), { settings: { show_ads: false } });
    await page.waitForLoadState('load');
    await expectNoDeals(page);
    expect(calls).toEqual([]);
});

test('a link to another section stays on that section when offers arrive', async ({ page }) => {
    await open(page, r => r.fulfill({ json: spotsAnswer([SPOT]) }), { path: '/pwa.html#support' });
    await expect(page.locator('#deals')).toBeVisible();
    await expect(page.locator('.nav-item[data-section="support"]')).toHaveClass(/active/);
});

test('a page saved before this fix (section showing, grey placeholders) still ends up clean', async ({ page }) => {
    const skeleton = '<div class="spot-card spot-skeleton"><div class="product-image skeleton-shimmer"></div></div>';
    await page.route('**/pwa.html', async route => {
        const response = await route.fetch();
        const body = (await response.text())
            .replace('id="deals" style="display:none"', 'id="deals"')
            .replace('id="showcaseScroll"></div>', `id="showcaseScroll">${skeleton}${skeleton}</div>`)
            .replace('class="nav-item" data-section="deals" style="display:none"', 'class="nav-item active" data-section="deals"')
            .replace('class="nav-item active" data-section="speedtest"', 'class="nav-item" data-section="speedtest"');
        await route.fulfill({ response, body });
    });
    await open(page, r => r.fulfill({ json: spotsAnswer([]) }));
    await expectNoDeals(page);
});
