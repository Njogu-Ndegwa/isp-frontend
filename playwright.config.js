const { defineConfig, devices } = require('@playwright/test');
const port = Number(process.env.PORTAL_TEST_PORT || 3000);
// PORTAL_TIER=legacy runs every test against the compiled scripts old browsers get.
const legacy = process.env.PORTAL_TIER === 'legacy';

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30_000,
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        ...devices['Desktop Chrome'],
        serviceWorkers: 'block',
    },
    webServer: {
        command: legacy ? `node tests/serve-legacy.js ${port}` : `npx serve . --listen ${port} --no-clipboard`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
