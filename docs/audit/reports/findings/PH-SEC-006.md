# PH-SEC-006: The web access cookie is never marked Secure behind the Cloudflare Tunnel

- Lane: SEC
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-21
- Verifier: TBD
- Affected runtime: web
- Coverage rows: OP-014, MOD-010
- Related/duplicate findings: PH-SEC-002 (the sign-in flow that sets this cookie), PH-OPS-002
- First observed against: the deployed image `lumakeys-lumakeys` `sha256:8c3a0bf9…`, built from `main` at `af57d89` on 2026-10-21

## User Impact

After sign-in, the browser holds `lumakeys_web_access`, which carries the access token
itself. In the documented deployment (Cloudflare Tunnel to the container's plain-HTTP
port 3001) the cookie is set without `Secure`. The browser will then send it on a
plain-HTTP request to `/api` on the same host, for example when the user opens an
`http://` link to the API directly. Anyone who can read that traffic gets the token,
which unlocks the whole library until the owner changes it.

Severity P3: `HttpOnly` keeps it from page scripts, `SameSite=Strict` keeps it off
requests started by other sites, `Path=/api` limits where it is sent, and Cloudflare
normally redirects HTTP to HTTPS. The exposure needs a plain-HTTP request to `/api` that
the user starts and a network observer before Cloudflare's edge. It weakens the slice 2
access gate without opening it.

## Expected Behavior Or Oracle

- A cookie that carries a credential on an HTTPS-only site is marked `Secure` (RFC 6265bis
  section 4.1.2.5; OWASP Session Management Cheat Sheet, "Secure attribute").
- The code states the same intent: `setAccessCookie` in `src/server/webSecurity.ts` adds
  `Secure` when the request is HTTPS. Behind the documented proxy that check never sees
  HTTPS.

## Evidence

### Environment

- Commit/patch identity: image `sha256:8c3a0bf9…` (the owner's 2026-10-21 deploy, from `af57d89`)
- OS/runtime/browser: Docker on the Linux host, `curl`
- Data profile/fixture: throwaway container, in-memory `/data`, a made-up token, loopback port 3297
- Hardware, if applicable: none

### Reproduction

1. Run the deployed image in a throwaway container with a made-up token.
2. `POST /api/access` with the right token: once with no forwarding header, once with
   `X-Forwarded-Proto: https`, once with `Cf-Visitor: {"scheme":"https"}`.
3. Observed every time: `set-cookie: lumakeys_web_access=<value>; Path=/api; HttpOnly; SameSite=Strict`, with no `Secure`.
4. Expected: `Secure` when the visitor used HTTPS (the two forwarded headers).
5. Repeat count: two runs, identical.

### Artifacts

- File/line or contract evidence: `src/server/webSecurity.ts`, `setAccessCookie`:
  `const secure = new URL(c.req.url).protocol === 'https:';`. Behind the tunnel,
  `c.req.url` is the origin's `http://` address.
- Test/command output summary: `/tmp/claude-1000/p11-docker-check/check2.out` (SHA-256
  `4559b106…b4a59108`), the three "cookie, header" lines; script `check2.sh` beside it.
- Screenshot/video/trace path and hash: none
- Durable-state before/after comparison: not applicable

## Root Cause

The server decides whether the visitor used HTTPS from its own request URL. The only
deployment the README documents ends TLS at Cloudflare, so the origin always sees HTTP and
never adds `Secure`. Slice 2 added the cookie without considering the forwarded scheme.

## Recommended Remediation Boundary

In `setAccessCookie`, also add `Secure` when the first value of `X-Forwarded-Proto` is
`https`, or when `Cf-Visitor` says the scheme is `https`. Trusting those headers here is
safe: a forged header can only add the flag, so the worst case is a cookie the browser
will not store over plain HTTP, never a weaker one. Loopback HTTP use without those
headers keeps working.

## Required Regression Proof

- Deterministic unit/integration proof: `webSecurity.test.ts` cases where sign-in with
  `X-Forwarded-Proto: https`, and with `Cf-Visitor` `https`, sets `Secure`; a plain-HTTP
  request without them does not.
- Electron proof: not applicable.
- Web proof: the throwaway-container check against an image built from the fix shows
  `Secure` with each forwarded header.
- Data/recovery proof: not applicable.
- Manual hardware/UI proof: owner, after the redeploy: F12, Application, Cookies shows
  `Secure` ticked for `lumakeys_web_access` on the live site (user tests A2).
- Broader regression command: `npm run verify`.

## Challenge Record

- Independent reproduction attempt: three header variants against the deployed image, plus
  reading the source that decides the flag.
- Alternative explanations tested: Cloudflare could add `Secure` on the way out, but it does
  not rewrite origin cookies unless a Transform Rule is set up. The live behaviour is still
  the owner's check (A2).
- Scope/severity changes: P3, for the reasons in User Impact.
- Deduplication decision: new. PH-SEC-002 covered moving the token out of the URL, not the
  cookie's attributes.
- Challenger conclusion and date: reproduced against the image, 2026-10-21.

## Resolution

- Accepted/rejected rationale: accepted by the owner on 2026-10-21 ("sure"), to be fixed in
  the follow-up to slices 2 and 3 (user tests decision 11).
- Fix branch/commit/issue: branch `remediation/p11-f3-web-deps`, commit `c706ad5` (the `hono` bump that follows is lead (k), a separate commit on the same branch); merged to `main` in `93ac583` after independent review (not pushed).
- Verification evidence (2026-10-21, worktree `p11-f3`): `setAccessCookie` now calls `isSecureRequest`, which adds `Secure` when the request URL is `https:`, when the first comma-separated `X-Forwarded-Proto` value is `https` (trimmed, case-insensitive), or when `Cf-Visitor` JSON has `scheme` `https` (malformed JSON or another scheme is ignored). `src/server/webSecurity.test.ts` gained 7 cases in "access cookie Secure flag": no `Secure` without headers, with `X-Forwarded-Proto: http` or `http, https`, or with a malformed or `http` `Cf-Visitor`; `Secure` with `X-Forwarded-Proto: https`, with ` HTTPS , http`, with `Cf-Visitor: {"scheme":"https"}`, on an `https://` request URL, and on the header sign-in path. Before the fix 4 of the 22 tests failed (the header cases); after it all 22 pass. `npm run verify` passed on Node 22.23.3 and on Node 24.15.0 (73 test files passed, 1 skipped; 478 tests passed, 1 skipped). Throwaway-container check (audit lead, 2026-10-21) of an image built from `93ac583` (`lumakeys-p11-check:f3`, `sha256:acf3fc05…`): sign-in with no forwarding header sets `Path=/api; HttpOnly; SameSite=Strict`; with `X-Forwarded-Proto: https`, and with `Cf-Visitor: {"scheme":"https"}`, the same plus `Secure`. The refusals and the gate are unchanged, and the image holds hono 4.13.13. Evidence: `/tmp/claude-1000/p11-docker-check/check-f3.out` (SHA-256 `c115fa4c…826d8`), script `check-image.sh` beside it. The owner's A2 check on the live site, after a redeploy, is still owed.
- Residual risk: a client that reaches the origin directly over plain HTTP and forges neither header still gets a non-Secure cookie, which is the documented loopback behaviour. A forged header only adds the flag, so the worst case is a cookie the browser will not store over plain HTTP. Cloudflare could still strip or rewrite the headers; the owner's A2 check shows what the live site sends.
- Revisit trigger, if accepted-risk:
