# PH-UI-021: Since the Electron 44 upgrade every desktop file dialog opens in Downloads and forgets the last folder

- Lane: UI
- Severity: P3
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: the slice 3 reviewer (independent), 2026-10-21
- Verifier: TBD
- Affected runtime: Electron
- Coverage rows: WF-004, WF-005, WF-006, WF-020, MOD-008
- Related/duplicate findings: PH-OPS-003 (the Electron 30.5.1 to 44.9.2 upgrade that brought the behaviour in; not a duplicate, because the upgrade is correct and this is a follow-up the app owes to it)
- First observed against: `main` at `ed40fa6` (slice 3 merged); the code that lacks `defaultPath` is older than the Phase 11 baseline, and the behaviour changed with the upgrade commit `21d8cd5`. Found 2026-10-21 during the slice 3 implementation and review.

## User Impact

On the desktop app, every native file dialog now opens in the Downloads folder and does not
remember where the user last picked a file. Someone who keeps MIDI files in `~/Music/midi`
has to navigate there again for every import, every folder import, every missing-file
reattach, every library restore, every backing-track pick, and every sample-pack folder
pick. The save dialogs (library backup, MIDI export, WAV export) pass a bare file name, so
their start folder depends on what Electron does with a name alone and is not shown here.
No data and no security boundary is involved, and the user can always browse to the folder,
so P3. It is a regression against the 30.5.1 behaviour that an upgrade the audit itself
required introduced, and it hits the most common desktop action (importing songs) on every
use, which is why it is filed.

## Expected Behavior Or Oracle

A file dialog opens where the user last picked a file of that kind, as it did on
Electron 30. Electron's own breaking-changes note for version 43 gives the workaround:
the dialog methods start in the Downloads directory when no `defaultPath` is given, the
operating system no longer tracks or restores the last-used directory, and an app that
wants the old behaviour stores the last folder and passes it as `defaultPath`. The same
note is recorded in the [PH-OPS-003](PH-OPS-003.md) Resolution (breaking-change review,
Electron 31 to 44).

## Evidence

### Environment

- Commit/patch identity: `main` at `ed40fa6`; Electron 44.9.2, better-sqlite3 13.0.3.
- OS/runtime/browser: none run for this finding. The evidence is the Electron 43
  breaking-changes notes (`docs/breaking-changes.md` in the Electron repository, section
  for 43) and the call sites in `src/main/index.ts`.
- Data profile/fixture: not applicable.
- Hardware, if applicable: a real display is needed to see a native dialog; the headless
  harness stubs dialogs.

### Reproduction

Established from the release notes and the code. It is not yet seen on a real display (the
status `reproduced` rests on the documented behaviour plus the absence of any `defaultPath`
in the call sites; the charter's status model has no word for "confirmed by documentation").

1. Desktop app on Electron 44.9.2, any profile. Library, Upload MIDI, pick a `.mid` from a
   folder other than Downloads (for example `~/Documents`).
2. Open Upload MIDI again.
3. Expected from the notes: the dialog opens in Downloads, not in `~/Documents`. The same
   holds for the seven other open dialogs below.
4. To be confirmed on a real display: user tests B15, on the post-merge Linux build, and
   sitting 2 item 4 on Windows.

### Artifacts

- File/line (`src/main/index.ts` at `ed40fa6`): none of the open-dialog option objects sets
  `defaultPath`. The 8 `dialog.showOpenDialog` calls are at lines 147 (`dialog:pick-midi-file`),
  187 (`songs:import-midi-files`, the Library "Upload MIDI" path), 224 (`songs:import-folder`),
  268 (`songs:reattach-midi-file`), 415 (`library:import`, a JSON backup), 487
  (`file:pick-audio`, a backing track), 504 (`file:pick-sample-dir`) and 542
  (`samples:install-pack`, a pack folder).
- The 3 `dialog.showSaveDialog` calls pass `defaultPath` as a bare file name only: line 388
  (`library:export`, `lumakeys-library-<date>.json`), line 449 (`file:save-midi`) and line
  470 (`file:save-wav`), both with the caller's suggested name. A name with no folder leaves
  the start folder to Electron; whether it is Downloads on Electron 44 is not established.
- PH-OPS-003 Resolution: the Electron 31 to 44 review named this change and did not alter
  the dialogs ("not changed here").

## Root Cause

The app relied on the operating system to remember each dialog's last folder, and
Electron 43 stopped that. The main process, which owns every dialog, has never kept a last
folder of its own, so there is no value to pass as `defaultPath`. The owning boundary is
the dialog handlers in `src/main/index.ts`.

## Recommended Remediation Boundary

Keep the last folder per dialog kind in the main process and pass it as `defaultPath`: one
small module (for example `src/main/dialogDefaults.ts`) with `lastDirectory(kind)` and
`rememberPath(kind, pickedPath)`, called from the 8 open handlers and the 3 save handlers.
Kinds follow what the user thinks of as one place: MIDI files (single pick, multi pick and
reattach), a MIDI folder, a library JSON (backup and restore), audio, a sample-pack folder,
and the three exports. Use the picked file's folder, ignore a folder that no longer exists,
and give the save dialogs an absolute `defaultPath` (the remembered folder joined with the
suggested name). Two designs, which the owner chooses between:

- In memory only: the folders are forgotten when the app closes. One file and one test; no
  new setting.
- Persisted in settings (a `desktop` category or similar): the folders survive a restart,
  as they did on Electron 30. It adds a setting that holds paths of the user's folders, so
  "Reset all user data" must clear it and the backup export must decide whether to include
  it.

This is not implementation authorization.

## Required Regression Proof

- Deterministic unit/integration proof: a unit test of the helper: after a pick the next
  call for that kind returns the picked file's folder; a missing folder is dropped; kinds do
  not leak into each other; an absolute `defaultPath` is built for a save.
- Electron proof: a headless harness driver stubs `dialog.showOpenDialog` and records its
  options: the second Upload MIDI call carries the first pick's folder as `defaultPath`.
- Web proof: not applicable; the browser file picker is the browser's.
- Data/recovery proof: if persisted, reset-user-data clears the setting and a restore does
  not bring a stale folder back.
- Manual hardware/UI proof: user tests B15 on a real display; sitting 2 item 4 on Windows.
- Broader regression command: `npx vitest run src/main` and `npm run verify`.

## Challenge Record

- Independent reproduction attempt: none at runtime. The finding came out of the slice 3
  implementation (its breaking-change review of Electron 31 to 44) and the slice 3 review;
  the dialog was not opened.
- Alternative explanations tested: that Linux dialogs go through the desktop portal, which
  might keep its own last folder regardless of Electron, was not tested; B15 settles it
  on this host. The note's wording covers every platform, so the Windows behaviour is
  expected to match.
- Scope/severity changes: P3, with a real but bounded cost per import; not P2, because the
  user can always browse and no state is lost.
- Deduplication decision: new. It is not part of PH-OPS-003, whose fix is the upgrade
  itself, and not part of PH-PAR-004 or PH-UI-009, which own what an import reports after a pick.
- Challenger conclusion and date: reproduced from the release notes and the code, 2026-10-21.
  Acceptance and placement are the owner's.

## Resolution

- Accepted/rejected rationale: not yet decided; the finding awaits the owner.
- Fix branch/commit/issue: none. Proposed placement: a small follow-up to slice 3 (in
  memory, one file and one test), or slice 14 "Settings values" if the folders are
  persisted. The owner decides both the placement and in-memory against persisted.
- Verification evidence: none yet beyond the documentation and the code reading above.
- Residual risk: as stated in User Impact.
- Revisit trigger: the owner's decision on acceptance, design and placement.
