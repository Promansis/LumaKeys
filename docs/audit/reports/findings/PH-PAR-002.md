# PH-PAR-002: Browser File-Picker Cancellation Leaves Import Promises Pending

- Lane: runtime parity
- Severity: P2
- Confidence: high
- Status: verified
- Owner: Codex (acting)
- Challenger: Codex, controlled live-Chrome cancellation challenge
- Verifier: Claude Code (acting), sitting 3 run 2026-10-20
- Affected runtime: web
- Coverage rows: WF-004, WF-006, WF-020, BR-008, BR-010, BR-058, OP-001, OP-005, MOD-004, MOD-009
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

Cancelling the browser MIDI picker, reattach picker, or backup picker leaves its promise pending. Library MIDI import keeps its importing state active and never unsubscribes its progress listener; reattach does the same. Backup import has no completion/cancellation outcome. Electron native dialogs return the documented empty or `null` value on cancellation. The user can recover by leaving/reloading the screen, so the defect is P2 rather than P1.

## Expected Behavior Or Oracle

The cancellation outcome for a user-initiated file selection must be explicit, settle its bridge promise, clean up temporary DOM/listener state, and let the caller leave its loading state. The web adapter must offer the same user-visible cancellation outcome as its Electron counterpart where browser capability permits it. See `docs/agents/lumakeys-runtime-data-audit.md` and the AppBridge contract in `src/shared/ipc.ts`.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime/browser: Linux x86_64, Chrome 149.0.7827.114, built self-hosted web runtime.
- Data profile/fixture: isolated `/tmp` web profile; no files selected or persisted.
- Hardware: none.

### Reproduction

1. Open the built web runtime in Chrome.
2. Call `window.appBridge.importMidiFiles()`.
3. Dispatch the browser input's cancellation path without dispatching `change`.
4. Wait 150 ms and inspect whether the returned promise settled.

The controlled renderer probe printed:

```text
{"cancelDispatched":true,"settled":false}
```

The same helper underlies `reattachMidiFile`; `pickJsonFile` used by `importLibrary` has the same `onchange`-only implementation. Electron's handlers return `{ songs: [], errors: [], skipped: 0 }`, `{ reattached: [], errors: [], skipped: 0 }`, or `null` when their native dialogs are cancelled.

### Artifacts

- MIDI and JSON picker helpers resolve only from `input.onchange`: `src/renderer/webBridge.ts:82` and `src/renderer/webBridge.ts:97`.
- All three affected methods await those helpers: `src/renderer/webBridge.ts:341`, `src/renderer/webBridge.ts:351`, and `src/renderer/webBridge.ts:389`.
- Library loading state waits on the returned promise: `src/renderer/components/LibraryScreen.tsx:362` and `src/renderer/components/LibraryScreen.tsx:455`.
- Electron cancellation paths are explicit: `src/main/index.ts:148`, `src/main/index.ts:229`, and `src/main/index.ts:376`.
- The complete command/result summary is recorded in [Phase 4](../phase-4-runtime-parity-2026-07-12.md#p4-par-002-browser-picker-cancellation).

## Root Cause

The browser adapter wraps dynamically created file inputs in promises but observes only the successful `change` event. It has no `cancel` handler or fallback completion path and does not remove the hidden element after cancellation.

## Recommended Remediation Boundary

Introduce one browser file-picker helper that always settles and removes its input on selection, cancellation, and failure. Use it for MIDI and JSON pickers, preserve the existing empty/`null` contract shapes, and make caller cleanup testable. Include a fallback for browsers that do not dispatch an input `cancel` event.

## Required Regression Proof

- Deterministic unit/integration proof: picker helper resolves empty/`null` and removes its input for `change`, `cancel`, and fallback completion.
- Electron proof: existing dialog cancellation shapes remain unchanged.
- Web proof: Chrome, Edge, and Firefox cancellation clears LibraryScreen loading state for import, reattach, and backup import.
- Data/recovery proof: cancellation makes no upload, database, or IndexedDB mutation.
- Manual hardware/UI proof: a user can cancel then immediately retry each picker.
- Broader regression command: affected renderer tests plus `npm test` and `npm run build:web`.

## Challenge Record

- Independent reproduction attempt: [PH-PAR-002 challenge](../challenges/PH-PAR-002.md).
- Alternative explanations tested: selection success remains covered by existing webBridge tests; the controlled cancellation event never invokes the only registered completion handler.
- Scope/severity changes: includes MIDI import, reattach, and backup import because they share the same helper pattern.
- Deduplication decision: distinct browser lifecycle root cause; not a duplicate of storage/import atomicity findings.
- Challenger conclusion and date: accepted as P2, 2026-07-12.

## Resolution

- Accepted/rejected rationale: the live browser bridge promise remains pending after the cancellation event that the implementation does not observe.
- Verified rationale: a real file-dialog cancel in Edge and Firefox settles the import and clears the loading state within 2 ms (sitting 3 item 5, below).
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 12 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 added the shared `pickFiles` helper and ten cancellation tests. Commit `4b2db33` later removed the focus-based fallback, so cancellation now relies only on the input's `cancel` event. Phase 11: the MIDI and JSON picker cancellation tests and "waits for native cancellation instead of treating window focus as cancellation" pass ([re-verification](../phase-11-reverification-2026-10-19.md)). [lane D](../phase-11-lane-d-runtime-parity-2026-10-19.md) traced the source and tests.
  [Sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 5, 2026-10-20, run by the agent in headed Edge 155 and Firefox 142 on Xvfb with a window manager: the real GTK file dialog ("Open files" in Edge, "File Upload" in Firefox) was cancelled by an X Escape key. The page saw `cancel` (trusted, 0 files) about 2.9 s after the click, and the button went from "Importing..." back to an enabled "Upload MIDI / MSCZ" 2 ms later, with the status "No files imported." A second pick with a typed path fired `change` (trusted, 1 file), sent 1 POST and showed "Imported 1 song. Review the metadata before playing."
- Residual risk: browsers without the `cancel` event (before Chrome 113, Firefox 91 and Safari 16.4) get the original pending import back. The reattach and backup pickers share `pickFiles` but were not cancelled by hand.
- Revisit trigger, if accepted-risk: not applicable.
