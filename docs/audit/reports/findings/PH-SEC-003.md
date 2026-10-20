# PH-SEC-003: Web HTML responses carry no Content-Security-Policy or related security headers, and the desktop renderer has no CSP either

- Lane: SEC
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (web: no response headers; Electron: no CSP in the renderer, added to scope 2026-10-20)
- Coverage rows: OP-016, MOD-010, MOD-013, MOD-014
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

5. Electron, 2026-10-20: `src/renderer/index.html` carries only a `Permissions-Policy`
   meta tag, and `src/main/index.ts` installs no `onHeadersReceived` hook, so the
   desktop renderer runs with no CSP. Electron itself says so: every launch of the
   built app in the headless harness logs "Electron Security Warning (Insecure
   Content-Security-Policy) … This renderer process has either no Content Security
   Policy set or a policy with "unsafe-eval" enabled" (`scripts/audit/electron/setup-guide-choices.mjs`,
   output `$TMPDIR/p11/EL2/setup.out`, sha256 `4b4b4d6a…f135462e`; the other Electron drivers filter
   this line). Electron prints the warning only for unpackaged runs; the missing policy
   is the same in the package.

### Artifacts

- File/line or contract evidence: `src/server/index.ts` middleware at the `app.use('*', ...)` call; `src/server/staticFiles.ts` sets content type, range, and cache headers only.
- Test/command output summary: [probe evidence](../../evidence/phase-11-web-probe-2026-10-19.md), four WARN lines under "Response headers".
- CSP feasibility: `dist/web/index.html` contains one `<script type="module" src=...>` and no inline script or `style=` attributes; fonts and video are self-hosted. Tone.js may need `worker-src blob:`; `audioEngine.ts` should be checked for `blob:` or `data:` URLs during remediation.

## Root Cause

Headers were added one at a time as features needed them (`Permissions-Policy` for
MIDI); there is no single place that declares the response security policy for HTML.

## Recommended Remediation Boundary

Put the CSP in `src/renderer/index.html` as a `<meta http-equiv="Content-Security-Policy">`
tag so both builds get it from the one file, and add one middleware in
`src/server/index.ts` for HTML responses that sets the header form of the CSP
(needed for `frame-ancestors`, which a meta tag cannot carry),
`X-Content-Type-Options`, `Referrer-Policy: no-referrer`, and
`X-Frame-Options: DENY`; add a `staticFiles.test.ts` case. Verify the main menu
video, Tone.js sampler loading, and the soundboard still work under the policy in a
browser before merging.

## Required Regression Proof

- Deterministic unit/integration proof: `staticFiles.test.ts` asserts the four headers on `/` and on the SPA fallback.
- Electron proof: the headless harness run no longer logs the insecure-CSP warning, and the main menu video, sampler loading, Free Play export, and soundboard still work (rerun `scripts/audit/electron/workflows.mjs`, `freeplay-export.mjs`, `sample-pack.mjs`).
- Web proof: probe section "Response headers" shows four PASS lines; manual play-through confirms no CSP violations in the browser console.
- Broader regression command: `npx vitest run src/server`

## Challenge Record

- Independent reproduction attempt: probe and source agree.
- Alternative explanations tested: "Cloudflare adds these headers" checked against the README, which configures only tunnel ingress and Access; no transform rules are documented.
- Scope/severity changes: entered at P3 after confirming no injection vector. On 2026-10-20 the lead widened the scope to Electron. The first pass had parked the desktop CSP as "a separate hardening item under MOD-014", but no finding tracked it, and one meta tag fixes both runtimes. Severity stays P3: the desktop window loads only bundled `file://` content, is sandboxed, and has context isolation.
- Deduplication decision: none
- Challenger conclusion and date: reproduced, 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
