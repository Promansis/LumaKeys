import { bodyLimit } from 'hono/body-limit';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { CONTENT_SECURITY_POLICY_HEADER } from '../shared/contentSecurityPolicy';

export const BRIDGE_RPC_BODY_LIMIT_BYTES = 256 * 1024;
export const LIBRARY_IMPORT_BODY_LIMIT_BYTES = 50 * 1024 * 1024;
export const MIDI_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
export const MIDI_UPLOAD_BODY_LIMIT_BYTES = MIDI_FILE_LIMIT_BYTES + 1024 * 1024;
export const ACCESS_LOGIN_BODY_LIMIT_BYTES = 4 * 1024;

/** The token value docker-compose.yml ships with; the server refuses to start with it. */
export const WEB_ACCESS_TOKEN_PLACEHOLDER = 'change-this-long-random-token';

const ACCESS_COOKIE_NAME = 'lumakeys_web_access';
const ACCESS_TOKEN_HEADER = 'x-lumakeys-access-token';
const ACCESS_DENIED_MESSAGE = 'Web API access token required. Sign in at /login.';

export type WebAccessPolicy =
  | { mode: 'token'; token: string }
  | { mode: 'trust-upstream' };

function jsonLimitError(c: Context, label: string) {
  return c.json({ error: `${label} exceeds the request body limit.` }, 413);
}

export function bridgeRpcBodyLimit(): MiddlewareHandler {
  return bodyLimit({
    maxSize: BRIDGE_RPC_BODY_LIMIT_BYTES,
    onError: (c) => jsonLimitError(c, 'Bridge request'),
  });
}

export function libraryImportBodyLimit(): MiddlewareHandler {
  return bodyLimit({
    maxSize: LIBRARY_IMPORT_BODY_LIMIT_BYTES,
    onError: (c) => jsonLimitError(c, 'Library import'),
  });
}

export function midiUploadBodyLimit(): MiddlewareHandler {
  return bodyLimit({
    maxSize: MIDI_UPLOAD_BODY_LIMIT_BYTES,
    onError: (c) => jsonLimitError(c, 'MIDI upload'),
  });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) {
    return null;
  }

  for (const cookie of header.split(';')) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return null;
}

function setAccessCookie(c: Context, secret: string): void {
  const secure = new URL(c.req.url).protocol === 'https:';
  c.header(
    'Set-Cookie',
    `${ACCESS_COOKIE_NAME}=${encodeURIComponent(secret)}; Path=/api; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`,
  );
}

/**
 * Decides how /api/* is protected. Throws when the environment names no gate, so a
 * deployment that loses its Cloudflare Access policy cannot start with the library open.
 */
export function resolveWebAccessPolicy(env: Record<string, string | undefined>): WebAccessPolicy {
  // New variable first, legacy variable as a one-release fallback.
  const token = (env.LUMAKEYS_WEB_ACCESS_TOKEN ?? env.PIANOHERO_WEB_ACCESS_TOKEN)?.trim();
  if (token === WEB_ACCESS_TOKEN_PLACEHOLDER) {
    throw new Error(
      'LUMAKEYS_WEB_ACCESS_TOKEN is still the placeholder from docker-compose.yml. '
        + 'Set a long random token (README section 5a).',
    );
  }
  if (token) {
    return { mode: 'token', token };
  }
  if (env.LUMAKEYS_TRUST_UPSTREAM_AUTH?.trim() === '1') {
    return { mode: 'trust-upstream' };
  }
  throw new Error(
    'No web access gate is set. Set LUMAKEYS_WEB_ACCESS_TOKEN, or set LUMAKEYS_TRUST_UPSTREAM_AUTH=1 '
      + 'if Cloudflare Access or another login already protects this host (README section 5a).',
  );
}

function createApiAccessGate(policy: WebAccessPolicy): MiddlewareHandler {
  return async (c, next) => {
    if (policy.mode === 'trust-upstream') {
      await next();
      return;
    }

    // Header or cookie only: a token in the URL would end up in browser history, proxy
    // logs and Referer headers.
    const headerSecret = c.req.header(ACCESS_TOKEN_HEADER);
    const suppliedSecret = headerSecret ?? readCookie(c.req.raw, ACCESS_COOKIE_NAME);

    if (suppliedSecret !== policy.token) {
      return c.json({ error: ACCESS_DENIED_MESSAGE }, 401);
    }

    if (headerSecret === policy.token) {
      setAccessCookie(c, policy.token);
    }

    await next();
  };
}

function isFormSubmission(c: Context): boolean {
  return (c.req.header('content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded');
}

async function readSubmittedToken(c: Context): Promise<string | undefined> {
  const headerSecret = c.req.header(ACCESS_TOKEN_HEADER);
  if (headerSecret !== undefined) {
    return headerSecret;
  }

  if (isFormSubmission(c)) {
    const body = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    return typeof body.token === 'string' ? body.token.trim() : undefined;
  }

  if ((c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    const body = await c.req.json<{ token?: unknown }>().catch(() => null);
    return typeof body?.token === 'string' ? body.token.trim() : undefined;
  }

  return undefined;
}

function renderLoginPage(rejected: boolean): string {
  const notice = rejected ? '\n      <p role="alert">That token was not accepted. Try again.</p>' : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LumaKeys sign-in</title>
  </head>
  <body>
    <main>
      <h1>LumaKeys</h1>
      <form method="post" action="/api/access">
        <label for="token">Access token</label>
        <input id="token" name="token" type="password" autocomplete="current-password" required autofocus />
        <button type="submit">Sign in</button>
      </form>${notice}
    </main>
  </body>
</html>
`;
}

/** Signs a browser or script in with the token from the request body or header, never the URL. */
function createAccessLoginHandler(token: string) {
  return async (c: Context) => {
    const fromForm = isFormSubmission(c);
    if ((await readSubmittedToken(c)) !== token) {
      return fromForm ? c.html(renderLoginPage(true), 401) : c.json({ error: ACCESS_DENIED_MESSAGE }, 401);
    }

    setAccessCookie(c, token);
    return fromForm ? c.redirect('/', 303) : c.json({ ok: true });
  };
}

/**
 * Puts /api/* behind the access policy. With a token, a browser signs in once at /login:
 * the form posts the token in the request body and the response sets an HttpOnly cookie
 * scoped to /api. The sign-in route is registered ahead of the gate so it can read the body.
 */
export function installWebAccess(app: Hono, policy: WebAccessPolicy): void {
  if (policy.mode === 'token') {
    app.get('/login', (c) => {
      c.header('Cache-Control', 'no-store');
      return c.html(renderLoginPage(false));
    });
    app.post(
      '/api/access',
      bodyLimit({ maxSize: ACCESS_LOGIN_BODY_LIMIT_BYTES, onError: (c) => jsonLimitError(c, 'Access request') }),
      createAccessLoginHandler(policy.token),
    );
  }

  app.use('/api/*', createApiAccessGate(policy));
  app.get('/api/access', (c) => c.json({ ok: true }));
}

/** Browser security headers for every HTML response: the app shell and the sign-in page. */
export function htmlSecurityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (!c.res.headers.get('Content-Type')?.startsWith('text/html')) {
      return;
    }

    c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY_HEADER);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
  };
}
