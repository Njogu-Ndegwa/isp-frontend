const { test, expect } = require('@playwright/test');

// Free trials: a plan with plan_type "free_trial" (price 0) is never sold. It
// stays out of the paid cards and is claimed through a "Try free" button whose
// success lands on the same screen a redeemed voucher does.

const MAC = '11:22:33:44:55:66';

const PAID = {
    id: 7, name: 'Daily', price: 50, speed: '5M',
    duration_value: 1, duration_unit: 'DAYS',
    connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1,
};

const TRIAL = {
    id: 12, name: 'Free Taste', price: 0, speed: '2M',
    duration_value: 30, duration_unit: 'MINUTES',
    connection_type: 'hotspot', plan_type: 'free_trial', is_hidden: false,
    max_shared_users: 1, trial_once_per_customer: true,
};

function portalPayload(plans) {
    return {
        router: {
            router_id: 42, name: 'Test Router', identity: 'TRIAL-TEST',
            auth_method: 'DIRECT_API', business_name: 'Test ISP',
            payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: null,
        },
        plans,
        ads: [],
        plan_flags: {
            has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
            regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1,
        },
        portal_settings: {},
    };
}

function trialEntry(overrides = {}) {
    return {
        plan_id: 12, name: 'Free Taste', speed: '2M',
        duration_value: 30, duration_unit: 'MINUTES',
        trial_once_per_customer: true, eligible: true, reason: null,
        ...overrides,
    };
}

function json(route, status, body) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const isEligibilityUrl = url => url.pathname.startsWith('/api/public/free-trial/42/');

async function openPortal(page, { plans = [PAID, TRIAL], trials = [trialEntry()] } = {}) {
    const eligibilityUrls = [];
    await page.route('**/api/public/portal/**', route => json(route, 200, portalPayload(plans)));
    await page.route(isEligibilityUrl, route => {
        eligibilityUrls.push(route.request().url());
        return json(route, 200, { success: true, router_id: 42, trials });
    });
    const query = new URLSearchParams({ router: 'TRIAL-TEST', gw: '10.0.0.1', mac: MAC });
    await page.goto('/?' + query.toString());
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(1);
    // Keep the page in place: success paths auto-navigate to dismiss the portal.
    await page.evaluate(() => {
        window.__autoBrowseCalls = 0;
        window.scheduleAutoStartBrowsing = () => { window.__autoBrowseCalls++; };
    });
    return eligibilityUrls;
}

test('a free-trial plan is a "Try free" button, never a KSH 0 card', async ({ page }) => {
    const eligibilityUrls = await openPortal(page);

    await expect(page.locator('#plansGrid')).not.toContainText('KSH 0');
    const btn = page.locator('#freeTrialList .free-trial-btn');
    await expect(btn).toHaveCount(1);
    await expect(btn).toContainText('Try free for 30 Minutes');
    await expect(btn).toContainText('Free Taste · 2Mbps · No payment needed');
    expect(new URL(eligibilityUrls[0]).pathname)
        .toBe('/api/public/free-trial/42/' + encodeURIComponent(MAC));

    // The paid list other scripts read (device pairing) doesn't carry it either.
    expect(await page.evaluate(() => allPlans.map(p => p.id))).toEqual([7]);
});

test('claiming reuses the voucher success screen', async ({ page }) => {
    await openPortal(page);

    const bodies = [];
    await page.route('**/api/public/free-trial/claim', route => {
        bodies.push(route.request().postDataJSON());
        return json(route, 200, {
            success: true, customer_id: 901, attempt_id: 55, auth_method: 'DIRECT_API',
            expiry: '2030-01-01T10:30:00Z', plan_name: 'Free Taste',
            message: 'Free trial started. Internet access is being provisioned.',
        });
    });

    await page.locator('#freeTrialList .free-trial-btn').click();

    await expect(page.locator('#successSection')).toBeVisible();
    await expect(page.locator('#plansSection')).toBeHidden();
    await expect(page.locator('.success-subtext')).toHaveText('Your free trial has started');
    await expect(page.locator('#connectionDetails')).toContainText('Free Taste');
    await expect(page.locator('#connectionDetails')).toContainText('Free trial');
    expect(bodies).toEqual([{ plan_id: 12, mac_address: MAC, router_id: 42 }]);
    expect(await page.evaluate(() => window.__autoBrowseCalls)).toBe(1);
});

test('a phone saved on this device is sent with the claim', async ({ page }) => {
    await openPortal(page);
    await page.evaluate(() => localStorage.setItem('bitwave_phone_number', '0712345678'));

    const bodies = [];
    await page.route('**/api/public/free-trial/claim', route => {
        bodies.push(route.request().postDataJSON());
        return json(route, 200, {
            success: true, customer_id: 901, attempt_id: 55, auth_method: 'DIRECT_API',
            expiry: '2030-01-01T10:30:00Z', plan_name: 'Free Taste', message: 'ok',
        });
    });

    await page.locator('#freeTrialList .free-trial-btn').click();

    await expect(page.locator('#successSection')).toBeVisible();
    expect(bodies).toEqual([{ plan_id: 12, mac_address: MAC, router_id: 42, phone: '0712345678' }]);
    // No phone field was added to the portal for this.
    await expect(page.locator('#freeTrialSection input')).toHaveCount(0);
});

test('a refused claim shows the backend reason under the button', async ({ page }) => {
    await openPortal(page);

    await page.route('**/api/public/free-trial/claim', route =>
        json(route, 400, { detail: 'You have already used this free trial.' }));

    await page.locator('#freeTrialList .free-trial-btn').click();

    const result = page.locator('#freeTrialResult');
    await expect(result).toBeVisible();
    await expect(result).toContainText('You have already used this free trial.');
    await expect(page.locator('#successSection')).toBeHidden();
    // Button is usable again for a retry.
    await expect(page.locator('#freeTrialList .free-trial-btn')).toBeEnabled();
});

test('trials this device cannot claim are not offered', async ({ page }) => {
    const eligibilityUrls = await openPortal(page, {
        trials: [trialEntry({ eligible: false, reason: 'You have already used this free trial.' })],
    });
    await expect.poll(() => eligibilityUrls.length).toBe(1);
    await expect(page.locator('#freeTrialSection')).toBeHidden();
    await expect(page.locator('#freeTrialList .free-trial-btn')).toHaveCount(0);
});

test('hotspots without a trial plan make no eligibility request', async ({ page }) => {
    const eligibilityUrls = await openPortal(page, { plans: [PAID] });
    await expect(page.locator('#freeTrialSection')).toBeHidden();
    expect(eligibilityUrls).toHaveLength(0);
});

test('the pay flow refuses a free-trial plan before any STK push', async ({ page }) => {
    await openPortal(page);

    let payRequests = 0;
    await page.route('**/api/hotspot/register-and-pay', route => { payRequests++; return json(route, 500, {}); });

    const error = await page.evaluate(async (trial) => {
        try {
            await processPayment('0712345678', { id: trial.id, planType: 'free_trial', originalData: trial });
            return null;
        } catch (e) {
            return e.message;
        }
    }, TRIAL);

    expect(error).toContain('Try free');
    expect(payRequests).toBe(0);
});
