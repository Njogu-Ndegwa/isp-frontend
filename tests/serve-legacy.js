// Serves the portal with the old-browser tier forced on, so the whole Playwright
// suite can run against legacy/ (PORTAL_TIER=legacy). Injects the same flag a test
// could set by hand into each page's <head>, ahead of the feature test.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const port = Number(process.argv[2] || 3000);
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4',
};

http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/') pathname = '/index.html';
    if (!path.extname(pathname) && fs.existsSync(path.join(ROOT, pathname + '.html'))) pathname += '.html';
    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
    }
    let body = fs.readFileSync(file);
    if (path.extname(file) === '.html') {
        body = body.toString('utf8').replace('<head>', '<head><script>window.__forceLegacyPortal = true;</script>');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
}).listen(port, '127.0.0.1');
