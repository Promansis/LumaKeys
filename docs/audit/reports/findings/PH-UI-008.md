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
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FB), 2026-10-19

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

- Commit/patch identity: `4466626` web build
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

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge. Owner decision 15 (2026-11-02) puts slice 17 in wave 3.
- Fix branch/commit: `remediation/p11-s17-small`, commits `1d31a8f` (buttons) and `6806afb` (keep the view mounted); implemented 2026-11-02, awaiting independent review; not merged.
- What changed: each playlist row in `src/renderer/components/PlaylistView.tsx` has `Move up` and `Move down` buttons (accessible names `Move up: <title>` and `Move down: <title>`). They call the existing `onReorderSong(songId, index ∓ 1)`, are disabled on the first and last row and whenever filters stop reordering, and drag-and-drop is unchanged. After the order updates, a polite live region (`Moved <title> to position N of M.`, class `.visually-hidden`, added to `src/renderer/styles.css`) announces the move and focus returns to the used button, or to the opposite button when the used one is now disabled. `LibraryScreen.refreshLibrary` gained a `keepVisible` option so a reorder refreshes in place instead of showing the loading panel, which had unmounted `PlaylistView` and dropped the focus and the announcement. No bridge, schema or stored data change.
- Tests: `src/renderer/components/PlaylistView.test.tsx` (5 tests: move down and up call `onReorderSong`, disabled at the ends, all disabled when `canReorder` is false, focus plus announcement after rerender, focus fallback at the list end) failed before the fix (`Unable to find an accessible element with the role "button" and name /Move down.*Alpha Waltz/`) and pass after. `LibraryScreen.test.tsx > LibraryScreen playlist reorder > keeps the playlist view mounted through a reorder so focus and the announcement survive` failed without `keepVisible` (`Unable to find an element with the text: Moved Alpha Waltz to position 2 of 3.`) and passes with it. Source identity for the reproduction: product code equal to `cc40b63`.
- Driver result: `library-organize-bulk.mjs` (web build of this branch, throwaway data directory), extended with a keyboard-reorder block: Move down by Enter and Move up by Space swapped the rows, the database order matched, the order persisted after reload, the end buttons were disabled, focus stayed on the used button and the live region announced the new position. 100 checks passed, 0 failed (a first run before `6806afb` failed the focus and announcement checks and found the remount).
- Proof owed: agent-runnable, none. Human-only: sitting 1 keyboard-only pass and a screen reader listening to the announcement.
- Residual risk: other library actions that call `refreshLibrary` without `keepVisible` still show the loading panel and would drop focus inside the open view; not in this finding's scope.
- Revisit trigger: reviewer verification, or a user report of a lost focus after a playlist change.
- Review follow-up, 2026-11-02 (lead): the independent review found that the pending move stayed set after a failed reorder. The view could then announce and move focus on a later, unrelated reload that happened to put the song at the old target. A second press before the reload also used an index from the old order. `onReorderSong` now returns a promise that settles once the parent's reorder and reload finish; LibraryScreen already catches the error and shows "Unable to reorder playlist: …". `PlaylistView` ignores move presses while a move is pending. The buttons stay enabled, because disabling the focused button would drop keyboard focus. When the call settles without the expected order, the view drops the pending move silently. New tests `ignores a second move press until the first reorder settles` and `drops the pending move without announcing when the reorder settles without the new order` failed on the first version and pass after. The first existing test now waits for each move to settle before the next press. The Status stays `accepted` until bookkeeping.
