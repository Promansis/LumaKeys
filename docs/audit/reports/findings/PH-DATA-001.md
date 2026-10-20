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
