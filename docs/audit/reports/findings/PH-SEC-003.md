# PH-SEC-003: Web HTML responses carry no Content-Security-Policy or related security headers

- Lane: SEC
- Severity: P3
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: web
- Coverage rows: OP-016, MOD-010, MOD-013
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

No current exploit path was found: React escapes rendered strings, the renderer has
no `dangerouslySetInnerHTML`, and the built `index.html` has a single external module
script and no inline script. The impact is defense in depth: any future injection
through song titles, backup JSON, or a dependency would run unrestricted, and the app
can be framed by another origin. Severity is P3 because the user-visible impact today
is nil; it is still recorded because the fix is cheap and the app renders
user-supplied names everywhere.

## Expected Behavior Or Oracle

Charter security rule for deployment surfaces plus common browser hardening: a
self-hosted single-page app served to the public internet sends
`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and
`X-Frame-Options` or `frame-ancestors`.

## Evidence

### Environment

- Commit/patch identity: source `6e549b6`
- OS/runtime/browser: isolated `dist/server/index.cjs` on Linux, curl
- Data profile/fixture: empty data dir

### Reproduction

1. `curl -D - http://127.0.0.1:3777/`
2. Headers present: `Permissions-Policy: midi=(self)`, `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Type`, `Accept-Ranges`.
3. Headers absent: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
4. Deterministic; the only header middleware in `src/server/index.ts` sets `Permissions-Policy`.

### Artifacts

- File/line or contract evidence: `src/server/index.ts` middleware at the `app.use('*', ...)` call; `src/server/staticFiles.ts` sets content type, range, and cache headers only.
- Test/command output summary: [probe evidence](../../evidence/phase-11-web-probe-2026-10-19.md), four WARN lines under "Response headers".
- CSP feasibility: `dist/web/index.html` contains one `<script type="module" src=...>` and no inline script or `style=` attributes; fonts and video are self-hosted. Tone.js may need `worker-src blob:`; `audioEngine.ts` should be checked for `blob:` or `data:` URLs during remediation.

## Root Cause

Headers were added one at a time as features needed them (`Permissions-Policy` for
MIDI); there is no single place that declares the response security policy for HTML.

## Recommended Remediation Boundary

Add one middleware in `src/server/index.ts` for HTML responses that sets CSP,
`X-Content-Type-Options`, `Referrer-Policy: no-referrer`, and
`X-Frame-Options: DENY`; add a `staticFiles.test.ts` case. Verify the main menu
video, Tone.js sampler loading, and the soundboard still work under the policy in a
browser before merging.

## Required Regression Proof

- Deterministic unit/integration proof: `staticFiles.test.ts` asserts the four headers on `/` and on the SPA fallback.
- Electron proof: not applicable (Electron loads `file://`; a CSP meta tag is a separate hardening item under MOD-014).
- Web proof: probe section "Response headers" shows four PASS lines; manual play-through confirms no CSP violations in the browser console.
- Broader regression command: `npx vitest run src/server`

## Challenge Record

- Independent reproduction attempt: probe and source agree.
- Alternative explanations tested: "Cloudflare adds these headers" checked against the README, which configures only tunnel ingress and Access; no transform rules are documented.
- Scope/severity changes: entered at P3 after confirming no injection vector.
- Deduplication decision: none
- Challenger conclusion and date: reproduced, 2026-10-19

## Resolution

- Accepted/rejected rationale: pending consolidation
