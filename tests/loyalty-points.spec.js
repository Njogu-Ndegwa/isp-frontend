const { test, expect } = require('@playwright/test');
const path = require('path');

// Loyalty points v1 (board post 5). The portal payload's `loyalty` block turns
// on "or N pts" on reward plan cards, a "Use my points" section and the points
// line on the success screen. Missing, null or disabled loyalty changes nothing.
// LOYALTY_SHOTS=<dir> also saves a screenshot of each state.

const MAC = 'AA:BB:CC:00:00:01';
const PHONE = '0700000001';
const SHOTS = process.env.LOYALTY_SHOTS || '';
// Leaves the field out of the payload, as an older backend does.
const MISSING = Symbol('missing');

const PLANS = [
    { id: 7, name: 'Daily', price: 50, speed: '5M', duration_value: 1, duration_unit: 'DAYS',
        connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 },
    { id: 8, name: 'Weekly', price: 300, speed: '5M', duration_value: 7, duration_unit: 'DAYS',
        connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 },
    { id: 9, name: '', price: 10, speed: '2M', duration_value: 1, duration_unit: 'HOURS',
        connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 },
];

const LOYALTY_ON = {
    enabled: true, earn_mode: 'per_kes', kes_per_point: 10, points_per_purchase: 1,
    plan_points: {}, expiry_days: 90,
    rewards: [{ plan_id: 7, points_cost: 50 }, { plan_id: 8, points_cost: 250 }],
};

const BALANCE_OK = {
    ok: true, balance: 120,
    rewards: [
        { plan_id: 7, points_cost: 50, affordable: true },
        { plan_id: 8, points_cost: 250, affordable: false },
    ],
    expiring: { points: 30, on: '2027-01-15' },
};

async function shot(page, name) {
    if (!SHOTS) return;
    // From the top, so the sticky header doesn't land mid-page in a full-page shot.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}

function portalPayload(loyalty) {
    const body = {
        router: { router_id: 42, name: 'Test Router', identity: 'LOYALTY-TEST', auth_method: 'DIRECT_API',
            business_name: 'Test ISP', payment_methods: ['mpesa'], payment_provider: 'mpesa',
            currency: 'KES', support_phone: null },
        plans: PLANS,
        ads: [],
        plan_flags: { has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
            regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1 },
        portal_settings: {},
    };
    if (loyalty !== MISSING) body.loyalty = loyalty;
    return body;
}

// Mocks the portal and the loyalty API. `replies` maps an action (balance,
// send-code, redeem) to a reply, or to a function of the request body.
async function openPortal(page, { loyalty = LOYALTY_ON, replies = {}, savedPhone = PHONE } = {}) {
    await page.setViewportSize({ width: 375, height: 812 });
    const calls = [];
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/')) return route.continue();
        return route.abort();
    });
    await page.route('**/api/public/portal/**', route => route.fulfill({ json: portalPayload(loyalty) }));
    await page.route('**/api/public/loyalty/**', route => {
        const action = new URL(route.request().url()).pathname.split('/').pop();
        const body = route.request().postDataJSON();
        calls.push({ action, body });
        const reply = replies[action];
        const json = typeof reply === 'function' ? reply(body, calls) : reply;
        return route.fulfill({ json: json || { ok: false, code: 'failed' } });
    });
    if (savedPhone) {
        await page.addInitScript(phone => {
            try { localStorage.setItem('bitwave_phone_number', phone); } catch (e) { /* ignore */ }
        }, savedPhone);
    }
    await page.goto('/?' + new URLSearchParams({ router: 'LOYALTY-TEST', gw: '10.0.0.1', mac: MAC }).toString());
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(3);
    // Keep the page in place: success paths auto-navigate to dismiss the portal.
    await page.evaluate(() => {
        window.__autoBrowseCalls = 0;
        window.scheduleAutoStartBrowsing = () => { window.__autoBrowseCalls++; };
    });
    return calls;
}

const card = (page, name) => page.locator('#plansGrid .plan-card', { hasText: name });

for (const [label, loyalty] of [['missing', MISSING], ['null', null], ['disabled', { enabled: false }]]) {
    test(`loyalty ${label}: the portal looks exactly as before`, async ({ page }) => {
        const calls = await openPortal(page, { loyalty });
        await expect(page.locator('#pointsSection')).toBeHidden();
        await expect(page.locator('#plansGrid .plan-points-cost')).toHaveCount(0);
        await expect(page.locator('#plansGrid')).not.toContainText('pts');
        expect(calls).toEqual([]);
        if (label === 'missing') await shot(page, '01-loyalty-off.png');
    });
}

test('reward plans show "or N pts"; other cards are untouched', async ({ page }) => {
    await openPortal(page);
    await expect(card(page, 'Daily').locator('.plan-points-cost')).toHaveText('⭐ or 50 pts');
    await expect(card(page, 'Weekly').locator('.plan-points-cost')).toHaveText('⭐ or 250 pts');
    await expect(card(page, '1 Hour').locator('.plan-points-cost')).toHaveCount(0);

    const section = page.locator('#pointsSection');
    await expect(section).toBeVisible();
    await expect(section.locator('.points-header-title')).toHaveText('Use my points');
    await expect(page.locator('#pointsEarnHint')).toHaveText('Earn 1 point for every KSH 10 you pay');
    await expect(page.locator('#pointsPhoneInput')).toHaveValue(PHONE);
    await shot(page, '02-loyalty-on-plan-cards.png');
    await section.scrollIntoViewIfNeeded();
    await shot(page, '03-use-my-points-section.png');
});

test('per-purchase mode explains itself', async ({ page }) => {
    await openPortal(page, { loyalty: { ...LOYALTY_ON, earn_mode: 'per_purchase', points_per_purchase: 1 } });
    await expect(page.locator('#pointsEarnHint')).toHaveText('Earn 1 point for every purchase');
    await page.evaluate(() => { loyaltyConfig.points_per_purchase = 2; renderLoyaltySection(); });
    await expect(page.locator('#pointsEarnHint')).toHaveText('Earn 2 points for every purchase');
});

test('on the paying device, Check shows the balance and the rewards', async ({ page }) => {
    const calls = await openPortal(page, { replies: { balance: BALANCE_OK } });
    await page.locator('#pointsCheckBtn').click();

    await expect(page.locator('.points-balance-value')).toHaveText('120');
    await expect(page.locator('.points-expiring')).toContainText('30 pts expire on');
    const rows = page.locator('.points-reward');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Daily');
    await expect(rows.nth(0).locator('button')).toBeEnabled();
    await expect(rows.nth(1)).toContainText('Need 130 more pts');
    await expect(rows.nth(1).locator('button')).toBeDisabled();
    await expect(page.locator('#pointsCodeStep')).toBeHidden();
    expect(calls).toEqual([{ action: 'balance', body: { identity: 'LOYALTY-TEST', phone: PHONE, mac: MAC } }]);
    await page.locator('#pointsSection').scrollIntoViewIfNeeded();
    await shot(page, '04-balance-device-check-passed.png');
});

test('another device gets an SMS code, then the balance', async ({ page }) => {
    const calls = await openPortal(page, { replies: {
        balance: body => (body.code === '123456' ? BALANCE_OK : { ok: false, code: 'needs_code' }),
        'send-code': { ok: true },
    } });
    await page.locator('#pointsCheckBtn').click();

    await expect(page.locator('#pointsCodeStep')).toBeVisible();
    await expect(page.locator('#pointsCodeHint')).toContainText(`6-digit code by SMS to ${PHONE}`);
    await expect(page.locator('#pointsBalance')).toBeHidden();
    await page.locator('#pointsSection').scrollIntoViewIfNeeded();
    await shot(page, '05-needs-code.png');

    await page.locator('#pointsCodeInput').fill('123456');
    await page.locator('#pointsCodeBtn').click();
    await expect(page.locator('.points-balance-value')).toHaveText('120');
    await expect(page.locator('#pointsCodeStep')).toBeHidden();
    expect(calls.map(c => c.action)).toEqual(['balance', 'send-code', 'balance']);
    expect(calls[2].body.code).toBe('123456');
    await shot(page, '06-balance-after-code.png');
});

test('a wrong code says so and keeps the code box', async ({ page }) => {
    await openPortal(page, { replies: {
        balance: body => (body.code ? { ok: false, code: 'bad_code' } : { ok: false, code: 'needs_code' }),
        'send-code': { ok: true },
    } });
    await page.locator('#pointsCheckBtn').click();
    await page.locator('#pointsCodeInput').fill('000000');
    await page.locator('#pointsCodeBtn').click();
    await expect(page.locator('#pointsResult')).toHaveText(/That code is wrong or has expired/);
    await expect(page.locator('#pointsCodeStep')).toBeVisible();
    await expect(page.locator('#pointsCodeInput')).toHaveValue('');
    await page.locator('#pointsSection').scrollIntoViewIfNeeded();
    await shot(page, '07-error-bad_code.png');
});

const SEND_CODE_ERRORS = {
    use_paying_device: 'Open this page on the phone you usually pay with to use your points.',
    rate_limited: 'Too many tries. Please wait a few minutes and try again.',
};
for (const [code, message] of Object.entries(SEND_CODE_ERRORS)) {
    test(`send-code ${code} has a clear message`, async ({ page }) => {
        await openPortal(page, { replies: {
            balance: { ok: false, code: 'needs_code' },
            'send-code': { ok: false, code },
        } });
        await page.locator('#pointsCheckBtn').click();
        await expect(page.locator('#pointsResult')).toHaveText(new RegExp(message.replace(/[.?]/g, '\\$&')));
        await expect(page.locator('#pointsCodeStep')).toBeHidden();
        await page.locator('#pointsSection').scrollIntoViewIfNeeded();
        await shot(page, `08-error-${code}.png`);
    });
}

const REDEEM_ERRORS = {
    not_enough_points: "You don't have enough points for this plan yet.",
    limit_reached: "You've reached today's limit for using points. Try again tomorrow.",
    not_a_reward: "This plan can't be bought with points any more. Pick another one.",
    loyalty_off: 'Points are not available on this WiFi right now.',
};
for (const [code, message] of Object.entries(REDEEM_ERRORS)) {
    test(`redeem ${code} has a clear message`, async ({ page }) => {
        await openPortal(page, { replies: { balance: BALANCE_OK, redeem: { ok: false, code } } });
        await page.locator('#pointsCheckBtn').click();
        await page.locator('.points-reward').first().locator('button').click();
        await expect(page.locator('#pointsResult')).toHaveText(new RegExp(message.replace(/[.?]/g, '\\$&')));
        await expect(page.locator('#processingSection')).toBeHidden();
        await page.locator('#pointsSection').scrollIntoViewIfNeeded();
        await shot(page, `09-error-${code}.png`);
    });
}

test('a failed request falls back to a generic message', async ({ page }) => {
    await openPortal(page, { replies: { balance: { detail: 'Internal error' } } });
    await page.locator('#pointsCheckBtn').click();
    await expect(page.locator('#pointsResult')).toHaveText(/Couldn't check your points/);
});

test('redeem without a passing device check asks for the code first', async ({ page }) => {
    const calls = await openPortal(page, { replies: {
        balance: BALANCE_OK,
        'send-code': { ok: true },
        redeem: body => (body.code === '654321' ? { ok: false, code: 'limit_reached' } : { ok: false, code: 'needs_code' }),
    } });
    await page.locator('#pointsCheckBtn').click();
    await page.locator('.points-reward').first().locator('button').click();
    await expect(page.locator('#pointsCodeStep')).toBeVisible();
    await page.locator('#pointsCodeInput').fill('654321');
    await page.locator('#pointsCodeBtn').click();
    await expect(page.locator('#pointsResult')).toHaveText(/today's limit/);
    expect(calls.map(c => c.action)).toEqual(['balance', 'redeem', 'send-code', 'redeem']);
    expect(calls[3].body).toEqual({ identity: 'LOYALTY-TEST', phone: PHONE, mac: MAC, plan_id: 7, code: '654321' });
});

test('a successful redeem polls payment-status and lands on the success screen', async ({ page }) => {
    const calls = await openPortal(page, { replies: {
        balance: BALANCE_OK,
        redeem: { ok: true, customer_id: 901, balance: 70 },
    } });
    let statusChecks = 0;
    await page.route('**/api/hotspot/payment-status/901**', route => {
        statusChecks++;
        return route.fulfill({ json: statusChecks < 2
            ? { status: 'pending' }
            : { status: 'active', plan_name: 'Daily', expiry: '2030-01-02T10:00:00Z' } });
    });

    await page.locator('#pointsCheckBtn').click();
    await page.locator('.points-reward').first().locator('button').click();

    await expect(page.locator('#processingSection')).toBeVisible();
    await expect(page.locator('#processingTitle')).toHaveText('Activating your free plan');
    await expect(page.locator('#processingPlanInfo')).toContainText('50 points');
    await expect(page.locator('#step1 .step-label')).toHaveText('Points used');
    await shot(page, '10-redeem-polling.png');

    await expect(page.locator('#successSection')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#connectionDetails')).toContainText('Daily');
    await expect(page.locator('#pointsSuccessNote')).toHaveText('⭐ You used 50 points. Balance 70.');
    // The processing screen is worded for mobile money again for a later purchase.
    await expect(page.locator('#step1 .step-label')).toHaveText('Payment request sent');
    expect(calls.find(c => c.action === 'redeem').body).toEqual({ identity: 'LOYALTY-TEST', phone: PHONE, mac: MAC, plan_id: 7 });
    expect(await page.evaluate(() => window.__autoBrowseCalls)).toBe(1);
    await shot(page, '11-redeem-success.png');
});

test('after a paid purchase the success screen shows the points earned', async ({ page }) => {
    await openPortal(page);
    await page.route('**/api/hotspot/register-and-pay', route => route.fulfill({
        json: { customer_id: 321, gateway: 'mpesa', status: 'pending' } }));
    await page.route('**/api/hotspot/payment-status/321**', route => route.fulfill({ json: {
        status: 'active', plan_name: 'Daily', expiry: '2030-01-02T10:00:00Z',
        loyalty: { earned: 5, balance: 25 },
    } }));
    await card(page, 'Daily').click();
    await page.locator('#phoneNumber').fill(PHONE);
    await page.getByRole('button', { name: 'Pay with M-Pesa' }).click();
    await expect(page.locator('#successSection')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#pointsSuccessNote')).toHaveText('⭐ You earned 5 points. Balance 25.');
    await shot(page, '12-paid-success-points-earned.png');
});

test('a paid purchase without a loyalty field shows no points line', async ({ page }) => {
    await openPortal(page, { loyalty: MISSING });
    await page.route('**/api/hotspot/register-and-pay', route => route.fulfill({
        json: { customer_id: 321, gateway: 'mpesa', status: 'pending' } }));
    await page.route('**/api/hotspot/payment-status/321**', route => route.fulfill({ json: {
        status: 'active', plan_name: 'Daily', expiry: '2030-01-02T10:00:00Z' } }));
    await card(page, 'Daily').click();
    await page.locator('#phoneNumber').fill(PHONE);
    await page.getByRole('button', { name: 'Pay with M-Pesa' }).click();
    await expect(page.locator('#successSection')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#pointsSuccessNote')).toHaveCount(0);
});

test('Swahili portal', async ({ page }) => {
    await openPortal(page, { replies: { balance: BALANCE_OK } });
    await page.evaluate(() => { applyLanguage('sw'); renderLoyaltySection(); renderPlans(allPlans); });
    await expect(page.locator('#pointsSection .points-header-title')).toHaveText('Tumia pointi zangu');
    await expect(page.locator('#pointsEarnHint')).toHaveText('Pata pointi 1 kwa kila KSH 10 unayolipa');
    await expect(card(page, 'Daily').locator('.plan-points-cost')).toHaveText('⭐ au pointi 50');
    await page.locator('#pointsCheckBtn').click();
    await expect(page.locator('.points-rewards-title')).toHaveText('Mipango ya bure unayoweza kupata');
    await page.locator('#pointsSection').scrollIntoViewIfNeeded();
    await shot(page, '13-swahili-balance.png');
});
