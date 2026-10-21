# PH-SEC-005: Soundboard source links open remote sites inside an Electron window with no navigation guard

- Lane: SEC
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: Electron
- Coverage rows: MOD-014, OP-013, MOD-008
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

`NoveltySoundboardScreen.tsx` renders `<a href={clip.sourcePage} target="_blank"
rel="noreferrer">` for 61 attribution links (37 `https://` third-party pages, 24
`local://` entries that open nothing). In the web runtime
this opens a normal browser tab. In Electron, `src/main/index.ts` registers no
`setWindowOpenHandler` and no `will-navigate` guard, so the click creates a new
`BrowserWindow` inside the app that renders the remote site. The remote page can
navigate that window anywhere, show its own dialogs, and looks like part of
LumaKeys. It does not receive the preload bridge (confirmed at runtime, see
Evidence), so no database access results. Impact is confined to spoofing and an unexpected in-app
browser; severity P3.

## Expected Behavior Or Oracle

Electron security checklist items 13 and 14: handle `window.open` with
`setWindowOpenHandler` and open external URLs with `shell.openExternal`; deny or
restrict navigation to remote origins. The product expectation is that attribution
links open in the user's browser.

## Evidence

### Environment

- Commit/patch identity: source `6e549b6`; current `out/main/index.js` and `out/renderer`
- OS/runtime/browser: static analysis plus Electron 30.5.1 source; runtime in the real
  app under the Phase 11 headless Electron harness (`scripts/audit/electron/`,
  offscreen windows, isolated profile under `$TMPDIR`), 2026-10-20

### Reproduction

1. `grep -n 'setWindowOpenHandler\|will-navigate\|openExternal' src/main/index.ts` returns nothing.
2. `src/renderer/components/NoveltySoundboardScreen.tsx` line 797 renders the `target="_blank"` link; `public/soundboard/animals-attribution.json` holds 24 `sourcePage` values, some `https://` and some `local://` (the latter open nothing).
3. Runtime, real app (`scripts/audit/electron/window-open.mjs`): open Soundboard, click
   Show Credits, point every rendered link at a local page standing in for the remote
   site, click the first one.
   - Windows go from 1 to 2. The child loads `http://127.0.0.1:<port>/child` in an
     app window with `contextIsolation: true`, `nodeIntegration: false`,
     `sandbox: true` (the main window reports the same three values;
     `getLastWebPreferences` shows `preload: null` for both windows, even though the
     main window has its bridge, so that field is not evidence).
   - Inside the child: `typeof window.appBridge` is `undefined` (0 keys),
     `typeof require` is `undefined`, `window.opener` is `null` (from `noreferrer`);
     `appBridge.getAllSongs` is unreachable.
   - The child navigates itself to `/next` (title "navigated") with nothing stopping it.
   - The parent stays on `file://…/out/renderer/index.html` with its bridge intact; no
     page or console errors.
   - Harness caveat: the driver adds a window-open handler that keeps Electron's default
     `allow` and only forces the child offscreen, because a visible window crashes
     headless Electron. With `NO_HANDLER=1` (no handler at all, as the app ships) the
     click creates a visible child and the headless app process exits, twice in a row;
     this is the same sandbox limit that affects every non-offscreen window, not a
     product crash. The override sets only `show` and `offscreen`; the other
     preferences above are what Electron derives from the parent.
4. Staged owner probe `scripts/audit/electron-window-open-probe.cjs` (sitting 0 item 1)
   is superseded by step 3 and withdrawn from the batch.

### Artifacts

- File/line or contract evidence: `src/main/index.ts` `createMainWindow`; `NoveltySoundboardScreen.tsx:797`; `public/soundboard/animals-attribution.json`.
- Command: `cd $TMPDIR/pw && PROFILE=$TMPDIR/p11/EL2/wo LK_SQLITE_MODULE=<Electron-ABI better-sqlite3> node window-open.mjs`; output `$TMPDIR/p11/EL2/wo.out` (sha256 `2136a3e1…1ffb90a63`); no-handler runs `wo-nh.1.out` and `wo-nh.2.out` (identical, sha256 `48cd343c…836acb4`).
- Electron behavior reference: `lib/browser/guest-window-manager.ts` at tag `v30.5.1` copies only `contextIsolation`, `javascript`, `nodeIntegration`, `sandbox`, `webviewTag`, `nodeIntegrationInSubFrames`, and `enableWebSQL` from the parent; `preload` is not inherited.

## Root Cause

The main process never declares a policy for windows the renderer opens; Electron's
default is to create one.

## Recommended Remediation Boundary

In `createMainWindow`, add
`mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url) for https; return { action: 'deny' }; })`
and a `will-navigate` handler that denies navigation away from the app's own
`file://` or dev-server origin. Optionally make `sandbox: true` explicit. One file
plus a unit test around the handler if the window setup is extracted.

## Required Regression Proof

- Deterministic unit/integration proof: handler returns `deny` for any URL and calls `shell.openExternal` only for `https:`.
- Electron proof: `scripts/audit/electron/window-open.mjs` reports "no child window" after the fix (and the stubbed `shell.openExternal` receives the URL); before the fix it reports a child with `bridge: "undefined"`.
- Web proof: unchanged behavior (new tab).
- Broader regression command: `npm run build` plus the probe.

## Challenge Record

- Independent reproduction attempt: static analysis, then the real app in the headless Electron harness (2026-10-20). Both agree.
- Alternative explanations tested: the stronger claim "child inherits the preload and therefore `window.appBridge`" was tested against Electron 30.5.1 source and disproved; that is why this is P3 and not P1.
- Scope/severity changes: narrowed from the L-11-008 lead.
- Deduplication decision: none
- Challenger conclusion and date: suspected pending runtime probe, 2026-10-19; reproduced at runtime, severity P3 kept (no bridge, sandboxed child), 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.

- Implementation, 2026-10-21 (branch `remediation/p11-s03-electron`, commit `eeae17b`; status unchanged, verifier pending):
  - New `src/main/windowGuard.ts` (no Electron imports) and a call in `createMainWindow`. `setWindowOpenHandler` returns `{ action: 'deny' }` for every URL and calls `shell.openExternal` only for `https:` URLs (a rejected or throwing launch is swallowed). A `will-navigate` handler cancels navigation unless the target is the packaged `index.html` file (hash and query ignored) or the dev-server origin. `sandbox: true` is now explicit.
  - Source identity: product code on `main` at `5017b8e` is identical to the audited `6e549b6` (`git diff 6e549b6 5017b8e -- src public package.json package-lock.json packaging` is empty).
  - Fails before, passes after:
    - Unit: `src/main/windowGuard.test.ts` (7 tests: `handleWindowOpen`, `isAppNavigation`, `installWindowGuard`). Before the module existed the file failed to load; after, 7 of 7 pass.
    - Electron driver `scripts/audit/electron/window-open.mjs`, which now checks the app as shipped (PASS or FAIL lines); `ALLOW_OFFSCREEN=1` replays the old baseline.
      - Baseline, Electron 30.5.1, `out/` built from `5017b8e`, `ALLOW_OFFSCREEN=1`: child window at `http://127.0.0.1:<port>/child` with `bridge: "undefined"`, `node: "undefined"`, `opener: "null"`; it navigates itself to `/next`; windows 1 to 2.
      - Baseline, default mode: the headless app exits on the click (`page.evaluate: Target page, context or browser has been closed`), the same crash the finding records for `NO_HANDLER=1`.
      - After, Electron 30.5.1 and again on Electron 44.9.2: windows 1 to 1, no `window` event, stubbed `shell.openExternal` called once with the https URL (the http link opens nothing), a `location.href` change to another origin leaves the main window on `file://…/out/renderer/index.html` with its bridge, main window `sandbox: true`. Four PASS lines on both.
  - Not run: a real click on a credit link with a real browser (human-only; steps in the slice report).
