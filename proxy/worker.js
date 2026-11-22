// Cloudflare Worker: CORS proxy for the Mission Control ticker (headlines + live flights).
// Only fetches URLs that start with an entry in ALLOW, so it can't be abused as an open proxy.
// In the ticker's Settings, set CORS PROXY to:  https://<worker-name>.<your-subdomain>.workers.dev/?url={url}
const ALLOW = [
  { prefix: 'https://www.business-standard.com/rss/', ttl: 300 }, // headlines: cache 5 min
  { prefix: 'https://api.adsb.lol/v2/', ttl: 20 }                 // live aircraft positions: keep fresh
];

export default {
  async fetch(req) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors });

    const target = new URL(req.url).searchParams.get('url');
    const rule = target && ALLOW.find((a) => target.startsWith(a.prefix));
    if (!rule) return new Response('forbidden: url not in allow-list', { status: 403, headers: cors });

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { 'user-agent': 'Mozilla/5.0 (personal desk ticker)', accept: 'application/json, application/rss+xml, application/xml, text/xml' },
        cf: { cacheTtl: rule.ttl, cacheEverything: true } // at most one upstream hit per TTL
      });
    } catch (e) {
      return new Response('upstream fetch failed', { status: 502, headers: cors });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
        'cache-control': 'public, max-age=' + rule.ttl
      }
    });
  }
};
