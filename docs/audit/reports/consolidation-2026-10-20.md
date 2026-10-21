# LumaKeys Audit Consolidation: Phase 11

- Baseline identity: `main` at `6e549b6bde622a5f74ad4c15fb596103f4d60c1a`, delta from
  `0bd40f5df5e362e4cc67be1f086c4e5e8d0e9072` ([baseline](baseline-2026-10-19.md)). Audit-only
  commits after it touch `docs/audit/` and `scripts/audit/` only. The desktop runs used
  the existing `out/` bundle, which was built after the last source commit.
- Audit period: 2026-10-19 to 2026-10-21
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
  [H documentation](phase-11-lane-h-documentation-2026-10-19.md), the owner's
  [user test batch](phase-11-user-tests.md), and the
  [owner sittings run by the agent](phase-11-owner-sittings-2026-10-20.md) (updated into
  this report the same day), and the
  [agent proofs](phase-11-agent-proofs-2026-10-21.md) of 2026-10-21 (updated into this
  report)
- Remediation plan: [Phase 11 remediation plan](phase-11-remediation-plan-2026-10-20.md)

## Readiness Decision

- Overall disposition: the agent's share of Phase 11 is complete and consolidated, and
  the agent has also run owner sittings 0, 1, 3 and 4 and the proofs the fixed findings
  owed ([agent proofs](phase-11-agent-proofs-2026-10-21.md)). The audit as a whole is not
  complete under the README's objective condition: 2 matrix rows are blocked (RT-010 on
  a colour-vision review, RT-011 on a real MIDI keyboard), sitting 2 (Windows) has not
  run, and nothing blocked is reported as passing. The product is not ready for a
  desktop update release, and the live web deployment is exposed.
- Release and deployment blockers:
  - Web deployment: [PH-OPS-002](findings/PH-OPS-002.md) (P0, accepted). Sitting 0 item 4
    found the live host answering `/api/*` with the app and no login, so anyone who finds
    the address can export, reset or delete the library. Until slice 2 lands, the fix is
    the owner's: Cloudflare Access in front of the host, or `LUMAKEYS_WEB_ACCESS_TOKEN`.
    [PH-SEC-002](findings/PH-SEC-002.md) (P2, accepted) puts that token in URLs.
  - Desktop update release: [PH-DATA-005](findings/PH-DATA-005.md) (P1, accepted). A
    user updating from any pre-rename build opens an empty library. Their data is intact
    on disk but not migrated.
  - Any release: [PH-MUS-014](findings/PH-MUS-014.md) (P1, accepted). A fresh profile
    plays about 60 dB too quietly on both runtimes while Settings shows the default
    volumes.
- Residual P0/P1 count: 6 not yet `verified`. Three are accepted and open (PH-OPS-002,
  PH-DATA-005, PH-MUS-014). Three are fixed and waiting for runtime or manual proof
  (PH-MUS-001, PH-MUS-002, PH-PAR-001). PH-SEC-001 (P0), PH-OPS-001 and PH-UI-002 (P1)
  are verified. PH-DATA-001 left this list on 2026-10-21: it failed its proof run, was
  reopened, and was lowered to P2 because the data-loss path is fixed.
- Accepted-risk count: 1 ([PH-OPS-004](findings/PH-OPS-004.md), owner decision 2 on 2026-10-20).
- Evidence confidence limits:
  - Desktop proof is Linux only: the `out/` bundle headless, and a packaged Linux build
    (built from HEAD in a throwaway copy) on Xvfb with a real window manager and real
    X input ([sitting 1](phase-11-owner-sittings-2026-10-20.md#sitting-1-linux-display-and-speakers)).
    Windows is sitting 2.
  - Web proof covers Chromium 141, real Chrome 151, Edge 155 and Firefox 142. Edge's own
    browser zoom was not driven; its zoom was emulated.
  - Audio was recorded from a PulseAudio null sink and measured, not heard. Listening on
    speakers is the owner's.
  - MIDI was a scripted Web MIDI device on both runtimes. A physical keyboard's driver,
    the OS path, Chrome's permission prompt and latency feel are the owner's.
  - The OS reduced-motion setting was driven through GTK and XSETTINGS on X11, not
    GNOME's own switch or Wayland.
  - Docker runs used a throwaway audit image on 127.0.0.1. The crafted scores did not
    reach the MuseScore 45 s timeout, 30 s CPU limit or 10 MB output limit; the agent
    proofs of 2026-10-21 fired all three through real uploads, with fake converters rather
    than the MuseScore binary.

## Coverage

Totals are copied from `coverage-matrix.md` (`recount-coverage.mjs --check` passes). The
findings column counts finding links per dimension, so one finding can appear in several
rows.

| Dimension | Total | Covered | Gap/blocked/waived | Findings |
|---|---:|---:|---:|---:|
| User workflows | 26 | 26 | 0 | 48 |
| Runtime/UI conditions | 12 | 10 | 2 | 18 |
| Durable entities/stores | 17 | 17 | 0 | 17 |
| AppBridge methods | 69 | 69 | 0 | 11 |
| Privileged/destructive operations | 18 | 18 | 0 | 19 |
| High-risk modules/operations | 14 | 14 | 0 | 35 |
| **Total** | **156** | **154** | **2** | **69 unique** |

Blocked rows, each with its owner in the matrix: RT-010 (a colour-vision review) and
RT-011 (a real MIDI keyboard). The sittings run by the agent covered the other 13 rows
that were blocked at first consolidation: WF-002, WF-009, WF-013, WF-015, WF-016, WF-025,
WF-026, RT-006, RT-008, RT-012, OP-014, OP-017 and MOD-013. OP-014 is covered with a
failure (PH-OPS-002). There are no bare gaps and no waivers.

## Findings By Disposition

| Severity | Suspected | Accepted | Fixed | Verified | Accepted risk |
|---|---:|---:|---:|---:|---:|
| P0 | 0 | 1 | 0 | 1 | 0 |
| P1 | 0 | 2 | 3 | 2 | 0 |
| P2 | 0 | 16 | 4 | 7 | 0 |
| P3 | 0 | 32 | 0 | 0 | 1 |
| **Total** | **0** | **51** | **7** | **10** | **1** |

The 18 earlier findings all still held on the new baseline (re-verification record).
After the sittings and the agent proofs of 2026-10-21, 10 of them are `verified`
(PH-SEC-001, PH-OPS-001, PH-PAR-002, PH-UI-001, PH-UI-002, PH-UI-004, PH-PAR-003,
PH-ARCH-002, PH-MUS-003, PH-DATA-002), 7 stay `fixed` (PH-MUS-001, PH-MUS-002,
PH-PAR-001, PH-DATA-003, PH-MUS-004, PH-UI-003, PH-ARCH-001) and 1, PH-DATA-001, was
reopened and is `accepted` at P2. Phase 11 added 51: 50 accepted and 1 accepted as a risk
after owner decision 2 (PH-OPS-004). Of the accepted, PH-OPS-002 moved from suspected to
P0 after sitting 0 item 4, the sittings raised PH-MUS-014 (P1), PH-MUS-015, PH-MUS-016
and PH-UI-019 (P3), and the agent proofs raised PH-MUS-017 (P2), PH-DATA-010 and
PH-UI-020 (P3). Every new finding has a detailed report and a challenge record. At this consolidation each file was checked against the
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
- Reopening, 2026-10-21: [PH-DATA-001](findings/PH-DATA-001.md) failed its agent proof run
  (the error wording names no retry for delete and restore, a reset retry reports success
  while old files remain hidden, and a startup stops while the leftover is locked). It
  went `fixed` to `reproduced` and, after the lead's challenge, to `accepted` the same
  day at P2, lowered from P1: delete, bulk delete and restore roll back byte-identically,
  so none of the remaining defects loses data the user meant to keep. It moves to new
  slice 19.
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
  - Decision 5 (2026-10-21): slice 18 ([PH-MUS-014](findings/PH-MUS-014.md)) joins
    wave 1, after slice 0.

### Lead dispositions

| Lead | Disposition |
|---|---|
| L-11-001 | [PH-SEC-002](findings/PH-SEC-002.md) |
| L-11-002 | Hardening note: non-constant-time token compare, no measurable differential |
| L-11-003 | Hardening note: `startsWith` without a separator, no sibling directory exists |
| L-11-004 | [PH-SEC-003](findings/PH-SEC-003.md) |
| L-11-005 | [PH-SEC-004](findings/PH-SEC-004.md) |
| L-11-006 | Closed by sitting 0 (OP-017, MOD-013): traversal and symlink entries stay inside the temp directory, a 300 MB bomb is rejected, and a 180,008-bar score is stopped by the 2 GiB memory limit while the server keeps answering. The timeout, CPU and output limits were not reached there; the agent proofs of 2026-10-21 fired all three |
| L-11-007 | [PH-OPS-002](findings/PH-OPS-002.md), accepted at P0 by sitting 0 item 4 |
| L-11-008 | Narrowed to [PH-SEC-005](findings/PH-SEC-005.md) (window-open guard); no CSP is folded into PH-SEC-003 |
| L-11-009 | [PH-OPS-003](findings/PH-OPS-003.md) |
| L-11-010 | Narrowed: the four `hono` advisories are not reachable from the app's routes |
| L-11-011 | [PH-OPS-005](findings/PH-OPS-005.md) |
| L-11-012 | [PH-OPS-004](findings/PH-OPS-004.md), accepted risk under owner decision 2, plus repository hygiene notes |
| L-11-013 | Not a finding: the tests show no behaviour difference between local Node 24 and the image's Node 22. Lane G suggests recording the supported range in the README |
| L-11-014 | Not a finding: the `Dockerfile` pins MuseScore 4.7.5 by URL and SHA-256 and fails closed on a mismatch. Sitting 0 runs the build that exercises the pin |
| L-11-015 | Narrowed: the reduced-motion half is rejected (the video and menu animations stop under reduce). The hidden-window half is closed by sitting 1 item 4: minimised, the packaged app pauses its video and drops to 0.2 % of a core |
| L-11-016 | Intentional: `GET /api/bridge/<method>` falls through to the SPA shell |
| L-11-017 | Closed by sitting 0 item 3: MuseScore-converted meter-tempo bars match the SMF reference and the oracle |

## Highest-Risk Conclusions

Current failures on the audited baseline:

1. [PH-DATA-005](findings/PH-DATA-005.md): the rename's migration looks in a directory no
   released build used. Every desktop user who updates sees a fresh install. Together
   with [PH-OPS-006](findings/PH-OPS-006.md) (a startup failure leaves an invisible
   process) and [PH-DATA-006](findings/PH-DATA-006.md) (an interrupted rename is not
   finished), the desktop startup path is the main release risk.
2. Web access: [PH-OPS-002](findings/PH-OPS-002.md) (P0: the live host answers `/api/*`
   with no login) and [PH-SEC-002](findings/PH-SEC-002.md) (token in URLs, history and
   logs). The whole library can be exported, reset or deleted through `/api`.
3. [PH-MUS-014](findings/PH-MUS-014.md): a fresh profile plays about 60 dB too quietly
   while Settings shows 80, 20 and 65, so a new user's piano is close to silent.
4. [PH-OPS-003](findings/PH-OPS-003.md): every desktop user runs Electron 30.5.1, which is
   out of support and has 37 high advisories. [PH-SEC-005](findings/PH-SEC-005.md) shows
   that remote pages already open inside the app.
5. Practice input and timing that silently give the wrong result:
   - [PH-MUS-005](findings/PH-MUS-005.md): computer-keyboard notes are dropped after any
     button click, including Resume.
   - [PH-MUS-010](findings/PH-MUS-010.md): any MIDI device change restarts the song.
   - [PH-MUS-011](findings/PH-MUS-011.md): a missing saved device filters all input
     while Settings says "Any connected device".
   - [PH-MUS-006](findings/PH-MUS-006.md): the metronome is wrong at any practice tempo
     other than 100 %.
   - [PH-MUS-012](findings/PH-MUS-012.md) and [PH-MUS-013](findings/PH-MUS-013.md): notes
     score before the song starts, and the capstone gate does not measure timing.
   - [PH-MUS-016](findings/PH-MUS-016.md): a downbeat played slightly early at a loop
     seam is dropped, and Learn mode then waits on it.
6. Features that report success and do nothing:
   - [PH-MUS-007](findings/PH-MUS-007.md): desktop WAV export saves silence.
   - [PH-PAR-006](findings/PH-PAR-006.md): web sample packs install but never play.
   - [PH-PAR-007](findings/PH-PAR-007.md): the web app does not load until the MIDI
     prompt is answered.
7. [PH-UI-006](findings/PH-UI-006.md): two clicks delete every song and its practice
   history, with no confirmation.
8. Keyboard and zoom access:
   - [PH-UI-010](findings/PH-UI-010.md): the latency calibration dialog is not keyboard
     operable.
   - [PH-UI-011](findings/PH-UI-011.md): the top bar shows no visible focus.
   - [PH-UI-012](findings/PH-UI-012.md): the HUD covers its own Settings button at 150 to
     189 % real zoom, in Chrome and the packaged app.
   - [PH-UI-019](findings/PH-UI-019.md): Ctrl+0 plays a note instead of resetting the zoom.
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
- The owner sittings run by the agent
  ([report](phase-11-owner-sittings-2026-10-20.md)) passed:
  - in a packaged Linux profile: the capstone, the main-menu video, a pack install, and
    a still-image fallback with all eight menu cards working when the video is missing
  - every Settings tab at real zoom in Chrome and the packaged app, and at 150 and 200 %
    in Edge and Firefox
  - upload-picker cancel, confirmation Escape and overlay focus containment in Edge and
    Firefox
  - the OS reduced-motion setting reaching Chrome and the packaged app at startup
  - a scripted MIDI device: held notes released within 1 ms of unplug, replug without a
    restart, pause and resume, and a non-4/4 loop on both runtimes
  - MuseScore in the image: parallel uploads, restart survival, converted meter maps and
    crafted-archive containment
- The agent proofs of 2026-10-21 passed for the rest of the owed proof
  ([report](phase-11-agent-proofs-2026-10-21.md)):
  - unplayable legacy rows stay unplayable and return 404 on both runtimes (PH-PAR-003)
  - a forced load failure shows Retry and Main Menu in Edge, Firefox and Chromium, 78 of
    78 checks each (PH-ARCH-001)
  - a failed setting write is reported as session-only and reads back in Electron, 19 of
    19 checks for two injection methods (PH-ARCH-002)
  - a fingering saved in five views stays on its own note and survives a backup round
    trip, 24 of 24 checks (PH-MUS-003)
  - delete, bulk delete and restore roll back byte-identically when a file step fails
    (PH-DATA-001, the part that holds)
- The AppBridge contract is unchanged since Phase 10 (69 methods). The `hono` advisories
  are unreachable, and the tests behave the same on Node 22 and 24. The `Dockerfile`
  pins the MuseScore download by SHA-256 and fails closed on a mismatch.

## Runtime, Recovery, And Hardware Proof

- Electron: Linux x64, Electron 30.5.1, isolated `$TMPDIR` profiles. The headless `out/`
  run covered startup, first-run setup, all main-menu destinations, IPC, relaunch and
  SIGKILL relaunch, and the keyboard walk (RT-008 desktop half). Sitting 1 added a
  packaged Linux build on Xvfb with `xfwm4` and real X input: real zoom, the OS
  reduced-motion setting, minimise and restore, and the missing-video fallback. Not
  covered: Windows (sitting 2).
- Desktop web: headless Chromium 141 for lanes E and F on isolated data directories;
  real Chrome 151 (sitting 1), Edge 155 and Firefox 142 (sitting 3). Edge's own browser
  zoom was not driven.
- Backup/restore: verified on both runtimes, including tampered and garbage inputs and
  cancel paths, and a backup round trip into a fresh profile keeps fingerings
  (PH-MUS-003). The PH-DATA-001 forced filesystem failure ran on 2026-10-21 and failed:
  rollback holds, the error wording and the reset retry do not (reopened at P2).
- Reset/recovery: reset with and without an installed pack, relaunch to the setup guide,
  and SIGKILL recovery all passed. On 2026-10-21 reset removed packs on both runtimes
  (PH-DATA-002 verified); a reset that fails after the database commit is not rolled back
  (PH-DATA-001). The legacy rename's interrupted states were probed
  (PH-DATA-006). A real pre-rename profile update is sitting 2 (PH-DATA-005).
- Packaging: the audit built a packaged Linux app in a throwaway copy for sitting 1;
  the capstone, the menu video and a pack install pass there. PH-PAR-001 still owes the
  asset assertion wired into `package:*` and a Windows package.
- MIDI/audio hardware: audio was recorded from a PulseAudio null sink and measured
  (sitting 1 items 5 to 7). MIDI was a scripted Web MIDI device on both runtimes
  (sitting 4). A physical keyboard and listening on speakers are still owed.
- Desktop UI/zoom/DPI/accessibility: keyboard walks on Chromium, Electron, Edge and
  Firefox; real zoom in Chrome and the packaged app; the OS reduced-motion setting via
  GTK and XSETTINGS on X11; computed contrast. GNOME's own switch, a screen-reader pass
  and a colour-vision review are still owed.

## Accepted Risks And Evidence Gaps

One finding was accepted as a risk after consolidation: [PH-OPS-004](findings/PH-OPS-004.md)
(owner decision 2). Its rationale and revisit trigger are in the finding.

| Item | Rationale | Owner | Revisit trigger |
|---|---|---|---|
| OP-017, MOD-013 residual | Closed 2026-10-21. The crafted scores did not reach the MuseScore limits, so the agent fired each one through real `.mscz` uploads against `dist/server` with fake converters: the 45 s timeout at 45.1 s, the 30 s CPU limit at 30.1 s and the 10 MB output limit (SIGXFSZ at 10,485,760 bytes). Each gave the clean "Unable to convert" error, left no child or temp directory and kept the server serving. Open notes, not findings: the timeout kills only the direct child, so a forking converter would leave a worker (the image runs `mscore4portable` from the extracted AppImage, which probably does not fork; unchecked), and a converter that hides SIGXFSZ and exits 0 leaves exactly 10 MiB, which passes the size check and shows a raw error ([agent proofs](phase-11-agent-proofs-2026-10-21.md#op-017-musescore-limits)) | Claude Code (acting) | When the converter or the Docker image's MuseScore changes |
| PH-OPS-002 on the live host | Sitting 0 item 4 found `/api/*` open. The owner's phone on mobile data also got the app with no login (A1, 2026-10-20), so anyone who knows the hostname can reach the library. P0 stands until the fix is deployed. Slice 2 merged to `main` on 2026-10-21 (`4b72c98`) and the finding is `fixed`; the live host runs the old build until the owner deploys with the token | Owner (production) | Now: deploy with `LUMAKEYS_WEB_ACCESS_TOKEN` set, then repeat A1 |
| PH-OPS-004 | Accepted risk: the database blobs in history hold no personal data, and a rewrite would break every clone for no privacy gain | Owner, decision 2 (taken 2026-10-20) | A database blob in history is found to hold personal data, or history is rewritten for another reason |
| RT-010, PH-MUS-014, PH-MUS-015, GNOME switch, CPU on real hardware | Listening on speakers, a colour-vision review, GNOME's own reduced-motion switch and system-monitor numbers need this machine's desktop and a person | Owner, user tests B | After slices 6, 11, 16 and 18, and before release |
| PH-DATA-005 Windows half | A real `%APPDATA%\luma-keys` profile update. Slice 1 merged on 2026-10-21 (`9e249ae`); the check needs a new Windows build from `main` at `ed40fa6` or later | Owner, sitting 2 | After the new Windows build |
| RT-006 residual | Edge's own browser zoom (Edge was checked with emulated zoom) | Owner, user tests D1 (optional) | After slice 11 |
| RT-011, PH-MUS-001, PH-MUS-002, PH-MUS-004 | A physical MIDI keyboard: driver, OS path, Chrome's permission prompt, latency feel and a musician's check of loop labels | Owner, user tests C | After slices 4 and 5 |
| 17 fixed findings not yet `verified` (7 at consolidation) | Each one's owed proof is listed in the [remediation plan](phase-11-remediation-plan-2026-10-20.md#proof-owed-by-fixed-findings). Four of the earlier 12 were verified on 2026-10-21 and PH-DATA-001 was reopened. Slice 0 then verified PH-ARCH-001, and slices 2, 0 and 18 added PH-OPS-002, PH-SEC-002, PH-SEC-003, PH-OPS-005 and PH-MUS-014 as `fixed` (2026-10-21). Slices 1, 15 and 3 then added PH-DATA-005, PH-DATA-006, PH-OPS-006, PH-DATA-004, PH-DATA-007, PH-OPS-003 and PH-SEC-005 as `fixed` (2026-10-21), and PH-DATA-007 then moved to `verified` after its headless Electron run | Claude Code (acting) and owner sittings | When the named sitting, deploy or GitHub run happens |
| `CLAUDE.md` and `AGENTS.md` | Closed 2026-10-21. Decision 3 keeps them gitignored. Task D1 moved the architecture and runtime content the audit cites into tracked documents (`CONTEXT.md`, ADR 0002) and repointed the citations, so a fresh clone has what the audit relies on. Merged to `main` in `44024d0` after a documentation review. The facts in `CONTEXT.md` change with the slices that change them | Claude Code (acting), task D1 | When a slice changes a cited runtime fact (the slice updates `CONTEXT.md`) |

## Remediation Roadmap

The [Phase 11 remediation plan](phase-11-remediation-plan-2026-10-20.md) maps all 51
accepted findings to 21 vertical slices. They are listed here in risk order. Since the
sittings, wave 1 runs slice 2 first, then 0, then 18, then 1 with 15, then 3; the owner
added slice 18 to wave 1 on 2026-10-21 (decision 5). Slices 19 and 20, added on
2026-10-21, are in wave 2.

| Slice | Findings | Outcome |
|---:|---|---|
| 0 | PH-OPS-005 | CI runs typecheck, tests, build and the asset assertion, and pays the re-verification proof debt |
| 1 | PH-DATA-005, PH-DATA-006, PH-OPS-006 | Desktop update keeps the library; startup failures are visible |
| 2 | PH-OPS-002, PH-SEC-002, PH-SEC-003 | The web API requires access; the token stays out of URLs; HTML carries a CSP and security headers |
| 3 | PH-OPS-003, PH-SEC-005 | Supported Electron; remote links open in the system browser |
| 4 | PH-MUS-005, PH-MUS-012, PH-MUS-016, PH-UI-019 | Notes count only when they should; Ctrl shortcuts reach the browser |
| 5 | PH-MUS-010, PH-MUS-011 | MIDI device changes neither restart the song nor silently filter input |
| 6 | PH-PAR-006, PH-MUS-007, PH-MUS-015 | Installed web packs play; WAV export has sound; desktop packs release naturally |
| 7 | PH-PAR-007 | The web app loads without answering the MIDI prompt |
| 8 | PH-UI-006, PH-DATA-010 | Song deletion asks first; the reset dialog names everything it removes |
| 9 | PH-MUS-006, PH-MUS-008 | Metronome and late first-tempo timing are correct |
| 10 | PH-UI-010, PH-UI-013, PH-UI-017, PH-UI-020 | Dialogs own focus and Escape; the load-error panel takes focus |
| 11 | PH-UI-011, PH-UI-012, PH-UI-014 | Navigation focus is visible and the HUD fits at 150 to 200 % |
| 12 | PH-MUS-013, PH-UI-018, PH-DATA-009 | Capstones measure timing; drill results and save failures are shown |
| 13 | PH-PAR-004, PH-UI-009, PH-ARCH-004, PH-SEC-004 | Import outcomes are accurate and cheap |
| 14 | PH-DATA-008, PH-ARCH-003 | Settings values survive reload with their declared type |
| 15 | PH-DATA-004, PH-DATA-007 | Browser stores renamed in August are carried over |
| 16 | PH-UI-015, PH-UI-016 | Colour-blind palette and grade contrast are legible |
| 17 | PH-UI-005, PH-UI-007, PH-UI-008, PH-MUS-009, PH-PAR-005 | Small independent fixes |
| 18 | PH-MUS-014 | A fresh profile plays at the volumes Settings shows |
| 19 | PH-DATA-001 | Delete and restore failures name the retry; a reset retry does not report success while old files remain; a locked leftover does not stop startup |
| 20 | PH-MUS-017 | Changing a track assignment keeps saved fingerings |

## Sign-Off

- Lane owners: Claude Code (acting) for lanes A to H. Evidence is in the lane reports
  above.
- Challengers: Claude Code (acting) consolidation challenge, 2026-10-20, recorded in
  each finding's Challenge Record. No independent human challenger was available, so P0
  and P1 remediation still needs a verifier other than the implementer where one exists.
- Audit lead: Claude Code (acting). The Phase 11 step 6 gate was signed on 2026-10-20 for
  agent evidence, and updated the same day after the agent ran sittings 0, 1, 3 and 4.
  RT-010 and RT-011 stay blocked until the owner's checks.
- Repository owner: decisions 1 to 4 in the
  [user test batch](phase-11-user-tests.md#owner-decisions-not-tests) are taken, the
  last three on 2026-10-20. Remediation has not started and waits for the owner's
  go-ahead. Final sign-off waits for the owner's remaining checks in the
  [user test batch](phase-11-user-tests.md) (sections A to E). No release is inferred
  from this report.
