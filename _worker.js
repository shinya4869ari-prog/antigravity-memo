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

    // API Route: Memos Endpoint (Cloudflare KV Cloud Storage)
    if (url.pathname === '/api/memos') {
      const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method === 'GET') {
        if (env && env.MEMO_KV) {
          try {
            const data = await env.MEMO_KV.get('memos');
            if (data === null) {
              return new Response(JSON.stringify({ uninitialized: true }), {
                headers: { ...corsHeaders, 'X-Storage-Mode': 'kv' }
              });
            }
            return new Response(data, {
              headers: { ...corsHeaders, 'X-Storage-Mode': 'kv' }
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers: corsHeaders
            });
          }
        }
        return new Response(JSON.stringify({
          mode: 'local',
          info: 'Cloudflare KV is not bound yet. Using LocalStorage fallback.'
        }), {
          headers: corsHeaders
        });
      }

      if (request.method === 'POST') {
        if (env && env.MEMO_KV) {
          try {
            const body = await request.text();
            await env.MEMO_KV.put('memos', body);
            return new Response(JSON.stringify({ success: true, mode: 'kv' }), {
              headers: corsHeaders
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers: corsHeaders
            });
          }
        }
        return new Response(JSON.stringify({ success: true, mode: 'local' }), {
          headers: corsHeaders
        });
      }
    }

    // API Route: Custom Apps Presets Endpoint (Cloudflare KV)
    if (url.pathname === '/api/apps') {
      const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method === 'GET') {
        if (env && env.MEMO_KV) {
          try {
            const data = await env.MEMO_KV.get('custom_apps');
            return new Response(data || 'null', {
              headers: { ...corsHeaders, 'X-Storage-Mode': 'kv' }
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers: corsHeaders
            });
          }
        }
        return new Response(JSON.stringify({ mode: 'local' }), {
          headers: corsHeaders
        });
      }

      if (request.method === 'POST') {
        if (env && env.MEMO_KV) {
          try {
            const body = await request.text();
            await env.MEMO_KV.put('custom_apps', body);
            return new Response(JSON.stringify({ success: true, mode: 'kv' }), {
              headers: corsHeaders
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers: corsHeaders
            });
          }
        }
        return new Response(JSON.stringify({ success: true, mode: 'local' }), {
          headers: corsHeaders
        });
      }
    }

    // Fallback: serve static assets via Cloudflare Pages / Workers Assets
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  }
};
