# Audit Reports

Create evidence-rich reports here only after the charter start gates are satisfied.

Recommended structure:

```text
reports/
  baseline-YYYY-MM-DD.md
  lanes/<lane>-audit.md
  findings/PH-<LANE>-NNN.md
  challenges/PH-<LANE>-NNN.md
  consolidation-YYYY-MM-DD.md
```

Copy the matching file from `../templates/`. Lane reports summarize coverage and link
finding IDs; they do not own finding status. The findings ledger remains canonical.

Current evidence: Phase 1 inventory, Phase 2 runtime/data/security, Phase 3
music/practice correctness, Phase 4 runtime parity, Phase 5 UI/accessibility/
performance, Phase 6 architecture/operations, and the
[Phase 7 consolidation](consolidation-2026-07-30.md) are present. The
[Phase 8 remediation plan](phase-8-remediation-plan-2026-07-30.md) maps all accepted
findings to vertical implementation slices. The
[Phase 10 verification report](phase-10-verification-2026-08-07.md) records current
commit identities, automated/runtime proof, verified disposition, and remaining
blockers. Raw runtime artifacts remain outside git and are described in their reports.

Phase 11 (delta re-audit after the LumaKeys rename, MSCZ import, static-file server,
and video main menu) is planned in the
[Phase 11 plan](phase-11-plan-2026-10-19.md) against the
[2026-10-19 baseline](baseline-2026-10-19.md). Its generated inputs live under
`../evidence/phase-11-*`. Re-verification records for previously fixed findings go in
one consolidated file per phase (`phase-11-reverification-2026-10-19.md`) following
`../templates/reverification-record.md`. Phase 11 lane reports:
[A web security](phase-11-lane-a-web-security-2026-10-19.md),
[B persistence](phase-11-lane-b-persistence-2026-10-19.md),
[C music correctness](phase-11-lane-c-music-correctness-2026-10-19.md),
[D runtime parity](phase-11-lane-d-runtime-parity-2026-10-19.md),
[E UI and accessibility](phase-11-lane-e-ui-accessibility-2026-10-19.md),
[G supply chain and operations](phase-11-lane-g-supply-chain-ops-2026-10-19.md),
[H documentation](phase-11-lane-h-documentation-2026-10-19.md), and lane F in four
parts: [web workflows](phase-11-lane-f-workflows-2026-10-19.md),
[library and recording](phase-11-lane-f-library-recording-2026-10-19.md),
[setup and settings](phase-11-lane-f-setup-settings-2026-10-19.md), and the
[Electron runtime](phase-11-electron-runtime-2026-10-20.md), run headless with the
drivers in `../../../scripts/audit/electron/`.
Proof the owner must run by hand is batched in
[phase-11-user-tests.md](phase-11-user-tests.md).
