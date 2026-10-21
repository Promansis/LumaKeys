# LumaKeys Full Audit Operator

Use this playbook to initialize, coordinate, resume, or consolidate the staged audit.
Do not use it to perform all lanes in one pass.

## Load First

1. `CONTEXT.md`, `PRODUCT.md`, and `DESIGN.md`.
2. `docs/adr/README.md` and accepted ADRs.
3. `docs/audit/README.md`, `charter.md`, `coverage-matrix.md`, and
   `findings-ledger.md`.
4. The current baseline and lane report only after the charter points to them.
5. Historical `.codex-audits/codebase` files only for the assigned surface.

## Start Gate

Stop before discovery if the Architecture-fix baseline, dependency repair, isolated
data profile, source identity, or baseline checks are unresolved. Report which
charter gate blocks reliable evidence. Do not repair or implement unless separately
authorized.

## Operating Loop

1. Select one phase and a bounded set of coverage rows.
2. Assign one accountable owner and evidence plan to each row.
3. Copy the lane-report template and record the correctness oracle before inspection.
4. Gather read-only static, automated, runtime, and manual evidence proportionate to
   the surface.
5. Record working behavior as well as gaps.
6. Create a finding only for a defensible root cause; enter its ID in the ledger and
   link every affected coverage row.
7. Challenge P0/P1 findings immediately and all other findings before acceptance.
8. Update row disposition and coverage totals from actual rows.
9. Stop at the lane exit gate. Do not drift into another lane or remediation.

## Shared-Lane Rule

Persistence, runtime parity, and security share canonical finding IDs. Choose the
lane that owns the root cause; list other lanes as affected. Music/UI and
performance/UI findings follow the same rule. Never create parallel findings merely
because several reports discuss the same defect.

## Evidence Standard

- Static code evidence may establish a violated invariant but not an observed runtime
  failure without a deterministic proof path.
- Commands include exact source identity, environment, fixture, and concise result.
- UI evidence names window, zoom, DPI, input method, motion preference, and state.
- Music evidence names the oracle, MIDI fixture/clock, tolerances, and repeat count.
- Data evidence compares durable state before, during failure, after restart, and
  after recovery.
- Security evidence defines trust boundary and attacker capability.

## Consolidation

Use `templates/final-consolidation.md`. A lane is incomplete while any assigned row
lacks evidence/disposition or an explicit gap. Do not infer readiness from test pass
counts, finding counts, or elapsed time.

## Remediation Handoff

Only accepted findings may enter a remediation slice. Group by shared root cause and
user-visible path, not by file. Order by P0/P1 risk, then confidence and dependency.
The remediation owner works on a separate implementation branch and the verifier,
not the implementer alone, changes status to `verified` for P0/P1.

## Re-Audit After The Baseline Moves

When HEAD is past the identity named in the latest verification report, follow
`docs/audit/README.md` Phase 11 instead of starting a new audit:

1. `scripts/audit/baseline.sh --with-builds` for the new identity.
2. `scripts/audit/delta-inventory.sh <last-audited> HEAD` into `docs/audit/evidence/`
   and fill `templates/delta-inventory.md`.
3. Add a coverage row for every new module, route, env var, asset path, or workflow
   before collecting evidence; owners start as "Phase N (unassigned)".
4. File a `templates/reverification-record.md` for every `fixed`/`verified` finding
   whose owning modules appear in the delta.
5. `node scripts/audit/dependency-triage.mjs` and, against an isolated server only,
   `scripts/audit/web-security-probe.sh` for the security lane.
6. `node scripts/audit/recount-coverage.mjs --check` before every lane exit.

The current plan of this kind is `docs/audit/reports/phase-11-plan-2026-10-19.md`.
