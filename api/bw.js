// Same-origin API fallback proxy.
//
// Phones behind some MikroTik walled gardens can reach this portal's origin but
// NOT isp.bitwavetechnologies.com (per-phone DNS/SNI lottery — see the
// plans-fail beacons). Everything served from THIS origin is reachable by
// definition, so when the primary API host fails, script.js retries through
// /api/bw/<path>, and this function forwards to the backend server-side.
//
// Only runs on the Vercel origin. The Hetzner mirror serves this file as static
// text (harmless): the frontend only uses /api/bw as a fallback, so behaviour
// there stays exactly what it was before this existed.

const BACKEND = 'https://isp.bitwavetechnologies.com';

// Prefixes the captive portal legitimately needs — all public/no-auth flows.
// Everything else 404s so this never becomes an open proxy into admin routes.
const ALLOWED_PREFIXES = [
  'public/',
  'hotspot/',
  'radius/hotspot/',
  'routers/by-identity/',
  'ads',
];

// Plans/portal reads may be served briefly stale from the edge; everything
// else (payments, vouchers, status polls) must never be cached.
const CACHEABLE_GET_PREFIXES = ['public/portal/', 'public/plans/', 'ads'];

module.exports = async (req, res) => {
  // Path arrives via the vercel.json rewrite /api/bw/:path* -> /api/bw?path=…
  // (a plain file + rewrite is used instead of an [...path].js catch-all,
  // which vercel dev fails to register on Windows checkouts).
  const raw = req.query.path;
  const path = Array.isArray(raw) ? raw.join('/') : String(raw || '');

  if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
    res.status(404).json({ error: 'not proxied' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const qIndex = req.url.indexOf('?');
  const params = new URLSearchParams(qIndex === -1 ? '' : req.url.slice(qIndex + 1));
  params.delete('path'); // injected by the rewrite, not for the backend
  const qsStr = params.toString();
  const target = `${BACKEND}/api/${path}${qsStr ? `?${qsStr}` : ''}`;

  const headers = {
    accept: 'application/json',
    'user-agent': req.headers['user-agent'] || 'bw-portal-proxy',
    'x-bw-proxy': '1',
  };
  const clientIp =
    req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '';
  if (clientIp) headers['x-forwarded-for'] = String(clientIp);

  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers['content-type'] = req.headers['content-type'] || 'application/json';
    init.body =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  }

  // One retry on transport failure or upstream 5xx — GET/HEAD ONLY. Retrying a
  // POST could double-fire an STK push if the backend processed the first
  // attempt and only the response was lost. Cloudflare occasionally rejects a
  // first request from datacenter IPs (seen live: Router-0829, 2026-08-17 —
  // "Fallback Portal API 502" while the backend was healthy).
  const canRetry = req.method === 'GET' || req.method === 'HEAD';
  let upstream;
  for (let attempt = 0; ; attempt++) {
    try {
      upstream = await fetch(target, init);
      if (!canRetry || upstream.status < 500 || attempt >= 1) break;
    } catch (err) {
      if (!canRetry || attempt >= 1) {
        res.status(502).json({ error: 'upstream unreachable', detail: String(err).slice(0, 200) });
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader(
    'content-type',
    upstream.headers.get('content-type') || 'application/json'
  );
  const cacheable =
    req.method === 'GET' &&
    upstream.ok &&
    CACHEABLE_GET_PREFIXES.some((p) => path.startsWith(p));
  res.setHeader(
    'cache-control',
    cacheable ? 's-maxage=30, stale-while-revalidate=300' : 'no-store'
  );
  res.send(text);
};
