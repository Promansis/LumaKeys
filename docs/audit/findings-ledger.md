# Findings Ledger

This is the canonical finding index. Detailed evidence lives in one file per finding
under `reports/findings/`, created from `templates/finding.md`.

## ID Format

Use `PH-<LANE>-NNN`:

- `WF` product workflows
- `MUS` music correctness
- `DATA` persistence/storage
- `PAR` runtime parity
- `SEC` security
- `UI` UI/accessibility
- `PERF` performance
- `ARCH` architecture
- `OPS` operations

IDs are never reused. A duplicate row remains and links to the canonical ID.

## Ledger

| ID | Title | Lane | Severity | Confidence | Runtime | Status | Coverage rows | Evidence report | Owner |
|---|---|---|---|---|---|---|---|---|---|---|
| PH-SEC-001 | Desktop sample-pack removal allows path traversal deletion | SEC | P0 | high | Electron | fixed | DATA-014, OP-003, OP-006, OP-013, MOD-008 | [PH-SEC-001](reports/findings/PH-SEC-001.md) | Codex (acting) |
| PH-DATA-001 | Cross-store destructive operations commit SQLite before filesystem work | DATA | P1 | high | both | fixed | DATA-001, DATA-002, DATA-013, OP-002, OP-005, OP-007, OP-009, OP-015 | [PH-DATA-001](reports/findings/PH-DATA-001.md) | Codex (acting) |
| PH-DATA-002 | Full user-data reset leaves instrument sample packs behind | DATA | P2 | high | both | fixed | DATA-014, DATA-015, OP-006, OP-009 | [PH-DATA-002](reports/findings/PH-DATA-002.md) | Codex (acting) |
| PH-DATA-003 | Backup restore does not verify MIDI content IDs | DATA | P2 | high | both | fixed | DATA-002, DATA-013, OP-005 | [PH-DATA-003](reports/findings/PH-DATA-003.md) | Codex (acting) |
| PH-MUS-001 | Live session controls erase judged practice state | MUS | P1 | high | both | fixed | WF-009, WF-010, MOD-003, MOD-011 | [PH-MUS-001](reports/findings/PH-MUS-001.md) | Codex (acting) |
| PH-MUS-002 | Imported MIDI measure maps are replaced by a fixed 4/4 grid | MUS | P1 | high | both | fixed | WF-004, WF-008, WF-009, DATA-004, DATA-012, MOD-011 | [PH-MUS-002](reports/findings/PH-MUS-002.md) | Codex (acting) |
| PH-MUS-003 | Custom fingerings bind to a filtered session index | MUS | P2 | high | both | fixed | WF-008, WF-009, DATA-007, BR-032, BR-033, BR-034, MOD-003, MOD-011 | [PH-MUS-003](reports/findings/PH-MUS-003.md) | Codex (acting) |
| PH-MUS-004 | MIDI device disconnect leaves held notes active | MUS | P2 | high | both | fixed | WF-002, WF-009, RT-011, MOD-003, MOD-011 | [PH-MUS-004](reports/findings/PH-MUS-004.md) | Codex (acting) |
| PH-PAR-001 | Electron production output omits required public runtime assets | PAR | P1 | high | Electron | fixed | WF-011, WF-016, WF-019, BR-060, BR-067, OP-006, MOD-012 | [PH-PAR-001](reports/findings/PH-PAR-001.md) | Codex (acting) |
| PH-PAR-002 | Browser file-picker cancellation leaves import promises pending | PAR | P2 | high | web | fixed | WF-004, WF-006, WF-020, BR-008, BR-010, BR-058, OP-001, OP-005, MOD-004, MOD-009 | [PH-PAR-002](reports/findings/PH-PAR-002.md) | Codex (acting) |
| PH-PAR-003 | Supported legacy MIDI migration loads only in Electron | PAR | P2 | high | both | fixed | DATA-002, WF-004, WF-006, WF-008, WF-009, BR-011, BR-059, OP-002, MOD-008, MOD-009 | [PH-PAR-003](reports/findings/PH-PAR-003.md) | Codex (acting) |
| PH-UI-001 | Immersive session dialogs do not contain keyboard focus | UI | P2 | high | both | fixed | WF-009, WF-015, WF-016, WF-024, RT-008, MOD-003, MOD-006 | [PH-UI-001](reports/findings/PH-UI-001.md) | Codex (acting) |
| PH-UI-002 | Settings tabs are clipped at required desktop zoom | UI | P1 | high | both | fixed | WF-003, WF-018, WF-019, WF-021, WF-022, RT-006, RT-008, MOD-005, MOD-007 | [PH-UI-002](reports/findings/PH-UI-002.md) | Codex (acting) |
| PH-UI-003 | Immersive canvases ignore reduced-motion preference | UI | P2 | high | both | fixed | WF-015, WF-016, RT-009, MOD-006 | [PH-UI-003](reports/findings/PH-UI-003.md) | Codex (acting) |
| PH-UI-004 | Escape exits Settings while cancelling a destructive confirmation | UI | P2 | high | both | fixed | WF-018, WF-021, WF-022, WF-024, RT-008, MOD-002, MOD-005 | [PH-UI-004](reports/findings/PH-UI-004.md) | Codex (acting) |
| PH-ARCH-001 | Practice-session prerequisite failures leave the session loading | ARCH | P2 | high | both | fixed | WF-008, WF-009, BR-015, BR-032, BR-053, MOD-003 | [PH-ARCH-001](reports/findings/PH-ARCH-001.md) | Codex (acting) |
| PH-ARCH-002 | Keyboard mapping reports success before its durable write settles | ARCH | P2 | high | both | fixed | WF-003, WF-018, BR-054, MOD-002, MOD-005 | [PH-ARCH-002](reports/findings/PH-ARCH-002.md) | Codex (acting) |
| PH-OPS-001 | Docker build context can embed default user data and environment files | OPS | P1 | high | web | verified | OP-014, MOD-012 | [PH-OPS-001](reports/findings/PH-OPS-001.md) | Codex (acting) |
| PH-SEC-002 | Access token accepted in the URL query string and documented as the login path | SEC | P2 | high | web | reproduced | OP-014, OP-018, MOD-010 | [PH-SEC-002](reports/findings/PH-SEC-002.md) | Claude Code (acting) |
| PH-SEC-003 | Web HTML responses carry no Content-Security-Policy or related security headers | SEC | P3 | high | web | reproduced | OP-016, MOD-010, MOD-013 | [PH-SEC-003](reports/findings/PH-SEC-003.md) | Claude Code (acting) |
| PH-SEC-004 | One MuseScore conversion blocks every other import for up to 45 seconds | SEC | P3 | high | web | reproduced | OP-017, WF-025, MOD-013 | [PH-SEC-004](reports/findings/PH-SEC-004.md) | Claude Code (acting) |
| PH-SEC-005 | Soundboard source links open remote sites inside an Electron window with no navigation guard | SEC | P3 | medium | Electron | suspected | MOD-014, OP-013, MOD-008 | [PH-SEC-005](reports/findings/PH-SEC-005.md) | Claude Code (acting) |
| PH-OPS-002 | Default web deployment exposes `/api/*` with no app-level gate | OPS | P2 | high | web | suspected | OP-014 | [PH-OPS-002](reports/findings/PH-OPS-002.md) | Claude Code (acting) |
| PH-OPS-003 | Shipped desktop runtime Electron 30.5.1 is past end of life | OPS | P2 | high | Electron | reproduced | MOD-012, MOD-008, OP-013 | [PH-OPS-003](reports/findings/PH-OPS-003.md) | Claude Code (acting) |
| PH-OPS-004 | A user SQLite database remains in git history | OPS | P2 | high | runtime-independent | suspected | MOD-012, DATA-003, DATA-004 | [PH-OPS-004](reports/findings/PH-OPS-004.md) | Claude Code (acting) |
| PH-OPS-005 | No continuous integration enforces the typecheck, test, or asset baseline | OPS | P3 | high | runtime-independent | reproduced | MOD-012 | [PH-OPS-005](reports/findings/PH-OPS-005.md) | Claude Code (acting) |
| PH-DATA-004 | Web sample packs installed before the rename are orphaned in the browser | DATA | P3 | high | web | reproduced | DATA-015, DATA-017, OP-006, OP-009, MOD-009 | [PH-DATA-004](reports/findings/PH-DATA-004.md) | Claude Code (acting) |

## Status Notes

Use this section only for cross-finding decisions such as a severity calibration,
merged root-cause cluster, or explicitly accepted risk. Finding-specific notes stay
in the detailed report.

- Phase 7 consolidation challenged all 18 findings. All remain accepted at their
  recorded severity and confidence; none was rejected, merged, fixed, verified, or
  moved to accepted risk. See
  [the consolidation report](reports/consolidation-2026-07-30.md).
- Phase 8 converted all 18 accepted findings into risk-ordered vertical remediation
  slices without changing status or severity. Implementation owners, verifiers, and
  branches remain a Phase 9 start gate. See
  [the remediation plan](reports/phase-8-remediation-plan-2026-07-30.md).
- Phase 9 implemented all 18 slices in the current worktree at commit
  `docs/audit-workflow` plus the chartered working-tree diff. Every finding has
  targeted regression proof (focused test fails before fix), typecheck, and
  proportionate builds proof. Status moved from `accepted` to `fixed`.
  Independent P0/P1 verification by another reviewer remains mandatory and is not
  satisfied by this implementation pass. See
  [the Stage 9 report](reports/phase-9-remediation-2026-07-30.md).
- Phase 10 froze the refactor at `d5839aa`, closed verification defects at
  `d4ba395`, restored a clean 318-test baseline, resolved BASE-SEC-001, and added
  package, Docker, browser/API, and real SIGKILL recovery evidence. Independent
  review keeps six P0/P1 findings at `fixed` because required runtime/manual proof
  remains; PH-OPS-001 reached `verified`. See
  [the Phase 10 report](reports/phase-10-verification-2026-08-07.md).

- PH-DATA-001 is the canonical cross-store atomicity finding for backup restore,
  song deletion, and full reset. Do not create separate findings for the same
  database-before-filesystem ordering without a distinct recovery root cause.
- BASE-SEC-001 is resolved by Hono 4.13.0, @hono/node-server 2.1.0, a passing
  unknown-length streaming-body 413/non-mutation regression, and
  `npm audit --omit=dev` reporting zero vulnerabilities.
- PH-MUS-002 is the canonical measure-map finding for non-4/4, tempo-change, and
  exact-bar-boundary loop behavior. Do not create separate findings for individual
  symptoms unless a distinct measure-map consumer has an independent root cause.
- PH-PAR-001 owns Electron renderer/package public-asset absence. Do not split
  curriculum, soundboard, menu, and managed-pack symptoms unless a later failure has
  a separate asset-location root cause.
- PH-PAR-002 owns browser file-input cancellation lifecycle for MIDI and JSON pickers.
  Do not duplicate it for individual import flows that share the same picker helper.
- PH-PAR-003 owns the Electron-only external-path fallback for migrated MIDI rows.
  Do not duplicate it for loading and difficulty-recompute symptoms.
- PH-UI-001 owns keyboard focus containment for all immersive session menus. Do
  not split it by Game, Free Play, or Soundboard unless a later overlay has a
  different focus-lifecycle owner.
- PH-UI-002 owns the Settings tab-row zoom collapse. Do not split it by affected
  tab or settings category.
- PH-UI-003 owns reduced-motion propagation into the Free Play and Soundboard
  canvas loops. It is not a duplicate of a general performance finding.
- PH-UI-004 owns the collision between modal Escape cancellation and the global
  Settings back shortcut. Do not merge it with PH-UI-001's focus containment.
- PH-ARCH-001 owns bridge-preflight failure visibility and recovery while opening
  a practice session. Do not duplicate it for score, fingering-identity, or
  immersive-dialog symptoms with their existing PH-MUS/PH-UI roots.
- PH-ARCH-002 owns renderer durable-setting outcome semantics. Do not merge it
  with PH-DATA-001 unless a distinct cross-store transaction failure is shown.
- PH-OPS-001 owns Docker build-context confidentiality for default user data and
  environment files. Do not merge it with runtime asset omission in PH-PAR-001.
