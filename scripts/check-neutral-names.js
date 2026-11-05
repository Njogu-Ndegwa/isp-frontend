#!/usr/bin/env node
// Fails if an ad-blocker-style word comes back into what filter lists can see:
// file names, ids, classes, data attributes, CSS selectors and URL paths.
// A generic rule like "##.ad-modal" or "/ads.js" hides or blocks it for every
// customer with a blocker, so offers vanish or the page breaks.
//
// Not checked on purpose: comments, visible text (customers must still see "AD"),
// JS variable names and API field names (show_ads, ad_id). No filter sees those.
//   node scripts/check-neutral-names.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WORDS = new Set([
    'ad', 'ads', 'adv', 'advert', 'adverts', 'advertise', 'advertiser', 'advertisers',
    'advertising', 'advertisement', 'advertisements', 'adsense', 'adserver', 'adbox',
    'banner', 'banners', 'sponsor', 'sponsors', 'sponsored', 'sponsorship',
    'promo', 'promos', 'promoted', 'promotion', 'promotions', 'marketplace',
]);

// "successAdsScroll" -> success, ads, scroll. "hero-slide--ad" -> hero, slide, ad.
const blockedWord = name => name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(w => w.toLowerCase())
    .find(w => WORDS.has(w));

const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripHtml = s => s.replace(/<!--[\s\S]*?-->/g, '');
const stripJs = s => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1');
// Drops ${...} (one level of nested braces) so template variables are not names.
const stripTemplates = s => s.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ');

const QUOTED = `(?:'([^']+)'|"([^"]+)"|\`([^\`]+)\`)`;
const JS_NAMES = [
    new RegExp(`(?:getElementById|getElementsByClassName|querySelector|querySelectorAll|closest|matches)\\(\\s*${QUOTED}`, 'g'),
    new RegExp(`classList\\.(?:add|remove|toggle|contains|replace)\\(\\s*${QUOTED}`, 'g'),
    new RegExp(`\\.(?:className|id)\\s*=\\s*${QUOTED}`, 'g'),
    new RegExp(`setAttribute\\(\\s*${QUOTED}`, 'g'),
    /\.dataset\.([A-Za-z0-9]+)/g,
];
const MARKUP_NAMES = [
    /\b(?:id|class)\s*=\s*"([^"]*)"/g,
    /\b(?:id|class)\s*=\s*'([^']*)'/g,
    /\s(data-[A-Za-z0-9-]+)/g,
];
const CSS_NAMES = [
    /[.#](-?[A-Za-z_][A-Za-z0-9_-]*)(?=[^{}]*\{)/g,
    /\[(data-[A-Za-z0-9-]+)/g,
    /@keyframes\s+([A-Za-z0-9_-]+)/g,
];
// API paths and local files named in code: `${API}/ads/click`, "ads.js".
const WORD = '(?:ads?|adverts?|advertis\\w*|banners?|sponsors?|promos?|marketplace)';
const URL_PATHS = new RegExp(`/${WORD}(?=[/?'"\`])|['"\`]${WORD}[-.][A-Za-z0-9.-]+(?=[?'"\`])`, 'gi');

function namesIn(file, text) {
    const names = [];
    const collect = (patterns, source) => {
        for (const re of patterns) {
            for (const m of source.matchAll(re)) names.push(m[1] || m[2] || m[3]);
        }
    };
    if (path.extname(file) === '.css') {
        collect(CSS_NAMES, stripCss(text));
    } else {
        const code = stripTemplates(path.extname(file) === '.html' ? stripHtml(text) : stripJs(text));
        collect(MARKUP_NAMES, code);
        collect(JS_NAMES, code);
    }
    return names;
}

function pathsIn(file, text) {
    if (path.extname(file) === '.css') return [];
    const code = path.extname(file) === '.html' ? stripHtml(text) : stripJs(text);
    return [...code.matchAll(URL_PATHS)].map(m => m[0]);
}

function findProblems() {
    const problems = [];
    const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
    for (const file of tracked) {
        const word = blockedWord(file);
        if (word) problems.push(`${file}: file name contains "${word}"`);
        if (!/\.(html|css|js)$/.test(file) || file.startsWith('tests/')) continue;
        if (file === 'scripts/check-neutral-names.js') continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const name of namesIn(file, text)) {
            const hit = blockedWord(name);
            if (hit) problems.push(`${file}: "${name}" contains "${hit}"`);
        }
        for (const p of pathsIn(file, text)) problems.push(`${file}: path ${p} looks blockable`);
    }
    return [...new Set(problems)];
}

if (require.main === module) {
    const problems = findProblems();
    if (problems.length) {
        console.error(`Ad-blocker-style names found:\n  ${problems.join('\n  ')}`);
        process.exit(1);
    }
    console.log('No ad-blocker-style names found.');
}

module.exports = { blockedWord, findProblems, namesIn, pathsIn };
