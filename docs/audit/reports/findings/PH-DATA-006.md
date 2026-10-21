# PH-DATA-006: An interrupted legacy database rename is not finished on restart; WAL-only commits are dropped or startup is refused

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (server same-directory rename; Electron profile move and same-directory rename)
- Coverage rows: DATA-017, OP-015
- Related/duplicate findings: PH-DATA-005 (desktop lookup), PH-OPS-006 (refusals are invisible on desktop)
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane B, 2026-10-19

## User Impact

The legacy SQLite set (`pianohero.db`, `-wal`, `-shm`) is renamed one file at a time.
If the process dies between two of those renames, the next start does not finish the
job:

- Profile move (Electron): if `pianohero.db` has already become `lumakeys.db` in the
  new profile and the `-wal` is still in the old one, the next start treats the
  migration as done. The database opens without its WAL and every transaction that
  was committed but not yet checkpointed is gone, with `integrity_check` still `ok`.
  The orphaned WAL stays in the old profile and becomes useless after the first write.
- Same-directory rename (server, and Electron when the database is already in place):
  the next start refuses with "Back up one and remove the other before starting."
  Following that advice literally (removing the legacy-named file, which is the WAL)
  loses the same transactions.

The window is two adjacent synchronous `renameSync` calls, once per installation,
and it matters only if the old build last exited without checkpointing. Severity
P3: the loss is bounded to recent uncheckpointed sessions and the trigger is
narrow, but the module's restart claim does not hold for this stage.

## Expected Behavior Or Oracle

- `docs/agents/lumakeys-runtime-data-audit.md` invariant: "Multi-step durable
  mutations are atomic or leave an explicit recoverable state."
- `legacyBrandMigration.ts:75-77` ("Never overwrites ... Idempotent") and the
  DATA-017 matrix note that the migration "recovers a half-finished move on restart".

## Evidence

### Environment

- Commit/patch identity: `6e549b6`; real `migrateLegacyBrand` and `AppDatabase` imported from `src/`.
- OS/runtime: Linux, Node 24.15.0 with the repository's tsx loader.
- Fixture: a legacy database built with the real `AppDatabase`, checkpointed, then
  given two more commits with `wal_autocheckpoint = 0` and killed with SIGKILL, so
  the last commits live only in `pianohero.db-wal` (marker `wal-only`, theory scores
  7 and 9; without the WAL the database reads marker `checkpointed`, score 7 only).

### Reproduction

Interruption is simulated by creating the exact intermediate state the code produces
between two renames (`scripts/audit/legacy-brand-probe.ts`):

1. H0 controls: uninterrupted same-directory and profile migrations keep marker `wal-only` and scores 7 and 9.
2. H1, profile move stopped after `midi-files`: restart finishes the move; data intact. The restart claim holds for this stage.
3. H2, profile move stopped after `pianohero.db` -> `lumakeys/lumakeys.db`: restart returns `migrated: false` twice; `AppDatabase` opens the destination; result marker `checkpointed`, scores `[7]`; the old profile still holds `pianohero.db-wal` and `pianohero.db-shm`.
4. H3, same-directory rename stopped after the `.db`: restart throws "Both ... exist ... Back up one and remove the other". Removing the legacy-named files as advised: marker `checkpointed`, scores `[7]`. Finishing the rename by hand: marker `wal-only`, scores `[7, 9]`.
5. H4, same-directory rename stopped before the `-shm`: restart throws the same error because a stale `pianohero.db-shm` counts as a legacy database; removing it recovers fully.
6. H5 (related): a profile move that meets an existing destination entry (`Local Storage`) moves `midi-files`, then throws, and throws again on every later start with the library split across two directories.
7. Repeat count: two full runs, identical results.

### Artifacts

- File/line: `src/persistence/legacyBrandMigration.ts:40-54` (`renameDbSet`), `:86-97` (restart logic keys on `lumakeys.db` alone), `:111-124` (profile loop renames the set file by file, database first).
- Command: `node --import file:///media/storage/LumaKeys/node_modules/tsx/dist/loader.mjs scripts/audit/legacy-brand-probe.ts`; output `$TMPDIR/p11/B/legacy-brand-probe.out` (sha256 `52d67ba5…6d00bb0a`).
- Durable-state comparison: marker and theory-score rows before and after each case, read from scratch copies.

## Root Cause

The migration treats the existence of `lumakeys.db` as proof that the whole SQLite
set has moved. The set is three files moved by three independent renames with the
main database first, so a partial move is indistinguishable from a finished one
(profile mode) or from a genuine conflict (same-directory mode).

## Recommended Remediation Boundary

In `legacyBrandMigration.ts`: before moving, open the legacy database once and run
`PRAGMA wal_checkpoint(TRUNCATE)` so only the main file carries data; move sidecars
first and the main database last; on start, if `lumakeys.db` exists without its
sidecars and legacy sidecars exist (beside it or in the legacy profile), finish the
rename instead of returning or refusing. Make the refusal text name the safe action
(rename, not remove).

## Required Regression Proof

- Deterministic unit/integration proof: `legacyBrandMigration.test.ts` cases built from a real WAL-bearing database for states H2, H3, H4, asserting the WAL-only rows survive restart.
- Electron proof: rerun `scripts/audit/electron-userdata-probe.mjs --packaged` after PH-DATA-005 is fixed.
- Web proof: `scripts/audit/legacy-brand-server-probe.mjs` with an added H3-style case.
- Broader regression command: `npx vitest run src/persistence`.

## Challenge Record

- Independent reproduction attempt: control cases H0 prove the fixture and inspection are sound (the same WAL-bearing set migrates intact when not interrupted).
- Alternative explanations tested: inspection reads scratch copies of the full set, so the probe cannot itself checkpoint or drop the WAL; `integrity_check` stays `ok`, so this is silent loss, not corruption.
- Scope/severity changes: P2 considered; P3 chosen because the trigger needs both an unclean exit of the old build and a crash inside a once-per-install window of two syscalls. H5 recorded as a related resilience observation, not a separate finding.
- Deduplication decision: distinct root cause from PH-DATA-005 (wrong source directory) and PH-OPS-006 (refusal visibility).
- Challenger conclusion and date: reproduced by constructed state, 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: branch `remediation/p11-s01-desktop-migration`, commit `3ee10c2` (Phase 11 remediation slice 1, with [PH-DATA-005](PH-DATA-005.md), [PH-DATA-006](PH-DATA-006.md) and [PH-OPS-006](PH-OPS-006.md)). Not yet reviewed or merged.
- Verification evidence:
  - Change in `src/persistence/legacyBrandMigration.ts`: before moving, the migration runs `PRAGMA wal_checkpoint(TRUNCATE)` on the earlier database (and on a current database it is about to replace) and stops if the checkpoint is blocked, so the main file holds every commit. The -wal and -shm files move before the main `pianohero.db`. On start, if `lumakeys.db` exists without a sidecar and a `pianohero.db-wal` or `-shm` is left beside it, or in an earlier profile that no longer has `pianohero.db`, the rename is finished. A left-over WAL older than the database is left alone. Refusal messages say which file to rename (with its -wal and -shm files) instead of "remove the other".
  - Tests in `src/persistence/legacyBrandMigration.test.ts`, built from real WAL-bearing `AppDatabase` files, under `interrupted moves (PH-DATA-006)`: `folds the WAL into the legacy database before moving, so it moves as one file`; `moves sidecars that outlive the checkpoint before the main database`; `finishes a profile move an earlier build stopped after the database (H2)`; `finishes a same-directory rename an earlier build stopped after the database (H3)`; `finishes a same-directory rename an earlier build stopped before the -shm (H4)`; `leaves a left-over WAL alone when the database was written after it`; `recovers from a stop at every rename without losing either library` (stops at each of the 6 renames, then restarts). Also `same directory > refuses, naming the safe rename, when both databases hold a library and no one can choose`. Before the fix, H3, H4 and the refusal test failed on behavior ("Both … exist … Back up one and remove the other"); the others failed because `legacyProfileDirs` did not exist yet. The baseline behavior for H2 is shown by the probe below.
  - Function-level probe (`scripts/audit/legacy-brand-probe.ts`). Before: H2 ends with marker `checkpointed` and scores [7], so the WAL-only 9 is lost; H3 and H4 refuse. After: H2, H3 and H4 end with marker `wal-only`, scores [7, 9] and `integrity_check` `ok`; a second H2 run changes nothing and the earlier directory is empty. Outputs `$TMPDIR/p11-s01/before/legacy-brand-probe.out` (sha256 `a7f9436e…459acdf2`) and `$TMPDIR/p11-s01/after/legacy-brand-probe.out` (sha256 `9e9f9a35…6cd8cbde`).
  - Web proof: new case S9 in `scripts/audit/legacy-brand-server-probe.mjs` (H3 state: `lumakeys.db` beside `pianohero.db-wal` and `-shm` that hold a WAL-only song), run against `dist/server/index.cjs` from `npm run build:web` on port 3210. Before: the server exits with code 1 and "Both … exist". After: the server starts and `/api` lists both songs. The other 18 cases give the same results as before; S7 (both databases hold data) still refuses, now with the rename text. Outputs `$TMPDIR/p11-s01/before/legacy-brand-server-probe.out` (sha256 `00d19d9b…d2485760`) and `$TMPDIR/p11-s01/after/legacy-brand-server-probe.out` (sha256 `edb42e11…ee31955d`).
  - Electron: the packaged rerun is still owed; the packaged app takes the new single-instance lock, which needs a Unix socket, and the agent sandbox blocks `socket()`, so every packaged launch aborts before startup runs (`FATAL:process_singleton_posix.cc(289)] Check failed: . socket() failed: Operation not permitted`, `$TMPDIR/p11-s01/after/manual-launch/sandboxed-launch.out`, sha256 `53b213c9…809c27f3`). Running the probe outside the sandbox was refused. A Linux `--dir` package of the fix exists in a private copy (`app.asar` sha256 `baafc670…6b67de89`).
  - Validation on the fix commit: `npx vitest run` 67 files passed, 1 skipped (391 tests passed, 1 skipped, the existing `museScore.integration.test.ts`); `npx tsc --noEmit` and `npx tsc --noEmit -p tsconfig.server.json` exit 0; `npm run build` and `npm run build:web` exit 0. Node v24.15.0, Electron 30.5.1.
- Residual risk: finishing a move from a left-over WAL relies on file modification times. A stop during the backup step can split the backup over two `before-legacy-migration-*` folders, or leave entries of a replaced profile that did not conflict in place; nothing is deleted in either case. Running an older build between two interrupted attempts was not tested.
- Revisit trigger, if accepted-risk:
