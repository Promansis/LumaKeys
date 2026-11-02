# PH-UI-006: Deleting songs has no confirmation and silently removes their practice history

- Lane: UI
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-19
- Verifier: TBD
- Affected runtime: both (same renderer code; web and headless Electron proven)
- Coverage rows: WF-007
- Related/duplicate findings: none (PH-UI-004 covers the Settings reset dialog, not the library)
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FB), 2026-10-19

## User Impact

In the Library, `Delete` in the bulk bar and `Delete Song` in the metadata editor remove
the selected songs at once. There is no confirmation, no undo, and the status line only
reports "Deleted 2 songs from the library." The delete also removes each song's stored
MIDI file, its game results, trouble spots, fingerings, and playlist membership (foreign
keys use `ON DELETE CASCADE`). `Select All Visible` followed by `Delete` empties the
library in two clicks, and `Delete` sits beside `Deselect All` in the bulk bar and beside
`Close` and `Save Metadata` in the editor. The MIDI can be re-imported from the original
file, but practice history cannot be recovered except from a library backup. Severity P2:
irreversible loss of user progress from one mis-click, reachable by every user.

## Expected Behavior Or Oracle

`DESIGN.md` (Confirmation Modal): "Use modal confirmation only for genuinely destructive
or high-risk actions", with Settings as the reference for destructive actions. The app
already confirms the two other destructive surfaces (data reset dialogs, and
`window.confirm` before a mid-run restart in `GameScreen.tsx:827` and `:1021`).
Counter-evidence: `LibraryScreen.test.tsx` ("deletes a song from the metadata editor")
asserts delete happens with no prompt, so the current behavior is deliberate; this finding
asks for a product decision against the design rule, not a regression fix.

## Evidence

### Environment

- Commit/patch identity: `4466626` web build (`dist/server/index.cjs`, built 2026-10-19 17:07)
- OS/runtime/browser: Linux, headless Chromium 141 via Playwright 1.56.1, web server on port 3785
- Data profile/fixture: five generated MIDI files, one game result saved through `saveGameResult`, one playlist
- Hardware, if applicable: none

### Reproduction

1. `scripts/audit/browser/library-organize-bulk.mjs` imports five songs, saves a result for "Delta Scale", adds it to a playlist.
2. Tick "Delta Scale" and "charlie etude", click `Delete` in `.bulk-action-bar`.
3. Observed: no native dialog (a `page.on('dialog')` handler recorded none), no `[role=dialog]`, the status line reads "Deleted 2 songs from the library." within one second and both songs are gone.
4. Dependent rows for the two songs went from `{"results":2,"playlist":1}` to `{"results":0,"playlist":0}`; both MIDI files were removed from `midi-files`; the three other songs and files were untouched.
5. The editor's `Delete Song` and a final `Select All Visible` then `Delete` behaved the same way (empty library).
6. Repeat count: three driver runs (the first two before fixture changes), same result each time.

### Artifacts

- File/line or contract evidence: `src/renderer/components/LibraryScreen.tsx` `handleDeleteSongs` (no confirm), `BulkActionBar.tsx` `onDelete`, `database.ts` foreign keys with `ON DELETE CASCADE`
- Test/command output summary: `$TMPDIR/p11/FB/library-organize-bulk.out` lines "bulk delete: native dialogs = [] ; in-page modal present = false", "dependent rows ... {"results":2,"playlist":1}" then `{"results":0,"playlist":0}`
- Screenshot/video/trace path and hash: `$TMPDIR/p11/FB/data-wf007/shots/04-before-bulk-delete.png`, sha256 `7f06822da00e0819b1ee75c5dcf85ab83c5c04017fdb826e7a3111460cc73e06`
- Durable-state before/after comparison: songs 5 to 3, files 5 to 3, results for the two songs 2 to 0

## Root Cause

The library delete handlers call `bulkDeleteSongs` directly. The cross-store delete is
correctly atomic (PH-DATA-001 fixed), so the gap is only the missing intent check before a
destructive, history-erasing operation.

## Recommended Remediation Boundary

Add one confirmation step (a Settings-style modal with a Cancel that owns focus) before
`bulkDeleteSongs` in `LibraryScreen.tsx`, naming the song count and that results are
removed. Folder and playlist deletes do not touch songs and can stay immediate.

## Required Regression Proof

- Deterministic unit/integration proof: update the `LibraryScreen.test.tsx` delete tests to expect a prompt and a cancel path that leaves the song.
- Electron proof: reproduced headless with `scripts/audit/electron/library-one-hand.mjs` (agent item A2, 2026-10-20); after the fix the same driver must show the corrected behaviour.
- Web proof: `library-organize-bulk.mjs` modified to cancel, then confirm.
- Data/recovery proof: cancel leaves rows, files, and results intact.
- Manual hardware/UI proof: none.
- Broader regression command: `npm test`.

## Challenge Record

- Independent reproduction attempt: second full driver run, same outcome; the bulk path and the editor path both reproduce. Reproduced in headless Electron 30.5.1 on 2026-10-20 (agent item A2, [Electron runtime report](../phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)): bulk Delete removed two songs and their files with no `window.confirm`, no main-process message box and no in-page dialog.
- Alternative explanations tested: a native `confirm` auto-dismissed by the driver would have left the songs in place, which did not happen; the driver registered the dialog handler before the click and recorded zero dialogs. Checked for an in-page modal (`[role=dialog], [role=alertdialog]`): none.
- Scope/severity changes: held at P2; the unit test shows intent, so the status may become accepted-risk if the owner decides immediate delete is the product rule.
- Deduplication decision: not covered by any ledger entry (searched for confirm, delete, bulk).
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s08-delete-confirm`, slice 8, commit `e2ff3e6`; implemented 2026-11-02, awaiting independent review; not merged.
- What changed: a new `DeleteSongsModal` (`src/renderer/components/DeleteSongsModal.tsx`) opens before any song delete. The bulk bar's Delete and the metadata editor's Delete Song both go through `requestDeleteSongs` in `LibraryScreen.tsx`, which stores the trigger and the pending ids. The prompt names the count ("Delete 2 songs?"), says the results, practice history, fingerings, trouble spots and playlist places go too, and says it cannot be undone. Cancel takes the focus; Escape, a backdrop click and Cancel close it without a bridge call. Confirm runs the unchanged `handleDeleteSongs`, so the "Deleted N songs" and "Delete failed." statuses are as before. The dialog uses `useModalFocusTrap`, so focus returns to the Delete button. No bridge, store or data change.
- Tests (`src/renderer/components/LibraryScreen.test.tsx`, `describe('delete confirmation')`, 6 new tests plus 2 existing delete tests changed to confirm): all 8 failed before the fix with `Unable to find role="dialog"` (the delete ran on the first click). They pass after it: the bulk prompt names the count and history with Cancel focused; Cancel makes no bridge call and keeps rows and selection; Escape cancels; Confirm deletes the two ids once and shows "Deleted 2 songs"; a confirmed bulk delete that fails shows "Delete failed." with the prompt closed; the editor's Delete Song prompt, with Cancel leaving the editor open. Source identity for the reproduction: product code equal to `1180731`.
- Driver result: `scripts/audit/browser/library-organize-bulk.mjs` (web, run 2026-11-02 against the slice build): every delete check passes. The bulk prompt text is the one above with Cancel focused and no native dialog; Cancel keeps 5 songs, their results, playlist rows and files; Confirm deletes 2 and leaves no orphan file; the editor prompt behaves the same; deleting the last song leaves the empty library. Two unrelated checks in that script fail (`date from today -> all` and `date to today -> all`, the Library date filter); they are outside this finding. `scripts/audit/electron/library-one-hand.mjs` (desktop, A2): prompt, Cancel focus, Cancel keeps 4 songs and 4 files, Confirm deletes 2 and their files, all pass. The driver's `toLibrary` was updated for the current main menu nav. In that run the later A3 step failed at its second `toLibrary` call after the results screen (it waited for "Your Library"). After review, `toLibrary` presses Escape only in a running game without the overlay and then clicks any visible Main Menu or Back to Main Menu button, so it also leaves the results screen; the A2/A3 rerun with that change is owed.
- Verification: `npm run verify` passed in the slice worktree.
- Proof owed: agent-runnable, the `library-one-hand.mjs` A2/A3 rerun after the `toLibrary` change. Human-only: the owner's check that the prompt reads clearly at keyboard-only and screen-reader use (user tests).
- Residual risk: the prompt covers the Library's two entry points. The playlist song remove and any other delete path are unchanged and were not part of this finding. After a confirmed delete from the metadata editor, focus returns to a Delete button that the closed editor removed, so it falls to the page; the result is shown by the status toast.
- Revisit trigger: reviewer verification, or user reports of a delete that did not ask.
