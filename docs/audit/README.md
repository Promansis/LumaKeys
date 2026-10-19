# LumaKeys Audit Workflow

This directory is the operating system for a staged, evidence-led audit. It contains
live audit conclusions as lanes complete. Discovery remains read-only; remediation
begins only after a finding is reproduced, challenged, accepted, and selected.

## Source Of Truth

| Document | Purpose |
|---|---|
| [charter.md](charter.md) | Scope, authority, severity, gates, and completion rules |
| [coverage-matrix.md](coverage-matrix.md) | Every required surface and its disposition |
| [findings-ledger.md](findings-ledger.md) | Canonical index of suspected through verified findings |
| `reports/` | Baselines and evidence-rich lane reports created during the audit |
| `evidence/` | Small text evidence or links to externally stored large artifacts |
| `templates/` | Reusable finding, baseline, lane, challenge, and remediation forms |

Do not duplicate finding state in lane reports. Reports link to finding IDs; the
findings ledger owns status and severity.

## Preconditions

Do not start evidence collection until all preconditions are recorded as complete in
the charter:

1. Finish, preserve, or explicitly baseline the uncommitted `Architecture-fix` UI
   work. Record the exact commit or patch identity used for audit evidence.
2. Create a dedicated read-only audit branch or worktree from that identity.
3. Repair the local dependency installation until Vitest and Vite use valid native
   binaries for this environment.
4. Capture the clean automated and smoke-test baseline using
   `templates/baseline-report.md`.
5. Confirm the minimum supported desktop window and supported desktop browsers.
6. Confirm all runtime testing uses isolated data under `/tmp`, never production or
   personal data.

Dependency repair and baseline failures are evidence about the environment, not
automatically product findings. Record both and distinguish them.

## Roles

One person may hold several roles, but each coverage row names one accountable owner.

- **Audit lead**: controls scope, evidence quality, IDs, deduplication, and gates.
- **Lane owner**: gathers evidence for one lane and updates coverage rows.
- **Challenger**: attempts to disprove, narrow, or merge findings.
- **Remediation owner**: implements an accepted vertical slice outside discovery.
- **Verifier**: confirms the fix independently against required regression proof.

The author of a finding should not be its only challenger or verifier for P0/P1
findings when another reviewer is available.

## Status Model

Findings move only forward unless new evidence requires reopening:

```text
suspected -> reproduced -> accepted -> fixed -> verified
                 |            |
                 +-> rejected  +-> accepted-risk
                 +-> duplicate
```

- `suspected`: credible lead without repeatable proof.
- `reproduced`: exact steps or deterministic evidence demonstrate the behavior.
- `accepted`: impact, root cause, severity, and remediation boundary survived review.
- `fixed`: implementation exists and targeted proof passes.
- `verified`: required regression and runtime evidence pass on the intended baseline.
- `rejected`: evidence disproved the claim or it is outside the charter.
- `duplicate`: represented by another canonical finding.
- `accepted-risk`: intentionally not fixed; rationale and revisit trigger are recorded.

## Severity

- **P0**: data loss/corruption, exploitable security boundary, or a task-blocking
  failure with no reasonable recovery.
- **P1**: core workflow failure, material music-correctness error, runtime-wide
  correctness failure, or serious accessibility barrier.
- **P2**: meaningful but recoverable UX, performance, reliability, parity, or
  maintainability problem.
- **P3**: bounded polish issue with observable user impact. Use sparingly.

Severity is based on impact and reach, not file size or estimated effort. Confidence
is recorded separately as `low`, `medium`, or `high`.

## Audit Phases

### 0. Freeze And Baseline

Satisfy all preconditions. Assign the audit lead, lane owners, and evidence baseline.
Do not turn baseline failures into fixes during this phase.

Exit gate: the charter names the immutable source identity, environment, supported
conditions, known baseline failures, and isolated data location.

### 1. Complete The Inventory

Populate every row in the coverage matrix for:

- User workflows and failure/recovery paths.
- Electron and desktop-web outcomes.
- Persisted entities and non-SQL durable state.
- AppBridge methods, web-special methods, stubs, and privileged HTTP operations.
- Destructive, import/export, upload, file, and sample-pack operations.
- High-risk modules and operational/deployment surfaces.

Exit gate: no required row has an empty owner or evidence plan.

### 2. Data Safety And Security

Audit persistence, storage, migrations, transactions, rollback, backup/restore,
deletion, path containment, RPC/input validation, upload limits, deployment access,
and recovery. Persistence, runtime-parity, and security owners use shared finding IDs
where one root cause crosses lanes.

Exit gate: every durable entity and privileged operation has evidence and a
disposition; all P0/P1 leads are challenged immediately.

### 3. Music And Practice Correctness

Audit MIDI parsing, device events, latency, audio scheduling, scoring windows,
combos, looping, wait mode, fingering, theory answers, curriculum progression, and
result persistence. Prefer deterministic MIDI fixtures and controlled clocks; label
hardware-only claims as unverified until hardware proof exists.

Exit gate: each rule has a stated oracle, fixture, observed result, and disposition.

### 4. Runtime Parity

Compare user-visible outcomes across Electron and desktop web, method by method and
workflow by workflow. An intentional capability difference is a documented
disposition, not a defect.

Exit gate: every AppBridge method and runtime-special path is covered.

### 5. UI, Accessibility, And Performance

Use `PRODUCT.md`, `DESIGN.md`, ADR 0001, and the LumaKeys UI profile. Check all
interaction states, hands-busy use, navigation/back behavior, desktop zoom, high-DPI
canvas pixels, keyboard-only operation, reduced motion, color-independent states,
device lifecycle, cleanup, frame time, rendering, memory, startup, queries, and
bundle size. Do not test or score mobile layouts.

Exit gate: every workflow has default/failure/recovery evidence and every applicable
desktop condition has a disposition.

### 6. Architecture And Operations

Run architecture analysis only after behavior and boundaries are evidenced. Treat
large modules as investigation targets. Evaluate ownership, dependencies, duplicated
knowledge, error handling, test seams, packaging, native modules, logging, recovery,
documentation, and reproducible release checks.

Exit gate: recommendations cite behavioral evidence and do not propose size-only
refactors.

### 7. Challenge And Consolidate

Use `templates/challenge-record.md`. Reproduce high-severity findings independently,
merge duplicates by root cause, reject unsupported claims, calibrate severity, and
separate environmental failures from product failures.

Exit gate: every finding is accepted, rejected, duplicate, or explicitly still
suspected with a named evidence gap.

### 8. Plan Remediation

Convert accepted findings into risk-ordered vertical slices using
`templates/remediation-slice.md`. A slice includes the user-visible path, runtime and
data boundaries, tests, recovery proof, and rollback strategy. Do not group unrelated
cleanup into a risk fix.

Order: P0, P1, high-confidence P2 clusters, then remaining P2/P3 work.

### 9. Remediate And Verify

Implement one risk cluster at a time on a dedicated branch. Use diagnosis for
uncertain failures and TDD for observable regression behavior. Re-run the affected
lane plus proportionate regression, then have the verifier update the ledger.

### 10. Final Readiness

Run full desktop, web, packaging, recovery, backup/restore, and hardware verification.
Complete the matrix and produce a consolidation report with residual risks and
accepted exceptions.

### 11. Delta Re-Audit

When the source identity moves past the last verified baseline, do not restart at
Phase 0. Capture a new baseline (`scripts/audit/baseline.sh`), generate a delta
inventory (`scripts/audit/delta-inventory.sh`, recorded with
`templates/delta-inventory.md`), add a coverage row for every new surface, re-verify
each `fixed`/`verified` finding whose owning modules appear in the delta
(`templates/reverification-record.md`), and then resume the open workflow and runtime
gaps. A failed re-verification reopens the canonical ID; it never creates a new one.

Exit gate: every new row has a disposition, every near-delta finding has a
re-verification record, and `scripts/audit/recount-coverage.mjs --check` passes.

The first delta re-audit is planned in
[reports/phase-11-plan-2026-10-19.md](reports/phase-11-plan-2026-10-19.md).

## Objective Completion Condition

The audit is complete only when every in-scope workflow, supported runtime, durable
entity, privileged operation, AppBridge method, and high-risk module has:

- An accountable owner.
- A reproducible evidence reference.
- A disposition.
- Links to any canonical findings.
- Required manual or automated proof marked complete or explicitly waived with a
  rationale and revisit trigger.

An absence of findings is not evidence of coverage.

## Working Rules

- Discovery is read-only except for audit ledgers and reports.
- Never use real user data, production storage, or destructive operations outside an
  isolated test profile.
- Use one finding per root cause. Link all affected workflows/runtimes to it.
- Record the oracle before judging music correctness.
- Store large videos, traces, databases, and screenshots outside git; link them with
  hashes and short reproduction notes.
- Do not change severity because a fix is easy or difficult.
- Do not call a finding verified when only typecheck or implementation tests pass.
