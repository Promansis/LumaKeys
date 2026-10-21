import type { Plugin } from 'vite';

/**
 * The renderer's Content-Security-Policy. The web server sends it as a header and both
 * production builds put it in index.html as a <meta> tag. Tone.js starts its clock
 * worker and the reverb's AudioWorklet from blob: URLs, and web sample packs play from
 * blob: URLs, so blob: is the only source allowed beyond the app's own files.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob:",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Header form: adds frame-ancestors, which browsers ignore in a <meta> policy. */
export const CONTENT_SECURITY_POLICY_HEADER = `${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`;

/**
 * Vite plugin that injects the policy as the first <head> tag of production builds. The
 * dev server is left alone: it needs inline scripts and styles for hot reload.
 */
export function contentSecurityPolicyMeta(): Plugin {
  return {
    name: 'lumakeys-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    }],
  };
}
