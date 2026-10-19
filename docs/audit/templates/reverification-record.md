# Re-Verification Record: PH-LANE-NNN

Use one record per previously `fixed` or `verified` finding when the source identity
moves past the baseline that proved the fix (a rename, refactor, dependency change, or
new feature touching the same path). The ledger status does not change until this
record concludes. A failed re-verification reopens the canonical ID; it never creates
a new one.

- Finding:
- Ledger status before this record: fixed | verified
- Baseline that proved the fix (commit):
- New baseline under test (commit):
- Re-verifier (not the original implementer for P0/P1):
- Date:

## What Changed Near The Fix

List the commits and files between the two baselines that touch the fix's owning
modules, its tests, or its data/paths. Use `scripts/audit/delta-inventory.sh <old> <new>`
and the finding's "Recommended Remediation Boundary" to decide what counts as near.

| Commit | File | Why it could disturb the fix |
|---|---|---|
| | | |

If nothing near the fix changed, say so and skip to Automated Proof with the
regression command only.

## Automated Proof

Re-run the "Required Regression Proof" from the finding file on the new baseline.

| Proof | Exact command | Result | Notes |
|---|---|---|---|
| Deterministic unit/integration | | pass / fail | |
| Broader regression | | pass / fail | |

## Runtime Proof

Carry forward the runtime, data, or hardware proof the Phase 10 report listed as still
owed. Mark each as `done`, `still owed`, or `blocked (environment)`.

| Owed proof (from Phase 10) | Status | Evidence or blocker |
|---|---|---|
| | | |

## Conclusion

- Fix still holds on the new baseline: yes / no / partially
- Ledger action: none | reopen as `reproduced` | promote to `verified`
- Residual proof still owed:
- Re-verifier sign-off and date:
