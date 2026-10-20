# PH-UI-008: Playlist order can only be changed by dragging

- Lane: UI
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-19
- Verifier: TBD
- Affected runtime: both
- Coverage rows: WF-007
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F (FB), 2026-10-19

## User Impact

In a playlist, each row offers `Play` and `Remove`; reordering exists only through HTML5
drag and drop (`draggable`, `onDragStart`, `onDrop` in `PlaylistView.tsx`). A user who
navigates by keyboard alone cannot reorder a playlist. Workaround: remove songs and re-add
them in the wanted order from the library (the bulk add keeps selection order). Severity P3:
one secondary operation with a workaround; keyboard-only navigation is a supported test
condition in the charter.

## Expected Behavior Or Oracle

`docs/audit/charter.md`, Supported Test Conditions: "Navigation: pointer and keyboard-only".
A reorder must be operable without dragging (accessibility criterion: WCAG 2.1.1 Keyboard
and 2.5.7 Dragging Movements).

## Evidence

### Environment

- Commit/patch identity: `6e549b6` web build
- OS/runtime/browser: headless Chromium 141
- Data profile/fixture: playlist of three songs

### Reproduction

1. `scripts/audit/browser/library-organize-bulk.mjs` creates a three-song playlist and drags row 3 onto row 1: order `[charlie etude, Alpha Waltz, Foxtrot Epic]` became `[Foxtrot Epic, charlie etude, Alpha Waltz]`, matching the database and surviving a reload (the drag path works).
2. The same step lists every button in a playlist row: `["Play","Remove"]`; no move up, move down, or order field.
3. While a search is active the rows are not draggable and the panel says "Clear search and advanced filters to reorder this playlist." (also drag only).
4. Repeat count: two runs, same DOM.

### Artifacts

- File/line or contract evidence: `src/renderer/components/PlaylistView.tsx:41-58`
- Test/command output summary: `$TMPDIR/p11/FB/library-organize-bulk.out` line "playlist row buttons (any non-drag reorder control?)"
- Screenshot/video/trace path and hash: none
- Durable-state before/after comparison: reorder persisted (database order equals view order)

## Root Cause

The reorder control was built only as a pointer gesture.

## Recommended Remediation Boundary

Add Move up and Move down buttons (calling the existing `onReorderSong(songId, newOrder)`)
to each playlist row, with a status announcement.

## Required Regression Proof

- Deterministic unit/integration proof: `PlaylistView` test clicking Move down and checking `onReorderSong`.
- Electron proof: none beyond the unit test.
- Web proof: extend `library-organize-bulk.mjs` to reorder by keyboard.
- Data/recovery proof: order persists after reload.
- Manual hardware/UI proof: sitting 1 keyboard-only pass.
- Broader regression command: `npm test`.

## Challenge Record

- Independent reproduction attempt: DOM inspection after the working drag.
- Alternative explanations tested: a hidden context-menu or keyboard shortcut (none found in `PlaylistView.tsx` or `LibraryScreen.tsx`); Playwright `dragTo` triggering an event the app does not receive from a real drag (it did work, so the control exists for pointer users).
- Scope/severity changes: P3 because a workaround exists.
- Deduplication decision: not in the ledger; PH-UI-001 is about focus containment in dialogs.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: none
- Verification evidence: none
- Residual risk: keyboard users cannot reorder
- Revisit trigger, if accepted-risk: not applicable
