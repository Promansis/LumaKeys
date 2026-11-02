# PH-DATA-010: The reset confirmation does not name packs, practice history or fingerings, and on the web says "from this device" for server-side data

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-21
- Verifier: TBD
- Affected runtime: both
- Coverage rows: DATA-014, OP-009, WF-022
- Related/duplicate findings: PH-DATA-002 (reset now removes packs; this is the copy gap that run found), PH-UI-006 (delete confirmation that omits practice history); none duplicate
- First observed against: `main` at `d208ee2` (source identity `4466626`), agent proof run for PH-DATA-002, 2026-10-20

## User Impact

The Delete User Data dialog tells the user what will go, and the list is shorter than what
goes. It names songs, playlists, folders, results, achievements and saved settings. It does
not name the downloaded instrument sample packs, the practice history and streak, the
custom fingerings or the trouble spots, all of which are removed. A user who agrees to the
copy does not know that downloaded packs will need to be installed again.

On the web the copy says "from this device", but the data lives in the server's data
directory. After a reset in one browser, a second browser on the same server loaded an
empty library, while its own localStorage key stayed. So the dialog understates the reach
(every browser using that server) and a second browser keeps stale local state. Nothing is
lost that the reset was not going to remove, and the user can reinstall or re-enter, so P3.

## Expected Behavior Or Oracle

A destructive confirmation names what it removes and where, so the user can judge the cost
(the PH-DATA-002 required proof: "confirmation copy and success/error state match the
actual reset boundary"). Copy that says "this device" must be true of the runtime.

## Evidence

### Environment

- Commit/patch identity: `main` at `d208ee2`; no product source changed since `4466626`.
- OS/runtime/browser: web: `dist/server/index.cjs` with Chromium 141.0.7390.37 (Playwright
  1.56.1) and a second browser context; Electron 30.5.1 (`out/`) with a relaunch. Linux.
- Data profile/fixture: a seeded throwaway library on each runtime (3 songs, a folder, a
  playlist, a result, an achievement, a fingering, settings and the Flute pack).

### Reproduction

1. Seed the library, install the Flute pack in Settings > Audio.
2. Open Settings > Delete User Data and read the card and the dialog.
3. Confirm. Compare the removed stores with the copy.
4. On the web, open the same server in a second browser context.

Result, identical on both runtimes. Settings card: `Removes songs, playlists, folders,
results, achievements, and saved settings from this device.` Dialog title `Delete all user
data?`, body `This removes songs, playlists, folders, results, achievements, and saved
settings from this device.` Removed beyond the six named: the instrument sample packs,
practice history and streak, fingerings and trouble spots. The success toast says
`Songs, history, and saved settings were removed.` On the web the second context loaded an
empty library after the reset while its own localStorage key stayed.

### Artifacts

- Drivers: `scripts/audit/browser/proof-data002-web.mjs` and
  `scripts/audit/electron/proof-data002-electron.mjs`.
- Evidence: `$TMPDIR/p11/PF/data/web002/` and `$TMPDIR/p11/PF/data/el002/` (`run.out`,
  `before.json`, `after.json`, `dialog.json`, screenshots).
- Copy: `src/renderer/components/SettingsScreen.tsx` (the Delete User Data card and
  `ConfirmActionModal`).

## Root Cause

The confirmation copy was written for the first six stores and was not updated when packs,
history and fingerings joined the reset. It also uses one wording for both runtimes,
although the web stores its data on the server.

## Recommended Remediation Boundary

Rewrite the card and dialog copy to list every removed store, including packs, and make the
web wording say the data is on the server and affects every browser using it. `src/renderer/components/SettingsScreen.tsx`, under `IS_WEB`. Stale local state in a second
browser is not part of this slice.

## Required Regression Proof

- Deterministic unit/integration proof: a `SettingsScreen` test that the dialog names packs,
  practice history, fingerings and trouble spots, and that the web wording differs.
- Electron and web proof: the dialog capture in `proof-data002-electron.mjs` and
  `proof-data002-web.mjs` matches the removed inventory in `before.json` and `after.json`.
- Broader regression command: `npx vitest run src/renderer/components/SettingsScreen.test.tsx`

## Challenge Record

- Independent reproduction attempt: the captured `dialog.json` and the before/after
  inventories were compared on 2026-10-21; the copy names six stores and the inventory
  shows more removed.
- Alternative explanations tested: the extra stores being removed by a side effect rather
  than by the reset. Each was seeded and each was empty after the reset.
- Scope/severity changes: none.
- Deduplication decision: new. PH-DATA-002 owned the defect, packs left behind, and that is
  gone on both runtimes. This finding owns the copy.
- Challenger conclusion and date: accepted at P3, 2026-10-21.

## Resolution

- Accepted/rejected rationale: accepted 2026-10-21.
- Fix branch/commit/issue: `remediation/p11-s08-delete-confirm`, slice 8, commit `e2ff3e6`; implemented and independently reviewed 2026-11-02; merged to `main` in `c1a1fbf`; `fixed`, not `verified`: the `library-one-hand.mjs` A2/A3 rerun after its `toLibrary` change (lead) and the owner keyboard-only and screen-reader read of the delete prompt and the new Delete User Data wording are owed.
- What changed: `SettingsScreen.tsx` builds the Delete User Data text in one place (`getDeleteUserDataScope`), used by the card and the confirmation dialog. Desktop: "songs, playlists, folders, results, achievements, and saved settings" is replaced by the full list: songs, playlists, folders, results, practice history and streak, achievements, fingerings, trouble spots, lesson progress, saved settings and installed instrument packs, "from this device". Lesson progress was added after review: `resetUserDataRows` clears every settings category, including the `learning` and `progress` ones that Clear Learning Progress on the same page calls lesson progress. Web: the same list without packs, "from the server. This affects every browser that uses it.", then "It also removes installed instrument packs from this browser." The web wording says "this browser" because packs live in the browser's IndexedDB, and the server reset cannot reach another browser's packs. The reset itself is unchanged.
- Tests (`src/renderer/components/SettingsScreen.test.tsx`): `names every store the desktop reset removes on the card and in the dialog` and `says on the web that the data is on the server and affects every browser` both failed before the fix (`expected 'Delete User DataRemoves songs, playli…' to contain 'practice history and streak'`; the old card read "Removes songs, playlists, folders, results, achievements, and saved settings from this device."). They pass after it. Source identity for the reproduction: product code equal to `1180731`.
- Driver result: `scripts/audit/browser/proof-data002-web.mjs` and `scripts/audit/electron/proof-data002-electron.mjs` were run 2026-11-02 against the slice build, in `$TMPDIR` data dirs and profiles. Both show the new card text, the dialog text and its `aria-describedby` equal to the dialog body. Web: DB rows and the three MIDI files went, browser A's localStorage and IndexedDB pack went, browser B's pack was not touched (as the copy says). Desktop: DB rows, MIDI files and the `instrument-sample-packs/flute` files went, and after a relaunch the setup guide shows. Evidence copies: `$TMPDIR/s08/evw/dialog.json` and `$TMPDIR/s08/eve/dialog.json` (not committed).
- Verification: `npm run verify` passed in the slice worktree.
- Proof owed: agent-runnable, none. Human-only: the owner's read of the new wording.
- Residual risk: the toast after a reset still says "Songs, history, and saved settings were removed." That is shorter than the dialog but not wrong; left alone as outside the finding. On the web, a pack installed in a second browser stays until that browser runs its own reset. Browser-local state the reset clears (Library filter presets, among others) is cleared only in the browser that ran it, as with packs.
- Revisit trigger: reviewer verification, or a new store added to the reset without a matching line in the copy.
