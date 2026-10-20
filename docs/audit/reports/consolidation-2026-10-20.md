# LumaKeys Audit Consolidation: Phase 11

- Baseline identity: `main` at `6e549b6bde622a5f74ad4c15fb596103f4d60c1a`, delta from
  `0bd40f5df5e362e4cc67be1f086c4e5e8d0e9072` ([baseline](baseline-2026-10-19.md)). Audit-only
  commits after it touch `docs/audit/` and `scripts/audit/` only. The desktop runs used
  the existing `out/` bundle, which was built after the last source commit.
- Audit period: 2026-10-19 to 2026-10-20
- Audit lead: Claude Code (acting)
- Lane reports: [plan](phase-11-plan-2026-10-19.md),
  [re-verification](phase-11-reverification-2026-10-19.md),
  [A web security](phase-11-lane-a-web-security-2026-10-19.md),
  [B persistence](phase-11-lane-b-persistence-2026-10-19.md),
  [C music correctness](phase-11-lane-c-music-correctness-2026-10-19.md),
  [D runtime parity](phase-11-lane-d-runtime-parity-2026-10-19.md),
  [E UI and accessibility](phase-11-lane-e-ui-accessibility-2026-10-19.md),
  lane F [web workflows](phase-11-lane-f-workflows-2026-10-19.md),
  [library and recording](phase-11-lane-f-library-recording-2026-10-19.md),
  [setup and settings](phase-11-lane-f-setup-settings-2026-10-19.md) and
  [Electron runtime](phase-11-electron-runtime-2026-10-20.md),
  [G supply chain and operations](phase-11-lane-g-supply-chain-ops-2026-10-19.md),
  [H documentation](phase-11-lane-h-documentation-2026-10-19.md), and the owner's
  [user test batch](phase-11-user-tests.md)
- Remediation plan: [Phase 11 remediation plan](phase-11-remediation-plan-2026-10-20.md)

## Readiness Decision

- Overall disposition: the agent's share of Phase 11 is complete and consolidated. The
  audit as a whole is not complete under the README's objective condition: 15 matrix
  rows are blocked on the owner's sittings 0 to 4, and nothing blocked is reported as
  passing. The product is not ready for a desktop update release.
- Release and deployment blockers:
  - Desktop update release: [PH-DATA-005](findings/PH-DATA-005.md) (P1, accepted). A
    user updating from any pre-rename build opens an empty library. Their data is intact
    on disk but not migrated.
  - Web deployment: [PH-OPS-002](findings/PH-OPS-002.md) (P2, suspected). With the default
    compose file, `/api/*` is open unless Cloudflare Access covers it. Sitting 0 item 4
    settles whether the owner's host is exposed. [PH-SEC-002](findings/PH-SEC-002.md)
    (P2, accepted) puts the access token in URLs when the gate is used.
- Residual P0/P1 count: 7 not yet `verified`. One is accepted and open (PH-DATA-005).
  Five are fixed and waiting for runtime or manual proof (PH-DATA-001, PH-MUS-001,
  PH-MUS-002, PH-PAR-001, PH-UI-002). PH-SEC-001 (P0) and PH-OPS-001 (P1) are verified.
- Accepted-risk count: 1 ([PH-OPS-004](findings/PH-OPS-004.md), owner decision 2 on 2026-10-20).
- Evidence confidence limits:
  - Electron proof is Linux, headless and offscreen, against the unpackaged `out/`
    bundle with a pinned `userData` ([harness limits](phase-11-electron-runtime-2026-10-20.md#what-the-harness-changes-and-therefore-cannot-prove)).
    A real window, real zoom, the OS reduced-motion setting, audio output, packaged
    builds and Windows are the owner's (sittings 1 and 2).
  - Web proof is headless Chromium 141 only. Edge and Firefox are sitting 3.
  - No MIDI hardware: Web MIDI was scripted. A physical keyboard is sitting 4.
  - No Docker: the MuseScore image, the access gate on the deployed host and the
    crafted-archive containment are sitting 0.
  - PH-UI-012 is proven by viewport emulation, not real zoom.

## Coverage

Totals are copied from `coverage-matrix.md` (`recount-coverage.mjs --check` passes). The
findings column counts finding links per dimension, so one finding can appear in several
rows.

| Dimension | Total | Covered | Gap/blocked/waived | Findings |
|---|---:|---:|---:|---:|
| User workflows | 26 | 19 | 7 | 42 |
| Runtime/UI conditions | 12 | 7 | 5 | 16 |
| Durable entities/stores | 17 | 17 | 0 | 15 |
| AppBridge methods | 69 | 69 | 0 | 10 |
| Privileged/destructive operations | 18 | 16 | 2 | 18 |
| High-risk modules/operations | 14 | 13 | 1 | 34 |
| **Total** | **156** | **141** | **15** | **62 unique** |

Blocked rows, each with its sitting and owner in the matrix: WF-002, WF-009, WF-013,
WF-015, WF-016, WF-025, WF-026, RT-006, RT-008, RT-010, RT-011, RT-012, OP-014, OP-017,
MOD-013. There are no bare gaps and no waivers.

## Findings By Disposition

| Severity | Suspected | Accepted | Fixed | Verified | Accepted risk |
|---|---:|---:|---:|---:|---:|
| P0 | 0 | 0 | 0 | 1 | 0 |
| P1 | 0 | 1 | 5 | 1 | 0 |
| P2 | 1 | 14 | 11 | 0 | 0 |
| P3 | 0 | 27 | 0 | 0 | 1 |
| **Total** | **1** | **42** | **16** | **2** | **1** |

The 18 earlier findings all still hold on the new baseline (re-verification record).
Phase 11 added 44: 42 accepted, 1 accepted as a risk after owner decision 2
(PH-OPS-004), and 1 still suspected (PH-OPS-002). Every new finding has a detailed
report and a challenge record. At this consolidation each file was checked against the
finding template and its rationale line now records the acceptance.

### Consolidation challenge decisions

- Severity: unchanged for all 44 at consolidation. PH-OPS-004 was lowered to P3
  afterwards (owner decision 2, below).
  - PH-DATA-005 stays P1. P0 was considered, but no bytes are lost; the old profile is
    intact and a fixed build can still migrate it.
  - PH-MUS-006 stays P2. Lane C offered P1. The metronome is optional, and the song,
    judging and stored results are correct.
  - PH-UI-006 stays P2. Deletion is something the user asks for; the defect is the
    missing confirmation and the unstated loss of history.
  - PH-UI-010 stays P2. One Settings dialog is unusable by keyboard and its Escape
    leaves the screen. Nothing is stored wrongly.
- Deduplication: none merged.
  - PH-DATA-007 and PH-DATA-004 have the same root cause pattern (a browser-side store
    renamed with no carry-over) but different stores and fixes. They stay separate and
    share remediation slice 15.
  - PH-MUS-005 and PH-UI-001: the PH-UI-001 focus return exposes PH-MUS-005, but the
    defect is the input guard. PH-UI-001 stays fixed.
  - PH-SEC-004 is distinct from L-11-006 (crafted archives), which stays an open lead.
  - The remaining dedup notes are in each finding's Challenge Record.
- Status corrections:
  - 11 finding files (PH-DATA-002, PH-DATA-003, PH-MUS-003, PH-MUS-004, PH-PAR-002,
    PH-PAR-003, PH-UI-001, PH-UI-003, PH-UI-004, PH-ARCH-001, PH-ARCH-002) still said
    "accepted" although the ledger has said `fixed` since Phase 9. They were corrected
    to match the ledger. No ledger status changed as a result.
  - PH-UI-012 read "reproduced (emulation)" and is now `accepted`. Its confidence line
    keeps the emulation limit.
- Owner decision taken during the audit: PH-MUS-013. Capstones run in Play mode at the
  capstone tempo, and the run's settings are locked while it runs (2026-10-20).
- Owner decisions after consolidation, 2026-10-20:
  - Decision 2: [PH-OPS-004](findings/PH-OPS-004.md) is `accepted-risk` and history is
    not rewritten. The agent read all six database blobs in history (the finding had
    listed four). They hold a fresh install's database with no personal data. Severity
    moved from P2 to P3 because the personal-data impact that set P2 is disproved.
  - Decision 3: the legacy-name fallback may be removed no earlier than 2027-01-31, and
    only in a release after the carry-over release, as in lane H's draft ADR. `CLAUDE.md`
    and `AGENTS.md` stay gitignored; the architecture and runtime content the audit
    relies on moves into tracked documents (task D1 in the remediation plan).
  - Decision 4: the owner accepted the proposed waves, owners and branches
    ([owner selection](phase-11-remediation-plan-2026-10-20.md#owner-selection-2026-10-20)).
    No slice has started; work waits for the owner's go-ahead.

### Lead dispositions

| Lead | Disposition |
|---|---|
| L-11-001 | [PH-SEC-002](findings/PH-SEC-002.md) |
| L-11-002 | Hardening note: non-constant-time token compare, no measurable differential |
| L-11-003 | Hardening note: `startsWith` without a separator, no sibling directory exists |
| L-11-004 | [PH-SEC-003](findings/PH-SEC-003.md) |
| L-11-005 | [PH-SEC-004](findings/PH-SEC-004.md) |
| L-11-006 | Open: crafted-archive containment of MuseScore. Next diagnostic: sitting 0 items 2 and 3 |
| L-11-007 | [PH-OPS-002](findings/PH-OPS-002.md), suspected until sitting 0 item 4 |
| L-11-008 | Narrowed to [PH-SEC-005](findings/PH-SEC-005.md) (window-open guard); no CSP is folded into PH-SEC-003 |
| L-11-009 | [PH-OPS-003](findings/PH-OPS-003.md) |
| L-11-010 | Narrowed: the four `hono` advisories are not reachable from the app's routes |
| L-11-011 | [PH-OPS-005](findings/PH-OPS-005.md) |
| L-11-012 | [PH-OPS-004](findings/PH-OPS-004.md), accepted risk under owner decision 2, plus repository hygiene notes |
| L-11-013 | Not a finding: the tests show no behaviour difference between local Node 24 and the image's Node 22. Lane G suggests recording the supported range in the README |
| L-11-014 | Not a finding: the `Dockerfile` pins MuseScore 4.7.5 by URL and SHA-256 and fails closed on a mismatch. Sitting 0 runs the build that exercises the pin |
| L-11-015 | Narrowed: the reduced-motion half is rejected (the video and menu animations stop under reduce). The hidden-window half stays open. Next diagnostic: sitting 1 item 4 |
| L-11-016 | Intentional: `GET /api/bridge/<method>` falls through to the SPA shell |
| L-11-017 | Evidence gap: MuseScore-converted MIDI against the measure-map oracle, sitting 0 item 3 |

## Highest-Risk Conclusions

Current failures on the audited baseline:

1. [PH-DATA-005](findings/PH-DATA-005.md): the rename's migration looks in a directory no
   released build used. Every desktop user who updates sees a fresh install. Together
   with [PH-OPS-006](findings/PH-OPS-006.md) (a startup failure leaves an invisible
   process) and [PH-DATA-006](findings/PH-DATA-006.md) (an interrupted rename is not
   finished), the desktop startup path is the main release risk.
2. Web access: [PH-OPS-002](findings/PH-OPS-002.md) (suspected open `/api/*`) and
   [PH-SEC-002](findings/PH-SEC-002.md) (token in URLs, history and logs). The whole
   library can be exported, reset or deleted through `/api`.
3. [PH-OPS-003](findings/PH-OPS-003.md): every desktop user runs Electron 30.5.1, which is
   out of support and has 37 high advisories. [PH-SEC-005](findings/PH-SEC-005.md) shows
   that remote pages already open inside the app.
4. Practice input and timing that silently give the wrong result:
   - [PH-MUS-005](findings/PH-MUS-005.md): computer-keyboard notes are dropped after any
     button click, including Resume.
   - [PH-MUS-010](findings/PH-MUS-010.md): any MIDI device change restarts the song.
   - [PH-MUS-011](findings/PH-MUS-011.md): a missing saved device filters all input
     while Settings says "Any connected device".
   - [PH-MUS-006](findings/PH-MUS-006.md): the metronome is wrong at any practice tempo
     other than 100 %.
   - [PH-MUS-012](findings/PH-MUS-012.md) and [PH-MUS-013](findings/PH-MUS-013.md): notes
     score before the song starts, and the capstone gate does not measure timing.
5. Features that report success and do nothing:
   - [PH-MUS-007](findings/PH-MUS-007.md): desktop WAV export saves silence.
   - [PH-PAR-006](findings/PH-PAR-006.md): web sample packs install but never play.
   - [PH-PAR-007](findings/PH-PAR-007.md): the web app does not load until the MIDI
     prompt is answered.
6. [PH-UI-006](findings/PH-UI-006.md): two clicks delete every song and its practice
   history, with no confirmation.
7. Keyboard and zoom access:
   - [PH-UI-010](findings/PH-UI-010.md): the latency calibration dialog is not keyboard
     operable.
   - [PH-UI-011](findings/PH-UI-011.md): the top bar shows no visible focus.
   - [PH-UI-012](findings/PH-UI-012.md): the HUD overlaps itself at 150 and 175 %.
   - [PH-UI-014](findings/PH-UI-014.md): Tab stops on invisible controls.

Future improvements rather than current breakage: [PH-OPS-005](findings/PH-OPS-005.md)
(no CI) and [PH-SEC-003](findings/PH-SEC-003.md) (no CSP). PH-OPS-005 is ordered first in
remediation anyway, because it turns the re-verification proof gaps into tests that run
on every push.

## Positive Evidence

- All 18 earlier fixes hold. The 19 Phase 9 proof files pass (143 tests), the full suite
  passes (365 passed, 1 skipped for the MuseScore integration test), and the asset
  assertion passes with 649 files in `out/renderer`. No test was deleted between
  baselines.
- [PH-SEC-001](findings/PH-SEC-001.md) is contained on both runtimes. On the desktop,
  14 crafted ids sent over the real IPC left every sentinel and both installed packs in
  place. On the web, the server refuses the pack methods and nine crafted ids left
  IndexedDB unchanged.
- The headless Electron run proved the desktop halves of 19 workflow rows on the real
  `out/` bundle:
  - import and reattach
  - library organisation and one-hand practice
  - practice and results
  - lessons, tier unlock and capstone
  - trainers
  - Free Play MIDI export (onset gaps within 3 ms of those played)
  - Settings read-back
  - sample-pack install and remove
  - backup, restore and reset
  - SIGKILL recovery
- Data integrity held where it matters:
  - a backup with one flipped base64 character writes 0 songs
  - SIGKILL after writes leaves `PRAGMA integrity_check` ok in WAL mode
  - Delete User Data removes songs, MIDI files, localStorage and the installed pack
- The AppBridge contract is unchanged since Phase 10 (69 methods). The `hono` advisories
  are unreachable, and the tests behave the same on Node 22 and 24. The `Dockerfile`
  pins the MuseScore download by SHA-256 and fails closed on a mismatch.

## Runtime, Recovery, And Hardware Proof

- Electron: Linux x64, headless offscreen, Electron 30.5.1, isolated `$TMPDIR` profiles.
  Covered startup, first-run setup, all main-menu destinations, IPC, relaunch and
  SIGKILL relaunch, and the keyboard walk (RT-008 desktop half). Not covered: packaged
  builds, Windows, real windows and zoom (sittings 1 and 2).
- Desktop web: headless Chromium 141 through Playwright on isolated data directories.
  Covered all lane F workflow rows, lane E keyboard, zoom emulation, reduced motion, and
  colour and contrast checks. Edge and Firefox are sitting 3.
- Backup/restore: verified on both runtimes, including tampered and garbage inputs and
  cancel paths. The PH-DATA-001 forced filesystem failure through the UI is still owed.
- Reset/recovery: reset with and without an installed pack, relaunch to the setup guide,
  and SIGKILL recovery all passed. The legacy rename's interrupted states were probed
  (PH-DATA-006). A real pre-rename profile update is sitting 2 (PH-DATA-005).
- Packaging: not rebuilt by the audit. PH-PAR-001 still owes capstones in a packaged
  profile and the asset assertion wired into `package:*`.
- MIDI/audio hardware: scripted Web MIDI only. Physical keyboard, disconnect and
  reconnect, and audible checks are sittings 1 and 4.
- Desktop UI/zoom/DPI/accessibility: keyboard walks on both runtimes, emulated zoom on
  the web, and computed contrast. Real zoom, the OS reduced-motion setting, a
  screen-reader pass and a colour-vision review are still owed.

## Accepted Risks And Evidence Gaps

One finding was accepted as a risk after consolidation: [PH-OPS-004](findings/PH-OPS-004.md)
(owner decision 2). Its rationale and revisit trigger are in the finding.

| Item | Rationale | Owner | Revisit trigger |
|---|---|---|---|
| WF-025, OP-017, MOD-013, L-11-006, L-11-017 | Docker is not reachable from the agent sandbox. MuseScore conversion, crafted-archive containment and the converted measure map need the image | Owner, sitting 0 | Before the next Docker image is deployed |
| OP-014, PH-OPS-002 | Whether the deployed host gates `/api/*` can only be checked from the owner's network | Owner, sitting 0 item 4 | Before relying on the current deployment |
| PH-OPS-004 | Accepted risk: the database blobs in history hold no personal data, and a rewrite would break every clone for no privacy gain | Owner, decision 2 (taken 2026-10-20) | A database blob in history is found to hold personal data, or history is rewritten for another reason |
| WF-016, WF-026, RT-010, RT-012, L-11-015 | Audio output, the OS reduced-motion setting, real zoom, the packaged video path, a colour-vision review and the minimised-window CPU check need a display, speakers or a person | Owner, sitting 1 | After slices 6, 11 and 16, and before release |
| PH-DATA-005 Windows half | A real `%APPDATA%\luma-keys` profile update | Owner, sitting 2 | After slice 1 |
| RT-006, RT-008 | Edge and Firefox keyboard walks and zoom (the Electron and Chromium walks are done) | Owner, sitting 3 | After slices 10 and 11 |
| WF-002, WF-009, WF-013, RT-011 | A physical MIDI keyboard and speakers | Owner, sitting 4 | After slices 4 and 5 |
| 16 fixed findings not yet `verified` | Each one's owed proof is listed in the [remediation plan](phase-11-remediation-plan-2026-10-20.md#proof-owed-by-fixed-findings) | Claude Code (acting) and owner sittings | When the named sitting or slice 0 runs |
| `CLAUDE.md` and `AGENTS.md` | Decision 3 keeps them gitignored. Until task D1 moves the architecture and runtime content into tracked documents, a fresh clone lacks what the audit cites | Claude Code (acting), task D1 | When wave 1 starts |

## Remediation Roadmap

The [Phase 11 remediation plan](phase-11-remediation-plan-2026-10-20.md) maps all 42
accepted findings to 18 vertical slices. They are listed here in risk order. Suspected
findings are not included; PH-OPS-002 joins slice 2 only if sitting 0 confirms it.

| Slice | Findings | Outcome |
|---:|---|---|
| 0 | PH-OPS-005 | CI runs typecheck, tests, build and the asset assertion, and pays the re-verification proof debt |
| 1 | PH-DATA-005, PH-DATA-006, PH-OPS-006 | Desktop update keeps the library; startup failures are visible |
| 2 | PH-SEC-002, PH-SEC-003 | Web token stays out of URLs; HTML carries a CSP and security headers |
| 3 | PH-OPS-003, PH-SEC-005 | Supported Electron; remote links open in the system browser |
| 4 | PH-MUS-005, PH-MUS-012 | Notes count only when they should |
| 5 | PH-MUS-010, PH-MUS-011 | MIDI device changes neither restart the song nor silently filter input |
| 6 | PH-PAR-006, PH-MUS-007 | Installed web packs play; WAV export has sound |
| 7 | PH-PAR-007 | The web app loads without answering the MIDI prompt |
| 8 | PH-UI-006 | Song deletion asks first |
| 9 | PH-MUS-006, PH-MUS-008 | Metronome and late first-tempo timing are correct |
| 10 | PH-UI-010, PH-UI-013, PH-UI-017 | Dialogs own focus and Escape |
| 11 | PH-UI-011, PH-UI-012, PH-UI-014 | Navigation focus is visible and the HUD fits at 150 to 200 % |
| 12 | PH-MUS-013, PH-UI-018, PH-DATA-009 | Capstones measure timing; drill results and save failures are shown |
| 13 | PH-PAR-004, PH-UI-009, PH-ARCH-004, PH-SEC-004 | Import outcomes are accurate and cheap |
| 14 | PH-DATA-008, PH-ARCH-003 | Settings values survive reload with their declared type |
| 15 | PH-DATA-004, PH-DATA-007 | Browser stores renamed in August are carried over |
| 16 | PH-UI-015, PH-UI-016 | Colour-blind palette and grade contrast are legible |
| 17 | PH-UI-005, PH-UI-007, PH-UI-008, PH-MUS-009, PH-PAR-005 | Small independent fixes |

## Sign-Off

- Lane owners: Claude Code (acting) for lanes A to H. Evidence is in the lane reports
  above.
- Challengers: Claude Code (acting) consolidation challenge, 2026-10-20, recorded in
  each finding's Challenge Record. No independent human challenger was available, so P0
  and P1 remediation still needs a verifier other than the implementer where one exists.
- Audit lead: Claude Code (acting). The Phase 11 step 6 gate was signed on 2026-10-20 for
  agent evidence. The blocked rows stay open until sittings 0 to 4.
- Repository owner: decisions 1 to 4 in the
  [user test batch](phase-11-user-tests.md#owner-decisions-not-tests) are taken, the
  last three on 2026-10-20. Remediation has not started and waits for the owner's
  go-ahead. Final sign-off waits for sittings 0 to 4. No release is inferred from this
  report.
