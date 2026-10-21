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
- Fix branch/commit/issue: branch `remediation/p11-s02-web-access`, `b6aaf47` (fix) and `aae47b5` (CSP drivers), slice 2, with review repairs in `3d5d963` and `ed31acb`. Not merged or deployed.
  - What changed: the new `src/shared/contentSecurityPolicy.ts` holds one policy: `default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' blob:; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`.
  - Web: `htmlSecurityHeaders()` in `src/server/webSecurity.ts`, installed for every route in `src/server/index.ts`, adds to each `text/html` response (the app shell, the SPA fallback and `/login`) the policy plus `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`.
  - Both builds: the Vite plugin `contentSecurityPolicyMeta()`, added in `vite.web.config.ts` and `electron.vite.config.ts`, puts `<meta http-equiv="Content-Security-Policy">` first in the built `index.html`.
  - Why `blob:`: Tone.js starts its clock worker from a blob URL, the Freeverb reverb loads its AudioWorklet through `addModule` on a blob URL, and web sample packs play from blob URLs. No style violation showed up with `style-src 'self'`.
  - Deviation from the boundary: it asked for the meta tag in `src/renderer/index.html`. The Vite dev server adds an inline React refresh script and inline styles that this policy blocks, so the plugin adds the tag to production builds only. One constant still feeds the header and both builds. Electron dev mode (`npm run dev`) therefore has no policy and still prints the warning.
- Verification evidence (agent run 2026-10-21, for the verifier; not a verification). Evidence files are under `$TMPDIR/p11-s02/`.
  - Tests that failed before the fix and pass after: `src/server/staticFiles.test.ts` "sends the HTML security headers on /" and "sends the HTML security headers on /library" (before: `htmlSecurityHeaders is not a function`); the new `src/shared/contentSecurityPolicy.test.ts` "allows only same-origin scripts and never eval", "adds frame-ancestors only to the header, because a <meta> policy cannot carry it" and "puts the policy first in <head> for production builds only" (before: the module did not exist).
  - Review repair (`3d5d963`): `src/server/index.test.ts` "gates the API and sends the CSP header when started with a token" starts the real server entry and checks the CSP header on `/`. In a scratch copy outside the worktree, deleting `app.use('*', htmlSecurityHeaders())` from `src/server/index.ts` fails that test; the mutation was not committed.
  - Probe "Response headers", built server, port 3220. Before: 4 WARN (`probe-before.txt`, sha256 `cab0a3da…a53e21d6`). After: PASS for Content-Security-Policy, X-Content-Type-Options, Referrer-Policy and X-Frame-Options; Permissions-Policy and Cache-Control still PASS; `/login` carries the same headers (`probe-final.txt`, sha256 `ec7926c5…b27249f5`).
  - Browser: `scripts/audit/browser/csp-check.mjs`, headless Chromium 141, port 3222. The built `index.html` carries the meta tag; the main-menu video plays; the audio engine starts (reverb worklet and clock worker); the built-in flute sampler loads; a `blob:` fetch works; Soundboard clips return 200; the app causes no CSP violation. The policy is enforced: string eval is refused, an injected inline script does not run, a cross-origin fetch is refused by `connect-src`, and an iframe of the app is blocked. All checks pass (`csp-web-final.out`, sha256 `fb378365…8bfe4e46`). The web "Install Better Sounds" flow makes 40 `undefinedblob:` requests that the policy refuses. That URL is already broken without a policy ([PH-PAR-006](PH-PAR-006.md) records "Fetch API cannot load undefinedblob:"), so the driver lists them apart and does not count them.
  - Electron, headless harness, Electron 30.5.1, worktree `out/` rebuilt with `npm run build`, throwaway profiles. `setup-guide-choices.mjs`: before, the insecure-CSP warning 3 times (sha256 `4b4b4d6a…f135462e`, the same output as this finding's evidence); after, 0 in two runs, with the rest of the output identical (`setup2.out` and `setup3.out`, sha256 `ef9acb30…f00796b0`). An earlier after-run timed out clicking Keyboard Setup after the relaunch, with no warning; the reruns passed. `workflows.mjs`: before, it crashed at PH-MUS-005 with "GPU process isn't usable. Goodbye." (environment, in `main.log`); after, exit 0 and `ERRORS []`. `freeplay-export.mjs`: exit 0 and `ERRORS []` before and after; the MIDI export matches; the WAV is silent both times (known, PH-MUS-007). `sample-pack.mjs`: exit 0 before and after, with the same known file-not-found errors while the pack is removed.
  - New `scripts/audit/electron/csp-check.mjs`: meta tag present, main-menu video loads, the engine starts and the Salamander sampler loads, a backing track picked from outside the app loads, a Soundboard clip loads, no CSP violation, no insecure-CSP warning, string eval refused. All pass (`el-after/csp.out`, sha256 `4f326e20…f85a838e`).
  - Owed, human only: a play-through with sound and the console open, in a real browser on the deployed web build and in the desktop build: play a song, Free Play, Soundboard, Install Better Sounds. Expect no CSP error other than the PH-PAR-006 `undefinedblob:` ones.
- Residual risk: `script-src blob:` lets script that already runs start more script from a blob URL; it adds nothing for content that cannot run script. Electron dev mode has no policy. JSON and asset responses do not get `nosniff`; the finding asked for HTML.
- Revisit trigger, if accepted-risk: not applicable.
