/**
 * Cloudflare Pages Functions / Advanced Worker Entrypoint
 * Handles static asset serving, health checks, and edge API capabilities.
 *
 * Security Policy (Fail-Closed):
 * - Direct *.workers.dev access is blocked (403 Forbidden).
 * - All /api/memos, /api/shared-pad, and /api/apps requests require EITHER:
 *   1. Cloudflare Access JWT (Cf-Access-Jwt-Assertion header or CF_Authorization cookie)
 *      verified for RS256 cryptographic signature (via JWKS), exp/nbf, iss, and aud.
 *   2. Dedicated automation Bearer token (Authorization: Bearer <MEMO_API_TOKEN> or X-Memo-Token)
 *      verified via constant-time comparison against env.MEMO_API_TOKEN.
 * - If authentication credentials or env configuration are missing/invalid, requests
 *   strictly Fail Closed with 401 Unauthorized.
 */

// In-memory cache for Cloudflare Access JWKS keys per issuer
const jwksCache = new Map();
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Constant-time string/byte comparison to prevent timing side-channel attacks.
 */
function timingSafeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length || aBytes.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/**
 * Decode Base64URL string into Uint8Array.
 */
function base64UrlToBytes(b64url) {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode Base64URL JSON segment safely.
 */
function decodeJwtJsonSegment(segment) {
  const bytes = base64UrlToBytes(segment);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Extract cookie value by name from Cookie header.
 */
function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name && rest.length > 0) {
      return rest.join('=').trim();
    }
  }
  return null;
}

/**
 * Fetch and cache Cloudflare Access JWKS keys for the configured issuer.
 */
async function getCloudflareAccessJwks(issuer, env) {
  const now = Date.now();
  const cached = jwksCache.get(issuer);
  if (cached && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  const fetcher = (env && typeof env.__JWKS_FETCH === 'function') ? env.__JWKS_FETCH : fetch;
  const res = await fetcher(certsUrl, { headers: { 'Accept': 'application/json' } });
  if (!res || !res.ok) {
    throw new Error(`Failed to fetch Cloudflare Access JWKS (${res ? res.status : 'no response'})`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.keys)) {
    throw new Error('Invalid JWKS payload');
  }
  jwksCache.set(issuer, { keys: data.keys, fetchedAt: now });
  return data.keys;
}

/**
 * Verify Cloudflare Access JWT:
 * Checks RS256 cryptographic signature, exp, nbf, iss, and aud.
 */
async function verifyCloudflareAccessJwt(request, env) {
  const rawIssuer = env && typeof env.CF_ACCESS_TEAM_DOMAIN === 'string' ? env.CF_ACCESS_TEAM_DOMAIN.trim() : '';
  const rawAud = env && typeof env.CF_ACCESS_AUD === 'string' ? env.CF_ACCESS_AUD.trim() : '';
  if (!rawIssuer || !rawAud) {
    return false;
  }

  const expectedIssuer = (rawIssuer.startsWith('https://') ? rawIssuer : `https://${rawIssuer}`).replace(/\/+$/, '');
  const allowedAuds = rawAud.split(',').map(s => s.trim()).filter(Boolean);
  if (allowedAuds.length === 0) {
    return false;
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    getCookieValue(request.headers.get('Cookie'), 'CF_Authorization');
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = decodeJwtJsonSegment(headerB64);
    const payload = decodeJwtJsonSegment(payloadB64);

    // 1. Algorithm & Key ID check
    if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
      return false;
    }

    // 2. Issuer (iss) check
    if (!payload || typeof payload.iss !== 'string' || payload.iss.replace(/\/+$/, '') !== expectedIssuer) {
      return false;
    }

    // 3. Audience (aud) check
    const tokenAuds = Array.isArray(payload.aud)
      ? payload.aud
      : (typeof payload.aud === 'string' ? [payload.aud] : []);
    const audMatched = tokenAuds.some(a => typeof a === 'string' && allowedAuds.includes(a));
    if (!audMatched) {
      return false;
    }

    // 4. Expiration (exp) & Not-Before (nbf) check
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || nowSec >= payload.exp) {
      return false;
    }
    if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || nowSec < payload.nbf)) {
      return false;
    }

    // 5. Cryptographic signature verification via JWKS
    const jwksKeys = await getCloudflareAccessJwks(expectedIssuer, env);
    const jwk = jwksKeys.find(k => k && k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) {
      return false;
    }

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlToBytes(signatureB64);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signatureBytes, signingInput);
    return valid === true;
  } catch {
    return false;
  }
}

/**
 * Verify dedicated automation API token (Oracle / MCP).
 * Browser clients do NOT store or use this token.
 */
function verifyAutomationToken(request, env) {
  const expectedToken = env && typeof env.MEMO_API_TOKEN === 'string' ? env.MEMO_API_TOKEN.trim() : '';
  if (!expectedToken || expectedToken.length < 16) {
    return false;
  }

  let candidate = '';
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    candidate = authHeader.slice(7).trim();
  } else {
    candidate = (request.headers.get('X-Memo-Token') || '').trim();
  }

  if (!candidate) {
    return false;
  }
  return timingSafeEqualStrings(candidate, expectedToken);
}

/**
 * Fail-Closed Authentication Guard for protected API endpoints.
 * Returns null if authenticated, or a 401 Response if unauthenticated.
 */
async function requireApiAuth(request, env) {
  // Path 1: Dedicated automation token (Oracle / MCP)
  if (verifyAutomationToken(request, env)) {
    return null;
  }
  // Path 2: Cloudflare Access JWT (Browser / Service Token with Access JWT)
  if (await verifyCloudflareAccessJwt(request, env)) {
    return null;
  }
  // Strict Fail-Closed: reject all unauthenticated or misconfigured requests
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Block direct *.workers.dev public exposure (enforce custom domain behind Cloudflare Access)
    if (url.hostname.endsWith('.workers.dev')) {
      return new Response(JSON.stringify({
        error: 'Direct workers.dev access is disabled. Use the protected custom domain.'
      }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    }

    // API Route: Health Check (minimal status, no sensitive data)
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'antigravity-mission-hub',
        timestamp: new Date().toISOString(),
        runtime: 'Cloudflare Workers & Pages'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    }

    // Dedicated scratchpad: never modifies instruction memos.
    if (url.pathname === '/api/shared-pad') {
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
      const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
      if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
      const authError = await requireApiAuth(request, env);
      if (authError) return authError;
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
      const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      };

      const authError = await requireApiAuth(request, env);
      if (authError) return authError;

      if (request.method === 'GET') {
        if (env && env.MEMO_KV) {
          try {
            const data = await env.MEMO_KV.get('memos');
            if (data === null) {
              return new Response(JSON.stringify({ uninitialized: true }), {
                headers: { ...headers, 'X-Storage-Mode': 'kv' }
              });
            }
            return new Response(data, {
              headers: { ...headers, 'X-Storage-Mode': 'kv' }
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers
            });
          }
        }
        return new Response(JSON.stringify({
          mode: 'local',
          info: 'Cloudflare KV is not bound yet. Using LocalStorage fallback.'
        }), {
          headers
        });
      }

      if (request.method === 'POST') {
        if (env && env.MEMO_KV) {
          try {
            const body = await request.text();
            await env.MEMO_KV.put('memos', body);
            return new Response(JSON.stringify({ success: true, mode: 'kv' }), {
              headers
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers
            });
          }
        }
        return new Response(JSON.stringify({ success: true, mode: 'local' }), {
          headers
        });
      }

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers
      });
    }

    // API Route: Custom Apps Presets Endpoint (Cloudflare KV)
    if (url.pathname === '/api/apps') {
      const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      };

      const authError = await requireApiAuth(request, env);
      if (authError) return authError;

      if (request.method === 'GET') {
        if (env && env.MEMO_KV) {
          try {
            const data = await env.MEMO_KV.get('custom_apps');
            return new Response(data || 'null', {
              headers: { ...headers, 'X-Storage-Mode': 'kv' }
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers
            });
          }
        }
        return new Response(JSON.stringify({ mode: 'local' }), {
          headers
        });
      }

      if (request.method === 'POST') {
        if (env && env.MEMO_KV) {
          try {
            const body = await request.text();
            await env.MEMO_KV.put('custom_apps', body);
            return new Response(JSON.stringify({ success: true, mode: 'kv' }), {
              headers
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers
            });
          }
        }
        return new Response(JSON.stringify({ success: true, mode: 'local' }), {
          headers
        });
      }

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers
      });
    }

    // Fallback: serve static assets via Cloudflare Pages / Workers Assets
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  }
};
