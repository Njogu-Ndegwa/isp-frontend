#!/usr/bin/env node
// Compiles the portal's browser JS to ES5 for old browsers (smart TVs). Output
// goes to legacy/, is committed, and is shipped by both deploy pipelines, which
// have no build step. CI (check-legacy.js) fails if it goes stale.
//   npm run build:legacy
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const esbuild = require('esbuild');
const { COMPILED, LEGACY_TARGETS } = require('./legacy-config');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.LEGACY_OUT || path.join(ROOT, 'legacy');

// These are read-only or special on window: `const top = 1` is fine in a script
// but compiles to `var top`, which silently does nothing.
const UNSAFE_AS_VAR = new Set(['top', 'parent', 'self', 'name', 'status', 'location', 'length', 'origin',
    'history', 'event', 'closed', 'opener', 'frames', 'screen', 'window', 'document', 'navigator']);

const plain = { babelrc: false, configFile: false, sourceType: 'script', comments: false };

function read(file) {
    return fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
}

function topLevelNames(source) {
    const names = new Set();
    babel.transformSync(source, {
        ...plain, code: false,
        plugins: [() => ({ visitor: { Program(p) { Object.keys(p.scope.bindings).forEach(n => names.add(n)); } } })],
    });
    return names;
}

// The scripts share one global scope. Babel's top-level temporaries and helpers
// (_excluded, _marked, ...) are unique per file only, so two files would overwrite
// each other's. Prefix the ones the source did not declare itself.
function scopeTemporaries(code, file, sourceNames) {
    const tag = '_' + file.replace(/\W/g, '');
    return babel.transformSync(code, {
        ...plain, compact: true,
        plugins: [() => ({
            visitor: {
                Program(p) {
                    for (const name of Object.keys(p.scope.bindings)) {
                        if (name.startsWith('_') && !sourceNames.has(name)) p.scope.rename(name, tag + name);
                    }
                },
            },
        })],
    }).code;
}

async function main() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    const polyfills = new Set();

    for (const file of COMPILED) {
        const source = read(file);
        const sourceNames = topLevelNames(source);
        for (const n of sourceNames) {
            if (UNSAFE_AS_VAR.has(n)) throw new Error(`${file}: top-level "${n}" clashes with window.${n} once compiled to var`);
        }
        const { code } = babel.transformSync(source, {
            ...plain, filename: file, compact: false,
            presets: [['@babel/preset-env', {
                targets: LEGACY_TARGETS, modules: false, useBuiltIns: 'usage',
                corejs: require('core-js/package.json').version,
            }]],
        });
        // preset-env asks for what this file needs as require() calls. They become
        // one shared polyfills.js, so strip them here.
        const body = code.replace(/^require\("(core-js\/[^"]+)"\);\n?/gm, (_, mod) => { polyfills.add(mod); return ''; });
        if (/require\("core-js/.test(body)) throw new Error(`${file}: a core-js require survived`);
        fs.writeFileSync(path.join(OUT, file), scopeTemporaries(body, file, sourceNames) + '\n');
    }

    // core-js modules depend on load order (es.promise.finally must follow es.promise),
    // so use core-js's own order, not alphabetical.
    const order = require('core-js-compat').modules;
    const rank = m => order.indexOf(m.replace('core-js/modules/', '').replace(/\.js$/, ''));
    const entry = [...polyfills].sort((a, b) => rank(a) - rank(b)).map(m => `require(${JSON.stringify(m)});`).join('\n')
        + '\nrequire("whatwg-fetch");\nrequire("./scripts/legacy-dom-polyfills.js");\n';
    const result = await esbuild.build({
        stdin: { contents: entry, resolveDir: ROOT, loader: 'js' },
        bundle: true, format: 'iife', platform: 'browser', target: 'es5', write: false, minify: true,
        legalComments: 'none', define: { global: 'window' },
    });
    fs.writeFileSync(path.join(OUT, 'polyfills.js'), result.outputFiles[0].text);
    for (const f of fs.readdirSync(OUT)) {
        console.log(`${f}: ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
