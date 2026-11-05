const { test, expect } = require('@playwright/test');
const { blockedWord, findProblems, namesIn, pathsIn } = require('../scripts/check-neutral-names');

test('no ad-blocker-style word in file names, ids, classes, data attributes or URL paths', () => {
    expect(findProblems()).toEqual([]);
});

test('the check catches what filter lists hit, and leaves alone what they do not', () => {
    for (const name of ['ads.js', 'adModal', 'hero-slide--ad', 'successAdsScroll', 'welcome-banner', 'data-ad-id',
        'images/Advertise-Here.png', 'promo-title', 'marketplace-showcase', 'success-sponsor']) {
        expect(blockedWord(name), name).toBeTruthy();
    }
    for (const name of ['spot-sheet', 'hero-slide--spot', 'loading', 'upload', 'header', 'adapter', 'badge', 'shadow']) {
        expect(blockedWord(name), name).toBeUndefined();
    }
    expect(namesIn('a.html', '<div id="adModal" class="x ad-box"><i data-ad-id="1">')).toEqual(
        expect.arrayContaining(['adModal', 'x ad-box', 'data-ad-id']));
    expect(namesIn('a.js', "card.className = 'ad-card'; el.closest('.wait-ad');")).toEqual(
        expect.arrayContaining(['ad-card', '.wait-ad']));
    expect(namesIn('a.css', '/* .ad-gone {} */ .ad-box > i { color: red }')).toEqual(['ad-box']);
    expect(pathsIn('a.js', 'fetch(`${API}/ads/click`); load("ads.js");')).toHaveLength(2);
    // Visible labels, API fields and comments stay allowed.
    const allowed = "const label = 'Ad'; const on = settings.show_ads; // the .ad-card at /ads";
    expect(namesIn('a.js', allowed)).toEqual([]);
    expect(pathsIn('a.js', allowed)).toEqual([]);
});
