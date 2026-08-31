const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30_000,
    use: {
        baseURL: 'http://127.0.0.1:3000',
        ...devices['Desktop Chrome'],
        serviceWorkers: 'block',
    },
    webServer: {
        command: 'npm run dev',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: true,
        timeout: 30_000,
    },
});
