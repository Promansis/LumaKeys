# PH-SEC-002: Access token accepted in the URL query string and documented as the login path

- Lane: SEC
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: OP-014, OP-018, MOD-010
- Related/duplicate findings: PH-OPS-002 (deployment default)
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

The web access token is the only app-level credential; whoever holds it can import,
delete, reset, and export the whole library through `/api/*`. The README's browser
login step puts that token in the URL
(`/api/access?access_token=...`). URLs are stored in browser history, in Cloudflare
Tunnel and Access request logs, in any reverse proxy log, and can be sent as a
`Referer` to third-party pages opened from the app (the soundboard links to external
sites). A single-user deployment is affected on every login; recovery requires
rotating the token in `docker-compose.yml` and restarting.

## Expected Behavior Or Oracle

Charter security rule: a credential that grants privileged operations must not be
written where parties outside the trust boundary can read it. OWASP guidance and
Cloudflare's own logging both treat query strings as logged, non-secret data. The
header and cookie transports already implemented satisfy the oracle; the query
transport does not.

## Evidence

### Environment

- Commit/patch identity: source `6e549b6`, docs `main`
- OS/runtime/browser: Linux x86_64, Node 24.15.0, isolated `dist/server/index.cjs`
- Data profile/fixture: empty `LUMAKEYS_DATA_DIR` under `$TMPDIR`, token `probe-token-123`
- Hardware, if applicable: none

### Reproduction

1. Start the built server with `LUMAKEYS_WEB_ACCESS_TOKEN` set.
2. `curl -D - 'http://127.0.0.1:3777/api/access?access_token=probe-token-123'`
3. Response is 200 with `Set-Cookie: lumakeys_web_access=...; Path=/api; HttpOnly; SameSite=Strict`. The token was accepted from the query string.
4. Repeated once in the probe run; deterministic from source.

### Artifacts

- File/line or contract evidence: `src/server/webSecurity.ts` lines 66 to 76 read `searchParams.get('access_token')` and mint the cookie from it; `README.md` section 5a instructs the query-string login.
- Test/command output summary: [probe evidence](../../evidence/phase-11-web-probe-2026-10-19.md), "query-string token accepted" line.
- Screenshot/video/trace path and hash: none
- Durable-state before/after comparison: not applicable

## Root Cause

The gate accepts three transports with equal trust. The query transport exists so a
browser can bootstrap the cookie without a UI, and the README turned that convenience
into the documented procedure. The invariant "secrets travel only in headers or
cookies" is not enforced anywhere.

## Recommended Remediation Boundary

Replace the query bootstrap with a tiny login form or a `POST /api/access` that reads
the token from the body or header, remove `access_token` from the query parser, and
update README section 5a. `webSecurity.ts`, `webSecurity.test.ts`, and `README.md`
only.

## Required Regression Proof

- Deterministic unit/integration proof: `webSecurity.test.ts` case that a query-string token is rejected with 401 and no cookie.
- Electron proof: not applicable.
- Web proof: probe line "query-string token accepted" must disappear; header and cookie cases still pass.
- Data/recovery proof: not applicable.
- Manual hardware/UI proof: owner logs in once through the new path in a private window.
- Broader regression command: `npx vitest run src/server`

## Challenge Record

- Independent reproduction attempt: probe output and source agree.
- Alternative explanations tested: "Cloudflare Access makes this moot" rejected: Access protects reachability, not the logs that Access and the tunnel write, nor browser history.
- Scope/severity changes: P2, not P1, because exploitation needs log or history access and Access sits in front.
- Deduplication decision: distinct from PH-OPS-002 (whether a gate exists at all).
- Challenger conclusion and date: reproduced, 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: branch `remediation/p11-s02-web-access`, `b6aaf47` (fix) and `aae47b5` (probe and browser driver), slice 2. Not merged or deployed.
  - What changed: the gate in `src/server/webSecurity.ts` reads the token from the `x-lumakeys-access-token` header or the cookie only. The `access_token` query parser is gone.
  - New sign-in: `GET /login` serves a static form (no script, `Cache-Control: no-store`) that posts `token` in the body to `POST /api/access`. A good token sets the same cookie as before (HttpOnly, SameSite=Strict, `Path=/api`, Secure on https) and redirects 303 to `/`. A wrong token gets the form back with 401 and no cookie. Scripts can post JSON `{"token":"..."}` (200 `{"ok":true}`) or keep sending the header. The sign-in route runs ahead of the gate, with a 4 KiB body limit. The cookie format is unchanged, so browsers that are already signed in stay signed in. The 401 message now says "Sign in at /login."
  - README section 5a documents `/login`, the script options, and that old `?access_token=` links stop working.
  - Beyond the boundary: `src/server/index.ts` changed too (it calls the new `installWebAccess`, shared with [PH-OPS-002](PH-OPS-002.md)), and `scripts/audit/web-security-probe.sh` now reads cookie flags from the body sign-in.
- Verification evidence (agent run 2026-10-21, for the verifier; not a verification). Evidence files are under `$TMPDIR/p11-s02/`.
  - Tests in `src/server/webSecurity.test.ts` that failed before the fix and pass after: "rejects an access token in the query string and sets no cookie" (before: expected 200 to be 401), "signs in through POST /api/access with the token in a JSON body" (before: 401), "signs in from the login form body and redirects to the app" (before: 401, not 303) and "serves a login form that posts the token in the request body" (before: 404). "rejects a wrong token posted to /api/access without setting a cookie" passes before and after. The header and cookie tests still pass.
  - Probe, built server with a test token, port 3220. Before: "INFO query-string token accepted; …" (`probe-before.txt`, sha256 `cab0a3da…a53e21d6`). After: "PASS query-string token rejected (401, no cookie)", "PASS body sign-in accepted (POST /api/access): 200", "PASS header token accepted: 200", cookie HttpOnly and SameSite=Strict PASS, wrong token 401, 0 WARN (`probe-final.txt`, sha256 `ec7926c5…b27249f5`). Extra curl checks in the same file: the form with the good token gets 303 to `/` with the cookie; a bad token gets 401 and no cookie; an 8 KiB sign-in body gets 413; an existing cookie still gets 200.
  - Browser: `scripts/audit/browser/csp-check.mjs`, headless Chromium 141, port 3222. It signs in through the `/login` form and lands on `/`. None of the 9 request or navigation URLs carried the token, `document.cookie` does not show the cookie, and `/api/access` answers 200 after sign-in. All checks pass (`csp-web-final.out`, sha256 `fb378365…8bfe4e46`).
  - Owed, human only: after deploy, the owner signs in once at `/login` in a private window on the live host, and an old `?access_token=` bookmark returns 401.
- Residual risk: the token still travels in the POST body, and the cookie value is the token itself, as before. Anything that logs request bodies or cookies would see it. `POST /api/access` has no rate limit; a 32-byte random token (README: `openssl rand -hex 32`) makes guessing impractical. The token is compared with plain string equality, as before.
- Revisit trigger, if accepted-risk: not applicable.
