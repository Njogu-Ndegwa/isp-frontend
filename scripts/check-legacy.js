#!/usr/bin/env node
// Fails if portal JS served to customers stops parsing on old browsers. A file
// that doesn't parse does nothing at all, which is how smart TVs ended up stuck on
// the grey loading cards for months with nothing reporting it.
//   node scripts/check-legacy.js
//
// Checks: legacy/ parses as ES5 and matches a fresh build; files every browser
// loads directly parse as ES5; inline page scripts parse as ES5; sources stay at or
// below the modern tier's feature test; every loader lists every script; and any
// new root .js / .html file has to be classified in legacy-config.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const acorn = require('acorn');
const cfg = require('./legacy-config');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function parseError(code, ecmaVersion) {
    try {
        acorn.parse(code, { ecmaVersion, sourceType: 'script' });
        return null;
    } catch (err) {
        return err.message;
    }
}

function inlineScripts(html) {
    const out = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
        if (!/\bsrc\s*=/.test(m[1]) && !/type\s*=\s*["']application\/(ld\+)?json/.test(m[1])) out.push(m[2]);
    }
    return out;
}

// Loader pages keep modern tags between the document.write and the closing comment.
function loaderProblems(file, html) {
    const start = html.indexOf('window.__legacyPortal) {');
    const end = html.indexOf('<!-- end of modern scripts -->');
    if (start === -1 || end === -1) return [`${file}: legacy loader or its closing comment is missing`];
    const block = html.slice(start, end);
    if (!/'<!-' \+ '-'/.test(block)) return [`${file}: loader does not open the comment that hides the modern tags`];
    const src = /<script src="([^"]+)"/g;
    const all = [...block.matchAll(src)].map(m => m[1]);
    const legacy = all.filter(s => s.startsWith('legacy/')).map(s => s.slice('legacy/'.length));
    const modern = all.filter(s => !s.startsWith('legacy/'));
    const problems = [];
    if (legacy[0] && !legacy[0].startsWith('polyfills.js')) problems.push(`${file}: legacy/polyfills.js must load first`);
    const compiled = legacy.filter(s => !s.startsWith('polyfills.js'));
    if (compiled.join() !== modern.join()) {
        problems.push(`${file}: legacy and modern script lists differ:\n    legacy: ${compiled.join(', ')}\n    modern: ${modern.join(', ')}`);
    }
    for (const s of legacy) {
        if (!fs.existsSync(path.join(ROOT, 'legacy', s.split('?')[0]))) problems.push(`${file}: legacy/${s} does not exist`);
    }
    // A script tag outside the loader would reach old browsers uncompiled.
    const outside = html.slice(0, start) + html.slice(end);
    for (const m of outside.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
        const name = m[1].split('?')[0];
        if (cfg.COMPILED.includes(name)) problems.push(`${file}: ${name} is loaded outside the loader`);
    }
    return problems;
}

function findProblems() {
    const problems = [];

    for (const file of cfg.COMPILED) {
        const err = parseError(read(file), cfg.MODERN_ES);
        if (err) problems.push(`${file}: uses syntax newer than ES${cfg.MODERN_ES}, past what the loader tests for: ${err}`);
    }
    for (const file of [...cfg.COMPILED, 'polyfills.js']) {
        if (!fs.existsSync(path.join(ROOT, 'legacy', file))) { problems.push(`legacy/${file} is missing`); continue; }
        const err = parseError(read(`legacy/${file}`), cfg.LEGACY_ES);
        if (err) problems.push(`legacy/${file}: not ES${cfg.LEGACY_ES}: ${err}`);
    }
    for (const file of cfg.DIRECT_ES5) {
        const err = parseError(read(file), cfg.LEGACY_ES);
        if (err) problems.push(`${file}: every browser loads this directly, so it must be ES${cfg.LEGACY_ES}: ${err}`);
    }
    for (const file of cfg.CLIENT_PAGES) {
        const html = read(file);
        inlineScripts(html).forEach((code, i) => {
            const err = parseError(code, cfg.LEGACY_ES);
            if (err) problems.push(`${file}: inline script ${i + 1} must be ES${cfg.LEGACY_ES}: ${err}`);
        });
        if (cfg.LOADER_PAGES.includes(file)) problems.push(...loaderProblems(file, html));
    }

    const known = new Set([...cfg.COMPILED, ...cfg.DIRECT_ES5, ...cfg.CLIENT_PAGES, ...Object.keys(cfg.NOT_SERVED_TO_CLIENTS)]);
    for (const file of fs.readdirSync(ROOT)) {
        if (/\.(js|html)$/.test(file) && !known.has(file)) {
            problems.push(`${file}: new browser file, classify it in scripts/legacy-config.js`);
        }
    }

    // legacy/ must be what the current sources compile to.
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-'));
    try {
        execFileSync(process.execPath, [path.join(__dirname, 'build-legacy.js')], {
            env: { ...process.env, LEGACY_OUT: fresh }, stdio: 'pipe',
        });
        for (const file of fs.readdirSync(fresh)) {
            const built = fs.readFileSync(path.join(fresh, file), 'utf8');
            const committed = fs.existsSync(path.join(ROOT, 'legacy', file)) ? read(`legacy/${file}`).replace(/\r\n/g, '\n') : null;
            if (built !== committed) problems.push(`legacy/${file} is stale: run npm run build:legacy and commit it`);
        }
    } finally {
        fs.rmSync(fresh, { recursive: true, force: true });
    }
    return problems;
}

if (require.main === module) {
    const problems = findProblems();
    if (problems.length) {
        console.error(`Old-browser check failed:\n  ${problems.join('\n  ')}`);
        process.exit(1);
    }
    console.log(`Old-browser check passed: legacy/ is ES${cfg.LEGACY_ES} and current, inline scripts are ES${cfg.LEGACY_ES}.`);
}

module.exports = { findProblems, parseError, inlineScripts };
