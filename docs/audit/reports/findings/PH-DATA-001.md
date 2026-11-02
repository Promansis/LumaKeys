# PH-DATA-001: Cross-Store Destructive Operations Commit SQLite Before Filesystem Work

- Lane: persistence
- Severity: P2 (lowered from P1 on 2026-10-21; see the Challenge Record)
- Confidence: high
- Status: accepted (reopened 2026-10-21: `fixed` to `reproduced` to `accepted`)
- Owner: Codex (acting)
- Challenger: Codex, fresh isolated-fixture challenge; Claude Code (acting), reopening challenge 2026-10-21
- Verifier: TBD. The independent source review and SIGKILL proof stand. The agent proof run of 2026-10-20 to 21 failed re-verification (see Resolution).
- Affected runtime: both
- Coverage rows: DATA-001, DATA-002, DATA-013, OP-002, OP-005, OP-007, OP-009, OP-015
- Related/duplicate findings: [PH-DATA-002](PH-DATA-002.md) (reset confirmation and its failure state); [PH-OPS-006](PH-OPS-006.md) (windowless Electron after a failed startup); [PH-DATA-010](PH-DATA-010.md) (reset confirmation copy)
- First observed against: 808e6739e55b5186e8a9565f2c4e9267c4894a6c plus the chartered audit patch identity

## User Impact

Library restore, song deletion, and full reset report failure after SQLite has already
performed the destructive or import mutation when subsequent MIDI storage work fails.
Restore can leave rows pointing at MIDI files that were never committed. Delete can
remove the library record while leaving its file orphaned. Reset can erase database
state while returning an error because files were not reset. These are core library
and recovery workflows with no durable rollback or repair record, making the issue
P1.

Reopened 2026-10-21, now P2. The data-loss path above is fixed: delete, bulk delete and
restore roll back with byte-identical files and rows. What is left is the error wording
without retry guidance on delete and restore, a reset retry that reports success while
the old files sit in a hidden directory, and a startup that stops while that directory is
locked. None of these loses data the user meant to keep, and the user can recover by
restoring permissions and retrying, so P2.

## Expected Behavior Or Oracle

The audit requires multi-step durable mutations to be atomic or to leave an explicit,
recoverable state. Backup import must validate and stage before committing, then either
complete all durable stores or preserve/recover the prior library state. Destructive
operations that return failure must not silently commit an unrecoverable subset.
See docs/agents/lumakeys-runtime-data-audit.md.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime: Linux x86_64, Node v24.15.0.
- Data profile/fixture: fresh disposable AppDatabase and fake MIDI adapter under /tmp.
- Hardware: none.

### Reproduction

Backup import:

1. Build a valid v2 backup containing two safe song IDs and staged MIDI entries.
2. Use an adapter whose first staged commit succeeds and second commit throws.
3. Call importLibraryBackup.
4. It throws, but both database rows remain with final MIDI paths and only the first
   MIDI file committed.

The isolated probe printed:

    {"error":"simulated second commit failure","firstRow":"/app-midi/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.mid","secondRow":"/app-midi/abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789.mid","committedMidiIds":["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"]}

Delete and reset:

1. Add a song to a fresh database.
2. Route deleteSong and resetUserData through createBridgeRouter with an adapter
   whose delete or reset rejects.
3. Each request returns 500 after its database mutation has completed.

The isolated probe printed:

    {"deleteStatus":500,"songExistsAfterDeleteFailure":false,"resetStatus":500,"songCountAfterResetFailure":0}

### Artifacts

- Backup commits database data before each staged file:
  src/persistence/libraryBackup.ts:136-139.
- Web delete/reset perform database mutation before storage work:
  src/server/bridgeRouter.ts:355-373.
- Electron has the same ordering:
  src/main/index.ts:133-137 and src/main/index.ts:336-342.
- Existing positive controls prove single-song import and reattach compensate for a
  failed staged-file commit: src/persistence/importSong.test.ts.
- Isolated reproduction commands/results: Phase 2 lane report, P2-DATA-001.

## Root Cause

SQLite and app-owned MIDI storage are treated as independent success paths. The
database transaction ends before the filesystem action, and the caller neither
compensates a subsequent filesystem failure nor writes a recovery journal. Library
backup import has the same problem across multiple staged commits.

## Recommended Remediation Boundary

Reopened 2026-10-21, slice 19: keep the existing rollback. Change only what the proof run
found. Delete and restore errors name the retry and say the library is unchanged. A reset
retry reports success only when the hidden `.midi-files-reset-<id>` directory is gone.
Startup does not stop while that directory is locked. Original boundary:

Introduce a narrowly scoped cross-store mutation protocol for library restore,
song/bulk deletion, and full reset. It must preserve old records/files until all
required filesystem work succeeds, or persist an explicit operation journal that
startup can deterministically finish or roll back. Keep the already-correct
single-song staging semantics as the reference; do not replace SQLite transactions
with broad best-effort error handling.

## Required Regression Proof

Reopened 2026-10-21: before this finding returns to `fixed`, rerun
`scripts/audit/browser/proof-data001-web.mjs` and
`scripts/audit/electron/proof-data001-electron.mjs`. Both must show (a) delete and restore
errors that name a retry and say the library is unchanged, with no raw OS error and no
misleading `EISDIR`; (b) a reset that fails after the database commit is rolled back or
reports the failure on every retry until the old files are gone; (c) a restart with the
leftover directory locked comes up (see [PH-OPS-006](PH-OPS-006.md) for the window).
The original proof below stays required.

- Deterministic unit/integration proof: injected failure on every staged restore
  commit, delete, bulk delete, and reset leaves either the old complete state or an
  explicit recoverable operation record.
- Electron proof: disposable profile, forced filesystem failure, restart, and
  integrity comparison.
- Web proof: isolated data root, failed request, restart, retry, and integrity
  comparison.
- Data/recovery proof: backup before/after checks include rows, MIDI files, folders,
  playlists, settings, and missing-file reports.
- Manual hardware/UI proof: import/reset error message includes a safe retry/recovery
  path.
- Broader regression command: npm test, npm run build, and npm run build:web.

## Challenge Record

- Independent reproduction attempt: ../challenges/PH-DATA-001.md.
- Alternative explanations tested: a database-side failure is already safe because
  staged files are discarded before commit; the failure appears only after the
  database transaction succeeds.
- Scope/severity changes: the finding was widened from backup restore to the shared
  database-before-filesystem operation pattern after delete/reset injection.
- Deduplication decision: canonical persistence finding for these cross-store flows.
- Reopening, 2026-10-21 (re-verification, `templates/reverification-record.md`): the agent proof run found criterion (a) of the required proof not met, and reset not rolled back after a database commit. The status went `fixed` to `reproduced` on the failed proof.
- Lead challenge, 2026-10-21: the run showed the data-loss path is fixed (single delete, bulk delete and restore roll back byte-identically, and every retry succeeded once permissions were back, with `integrity_check` ok). The remaining defects are wording, a misleading success on a reset retry, and a startup stop while the leftover is locked. Severity lowered from P1 to P2.
- Scope/severity change: P1 to P2. No new finding is created; the reopened ID keeps the remaining work (slice 19).
- Conclusion and date: accepted at P2, 2026-10-21 (`reproduced` to `accepted` the same day).

## Resolution

- Accepted rationale: direct fault injection shows an error response with committed,
  inconsistent durable state.
- Reopened 2026-10-21: the agent proof run failed re-verification and the finding returned to `accepted` at P2, assigned to new remediation slice 19 "Destructive-operation failures" in wave 2 ([plan](../phase-11-remediation-plan-2026-10-20.md)). It had been `fixed` since Phase 9. Report: [agent proofs](../phase-11-agent-proofs-2026-10-21.md#ph-data-001-forced-filesystem-failures).
- Fix branch/commit/issue: `d5839aa`, verified implementation in `d4ba395`.
- Verification evidence: fault-injection tests, independent source review, and real SIGKILL delete/reset/restore recovery pass; complete Electron/web UI retry and full library integrity matrices remain in [Phase 10](../phase-10-verification-2026-08-07.md).
  - Agent proof run 2026-10-20: forced filesystem failures through the UI on both runtimes, with `chmod` only, in throwaway dirs under `$TMPDIR`. Web: `dist/server/index.cjs` with Chromium 141.0.7390.37 (Playwright 1.56.1), Node v24.15.0. Electron: the existing `out/` build, Electron 30.5.1 (Chromium 124.0.6367.243). Faults: `midi-files` read-only; a locked directory standing where the 2nd song file goes (single delete, bulk delete of 3, restore of 4, so the first file moves and the second fails); an unreadable backup file (Electron); the data dir or userData read-only (reset); `midi-files` read-only at reset time; a locked sample-pack directory (Electron reset). After each failure the driver compared DB rows, the durable-operations table and the files on disk, then restored permissions and retried. Result: (b) and (c) pass, (a) fails.
    - (b) Single delete, bulk delete and restore leave the old library intact: DB rows and files are identical before and after, and the 1st file is rolled back when the 2nd fails. One residue: when restore fails at staging (`midi-files` read-only), a `restore-library:prepared` row stays in `durable_operations` until the next restart, on both runtimes. It is harmless, because recovery rolls back nothing. Reset is not rolled back when the failure comes after the database commit (`midi-files` read-only, or a locked pack directory): songs, settings and results are wiped, the old MIDI files sit in a hidden `.midi-files-reset-<id>` dir (or `.instrument-sample-packs-reset-<id>` dir), and a `reset-user-data:db-committed` row records it. That is the recoverable record the finding asks for, but see the retry notes below. When the failure comes before the database commit (data dir or userData read-only), nothing changes.
    - (c) With permissions restored, a retry of delete, bulk delete, restore and reset succeeded on both runtimes, and `integrity_check` was `ok` in every inventory. Restart recovery also worked once permissions were back: the stale reset directory was removed and the operation row cleared (Electron also cleared the pack backup dir).
    - (a) Delete and restore show only the raw error, for example `Delete failed: EACCES: permission denied, mkdir '<path>/midi-files/.delete-<id>'` and `Import failed: Error invoking remote method 'library:import': Error: EACCES: ...` (Electron adds the IPC prefix). Neither names a retry or says the library is unchanged. A restore that fails on the 2nd file shows `Path is a directory: rm returned EISDIR`, which hides the real rename error. Reset shows `Delete failed. Some data may still be saved.` and a toast `Some data may still be saved. Try again before sharing this device.`, which does name a retry, and the confirmation dialog stays open for it. This criterion is not met for delete and restore, so the owed proof is not complete.
    - New defects found, repro steps in the run report: (1) retrying reset while the fault is still there reports `User data deleted` and `All user data was deleted` although the old MIDI files remain in the hidden dir; (2) a restart while that dir is still locked does not come up: the web server exits with code 1 (`EACCES ... unlink`), and the Electron app stays running with no window (`UnhandledPromiseRejectionWarning` in the main process); (3) the stale `restore-library:prepared` row above.
    - Not covered: a fault injected between two commits by timing rather than by a locked path; Windows and macOS; a real full disk. The Electron relaunch used the offscreen driver, not a display.
    - Driver: `scripts/audit/browser/proof-data001-web.mjs` and `scripts/audit/electron/proof-data001-electron.mjs` (helpers `proof-data-common.mjs`, `proof-electron-harness.mjs`). Evidence: `/tmp/claude-1000/p11/PF/data/web001/` and `/tmp/claude-1000/p11/PF/data/el001/` (`run.out`, per-step JSON inventories, screenshots).
- Residual risk: the three defects above are open. Harmless extra: a failed restore leaves a `restore-library:prepared` row in `durable_operations` until the next restart. Host-level failures by timing, Windows, macOS and a real full disk were not covered.
- Revisit trigger: before backup/restore or destructive-data release sign-off.
- Slice 19 fix branch/commit: `remediation/p11-s19-destructive-failures`, commits `aa49f9b`,
  and the review repairs `d47bd51` and `372ba43`; implemented 2026-11-02, awaiting independent review;
  not merged.
- Review rulings (2026-11-02): the delete half of the rollback-failure change (a prepared
  row kept with a restart message) and the desktop `readLibraryBackupFile` wording are
  accepted; the web reads a backup in the browser, so the desktop-only reader is justified.
- What changed (slice 19):
  - `src/persistence/crossStoreMutations.ts`: a delete that fails before the database
    commit rolls back and throws `LibraryOperationError` with "Nothing was deleted, and
    your library is unchanged. Check that the LumaKeys data folder can be written to, then
    try again."; the OS error is kept in `cause` and written to the host log. If the
    rollback itself fails, the prepared row stays for startup recovery and the message says
    to restart LumaKeys. `resetUserDataAcrossStores` first finishes any earlier reset left at
    `db-committed` (the hidden `.midi-files-reset-<id>` directory and, on desktop, the
    sample-pack backup through a new `recoverSecondaryReset` argument) and fails until those
    files are gone. Choice for the plan's either/or: keep failing, not roll back, because
    the rows were deleted in a committed transaction and restoring them needs a database
    copy or a new journal, which the plan excludes and which would rewrite stored data.
  - `src/persistence/libraryBackup.ts`: staging and file commits of a restore share one
    rollback, so a staging failure no longer leaves a `restore-library:prepared` row. The
    message is "Nothing was restored, and your library is unchanged. Check that the
    LumaKeys data folder can be written to, then try the import again." A database import
    failure keeps its existing message. A recoverable restore no longer discards its
    per-song staging folders in `finally`, so when the rollback fails the `.ready` and
    `.previous` copies stay for the restart the message asks for (`commitRestore` and
    `rollbackRestore` remove the folder themselves). New `readLibraryBackupFile` (used by the desktop
    `library:import` handler) words an unreadable backup file the same way.
  - `src/persistence/database.ts` and `importSong.ts`, second review repair: while any
    `prepared` operation row exists (a delete or restore whose rollback failed), the new
    `AppDatabase.assertNoPendingRollback` refuses every new restore, delete, bulk delete,
    reset (through `prepareDurableOperation`, the shared entry point) and MIDI import or
    reattach (`importSongFromBuffer`, `reattachSongFromBuffer`), with the failed
    operation's restart message. Both runtimes reach these through the same functions.
    Without it, a same-session retry could write a song file that the next start's replay
    of the old rollback removes, leaving a row with no file. A normal restart finishes the
    old operation and clears the guard.
  - `src/storage/midiStorage.ts`: a restore commit undoes only a move it made, so a
    directory standing at the target reports the rename `EACCES` instead of `EISDIR`.
  - `src/persistence/database.ts`: `recoverDurableOperations` keeps going past a
    `db-committed` operation that cannot finish (it only clears files no row points at),
    logs it, keeps its row for the next start and returns the failures. A `prepared`
    operation whose rollback fails still throws, so startup stops as on the base (desktop
    PH-OPS-006 dialog and exit, web exit 1): carrying on would leave rows whose files are in
    the hidden directory, and the next start's `rollbackReset` would replace `midi-files`,
    deleting songs imported meanwhile. A skipped failure shows nothing to the user: it is
    only logged, because `src/main/index.ts` and `src/server/index.ts` ignore the returned
    list. Those host call sites are unchanged; `src/main/index.ts` changes only in the reset
    and import handlers.
  - `src/renderer/bridgeErrorMessage.ts` and `LibraryScreen.tsx`: delete and Import Library
    errors show `Delete failed. <message>` / `Import failed. <message>` without Electron's
    `Error invoking remote method` prefix. `SettingsScreen.tsx` is unchanged: its reset
    message already names a retry.
- Tests (source identity for the reproduction: product code equal to `1180731`). Failed
  before, pass after:
  - `crossStoreMutations.test.ts`: "keeps the database row and MIDI bytes when deletion
    fails" (before: the raw `delete failed` error, no unchanged message); "says the library
    is unchanged, without the OS error, when the song folder is read-only" (before:
    `EACCES: permission denied, mkdir '<root>/midi/.delete-<id>'`); "keeps a prepared
    delete for startup recovery when its rollback fails" (before: `stage failed after
    moving`, and the row was completed); "keeps failing a reset retry until the hidden reset
    directory is gone" (before: the retry resolved); "finishes a leftover secondary reset
    before reporting a reset retry as done" (before: 2 operation rows instead of 1); "lets
    startup recovery continue past a locked reset leftover and keeps it for the next start"
    (before: recovery threw `EACCES: permission denied, unlink '.../.midi-files-reset-<id>/<song>.mid'`).
    Review repair: "stops startup when a reset interrupted before its database commit cannot
    be rolled back" (before, on `aa49f9b`: `promise resolved "[ { operation: { …(4) }, …(1)
    } ]" instead of rejecting`).
  - `libraryBackup.test.ts`: "says the library is unchanged and clears its operation when
    the song folder is read-only" (before: `EACCES: permission denied, mkdir
    '.../.restore-<id>'`); "reports a failure on the second file without EISDIR and rolls
    back the first file" (before: `Path is a directory: rm returned EISDIR`); "says the
    library is unchanged, without the OS error, when the backup file cannot be read"
    (before: no such reader; the Electron driver showed `Import failed. EACCES: permission
    denied, open '<path>'`). Review repair: "keeps the staged files so a restart recovers
    the song when a restore rollback fails" (before, on `aa49f9b`: the restart's read of the
    song file failed with `ENOENT: no such file or directory`, leaving a row with no file).
    Second review repair: "refuses a same-session retry after a failed restore rollback, so
    the restart cannot remove its files" (the reviewer's probe: two-song backup into an empty
    library, second file blocked, rollback fails, retry, restart, then a further start keeps
    both rows and files; before, on `d47bd51`: `promise resolved "{ songsImported: 2, …(4) }"
    instead of rejecting`) and "refuses deletes, resets and MIDI imports until a restart
    finishes a failed restore rollback" (also checks that the restart clears the guard;
    before: `promise resolved "{ …(8) }" instead of rejecting`).
  - `LibraryScreen.test.tsx`: "shows the unchanged-library retry message, without the IPC
    or OS error, when a delete fails" (before: `Delete failed: Error invoking remote method
    'bulk:delete-songs': ...`).
  - `npm run verify` passes on `372ba43`: 508 tests passed, 1 skipped (75 files), both type checks, both builds and the Electron asset check.
- Driver result, 2026-11-02, rerun on the `dist/` and `out/` builds of `372ba43`, `chmod` faults only,
  throwaway dirs under `$TMPDIR`:
  - Web, `scripts/audit/browser/proof-data001-web.mjs` (Node v24.15.0, Chromium
    141.0.7390.37): (a) single delete, bulk delete and both restore faults show the
    unchanged-library message with no OS error and no `EISDIR`, rows and files unchanged and
    no operation rows left; every retry with permissions back succeeds. (b) a reset retry
    with `midi-files` still locked fails again with the hidden directory and its row kept.
    (c) a restart with that directory locked comes up (`server restarted ok = true`), keeps
    the row, and the next restart with permissions back clears it. `integrity_check` was
    `ok` in all 31 inventories.
  - Electron, `scripts/audit/electron/proof-data001-electron.mjs` under the shared flock
    (Electron 44.9.2, headless ozone): the same (a) to (c), plus the unreadable backup file
    and the locked sample-pack reset. A relaunch with the reset leftover locked opens the
    window and logs the kept operation; the relaunch with permissions back clears it.
    `integrity_check` was `ok` in all 40 inventories.
    An earlier attempt on the same build stopped at the first page load
    (`ERR_ABORTED (-3)` loading `out/renderer/index.html`, written 2 minutes before) and is
    not counted; the immediate rerun above loaded normally.
  - Evidence: `/tmp/claude-1000/s19/web-evid/` and `/tmp/claude-1000/s19/eevid/` (`run.out`,
    per-step JSON inventories, screenshots).
- Proof owed: agent-runnable, none beyond the independent review. Human-only: user test of
  the delete and import messages on a real profile whose data folder cannot be written to
  (Windows and macOS were not covered).
- Residual risk: failures after the database commit of a delete or restore still show the
  raw error, and a delete retry does not look for a leftover `.delete-<id>` directory
  (startup recovery clears it). If a restore commit and its rollback both fail, the
  `.previous` copy can be removed with the operation directory. While a `db-committed`
  operation cannot finish at startup, the app runs and nothing visible says so (it is only logged); a
  visible notice is PH-OPS-006 (slice 1). Not in scope, per review: a failed in-session
  reset rollback still clears its row and strands files (`crossStoreMutations.ts`, the
  reset `prepared` path), and invalid JSON on the web Import Library still shows a raw
  error. While a failed rollback waits for a restart, a concurrent in-flight operation's own
  `prepared` row also blocks a new one (it is refused with the restart message instead of
  running alongside); the bridge `addSong` row writes are not guarded, as they write no song
  file. Faults by timing, a
  real full disk, Windows and macOS were not covered.
- Revisit trigger: independent review of slice 19, and before backup/restore or
  destructive-data release sign-off.
