# PH-OPS-004: A user SQLite database remains in git history

- Lane: OPS
- Severity: P2
- Confidence: high that the blobs exist; unknown whether they hold personal data
- Status: suspected
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: runtime-independent
- Coverage rows: MOD-012, DATA-003, DATA-004
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

`.pianohero-data/pianohero.db` (180,224 bytes) and its `-shm` file were tracked
until commit `489fe45` untracked them. The blobs stay in every clone and on GitHub
(`Promansis/LumaKeys`, public remote). If the database was a real practice profile
it holds song titles, play history, theory results, and settings; if it was a test
fixture the impact is only repository weight. Only the owner can tell, and only a
history rewrite removes it, which invalidates every existing clone and PR base.

## Expected Behavior Or Oracle

Charter data rule and `evidence/README.md`: never place production databases or
personal practice data in version control.

## Evidence

- `git rev-list --objects --all | grep .pianohero-data` lists blobs `5142e0d7` (180,224 bytes), `fe9ac284` (32,768 bytes), `4d0f4d75` (4,096 bytes), and `e69de29b` (empty WAL).
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

## Resolution

- Accepted/rejected rationale: kept `suspected` at the Phase 11 consolidation on 2026-10-20 until the evidence gap below closes.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: as stated in User Impact.
- Revisit trigger: before the repository is shared with anyone new or made public.
