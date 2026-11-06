const { test, expect } = require('@playwright/test');

// Tapping the sides of the hero moves between slides, WhatsApp Status style.
// Everything here runs at phone width. API calls are mocked, so no view or tap
// ever reaches production.

const IDENTITY = 'TAP-TEST';
const MAC = '11:22:33:44:55:66';
const SUPPORT = '+254700000001';

const PLANS = Array.from({ length: 12 }, (_, i) => ({
    id: 100 + i, name: `Plan ${i + 1}`, price: 50 + i, speed: '5M',
    duration_value: 1, duration_unit: 'DAYS',
    connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
}));

const imageSlide = (id, extra = {}) => ({
    id, title: `Offer ${id}`, description: null,
    seller_name: `Shop ${id}`, seller_location: 'By the stage',
    phone_number: '0712 000 111', whatsapp_number: null,
    price: 'KSH 120', price_value: 120, category: 'produce',
    badge_type: null, badge_text: null,
    placement: 'hero', media_type: 'image', image_url: '/images/demo-spots/onions-land.webp',
    video_url: null, poster_url: null, image_fit: 'cover', bg_color: '#14532D', slot: 'platform',
    ...extra,
});

const videoSlide = id => imageSlide(id, {
    media_type: 'video', image_url: null,
    video_url: '/images/demo-spots/onions-land.mp4', poster_url: '/images/demo-spots/onions-land.webp',
});

function portal({ ads = [imageSlide(9), imageSlide(10)], showAds = true, headerStyle = 'hero' } = {}) {
    return {
        router: {
            router_id: 42, name: 'Test Router', identity: IDENTITY,
            auth_method: 'DIRECT_API', business_name: 'Test ISP',
            payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: SUPPORT,
        },
        plans: PLANS,
        ads,
        plan_flags: {
            has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
            regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1,
        },
        portal_settings: { header_style: headerStyle, show_ads: showAds, portal_support_phone: SUPPORT },
    };
}

const json = (route, status, body) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Opens the portal and returns the beacons and page errors it collects.
async function openPortal(page, body = portal(), { beforeGoto } = {}) {
    const beacons = [];
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(url => url.hostname === 'isp.bitwavetechnologies.com', route =>
        json(route, 200, { ads: [], pagination: {} }));
    await page.route(url => url.pathname.endsWith(`/public/portal/${IDENTITY}`), route => json(route, 200, body));
    await page.route(url => /\/public\/spots\/(seen|tap)$/.test(url.pathname), route => {
        const kind = route.request().url().endsWith('/tap') ? 'tap' : 'view';
        beacons.push({ kind, body: route.request().postDataJSON() });
        return json(route, 200, { success: true });
    });
    if (beforeGoto) await beforeGoto(page);
    const query = new URLSearchParams({ router: IDENTITY, gw: '10.0.0.1', mac: MAC });
    await page.goto('/?' + query.toString());
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(PLANS.length, { timeout: 15000 });
    return { beacons, errors };
}

const current = page => page.evaluate(() => {
    const segs = Array.from(document.querySelectorAll('#portal-header .hero-seg'));
    return segs.findIndex(s => s.hasAttribute('aria-current'));
});
const expectSlide = (page, i) => expect.poll(() => current(page), { timeout: 2000 }).toBe(i);
const heroBox = page => page.locator('#portal-header').boundingBox();
const leftPoint = async page => { const b = await heroBox(page); return { x: b.x + b.width * 0.2, y: b.y + b.height * 0.45 }; };
const rightPoint = async page => { const b = await heroBox(page); return { x: b.x + b.width * 0.8, y: b.y + b.height * 0.45 }; };
const tapsOf = beacons => beacons.filter(b => b.kind === 'tap');
const viewsOf = beacons => beacons.filter(b => b.kind === 'view');

// A real finger through Chromium's gesture recogniser: the same path a phone
// takes, so the browser decides for itself whether this is a tap or a scroll.
async function fingerDrag(page, from, dx, dy) {
    const cdp = await page.context().newCDPSession(page);
    const point = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove', touchPoints: point(from.x + (dx * i) / steps, from.y + (dy * i) / steps),
        });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
}

test.describe('on a phone (touch, 390px)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('right is next, left is previous, one tap moves exactly one slide, and both ends wrap', async ({ page }) => {
        const { beacons, errors } = await openPortal(page);
        await expect(page.locator('#portal-header .hero-seg')).toHaveCount(3);
        const right = await rightPoint(page);
        const left = await leftPoint(page);

        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await page.waitForTimeout(400); // a ghost click would show up here
        expect(await current(page)).toBe(1);

        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 2);
        await page.touchscreen.tap(right.x, right.y); // next on the last wraps to the first
        await expectSlide(page, 0);
        await page.touchscreen.tap(left.x, left.y);   // previous on the first wraps to the last
        await expectSlide(page, 2);
        await page.touchscreen.tap(left.x, left.y);
        await expectSlide(page, 1);

        expect(tapsOf(beacons)).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('the progress bars follow: earlier full, later empty, current filling from empty', async ({ page }) => {
        await openPortal(page);
        const right = await rightPoint(page);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 2);
        const left = await leftPoint(page);
        await page.touchscreen.tap(left.x, left.y);
        await expectSlide(page, 1);

        const widths = () => page.evaluate(() =>
            Array.from(document.querySelectorAll('#portal-header .hero-seg i')).map(i => {
                const parent = i.parentElement.getBoundingClientRect().width;
                return Math.round((100 * i.getBoundingClientRect().width) / parent);
            }));
        const [first, middle, last] = await widths();
        expect(first).toBe(100);
        expect(middle).toBeLessThan(40);
        expect(last).toBe(0);
    });

    test('the timer restarts from the slide a tap lands on', async ({ page }) => {
        await openPortal(page);
        const right = await rightPoint(page);
        await page.waitForTimeout(4000); // the welcome slide's 6 s is mostly gone
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        const tappedAt = Date.now();

        await page.waitForTimeout(4000); // past where the old timer would have fired
        expect(await current(page)).toBe(1);
        await expectSlideWithin(page, 2, 4000);
        const elapsed = Date.now() - tappedAt;
        expect(elapsed).toBeGreaterThan(5500);
        expect(elapsed).toBeLessThan(8000);
    });

    test('Call stays on the slide and records one call tap; just missing it does nothing', async ({ page }) => {
        const { beacons } = await openPortal(page);
        await page.evaluate(() => document.addEventListener('click', e => {
            if (e.target.closest('a[href^="tel:"]')) e.preventDefault();
        }, true));
        const right = await rightPoint(page);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await page.waitForTimeout(600); // let the slide finish arriving

        const call = page.locator('.hero-slide[data-spot-id="9"] [data-hero-cta="call"]');
        const box = await call.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await expect.poll(() => tapsOf(beacons).length, { timeout: 3000 }).toBe(1);
        expect(tapsOf(beacons)[0].body).toMatchObject({ ad_id: 9, click_type: 'call', placement: 'hero' });
        expect(await current(page)).toBe(1);

        // Touch: Chromium may retarget a near miss onto the link by itself, which
        // is its normal fat-finger help. Either way the slide must not move.
        await page.touchscreen.tap(box.x - 8, box.y + box.height / 2);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(1);
    });

    test('Call Support on the welcome slide and the WiFi chip never change the slide', async ({ page }) => {
        const { beacons } = await openPortal(page);
        await page.evaluate(() => document.addEventListener('click', e => {
            if (e.target.closest('a[href^="tel:"]')) e.preventDefault();
        }, true));
        const support = page.locator('#portal-header .hero-support-btn');
        await expect(support).toBeVisible();
        const s = await support.boundingBox();
        await page.touchscreen.tap(s.x + s.width / 2, s.y + s.height / 2);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(0);

        const right = await rightPoint(page);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await page.waitForTimeout(600);
        const chip = await page.locator('.hero-slide[data-spot-id="9"] .hero-spot-brand').boundingBox();
        await page.touchscreen.tap(chip.x + 10, chip.y + chip.height / 2);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(1);
        expect(tapsOf(beacons)).toEqual([]);
    });

    test('a slide change is not an ad tap, and a view still counts once per ad', async ({ page }) => {
        const { beacons } = await openPortal(page);
        const right = await rightPoint(page);
        const left = await leftPoint(page);

        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await expect.poll(() => viewsOf(beacons).length, { timeout: 3000 }).toBe(1);
        expect(viewsOf(beacons)[0].body).toMatchObject({ ad_ids: [9], placement: 'hero', mac_address: MAC });

        // Away and back: the same ad, on screen again, no second view.
        await page.touchscreen.tap(left.x, left.y);
        await expectSlide(page, 0);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await page.waitForTimeout(1500);
        expect(viewsOf(beacons).length).toBe(1);
        expect(tapsOf(beacons)).toEqual([]);
    });

    test('flicking past an ad in under a second does not count as a view of it', async ({ page }) => {
        const { beacons } = await openPortal(page);
        const right = await rightPoint(page);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 2);
        await expect.poll(() => viewsOf(beacons).length, { timeout: 3000 }).toBe(1);
        expect(viewsOf(beacons)[0].body.ad_ids).toEqual([10]);
    });

    test('scrolling the page over the hero is not a tap', async ({ page }) => {
        const { beacons } = await openPortal(page);
        const right = await rightPoint(page);
        const y0 = await page.evaluate(() => window.scrollY);
        await fingerDrag(page, right, 0, -180);
        await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 2000 }).toBeGreaterThan(y0 + 50);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(0);
        expect(beacons).toEqual([]);
    });

    test('a swipe moves one slide: left is next, right is previous', async ({ page }) => {
        const { beacons } = await openPortal(page);
        const right = await rightPoint(page);
        const left = await leftPoint(page);
        await fingerDrag(page, right, -150, 0);
        await expectSlide(page, 1);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(1);
        await fingerDrag(page, left, 150, 0);
        await expectSlide(page, 0);
        expect(tapsOf(beacons)).toEqual([]);
    });

    test('leaving a video pauses it, coming back starts it muted, and it only advances once at the end', async ({ page }) => {
        await openPortal(page, portal({ ads: [videoSlide(9), imageSlide(10)] }));
        const right = await rightPoint(page);
        const left = await leftPoint(page);
        const video = page.locator('.hero-slide[data-spot-id="9"] video');

        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        expect(await video.evaluate(v => v.src)).toContain('onions-land.mp4');

        // Sound on, then away.
        const mute = page.locator('.hero-slide[data-spot-id="9"] .hero-spot-mute');
        await expect(mute).toHaveAttribute('aria-label', 'Turn sound on');
        await page.waitForTimeout(600);
        const m = await mute.boundingBox();
        await page.touchscreen.tap(m.x + m.width / 2, m.y + m.height / 2);
        await expect(mute).toHaveAttribute('aria-label', 'Turn sound off');
        expect(await current(page)).toBe(1);

        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 2);
        expect(await video.evaluate(v => v.paused)).toBe(true);

        // Back: muted again and the button says so.
        await page.touchscreen.tap(left.x, left.y);
        await expectSlide(page, 1);
        expect(await video.evaluate(v => v.muted)).toBe(true);
        expect(await video.evaluate(v => v.currentTime)).toBeLessThan(1);
        await expect(mute).toHaveAttribute('aria-label', 'Turn sound on');

        // The clip ending moves on once, not once per earlier visit.
        await video.evaluate(v => v.dispatchEvent(new Event('ended')));
        await expectSlide(page, 2);
        await page.waitForTimeout(200);
        expect(await current(page)).toBe(2);
    });

    test('the video timer is dropped when a tap leaves it', async ({ page }) => {
        await openPortal(page, portal({ ads: [videoSlide(9), imageSlide(10)] }));
        const right = await rightPoint(page);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 2);
        const video = page.locator('.hero-slide[data-spot-id="9"] video');
        await video.evaluate(v => v.dispatchEvent(new Event('ended')));
        await page.waitForTimeout(200);
        expect(await current(page)).toBe(2);
    });

    test('with no ads the hero is a single photo: tapping does nothing and nothing breaks', async ({ page }) => {
        const { beacons, errors } = await openPortal(page, portal({ ads: [] }));
        await expect(page.locator('#portal-header .hero-track')).toHaveCount(0);
        const before = await page.locator('#portal-header').innerHTML();
        const right = await rightPoint(page);
        const left = await leftPoint(page);
        await page.touchscreen.tap(right.x, right.y);
        await page.touchscreen.tap(left.x, left.y);
        await page.waitForTimeout(200);
        expect(await page.locator('#portal-header').innerHTML()).toBe(before);
        expect(beacons).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('without the photo hero there is no carousel and no errors', async ({ page }) => {
        const { beacons, errors } = await openPortal(page, portal({ headerStyle: 'standard' }));
        await expect(page.locator('.hero-track')).toHaveCount(0);
        await page.touchscreen.tap(200, 40);
        await page.waitForTimeout(200);
        expect(tapsOf(beacons)).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('away from the plans the hero rests on the welcome slide, so tapping and swiping do nothing', async ({ page }) => {
        const { beacons } = await openPortal(page);
        const right = await rightPoint(page);
        await page.evaluate(() => document.getElementById('plansSection').classList.add('hidden'));
        await page.touchscreen.tap(right.x, right.y);
        await fingerDrag(page, right, -150, 0);
        await page.waitForTimeout(1200);
        expect(await current(page)).toBe(0);
        expect(beacons).toEqual([]);
    });

    test('a re-render of the hero leaves one working set of tap handlers', async ({ page }) => {
        await openPortal(page);
        await page.evaluate(() => {
            const settings = window.portalSettings || { header_style: 'hero' };
            renderHeroHeader(settings);
        });
        await expect(page.locator('#portal-header .hero-track')).toHaveCount(1);
        const right = await rightPoint(page);
        await page.touchscreen.tap(right.x, right.y);
        await expectSlide(page, 1);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(1);
    });
});

test.describe('with a mouse (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('a click moves one slide, and selects no text', async ({ page }) => {
        const { beacons } = await openPortal(page);
        const right = await rightPoint(page);
        const left = await leftPoint(page);
        await page.mouse.click(right.x, right.y);
        await expectSlide(page, 1);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(1);
        await page.mouse.click(left.x, left.y);
        await expectSlide(page, 0);

        // Double-clicking the headline would normally select a word. It has to
        // stop moving first, or this measures a spot that's no longer the headline.
        await page.waitForTimeout(700);
        const title = await page.locator('#portal-header .hero-title').boundingBox();
        await page.mouse.dblclick(title.x + 40, title.y + title.height / 2);
        expect(await page.evaluate(() => String(window.getSelection()))).toBe('');
        expect(tapsOf(beacons)).toEqual([]);
    });

    test('just missing Call does nothing at all', async ({ page }) => {
        const { beacons } = await openPortal(page);
        const right = await rightPoint(page);
        await page.mouse.click(right.x, right.y);
        await expectSlide(page, 1);
        await page.waitForTimeout(700);
        const box = await page.locator('.hero-slide[data-spot-id="9"] [data-hero-cta="call"]').boundingBox();
        await page.mouse.click(box.x - 8, box.y + box.height / 2);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(1);
        expect(tapsOf(beacons)).toEqual([]);
    });

    test('dragging is never also a tap: sideways is one swipe, up and down is nothing', async ({ page }) => {
        await openPortal(page);
        const right = await rightPoint(page);

        // Vertical drag on the welcome slide.
        await page.mouse.move(right.x, right.y);
        await page.mouse.down();
        await page.mouse.move(right.x, right.y - 60, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        expect(await current(page)).toBe(0);

        // Sideways drag ending on the same side: one swipe, not a swipe and a tap.
        await page.mouse.move(right.x + 40, right.y);
        await page.mouse.down();
        await page.mouse.move(right.x - 40, right.y, { steps: 5 });
        await page.mouse.up();
        await expectSlide(page, 1);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(1);

        // Same on a photo, where the browser would otherwise start an image drag.
        await page.waitForTimeout(400);
        await page.mouse.move(right.x + 40, right.y);
        await page.mouse.down();
        await page.mouse.move(right.x - 40, right.y, { steps: 5 });
        await page.mouse.up();
        await expectSlide(page, 2);
        await page.waitForTimeout(300);
        expect(await current(page)).toBe(2);
    });

    test('the swap in one constant: left becomes next, right becomes previous', async ({ page }) => {
        test.skip(process.env.PORTAL_TIER === 'legacy', 'patches the source text of spots.js, which the compiled copy does not have');
        await openPortal(page, portal(), {
            beforeGoto: p => p.route(/\/spots\.js/, async route => {
                const res = await route.fetch();
                const body = await res.text();
                const swapped = body.replace('{ left: -1, right: 1 }', '{ left: 1, right: -1 }');
                expect(swapped).not.toBe(body);
                await route.fulfill({ response: res, body: swapped });
            }),
        });
        const left = await leftPoint(page);
        const right = await rightPoint(page);
        await page.mouse.click(left.x, left.y);
        await expectSlide(page, 1);
        await page.mouse.click(right.x, right.y);
        await expectSlide(page, 0);
    });

    test('still moves when the phone asks for reduced motion', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openPortal(page);
        const right = await rightPoint(page);
        await page.mouse.click(right.x, right.y);
        await expectSlide(page, 1);
        await page.waitForTimeout(6500); // no auto-rotate in this mode
        expect(await current(page)).toBe(1);
    });
});

test.describe('with a keyboard (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('labelled Previous and Next work from the keyboard and record no tap', async ({ page }) => {
        const { beacons } = await openPortal(page);
        const prev = page.getByRole('button', { name: 'Previous slide' });
        const next = page.getByRole('button', { name: 'Next slide' });
        await expect(next).toHaveCount(1);
        await expect(prev).toHaveCount(1);

        await next.focus();
        await page.keyboard.press('Enter');
        await expectSlide(page, 1);
        await page.keyboard.press('Space');
        await expectSlide(page, 2);
        await prev.focus();
        await page.keyboard.press('Enter');
        await expectSlide(page, 1);
        expect(tapsOf(beacons)).toEqual([]);
    });

    test('Tab never lands on a slide that is off to the side, and the hero stays in line', async ({ page }) => {
        await openPortal(page);
        const reached = [];
        for (let i = 0; i < 8; i++) {
            await page.keyboard.press('Tab');
            reached.push(await page.evaluate(() => {
                const el = document.activeElement;
                const slide = el && el.closest && el.closest('.hero-slide');
                return slide ? (slide.dataset.spotId || 'welcome') : (el && el.className) || '';
            }));
        }
        expect(reached).not.toContain('9');
        expect(reached).not.toContain('10');
        expect(await page.evaluate(() => document.getElementById('portal-header').scrollLeft)).toBe(0);
    });

    test('Enter on Call still calls and stays on the slide', async ({ page }) => {
        const { beacons } = await openPortal(page);
        await page.evaluate(() => document.addEventListener('click', e => {
            if (e.target.closest('a[href^="tel:"]')) e.preventDefault();
        }, true));
        await page.getByRole('button', { name: 'Next slide' }).focus();
        await page.keyboard.press('Enter');
        await expectSlide(page, 1);
        await page.locator('.hero-slide[data-spot-id="9"] [data-hero-cta="call"]').focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => tapsOf(beacons).length, { timeout: 3000 }).toBe(1);
        expect(await current(page)).toBe(1);
    });
});

function expectSlideWithin(page, i, timeout) {
    return expect.poll(() => current(page), { timeout, intervals: [100] }).toBe(i);
}
