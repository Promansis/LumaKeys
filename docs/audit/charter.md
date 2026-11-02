# Audit Charter

- Charter status: active
- Audit status: phase 10 verification in progress; immutable refactor baseline `d5839aa` plus verification fix `d4ba395`; 63 files/318 tests and both builds pass; BASE-SEC-001 resolved; PH-OPS-001 independently verified; six P0/P1 findings remain fixed pending named runtime/manual proof; Windows, Edge, physical MIDI/audio, zoom, and workflow matrices remain blockers
- Audit lead: Codex (acting; repository owner requested continuation)
- Source branch/worktree: `docs/audit-workflow` at `/media/storage/LumaKeys`
- Source commit or patch identity: refactor baseline `d5839aa55a6c9d4796b24d42b23ab12dde06b854`; verification fixes `d4ba395eee6c5adcdecdce5226df79aa8ae79a93`; original discovery baseline retained in [the baseline report](reports/baseline-2026-07-11.md).
- Start date: 2026-07-11
- Target consolidation date: completed 2026-07-30

## Mission

Establish evidence-backed confidence in LumaKeys's user workflows, music
correctness, data safety, supported runtime behavior, desktop UI, accessibility,
performance, architecture, and operations. Discovery identifies and disposes risks;
it does not authorize product changes.

## In Scope

- All user journeys listed in `CONTEXT.md`.
- Electron desktop and self-hosted web in desktop browsers.
- SQLite, MIDI/sample storage, settings, browser local state, and IndexedDB state.
- Every `AppBridge` method and privileged HTTP/file operation.
- Setup, import, practice, results, progress, lessons, theory, free play, soundboard,
  settings, backup/restore, reset, packaging, startup, and recovery.
- Product behavior, music correctness, security, accessibility, performance,
  maintainability, and operational readiness.

## Out Of Scope

- Mobile browsers, phone/tablet breakpoints, touch-first UI, and mobile performance.
- New product features or speculative SaaS/multi-tenant requirements.
- Broad refactoring based only on module size.
- Remediation during discovery.
- Testing against production or the owner's personal data.

## Supported Test Conditions

| Condition | Required value | Status |
|---|---|---|
| Minimum desktop window | `1180x780`; minimum required for the playing UI to fit without clashes | confirmed |
| Default window | 1480x960 | defined |
| Large desktop window | `1920x1080` | confirmed |
| Desktop zoom | 100%, 125%, 150%, 175%, 200% | defined |
| Pixel density | 1x and available high-DPI scale | defined |
| Motion | default and reduced motion | defined |
| Navigation | pointer and keyboard-only | defined |
| Input | computer keyboard and available MIDI hardware | defined |
| Electron platform(s) | Linux x64 and Windows x64 | confirmed |
| Desktop browser(s) | Current stable desktop Chrome, Edge, and Firefox | confirmed |

## Lanes

| Lane | Owner | Shared owner/reviewer | Status |
|---|---|---|---|
| Product workflows | Codex (acting) | Audit lead | 24 explicit workflow evidence gaps; Phase 10 package/Docker/recovery proof added; final readiness pending |
| Music correctness | Codex (acting) | Practice-engine review | phase 3 complete; accepted findings PH-MUS-001 through PH-MUS-004; hardware/audio proof gaps remain |
| Persistence | Codex (acting) | Runtime-data review | phase 2 complete; accepted findings PH-DATA-001 through PH-DATA-003 |
| Runtime parity | Codex (acting) | Persistence and security review | phase 4 complete; accepted findings PH-PAR-001 through PH-PAR-003; platform/package proof gaps remain |
| Security | Codex (acting) | Runtime-data review | PH-SEC-001 fixed pending Electron bridge proof; BASE-SEC-001 resolved with dependency update and stream regression |
| UI and accessibility | Codex (acting) | Product-workflow review | phase 5 complete; accepted findings PH-UI-001 through PH-UI-004; browser/color/hardware proof gaps remain |
| Performance | Codex (acting) | Practice/UI review | phase 5 complete; no standalone performance finding; active-GPU/soak proof remains a gap |
| Architecture | Codex (acting) | Audit lead | phase 6 complete; PH-ARCH-001 and PH-ARCH-002 accepted |
| Operations | Codex (acting) | Runtime-data review | PH-OPS-001 verified; Linux package and Docker restart pass; Windows runtime remains blocked |
| Challenge/consolidation | Codex (acting) | Lane owners | phase 7 complete; all 18 findings challenged and dispositioned; no accepted risks |
| Remediation planning | Codex (acting) | Finding owners and verifiers TBD | phase 8 complete; all 18 accepted findings mapped to vertical slices in the Phase 8 plan |
| Final verification | Codex (acting) | independent fresh-context verifier | phase 10 active; PH-OPS-001 verified; six P0/P1 runtime/manual proof gaps remain |
| Delta re-audit (Phase 11) | Claude Code (acting) | the owner, through the [user test batch](reports/phase-11-user-tests.md) | consolidated 2026-10-20: 48 new findings (47 accepted, PH-OPS-002 at P0, and 1 accepted risk), 51 with the 2026-10-21 proofs; the agent ran owner sittings 0, 1, 3 and 4 the same day ([report](reports/phase-11-owner-sittings-2026-10-20.md)), which moved PH-PAR-002, PH-UI-001, PH-UI-002 and PH-UI-004 to verified and raised PH-MUS-014 to 016 and PH-UI-019; the agent proofs of 2026-10-21 ([report](reports/phase-11-agent-proofs-2026-10-21.md)) moved PH-PAR-003, PH-ARCH-002, PH-MUS-003 and PH-DATA-002 to verified, reopened PH-DATA-001 at P2 (failed re-verification), raised PH-MUS-017, PH-DATA-010 and PH-UI-020, and closed the OP-017 limits residual, leaving 69 findings (10 verified, 7 fixed, 51 accepted, 1 accepted-risk); on 2026-10-21 the owner started wave 1 and slices 2, 0 and 18 and task D1 merged, which moved PH-OPS-002, PH-SEC-002, PH-SEC-003, PH-OPS-005 and PH-MUS-014 to fixed and PH-ARCH-001 to verified, and PH-MUS-018 was raised, leaving 70 findings (11 verified, 11 fixed, 46 accepted, 1 reproduced, 1 accepted-risk); the rest of wave 1 then merged (slice 1 `c95586b`, slice 15 `8d73767`, slice 3 `a84acb0`, and the slice 0 follow-up `a7517ae`), which moved PH-DATA-005, PH-DATA-006, PH-OPS-006, PH-DATA-004, PH-DATA-007, PH-OPS-003 and PH-SEC-005 to fixed, and PH-UI-021 was raised, leaving 71 findings (12 verified, 17 fixed, 39 accepted, 2 reproduced, 1 accepted-risk); on 2026-11-02 wave 2 slices 6, 4 and 9 merged (`c7216e2`, `ea89f3e`, `6f327c9`), which moved PH-PAR-006, PH-MUS-007, PH-MUS-015, PH-MUS-005, PH-MUS-012, PH-MUS-016, PH-UI-019, PH-MUS-006 and PH-MUS-008 to fixed, leaving 72 findings (13 verified, 28 fixed, 30 accepted, 1 accepted-risk); wave 2 slices 5, 20, 19 and 7 then merged (`ccc68c2`, `c03f220`, `c8f9b1a`, `8fc933f`), which moved PH-MUS-010, PH-MUS-011, PH-MUS-017, PH-DATA-001 and PH-PAR-007 to fixed, leaving 72 findings (13 verified, 33 fixed, 25 accepted, 1 accepted-risk); coverage 154 of 156, with RT-010 and RT-011 blocked on the owner and sitting 2 (Windows) not run; owner decisions 2 to 4 taken 2026-10-20; see the [consolidation](reports/consolidation-2026-10-20.md) and the [remediation plan](reports/phase-11-remediation-plan-2026-10-20.md) |

## Preconditions

| Gate | Evidence required | Status |
|---|---|---|
| Architecture-fix UI work stabilized | Dirty patch hashes in [baseline report](reports/baseline-2026-07-11.md) preserve the existing UI work without modifying it | complete |
| Dedicated audit branch/worktree | Existing `docs/audit-workflow` worktree at `/media/storage/LumaKeys`; discovery is read-only outside `docs/audit/*` | complete |
| Dependency installation repaired | Lockfile-preserving `npm ci` restored executable launchers and esbuild; runtime-aware native-module guards now select the active ABI | complete |
| Typecheck baseline | `npm run typecheck` passes; evidence in [baseline report](reports/baseline-2026-07-11.md) | complete |
| Full test baseline | `npm test` passes 57 files and 285 tests against isolated data; evidence in [baseline report](reports/baseline-2026-07-11.md) | complete |
| Desktop build baseline | `npm run build` passes; generated output was not committed | complete |
| Web build baseline | `npm run build:web` passes with isolated data; generated output was not committed | complete |
| Package/security baseline | `npm audit` completed; 48 dependency advisories are recorded as leads, not findings, in the [baseline report](reports/baseline-2026-07-11.md) | complete |
| Electron startup smoke | Isolated Xvfb smoke rendered a `1480x960` LumaKeys window and exited cleanly after SIGTERM; see [baseline report](reports/baseline-2026-07-11.md) | complete |
| Web startup smoke | Isolated server and Chrome smoke completed first-run setup, main-menu navigation, and clean shutdown; see [baseline report](reports/baseline-2026-07-11.md) | complete |
| Isolated data profile | `/tmp/lumakeys-audit-20260711-phase0`; retain only for the audit and remove after final consolidation | complete |
| Test conditions confirmed | Repository owner confirmed the desktop window, Electron platform, and browser matrix on 2026-07-11 | complete |

No audit lane moves to evidence collection while a precondition is blocked unless the
audit lead records a narrow exception, its effect on confidence, and an expiry.

## Phase 11 Gates

Phase 11 re-audits the delta since the Phase 10 identity (`0bd40f5`) against the new
identity (`4466626`). The Phase 1 to 10 preconditions above still describe the
environment; these gates are specific to re-auditing a moved baseline.

| Gate | Evidence required | Status |
|---|---|---|
| New baseline captured | [baseline-2026-10-19](reports/baseline-2026-10-19.md): typecheck, tests, both builds, `npm audit` | complete: web smoke 2026-10-19; Electron smoke 2026-10-20, headless offscreen ([Electron runtime](reports/phase-11-electron-runtime-2026-10-20.md)) |
| Delta inventoried | [delta inventory](evidence/phase-11-delta-inventory-2026-10-19.md) generated by `scripts/audit/delta-inventory.sh` and every new surface has a coverage row | complete (rows WF-025/026, RT-012, DATA-017, OP-016/017/018, MOD-013/014 added) |
| Audited identity chosen | Owner chose `main` on 2026-10-19; `feat/main-menu-video-background` was fast-forwarded into `main`, so source files equal `4466626` | complete |
| Owners named | Owner assigned every lane to Claude Code (acting) on 2026-10-19; the owner is manual verifier through [the user test batch](reports/phase-11-user-tests.md) | complete |
| Re-verification scope fixed | The 18 fixed findings are listed in the plan's re-verification register with delta risk and owed proof | complete |
| Coverage counts honest | `node scripts/audit/recount-coverage.mjs --check` passes | complete on 2026-10-19; passes again at consolidation on 2026-10-20 |
| Isolated data profile | Absolute `$TMPDIR` path per lane, removed after consolidation | per lane |

Remediation of any Phase 11 finding happens on a separate branch after consolidation.
Scripts under `scripts/audit/` are read-only helpers and are not evidence by
themselves; the report must record the command, identity, and environment.

## Finding Standard

Every finding must contain:

- ID, lane, severity, confidence, and status.
- User impact and affected runtime(s).
- Exact evidence, environment, and reproduction steps.
- Expected behavior or correctness oracle.
- Root cause, not only the symptom.
- Recommended remediation boundary.
- Required automated, runtime, recovery, and manual regression proof.
- Links to coverage rows and related/duplicate findings.

Use `templates/finding.md`; use P0-P3 and the statuses in `README.md`.

## Evidence Rules

- Cite file and line, command and output summary, test fixture, screenshot/trace hash,
  or an exact manual procedure.
- Label static inference as inference. It cannot by itself establish a runtime failure.
- Record environmental failures separately from product failures.
- Hardware claims name device, connection, OS, driver/browser, and repeat count.
- Canvas proof includes a screenshot and a nonblank pixel check at the tested scale.
- Security findings include the trust boundary, attacker capability, input, and impact.
- Data-safety findings include setup, interruption/failure point, resulting durable
  state, recovery attempt, and integrity check.

## Stop Conditions

Pause the affected lane and notify the audit lead when:

- A test risks production/personal data.
- A P0 is reproduced.
- Required evidence would need destructive external action not already authorized.
- The baseline changes during evidence collection.
- A dependency or environment failure makes results unreliable.

## Completion

The audit completes only under the objective completion condition in `README.md`.
Residual suspected items must have an owner, evidence gap, next action, and due/revisit
trigger; otherwise the lane is incomplete.

## Approval

- Repository owner: support matrix confirmed in this audit session on 2026-07-11
- Audit lead: Codex (acting)
- Date approved for Phase 1 planning: 2026-07-11
