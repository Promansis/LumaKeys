# PH-OPS-004: A default-state SQLite database remains in git history

- Lane: OPS
- Severity: P3 (P2 until 2026-10-20; see the Challenge Record)
- Confidence: high; every blob was read on 2026-10-20 and none holds personal data
- Status: accepted-risk
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: not applicable (accepted risk, owner decision 2)
- Affected runtime: runtime-independent
- Coverage rows: MOD-012, DATA-003, DATA-004
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

Six database files under `.pianohero-data/` were tracked until commit `489fe45`
untracked them on 2026-08-07. The blobs stay in every clone and on GitHub
(`Promansis/LumaKeys`, public remote, on `origin/main` and `origin/Architecture-fix`).
Read on 2026-10-20, they hold a fresh install's database: every table is empty except
the seven achievement rows, all still locked, and one setting
(`fingering`/`handSize` = `medium`). There are no song titles, play history, theory
results or file paths, and no free pages holding deleted rows. The impact is about
0.7 MB of repository weight and a breach of the charter data rule. Only a history
rewrite removes it, which changes every commit hash and invalidates every existing
clone and branch base.

## Expected Behavior Or Oracle

Charter data rule and `evidence/README.md`: never place production databases or
personal practice data in version control.

## Evidence

- `git rev-list --objects --all | grep -E '\.(db|sqlite3?)(-wal|-shm|-journal)?$'` lists six blobs, all under `.pianohero-data/`: `pianohero.db` `5142e0d7` (180,224 bytes) and `4d0f4d75` (4,096 bytes); `pianohero.db-wal` `7ccf9207` (449,112 bytes) and `e69de29b` (empty); `pianohero.db-shm` `fe9ac284` and `0eae09ec` (32,768 bytes each). The second-pass listing named four. `7ccf9207` and `0eae09ec` came from commits `4b68997` and `77b0e3c` (April 2026) and were missed.
- `git branch -r --contains` places the commits that added them on `origin/main` and `origin/Architecture-fix`.
- Content check, 2026-10-20: each blob was copied with `git cat-file -p` to `$TMPDIR`, opened read-only, and deleted afterwards. `5142e0d7` has 44 pages and a freelist count of 0. Every table has zero rows except `achievements` (7 rows, `unlocked_at` null in all) and `settings` (1 row, `fingering`/`handSize` = `medium`). A `strings` pass over every blob, including the WAL `7ccf9207`, finds only schema text, the seven achievement ids and that setting. No `.mid` name, home-directory, mount or drive path appears.
- `.gitignore` and `.dockerignore` now exclude `*.db` and the data directories, so no new copy can be added.

## Root Cause

The data directory defaulted to the working directory (`.pianohero-data`) before the
ignore rules existed.

## Recommended Remediation Boundary

Owner decision, not an agent action: inspect the blob (`git cat-file -p 5142e0d7 > /tmp/x.db` then open with `sqlite3`) and either accept the risk in the ledger with a rationale, or rewrite history with `git filter-repo` and force-push, then re-clone. This is one of the three decisions the Phase 11 plan reserves for the owner.

## Required Regression Proof

- Deterministic unit/integration proof: `git rev-list --objects --all | grep -c pianohero.db` returns 0 after a rewrite; or the ledger records accepted-risk.
- Broader regression command: none.

## Challenge Record

- Independent reproduction attempt: object listing is deterministic.
- Alternative explanations tested: the 4,096-byte variant is an empty schema; the 180 KB one is not, so content is plausible.
- Challenger conclusion and date: suspected pending owner inspection, 2026-10-19
- Consolidation challenge, 2026-10-20: kept `suspected`. Evidence gap: whether the blobs in history hold personal data is unknown. Next action: the owner inspects the blob (steps in this file), then accepts the risk or authorises a history rewrite (owner decision 2 in the user-test file). Deduplication: none; this is the only finding about repository history.
- Owner decision 2, 2026-10-20: the agent read every blob (Evidence above). The
  personal-data impact that set P2 is disproved, so severity is lowered to P3: what
  remains is repository weight and a breach of the charter data rule in history only.
  Status moved suspected, reproduced, accepted, then accepted-risk. The owner chose not
  to rewrite history, which would break every clone and branch base for no privacy
  gain.

## Resolution

- Accepted/rejected rationale: `accepted-risk` on 2026-10-20 (owner decision 2). The blobs are a fresh install's database with no personal data, and a rewrite would invalidate every clone and branch base for no privacy gain.
- Fix branch/commit/issue: none; history is not rewritten.
- Verification evidence: the 2026-10-20 content check under Evidence.
- Residual risk: about 0.7 MB of history weight; the charter data rule is breached in history only. `.gitignore` and `.dockerignore` stop new copies.
- Revisit trigger: a database blob in history is found to hold personal data, or history is rewritten for another reason (remove these blobs in the same rewrite).
