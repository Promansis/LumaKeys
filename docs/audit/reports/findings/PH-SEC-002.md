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
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
