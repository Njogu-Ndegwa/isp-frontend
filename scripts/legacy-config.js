// Which browser-side files exist, and how each one reaches an old browser.
// check-legacy.js fails if a new root .js or .html file is not listed here.
module.exports = {
    // Written with modern syntax. Served as-is to modern browsers; old browsers
    // get the compiled copy from legacy/ (see the loader in index.html, pwa.html).
    COMPILED: ['script.js', 'script003.js', 'spots.js', 'device-pairing.js', 'access-login.js', 'pwa.js'],

    // Loaded directly by every browser, so must be plain ES5 by hand.
    DIRECT_ES5: ['expired.js'],

    // Pages hotspot customers land on. Their inline scripts run on every browser,
    // BEFORE any polyfill, so they must be plain ES5 and must guard newer APIs.
    CLIENT_PAGES: ['index.html', 'expired.html', 'pwa.html', 'login.html'],

    // Pages that pick modern or legacy scripts with the loader.
    LOADER_PAGES: ['index.html', 'pwa.html'],

    // Not sent to hotspot customers' browsers, with the reason.
    NOT_SERVED_TO_CLIENTS: {
        'playwright.config.js': 'test config',
        'service-worker.js': 'never registered: index.html and pwa.html unregister it',
        'upsell.js': 'not referenced by any page',
        'demo.html': 'sales demo opened on purpose on a modern browser',
        'dev-preview.html': 'admin app preview',
        'test-captive.html': 'developer test page',
        'test-phone-format.html': 'developer test page',
    },

    // The old tier. Babel compiles for these; the CI parse check requires ES5
    // output, which covers Chrome 50-60 era TVs and below. The page's CSS needs
    // custom properties, so the real floor for a good-looking page is Chrome 49.
    LEGACY_TARGETS: { chrome: '38', safari: '9' },
    LEGACY_ES: 5,

    // The modern tier. The loader's feature test is optional chaining + nullish
    // coalescing (Chrome 80), so sources must not use syntax newer than ES2020 or
    // browsers just past that test would fail to parse them.
    MODERN_ES: 2020,
};
