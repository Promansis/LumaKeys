# PH-OPS-005: No continuous integration enforces the typecheck, test, or asset baseline

- Lane: OPS
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: runtime-independent
- Coverage rows: MOD-012
- Related/duplicate findings: PH-PAR-001 (asset assertion exists but is not wired in)
- First observed against: `main` at source identity `6e549b6`, Phase 11 baseline 2026-10-19

## User Impact

The repository has no `.github/workflows`, no pre-push hook, and no npm script that
chains typecheck, tests, and the Electron asset assertion. Every proof in this audit
is true only at the moment it ran. Between Phase 10 and Phase 11 five source files
changed without a touched test and the asset assertion was never executed by a
script. The user-visible risk is a regression of any fixed finding shipping unnoticed;
severity P3 because nothing is currently broken, but it is the root of the
"proof decays" pattern seen in the re-verification report.

## Expected Behavior Or Oracle

Charter operations requirement: reproducible release checks. The repository's own
`scripts/audit/baseline.sh` already encodes the check set.

## Evidence

- `ls .github/workflows` fails; `package.json` has no `ci`, `verify`, or `prepack` script; `grep assert-electron package.json packaging/ Dockerfile` finds nothing.
- Delta inventory lists `src/lib/game/types.ts`, `src/main/index.ts`, `ImmersiveHud.tsx`, `styles.css`, `src/server/index.ts` modified without a touched test.

## Root Cause

Verification lives in documents and in people's memory, not in a job that runs on
every push.

## Recommended Remediation Boundary

Add a `verify` npm script (`typecheck`, server typecheck, `vitest run`, `build`,
`assert-electron-assets`) and one GitHub Actions workflow that runs it on push and
pull request with `LUMAKEYS_SKIP_ELECTRON_REBUILD=1`. Optionally run
`node scripts/audit/recount-coverage.mjs --check` so the audit matrix cannot drift.
Two new files plus `package.json`.

## Required Regression Proof

- Deterministic unit/integration proof: the workflow passes on `main` and fails on a branch that breaks a test.
- Broader regression command: `npm run verify`.

## Challenge Record

- Independent reproduction attempt: file listing is deterministic.
- Alternative explanations tested: "solo project does not need CI" considered; kept at P3 because the audit's own value depends on it.
- Challenger conclusion and date: reproduced, 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3; deduplication: canonical for the missing CI. PH-PAR-001's unwired asset assertion is one check CI would run, not a duplicate. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Slice 0 (2026-10-21, `remediation/p11-s00-ci`, run by the agent): `package.json` gains `verify` (`npm run typecheck`, `tsc --noEmit -p tsconfig.server.json`, `vitest run`, `npm run build`, `npm run build:web`, `node scripts/assert-electron-assets.mjs`, in that order). New `.github/workflows/verify.yml` runs on push and pull request: `npm ci`, `npm run verify`, then `node scripts/audit/recount-coverage.mjs --check`, with `LUMAKEYS_SKIP_ELECTRON_REBUILD=1` and `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, Node 22 (the Dockerfile's version), read-only token and a 20 minute limit. The second variable is an addition to the plan: with it `npm ci` does not download the Electron binary, which nothing in `verify` needs.
  - Test-first: `scripts/verifyWiring.test.mjs` (`PH-OPS-005 verify script`, `PH-OPS-005 workflow`) failed with no `verify` script and no workflow file, and passes now.
  - Local CI run (GitHub cannot be reached from here): a clean `git archive` of the branch in a private directory, a fresh `npm ci` with the two variables (605 packages, 27 s, no Electron binary), then `npm run verify` (80 s, exit 0: 69 test files and 381 tests passed, 1 file skipped; the asset inventory passed with 647 public files), then the recount check (matches the rows). `npm run verify` also passes in the worktree (108 s). `action-validator` (the GitHub workflow JSON schema) accepts the workflow and rejects a copy with `push` misspelled.
  - Broken-test run: with one expectation changed in the clean copy, `npm run verify` exits 1 at `vitest run` (1 failed, 380 passed) and the builds do not run.
  - Still owed: the first green run on GitHub Actions on `main` and a red run on a pushed broken branch. Push is blocked, so that needs the owner (see the slice 0 report). Node 22 was not available locally; the local runs used Node 24.15.0.
