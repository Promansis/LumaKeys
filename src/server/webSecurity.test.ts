// @vitest-environment node

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { installWebAccess, resolveWebAccessPolicy, type WebAccessPolicy } from './webSecurity';

function makeApp(policy: WebAccessPolicy = { mode: 'token', token: 'secret-token' }) {
  const app = new Hono();
  installWebAccess(app, policy);
  app.get('/api/ping', (c) => c.json({ ok: true }));
  return app;
}

describe('webSecurity', () => {
  it('allows API requests when upstream auth is explicitly trusted', async () => {
    const app = makeApp({ mode: 'trust-upstream' });

    const response = await app.request('/api/ping');

    expect(response.status).toBe(200);
  });

  it('denies API requests without the configured access token', async () => {
    const app = makeApp();

    const response = await app.request('/api/ping');
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/access token/i);
  });

  it('allows API requests with the configured access token and sets a scoped cookie', async () => {
    const app = makeApp();

    const response = await app.request('/api/ping', {
      headers: { 'x-lumakeys-access-token': 'secret-token' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Path=/api');
  });

  it('allows follow-up API requests with the scoped access cookie', async () => {
    const app = makeApp();

    const response = await app.request('/api/ping', {
      headers: { cookie: 'lumakeys_web_access=secret-token' },
    });

    expect(response.status).toBe(200);
  });

  it('answers 401, not 500, for a malformed access cookie', async () => {
    const app = makeApp();

    const response = await app.request('/api/ping', {
      headers: { cookie: 'lumakeys_web_access=%' },
    });

    expect(response.status).toBe(401);
  });

  // PH-SEC-002: a token in the URL ends up in history, proxy logs and Referer headers.
  it('rejects an access token in the query string and sets no cookie', async () => {
    const app = makeApp();

    const response = await app.request('/api/access?access_token=secret-token');

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('signs in through POST /api/access with the token in a JSON body', async () => {
    const app = makeApp();

    const response = await app.request('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'secret-token' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('set-cookie')).toMatch(/^lumakeys_web_access=secret-token; Path=\/api; HttpOnly; SameSite=Strict/);
  });

  it('signs in from the login form body and redirects to the app', async () => {
    const app = makeApp();

    const response = await app.request('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=secret-token',
    });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });

  // PH-SEC-006: behind the Cloudflare Tunnel the origin sees plain HTTP, so the forwarded
  // scheme decides whether the access cookie is Secure. A forged header can only add the flag.
  describe('access cookie Secure flag', () => {
    async function signInCookie(headers: Record<string, string> = {}) {
      const response = await makeApp().request('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ token: 'secret-token' }),
      });
      expect(response.status).toBe(200);
      return response.headers.get('set-cookie') ?? '';
    }

    it('is not Secure on plain loopback HTTP without forwarded headers', async () => {
      expect(await signInCookie()).not.toContain('Secure');
    });

    it('is Secure when X-Forwarded-Proto is https', async () => {
      expect(await signInCookie({ 'X-Forwarded-Proto': 'https' })).toMatch(/; Secure$/);
    });

    it('reads the first X-Forwarded-Proto value, trimmed and case-insensitive', async () => {
      expect(await signInCookie({ 'X-Forwarded-Proto': ' HTTPS , http' })).toMatch(/; Secure$/);
      expect(await signInCookie({ 'X-Forwarded-Proto': 'http, https' })).not.toContain('Secure');
      expect(await signInCookie({ 'X-Forwarded-Proto': 'http' })).not.toContain('Secure');
    });

    it('is Secure when Cf-Visitor says the scheme is https', async () => {
      expect(await signInCookie({ 'Cf-Visitor': '{"scheme":"https"}' })).toMatch(/; Secure$/);
    });

    it('ignores a Cf-Visitor header that is malformed or names another scheme', async () => {
      expect(await signInCookie({ 'Cf-Visitor': '{"scheme":' })).not.toContain('Secure');
      expect(await signInCookie({ 'Cf-Visitor': '{"scheme":"http"}' })).not.toContain('Secure');
      expect(await signInCookie({ 'Cf-Visitor': 'null' })).not.toContain('Secure');
    });

    it('stays Secure when the request URL itself is https', async () => {
      const response = await makeApp().request('https://example.test/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'secret-token' }),
      });
      expect(response.headers.get('set-cookie')).toMatch(/; Secure$/);
    });

    it('is Secure on the header sign-in path too', async () => {
      const response = await makeApp().request('/api/ping', {
        headers: { 'x-lumakeys-access-token': 'secret-token', 'X-Forwarded-Proto': 'https' },
      });
      expect(response.headers.get('set-cookie')).toMatch(/; Secure$/);
    });
  });

  it('rejects a wrong token posted to /api/access without setting a cookie', async () => {
    const app = makeApp();

    const jsonResponse = await app.request('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong-token' }),
    });
    const formResponse = await app.request('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=wrong-token',
    });

    expect(jsonResponse.status).toBe(401);
    expect(jsonResponse.headers.get('set-cookie')).toBeNull();
    expect(formResponse.status).toBe(401);
    expect(formResponse.headers.get('set-cookie')).toBeNull();
  });

  it('serves a login form that posts the token in the request body', async () => {
    const app = makeApp();

    const response = await app.request('/login');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<form method="post" action="/api/access">');
    expect(html).toContain('type="password"');
  });
});

// PH-OPS-002: a server with no gate and no explicit upstream trust must not start open.
describe('resolveWebAccessPolicy', () => {
  it('refuses to start when neither a token nor upstream trust is set', () => {
    expect(() => resolveWebAccessPolicy({})).toThrow(/LUMAKEYS_WEB_ACCESS_TOKEN.*LUMAKEYS_TRUST_UPSTREAM_AUTH=1/);
    expect(() => resolveWebAccessPolicy({ LUMAKEYS_WEB_ACCESS_TOKEN: '  ' })).toThrow(/LUMAKEYS_WEB_ACCESS_TOKEN/);
  });

  it('refuses the placeholder token shipped in docker-compose.yml', () => {
    expect(() => resolveWebAccessPolicy({ LUMAKEYS_WEB_ACCESS_TOKEN: 'change-this-long-random-token' })).toThrow(/placeholder/);
    expect(() => resolveWebAccessPolicy({
      LUMAKEYS_WEB_ACCESS_TOKEN: 'change-this-long-random-token',
      LUMAKEYS_TRUST_UPSTREAM_AUTH: '1',
    })).toThrow(/placeholder/);
  });

  it('uses the configured token, with the legacy variable as a fallback', () => {
    expect(resolveWebAccessPolicy({ LUMAKEYS_WEB_ACCESS_TOKEN: ' secret-token ' })).toEqual({ mode: 'token', token: 'secret-token' });
    expect(resolveWebAccessPolicy({ PIANOHERO_WEB_ACCESS_TOKEN: 'legacy-token' })).toEqual({ mode: 'token', token: 'legacy-token' });
    expect(resolveWebAccessPolicy({ LUMAKEYS_WEB_ACCESS_TOKEN: 'secret-token', LUMAKEYS_TRUST_UPSTREAM_AUTH: '1' })).toEqual({ mode: 'token', token: 'secret-token' });
  });

  it('treats a blank token variable as unset, so the legacy token still applies', () => {
    expect(resolveWebAccessPolicy({ LUMAKEYS_WEB_ACCESS_TOKEN: '', PIANOHERO_WEB_ACCESS_TOKEN: 'legacy-token' })).toEqual({ mode: 'token', token: 'legacy-token' });
    expect(resolveWebAccessPolicy({ LUMAKEYS_WEB_ACCESS_TOKEN: '  ', PIANOHERO_WEB_ACCESS_TOKEN: ' legacy-token ' })).toEqual({ mode: 'token', token: 'legacy-token' });
    expect(() => resolveWebAccessPolicy({ LUMAKEYS_WEB_ACCESS_TOKEN: ' ', PIANOHERO_WEB_ACCESS_TOKEN: 'change-this-long-random-token' })).toThrow(/placeholder/);
    expect(resolveWebAccessPolicy({ LUMAKEYS_WEB_ACCESS_TOKEN: '', LUMAKEYS_TRUST_UPSTREAM_AUTH: '1' })).toEqual({ mode: 'trust-upstream' });
  });

  it('trusts upstream auth only when LUMAKEYS_TRUST_UPSTREAM_AUTH is exactly 1', () => {
    expect(resolveWebAccessPolicy({ LUMAKEYS_TRUST_UPSTREAM_AUTH: '1' })).toEqual({ mode: 'trust-upstream' });
    expect(() => resolveWebAccessPolicy({ LUMAKEYS_TRUST_UPSTREAM_AUTH: 'true' })).toThrow(/LUMAKEYS_TRUST_UPSTREAM_AUTH=1/);
    expect(() => resolveWebAccessPolicy({ LUMAKEYS_TRUST_UPSTREAM_AUTH: '0' })).toThrow(/LUMAKEYS_TRUST_UPSTREAM_AUTH=1/);
  });
});
