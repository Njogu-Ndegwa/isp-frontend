const { test, expect } = require('@playwright/test');

// The "Your internet has expired" page an expired PPPoE customer's router
// redirects every plain-HTTP request to (?r=<router>&u=<username>).

// The router links to /expired.html (Vercel serves it with its query string).
// The local `serve` dev server 301s *.html to the clean URL and drops the
// query on the way, so the tests open the clean URL it serves directly.
const PAGE = '/expired?';

const PLANS = [
    { id: 11, name: 'Home 10M', price: 1500, speed: '10Mbps', duration_value: 30, duration_unit: 'days', badge_text: null },
    { id: 12, name: 'Home 20M', price: 2500, speed: '20Mbps', duration_value: 30, duration_unit: 'days', badge_text: null },
];

function pageData(overrides = {}) {
    return {
        router: { router_id: 42, name: 'R42', business_name: 'FastNet', support_phone: '0700111222', mpesa: true },
        paybill: '4123456',
        plans: PLANS,
        customer: {
            username: 'jane', account_number: '10000712', first_name: 'Jane', phone_hint: '*******678',
            plan_id: 11, plan_name: 'Home 10M', plan_price: 1500, expiry: '2026-10-28T09:30:00',
            status: 'inactive', paused: false, online: false,
        },
        lookup: 'found',
        portal_settings: { color_theme: 'ocean_blue' },
        ...overrides,
    };
}

async function mockApi(page, { data = pageData(), statuses = [], pay } = {}) {
    const calls = { pay: [], status: 0, load: [] };
    await page.addInitScript(() => {
        window.__EXPIRED_POLL_MS = 150;
        window.__EXPIRED_IDLE_POLL_MS = 150;
    });
    await page.route('**/public/pppoe/expired/**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.pathname.endsWith('/pay')) {
            calls.pay.push(req.postDataJSON());
            const res = pay || { status: 200, body: { status: 'sent', phone_hint: '*********111', amount: 2500 } };
            return route.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) });
        }
        if (url.pathname.endsWith('/status')) {
            // Before any prompt the customer stays offline; after it, play the script.
            let s = { online: false, payment: null };
            if (calls.pay.length) {
                s = statuses[Math.min(calls.status, statuses.length - 1)] || s;
                calls.status += 1;
            }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(s) });
        }
        calls.load.push(url.searchParams.get('u'));
        const body = typeof data === 'function' ? data(url.searchParams.get('u')) : data;
        if (body === 404) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not available"}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    return calls;
}

test('expired customer sees account, plans and paybill, pays, and is told they are back online', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const hosts = new Set();
    page.on('request', (r) => hosts.add(new URL(r.url()).host));
    const calls = await mockApi(page, {
        statuses: [
            { online: false, payment: { status: 'pending' } },
            { online: true, plan_name: 'Home 20M', expiry: '2026-11-28T10:00:00', payment: { status: 'completed' } },
        ],
    });

    await page.goto(PAGE + 'r=42&u=jane');

    await expect(page.locator('#headline')).toHaveText('Your internet has expired');
    await expect(page.locator('#brand')).toHaveText('FastNet');
    await expect(page.locator('#accUser')).toHaveText('jane');
    await expect(page.locator('#accNumber')).toHaveText('10000712');
    await expect(page.locator('#accPlan')).toContainText('Home 10M');
    await expect(page.locator('#accExpiry')).toContainText('2026');
    await expect(page.locator('.x-plan')).toHaveCount(2);
    await expect(page.locator('.x-plan[aria-checked="true"]')).toContainText('Your plan');
    await expect(page.locator('#pbNumber')).toHaveText('4123456');
    await expect(page.locator('#pbAccount')).toHaveText('10000712');
    await expect(page.locator('#phoneHint')).toContainText('ending 678');
    await expect(page.locator('#helpLink')).toHaveAttribute('href', 'tel:0700111222');

    await page.locator('.x-plan', { hasText: 'Home 20M' }).click();
    await expect(page.locator('#payBtn')).toHaveText('Pay KES 2,500 with M-Pesa');
    await expect(page.locator('#pbAmount')).toHaveText('KES 2,500');
    await page.fill('#phone', '0799 000 111');
    await page.click('#payBtn');

    await expect(page.locator('#waiting')).toBeVisible();
    await expect(page.locator('#waitingText')).toContainText('ending 111');
    expect(calls.pay).toEqual([{ router_id: 42, username: 'jane', plan_id: 12, phone: '254799000111' }]);

    await expect(page.locator('#online')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#online h1')).toHaveText("You're back online");
    await expect(page.locator('#onlineText')).toContainText('Home 20M is active until');

    // While walled, only this origin and the API host are reachable: the page
    // must not depend on anything else (fonts, CDNs).
    for (const host of hosts) {
        expect(['127.0.0.1:3000', 'isp.bitwavetechnologies.com']).toContain(host);
    }
});

test('blank phone uses the number on file; a failed prompt can be retried', async ({ page }) => {
    const calls = await mockApi(page, {
        statuses: [{ online: false, payment: { status: 'failed', result_desc: 'Request cancelled by user' } }],
    });
    await page.goto(PAGE + 'r=42&u=jane');
    await expect(page.locator('.x-plan')).toHaveCount(2);

    await page.click('#payBtn');

    await expect(page.locator('#payError')).toContainText('Request cancelled by user', { timeout: 10_000 });
    await expect(page.locator('#payBtn')).toBeEnabled();
    expect(calls.pay[0]).toEqual({ router_id: 42, username: 'jane', plan_id: 11, phone: null });
});

test('without a username the page asks for the account, then loads it', async ({ page }) => {
    const calls = await mockApi(page, {
        data: (u) => (u ? pageData() : pageData({ customer: null, lookup: 'none' })),
    });
    await page.goto(PAGE + 'r=42');

    await expect(page.locator('#lookupCard')).toBeVisible();
    await expect(page.locator('#payCard')).toBeHidden();
    await page.fill('#lookupInput', '10000712');
    await page.click('#lookupForm button');

    await expect(page.locator('#accUser')).toHaveText('jane');
    expect(calls.load).toEqual([null, '10000712']);
    await expect(page).toHaveURL(/u=10000712/);
});

test('an already-renewed customer lands on "You\'re back online"', async ({ page }) => {
    await mockApi(page, {
        data: pageData({ customer: { ...pageData().customer, online: true, status: 'active', expiry: '2026-11-28T10:00:00' } }),
    });
    await page.goto(PAGE + 'r=42&u=jane');
    await expect(page.locator('#online')).toBeVisible();
    await expect(page.locator('#expiredView')).toBeHidden();
});

test('a router without the feature shows that the page is not available', async ({ page }) => {
    await mockApi(page, { data: 404 });
    await page.goto(PAGE + 'r=42&u=jane');
    await expect(page.locator('#unavailable')).toBeVisible();
});

test('paused accounts are not offered a payment', async ({ page }) => {
    await mockApi(page, { data: pageData({ customer: { ...pageData().customer, paused: true } }) });
    await page.goto(PAGE + 'r=42&u=jane');
    await expect(page.locator('#headline')).toHaveText('Your account is paused');
    await expect(page.locator('#payCard')).toBeHidden();
    await expect(page.locator('#paybillCard')).toBeHidden();
});

test('falls back to the same-origin proxy when the API host is unreachable', async ({ page }) => {
    await page.route('https://isp.bitwavetechnologies.com/**', (route) => route.abort('connectionrefused'));
    const seen = [];
    await page.route('**/api/bw/**', (route) => {
        seen.push(new URL(route.request().url()).pathname);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageData()) });
    });
    await page.goto(PAGE + 'r=42&u=jane');
    await expect(page.locator('#accUser')).toHaveText('jane');
    expect(seen[0]).toBe('/api/bw/public/pppoe/expired/42');
});

test('phone and date helpers', async ({ page }) => {
    await mockApi(page);
    await page.goto(PAGE + 'r=42&u=jane');
    const out = await page.evaluate(() => {
        const x = window.__expiredPage;
        return {
            a: x.normalizePhone('0712 345 678'), b: x.normalizePhone('712345678'), c: x.normalizePhone('+254 110 000 111'),
            bad: x.normalizePhone('12345'), month: x.duration({ duration_value: 30, duration_unit: 'days' }),
            hours: x.duration({ duration_value: 6, duration_unit: 'hours' }),
            eat: x.formatExpiry('2026-10-28T21:30:00'),
        };
    });
    expect(out).toMatchObject({ a: '254712345678', b: '254712345678', c: '254110000111', bad: null, month: '1 month', hours: '6 hours' });
    expect(out.eat).toMatch(/29 Oct 2026/); // 21:30 UTC is 00:30 EAT the next day
});
