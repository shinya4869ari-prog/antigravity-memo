/**
 * Cloudflare Pages Functions / Advanced Worker Entrypoint
 * Handles static asset serving, health checks, and edge API capabilities.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API Route: Health Check
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'antigravity-mission-hub',
        timestamp: new Date().toISOString(),
        runtime: 'Cloudflare Workers & Pages'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // API Route: Memos Endpoint (Ready for KV / D1 binding if configured in wrangler)
    if (url.pathname === '/api/memos') {
      if (request.method === 'GET') {
        // If KV bound (e.g., env.MEMO_KV), retrieve from KV, else return status
        if (env && env.MEMO_KV) {
          const data = await env.MEMO_KV.get('memos');
          return new Response(data || '[]', {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        return new Response(JSON.stringify({
          info: 'Client-side LocalStorage active. To enable Cloudflare KV sync, bind MEMO_KV in wrangler.json.'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (request.method === 'POST') {
        if (env && env.MEMO_KV) {
          const body = await request.text();
          await env.MEMO_KV.put('memos', body);
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ success: true, mode: 'local' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Fallback: serve static assets via Cloudflare Pages
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  }
};
