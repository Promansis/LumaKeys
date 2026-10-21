// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  CONTENT_SECURITY_POLICY_HEADER,
  contentSecurityPolicyMeta,
} from './contentSecurityPolicy';

function directive(policy: string, name: string): string | undefined {
  return policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
}

// PH-SEC-003: one policy for the web header and the <meta> tag in both builds.
describe('contentSecurityPolicy', () => {
  it('allows only same-origin scripts and never eval', () => {
    expect(directive(CONTENT_SECURITY_POLICY, 'default-src')).toBe("default-src 'self'");
    expect(directive(CONTENT_SECURITY_POLICY, 'script-src')).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
    expect(directive(CONTENT_SECURITY_POLICY, 'object-src')).toBe("object-src 'none'");
  });

  it('adds frame-ancestors only to the header, because a <meta> policy cannot carry it', () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain('frame-ancestors');
    expect(CONTENT_SECURITY_POLICY_HEADER).toBe(`${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`);
  });

  it('puts the policy first in <head> for production builds only', () => {
    const plugin = contentSecurityPolicyMeta();
    const transform = plugin.transformIndexHtml as () => unknown;

    expect(plugin.apply).toBe('build');
    expect(transform()).toEqual([{
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    }]);
  });
});
