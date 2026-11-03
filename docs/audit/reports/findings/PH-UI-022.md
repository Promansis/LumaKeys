# PH-UI-022: Shared row containers lost `display: flex`; song-card BPM glued to duration or difficulty

- Lane: UI
- Severity: P1
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: the slice 25 reviewer (independent, Opus), 2026-11-03
- Verifier: TBD
- Affected runtime: both
- Coverage rows: WF-007, WF-009, MOD-004
- Related/duplicate findings: PH-MUS-019 (the owner's "beats per minute come out very strange" report; slice 22 changed which tempo is stored, which was a real defect, but did not address this display bug, which is a separate cause of the same symptom; not a duplicate)
- First observed against: `main` at `c170bc3`, owner report of 2026-11-02 with screenshots of all songs (the screenshots are not in the repository). The defect itself arrived in commit `775924d` ("Soundboard popover fixes", 2026-05-25).

## User Impact

On every Library song card and every recommendation card the duration, difficulty and
beats per minute ran together with no gap, so the card mislabelled core song data. A
Library card read "1:31100 BPM" (duration 1:31 and 100 BPM) and a recommendation card read
"Difficulty 4100 BPM" (Difficulty 4 and 100 BPM). The owner read this as wrong tempos. The
same lost rule broke the row layout of panel headings with their buttons, the playlist Move
up and Move down controls, the filter chips and the game menu. No data was changed, and the
stored BPM values were correct, but the songs list is the app's main screen and the
mislabelling is on every card, so P1 (a core workflow shows wrong-looking data, app-wide).

## Expected Behavior Or Oracle

Each fact on a song card is a separate item with space between: duration, difficulty and
BPM read as three values. Rows that hold a heading and its buttons, a button group or a
chip list lay out in a row, as they did before `775924d`. Source: the design of the
component in `src/renderer/components/LibraryScreen.tsx` (separate `<span>`s in a flex row)
and the layout before `775924d`.

## Evidence

### Environment

- Commit/patch identity: `main` at `c170bc3` (before the fix); fix at `35063cb`.
- OS/runtime/browser: web build, Chromium via Playwright, 1280x800 and 420x800, throwaway
  data directories.
- Data profile/fixture: the owner's library for the decoded examples below; throwaway
  libraries for the screenshots.
- Hardware, if applicable: none.

### Reproduction

1. Open the Library with any imported song, in grid or list view, and read a card's meta
   line. Open the recommendations and read a recommendation card.
2. Observe the values run together: "1:31100 BPM", "Difficulty 4100 BPM".
3. Expected: the values are separate items. Observed: inline spans with no gap, because the
   shared container rule has no `display: flex`.

Decoded examples from the owner's library (duration, then BPM), all correct values:

| Song | Duration | BPM |
|---|---|---|
| Randy Newman | 1:31 | 100 |
| Let it Go (easy) | 0:31 | 126 |
| Under the Sea | 3:17 | 150 |
| Let it Go | 3:20 | 74 |
| Greensleeves | 0:53 | 54 |
| Moonlight Sonata 1st | 6:54 | 40 |
| Piano | 4:22 | 54 |
| The Ants go Marching | 0:25 | 120 |

### Artifacts

- File/line: `src/renderer/styles.css`, the rule shared by `.control-row`, `.panel-heading`,
  `.transport-buttons`, `.song-card-header`, `.song-card-meta`, `.song-card-stats`,
  `.results-actions`, `.view-toggle`, `.filter-chips` and `.timing-breakdown`; commit
  `775924d` deleted `display: flex;` from it.
- File/line: `src/renderer/components/LibraryScreen.tsx`, the library card (about lines
  895 to 903) and the recommendation card (about lines 1279 to 1282): separate `<span>`s.
- `.song-card-stats` and `.timing-breakdown` were unaffected, because later rules make
  them grids.
- Before and after screenshots: `/tmp/claude-1000/pw/s25/` (pairs in `pairs/`); not
  retained in the repository.

## Root Cause

A commit about the Soundboard popover removed `display: flex;` from a CSS rule that ten
selectors share. The popover change needed the rule's other declarations only; the
deletion silently changed the layout of every other selector in the list. No test checked
the computed layout of these containers, so nothing failed.

## Recommended Remediation Boundary

Restore `display: flex` on the shared rule, and add a jsdom computed-style test that fails
if any of the selectors loses it. Check that the two Soundboard popout headings, designed
after the regression, still stack. This is not implementation authorization.

## Required Regression Proof

- Deterministic unit/integration proof: `src/renderer/stylesLayout.test.ts`, a jsdom
  computed-style test of the shared containers.
- Browser proof: before and after screenshots of the Library grid and list,
  recommendations, playlist, game menu and a narrow Library, at 1280x800 and 420x800.
- Electron proof: the Electron build was not screenshotted.
- Data/recovery proof: not applicable.
- Manual hardware/UI proof: the owner looks at the Library and recommendation cards in
  their own install. Web: done 2026-11-04 on the owner's Docker install, rebuilt from
  `53098f0`; the owner reported "Fixed". Electron: still owed.
- Broader regression command: `npm run verify`.

## Challenge Record

- Independent reproduction attempt: the before screenshots of the web build (see Artifacts)
  show the glued text the owner reported, 2026-11-03.
- Alternative explanations tested: that the stored BPM was wrong. It was not: the decoded
  values above match the songs, and `midiFileParser.ts` stores the dominant tempo since
  slice 22 (PH-MUS-019). The tempo fix and this display fix are independent.
- Scope/severity changes: P1 on the reach (every card, app-wide row layout); not P0, because no data is lost or changed.
- Deduplication decision: new. PH-MUS-019 owns which tempo is stored and the count-in;
  this owns the display of the values.
- Challenger conclusion and date: independent Opus review of slice 25, PASS WITH NOTES,
  2026-11-03. Its one note (the soundboard popout heading) was fixed in `ad223e4`.

## Resolution

- Accepted/rejected rationale: accepted and fixed on the owner's report as slice 25.
- Fix branch/commit/issue: branch `remediation/p11-s25-flex-rows`; `f84d7fc` restores `display: flex` and adds `src/renderer/stylesLayout.test.ts` (failed 8 of 10 before the fix); `ad223e4` stacks the `.soundboard-key-map-popout` and `.soundboard-mode-popout` headings (designed after the regression; the key-map title had squeezed to one word per line). Merged to `main` in `35063cb` on 2026-11-03; pushed with `53098f0` the same day (CI `verify` passed).
- Verification evidence: independent Opus review PASS WITH NOTES (the note fixed in `ad223e4`); `npm run verify` passed with 739 tests. Playwright before and after screenshots, web build, 1280x800 and 420x800, throwaway data directories, in `/tmp/claude-1000/pw/s25/`. Better: Library grid, Library list, recommendations, playlist, game menu, narrow Library. Same: results (the Measure Accuracy hint now sits beside its title), scale practice, interval trainer, free play, theory hub and quiz, progress, keyboard setup, settings, latency wizard. Soundboard key-map popout: regressed, then fixed by `ad223e4`. Not reached: the paused in-game control bar. Status is `fixed`, not `verified`.
- Residual risk: the Electron build was not screenshotted; the paused in-game control bar was not seen. The owner confirmed the cards on the web install (2026-11-04), not yet on Electron.
- Revisit trigger: the owner's Electron check moves this to `verified` (the web glance was done 2026-11-04).
