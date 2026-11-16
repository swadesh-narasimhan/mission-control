// Cloudflare Worker: CORS proxy for the Mission Control headlines page.
// Only fetches URLs that start with an entry in ALLOW, so it can't be abused as an open proxy.
// In the ticker's Settings, set CORS PROXY to:  https://<worker-name>.<your-subdomain>.workers.dev/?url={url}
const ALLOW = ['https://www.business-standard.com/rss/'];

export default {
  async fetch(req) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors });

    const target = new URL(req.url).searchParams.get('url');
    if (!target || !ALLOW.some((p) => target.startsWith(p))) {
      return new Response('forbidden: url not in allow-list', { status: 403, headers: cors });
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { 'user-agent': 'Mozilla/5.0 (personal RSS ticker)', accept: 'application/rss+xml, application/xml, text/xml' },
        cf: { cacheTtl: 300, cacheEverything: true } // Cloudflare edge cache: at most one upstream hit per 5 min
      });
    } catch (e) {
      return new Response('upstream fetch failed', { status: 502, headers: cors });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'content-type': upstream.headers.get('content-type') || 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=300'
      }
    });
  }
};
