# PH-SEC-005: Soundboard source links open remote sites inside an Electron window with no navigation guard

- Lane: SEC
- Severity: P3
- Confidence: medium
- Status: suspected
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: Electron
- Coverage rows: MOD-014, OP-013, MOD-008
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

`NoveltySoundboardScreen.tsx` renders `<a href={clip.sourcePage} target="_blank"
rel="noreferrer">` for 24 attribution links to third-party sites. In the web runtime
this opens a normal browser tab. In Electron, `src/main/index.ts` registers no
`setWindowOpenHandler` and no `will-navigate` guard, so the click creates a new
`BrowserWindow` inside the app that renders the remote site. The remote page can
navigate that window anywhere, show its own dialogs, and looks like part of
LumaKeys. It does not receive the preload bridge (see Challenge Record), so no
database access results. Impact is confined to spoofing and an unexpected in-app
browser; severity P3.

## Expected Behavior Or Oracle

Electron security checklist items 13 and 14: handle `window.open` with
`setWindowOpenHandler` and open external URLs with `shell.openExternal`; deny or
restrict navigation to remote origins. The product expectation is that attribution
links open in the user's browser.

## Evidence

### Environment

- Commit/patch identity: source `6e549b6`
- OS/runtime/browser: static analysis plus Electron 30.5.1 source

### Reproduction

1. `grep -n 'setWindowOpenHandler\|will-navigate\|openExternal' src/main/index.ts` returns nothing.
2. `src/renderer/components/NoveltySoundboardScreen.tsx` line 797 renders the `target="_blank"` link; `public/soundboard/animals-attribution.json` holds 24 `sourcePage` values, some `https://` and some `local://` (the latter open nothing).
3. Runtime confirmation is staged: `scripts/audit/electron-window-open-probe.cjs` opens such a link from a window configured like the app's and reports whether a child window appears and whether it holds `window.appBridge`. It cannot run in the agent sandbox (needs a display and D-Bus); see [user batch sitting 0](../phase-11-user-tests.md) item 1.

### Artifacts

- File/line or contract evidence: `src/main/index.ts` `createMainWindow`; `NoveltySoundboardScreen.tsx:797`.
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
- Electron proof: `electron-window-open-probe.cjs` reports no child window (timeout path) after the fix; before the fix it reports a child with `hasBridge: "undefined"`.
- Web proof: unchanged behavior (new tab).
- Broader regression command: `npm run build` plus the probe.

## Challenge Record

- Independent reproduction attempt: static only; probe staged for owner.
- Alternative explanations tested: the stronger claim "child inherits the preload and therefore `window.appBridge`" was tested against Electron 30.5.1 source and disproved; that is why this is P3 and not P1.
- Scope/severity changes: narrowed from the L-11-008 lead.
- Deduplication decision: none
- Challenger conclusion and date: suspected pending runtime probe, 2026-10-19

## Resolution

- Accepted/rejected rationale: pending probe and consolidation
