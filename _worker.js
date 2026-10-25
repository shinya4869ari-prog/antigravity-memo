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

    // Dedicated scratchpad: never modifies instruction memos.
    if (url.pathname === '/api/shared-pad') {
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
      const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
      if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
      if (!env?.MEMO_KV) return reply({ mode: 'local' });
      try {
        if (request.method === 'GET') {
          return reply({ mode: 'kv', pad: await env.MEMO_KV.get('shared_pad', 'json') });
        }
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 3000000) return reply({ error: 'メモは画像込みで3MB以内にしてください' }, 413);
        let body;
        try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid JSON' }, 400); }
        const pad = body.pad;
        if (!pad || typeof pad.text !== 'string' || pad.text.length > 200000 ||
            typeof pad.revision !== 'string' || pad.revision.length > 100 ||
            !Array.isArray(pad.images) || pad.images.length > 8 ||
            pad.images.some(src => typeof src !== 'string' || !/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(src)) ||
            !(body.base === null || typeof body.base === 'string')) {
          return reply({ error: 'Invalid scratchpad' }, 400);
        }
        const current = await env.MEMO_KV.get('shared_pad', 'json');
        if ((current?.revision || null) !== body.base) return reply({ pad: current }, 409);
        await env.MEMO_KV.put('shared_pad', JSON.stringify(pad));
        return reply({ mode: 'kv', success: true });
      } catch { return reply({ error: '共有メモの保存・取得に失敗しました' }, 500); }
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
