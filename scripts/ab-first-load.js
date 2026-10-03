// A/B: time from navigation to the first plan card, on a throttled "budget
// phone" (250 ms RTT, 1.5 Mbps, 4x CPU). The portal API is mocked with a
// realistic Kenya->Cloudflare latency so only the page's own ordering differs.
//   node scripts/ab-first-load.js http://127.0.0.1:3001 http://127.0.0.1:3000
const { chromium } = require('@playwright/test');

const PORTAL = {
    router: { router_id: 42, name: 'T', identity: 'AB-TEST', auth_method: 'DIRECT_API',
        business_name: 'Test ISP', payment_methods: ['mpesa'], payment_provider: 'mpesa', support_phone: null },
    plans: [{ id: 7, name: 'Daily', price: 50, speed: '5M', duration_value: 1, duration_unit: 'DAYS',
        connection_type: 'hotspot', plan_type: 'regular', is_hidden: false, max_shared_users: 1 }],
    ads: [],
    plan_flags: { has_emergency_plans: false, has_special_offers: false, emergency_mode_active: false,
        regular_plans_hidden: false, sharing_enabled: false, max_shared_users: 1 },
    portal_settings: {},
};
const API_DELAY_MS = 700; // measured 0.53-0.77 s from Kenya, cold connection

async function once(browser, base) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 250, downloadThroughput: 1.5e6 / 8, uploadThroughput: 0.75e6 / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.route(url => url.pathname.endsWith('/public/portal/AB-TEST'), async route => {
        await new Promise(r => setTimeout(r, API_DELAY_MS));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PORTAL) });
    });
    // External hosts a captive phone can't reach anyway (fonts, ads, images).
    await page.route(url => !url.hostname.startsWith('127.') && !url.pathname.endsWith('/public/portal/AB-TEST'),
        route => route.abort());
    const t0 = Date.now();
    await page.goto(`${base}/?router=AB-TEST&gw=10.0.0.1&mac=11:22:33:44:55:66`, { waitUntil: 'commit' });
    await page.locator('#plansGrid .plan-card').first().waitFor({ timeout: 30000 });
    const ms = Date.now() - t0;
    await context.close();
    return ms;
}

(async () => {
    const [a, b] = process.argv.slice(2);
    const browser = await chromium.launch();
    const results = { [a]: [], [b]: [] };
    for (let i = 0; i < 6; i++) {
        for (const base of [a, b]) results[base].push(await once(browser, base));
    }
    await browser.close();
    for (const [base, xs] of Object.entries(results)) {
        const s = [...xs].sort((x, y) => x - y);
        console.log(base, 'median', s[Math.floor(s.length / 2)], 'ms  runs', xs.join(' '));
    }
})();
