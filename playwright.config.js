const { defineConfig, devices } = require('@playwright/test');
const port = Number(process.env.PORTAL_TEST_PORT || 3000);

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30_000,
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        ...devices['Desktop Chrome'],
        serviceWorkers: 'block',
    },
    webServer: {
        command: `npx serve . --listen ${port} --no-clipboard`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
