# Phase 11 Remediation Plan

- Baseline identity: `main` at `4466626bb175738ba95176131ffc77a01b3911d1` ([baseline](baseline-2026-10-19.md))
- Planning date: 2026-10-20
- Audit lead: Claude Code (acting)
- Input: the 42 accepted Phase 11 findings in [the findings ledger](../findings-ledger.md)
  and [the Phase 11 consolidation](consolidation-2026-10-20.md); 47 after the
  [sittings run by the agent](phase-11-owner-sittings-2026-10-20.md) on 2026-10-20; 51
  after the [agent proofs](phase-11-agent-proofs-2026-10-21.md) on 2026-10-21
- Scope: planning only. No product code, finding status, severity or coverage
  disposition changed. Owner decisions 2 to 4 were recorded on 2026-10-20 (see
  [Owner Selection](#owner-selection-2026-10-20)).
- Updated 2026-10-20 after the sittings: PH-OPS-002 is accepted at P0 and joins slice 2,
  which moves to the front of wave 1 under decision 4's gate. Four new findings are
  placed: PH-MUS-016 and PH-UI-019 in slice 4, PH-MUS-015 in slice 6, and PH-MUS-014 (P1)
  in a new slice 18 proposed for wave 1. The new placements and slice 18's wave wait for
  the owner.
- Updated 2026-10-21 after the agent proofs: PH-DATA-001 was reopened at P2 and is
  accepted again in new slice 19 "Destructive-operation failures", wave 2. Three new
  findings are placed: PH-MUS-017 (P2) in new slice 20 "Fingering preservation", wave 2,
  PH-DATA-010 (P3) in slice 8, and PH-UI-020 (P3) in slice 10. Four fixed findings
  (PH-PAR-003, PH-ARCH-002, PH-MUS-003, PH-DATA-002) are now `verified` and leave the
  proof-owed table.
- Updated 2026-10-21, owner decision 5: slice 18 (PH-MUS-014) joins wave 1, after
  slice 0.
- Updated 2026-10-21 after the wave 1 start: see [Remediation Progress](#remediation-progress-2026-10-21).
- Updated 2026-10-21 after the rest of wave 1 merged: see [Remediation Progress](#remediation-progress-2026-10-21); PH-UI-021 is new and unplaced.

## Stage Decision

All 51 accepted findings are assigned to one of 21 vertical slices. A slice holds more
than one finding only when the findings share an owning module and the same proof
session. Findings with different root causes keep their own regression tests inside the
slice and are verified one by one. Slice 17 is the exception: five unrelated one-file
fixes, kept together only to save review overhead. Each can ship on its own.

[PH-OPS-002](findings/PH-OPS-002.md) joined slice 2 on 2026-10-20, when sitting 0 item 4
found the deployed `/api/*` answering with no login. One finding is not planned:

- [PH-OPS-004](findings/PH-OPS-004.md) is `accepted-risk` under owner decision 2
  (2026-10-20): the database blobs in history hold no personal data, and history is not
  rewritten.

Owner decision 4 (2026-10-20) accepted each slice's proposed branch and assigned every
slice; see [Owner Selection](#owner-selection-2026-10-20). P1 slices need a verifier
other than the implementer where one is available.

## Execution Order

| Order | Slice | Findings | Severity | Dependency |
|---:|---|---|---|---|
| 0 | CI and proof debt | PH-OPS-005 | P3 | none; first, so every later slice runs under it |
| 1 | Desktop startup migration | PH-DATA-005, PH-DATA-006, PH-OPS-006 | P1, P3, P2 | none; release blocker for a desktop update |
| 2 | Web access | PH-OPS-002, PH-SEC-002, PH-SEC-003 | P0, P2, P3 | none; first in wave 1 since the gate tripped |
| 3 | Electron upgrade and window-open guard | PH-OPS-003, PH-SEC-005 | P2, P3 | merge after slice 1 (both edit `src/main/index.ts`) |
| 4 | Practice input integrity | PH-MUS-005, PH-MUS-012, PH-MUS-016, PH-UI-019 | P2, P3, P3, P3 | none |
| 5 | MIDI device lifecycle | PH-MUS-010, PH-MUS-011 | P2, P2 | none |
| 6 | Audio output | PH-PAR-006, PH-MUS-007, PH-MUS-015 | P2, P2, P3 | none |
| 7 | Web startup without MIDI permission | PH-PAR-007 | P2 | after slice 5 if both edit the MIDI startup in `App.tsx` |
| 8 | Delete confirmation | PH-UI-006, PH-DATA-010 | P2, P3 | none |
| 9 | Timing | PH-MUS-006, PH-MUS-008 | P2, P3 | none |
| 10 | Dialogs and Escape | PH-UI-010, PH-UI-013, PH-UI-017, PH-UI-020 | P2, P3, P3, P3 | none |
| 11 | Navigation focus and HUD zoom | PH-UI-011, PH-UI-012, PH-UI-014 | P2, P2, P3 | none |
| 12 | Learning flow | PH-MUS-013, PH-UI-018, PH-DATA-009 | P3, P3, P3 | after slice 4 (capstone accuracy depends on its judging rule) |
| 13 | Import outcomes | PH-PAR-004, PH-UI-009, PH-ARCH-004, PH-SEC-004 | P3 | none |
| 14 | Settings values | PH-DATA-008, PH-ARCH-003 | P3 | none |
| 15 | Browser rename carry-over | PH-DATA-004, PH-DATA-007 | P3 | ships in the same release as slice 1 (owner decision 3) |
| 16 | Colour | PH-UI-015, PH-UI-016 | P3 | none |
| 17 | Small independent fixes | PH-UI-005, PH-UI-007, PH-UI-008, PH-MUS-009, PH-PAR-005 | P3 | none |
| 18 | Fresh-profile audio defaults | PH-MUS-014 | P1 | none; wave 1 after slice 0 (owner decision 5) |
| 19 | Destructive-operation failures | PH-DATA-001 | P2 | after slice 1 if both edit the desktop startup recovery in `src/main/index.ts` |
| 20 | Fingering preservation | PH-MUS-017 | P2 | none |
| 21 | ADR 0002 window items | none (ADR 0002 items 3, 4, 6 and 7) | n/a | none; must ship in a release before `0.3.0` (owner decision 8) |

Order is by user risk: data loss on update first, then the open web surface, then the
shipped runtime, then practice correctness, then access and polish. P2 slices without a
dependency can run in parallel once slice 0 is merged. The table sets merge and
verification order. It does not require one long-lived branch.

## Owner Selection, 2026-10-20

Owner decision 4 accepted the agent's recommendation. Nothing has started: each wave
starts only when the owner says so.

| Wave | Slices | Goal | Starts |
|---|---|---|---|
| Gate | sitting 0 item 4 | Settle PH-OPS-002. If the deployed `/api/*` is open, slice 2 moves to the front of wave 1. **Tripped 2026-10-20**: the live host answered `/` and `/api/*` with no login (from this host's own address; the owner's phone on mobile data confirmed it the same day, user tests A1) | done |
| 1: carry-over release (proposed `0.2.0`) | 2, then 0, then 18, then 1 with 15, then 3; task D1 alongside | Close the open web surface, then CI, then audible volumes on a fresh profile, then the desktop and browser carry-over a safe desktop update needs, then a supported Electron. Slice 18 joined under owner decision 5 (2026-10-21) | started 2026-10-21 on the owner's go-ahead; see [Remediation Progress](#remediation-progress-2026-10-21). `0.2.0` cut 2026-11-02 at `1180731` (owner decision 13): version bump `6ef1ec1`, branch `release/0.2`. The release gate below still holds before the `v0.2.0` tag |
| 2 | 4, 5, 6, 7, 8, 9, 10, 11, 19, 20, 21, then 12 after 4 | P2 practice correctness, the capstone change from decision 1, the reopened destructive-operation failures and the fingering loss found by the agent proofs, and the ADR 0002 window items (slice 21, owner decision 14) | started 2026-11-02 on the owner's go-ahead (decision 12); slice 0 was merged |
| 3 (was Deferred) | 13, 14, 16, 17 | P3 polish, plus a triage of the open `npm audit` advisories | started 2026-11-02 on the owner's go-ahead (decision 15); branches from `cc40b63`. Decision 16 adds PH-DATA-003's song title to slice 13 and a BPM investigation. Triage done 2026-11-02: [npm-audit-triage-2026-11-02.md](npm-audit-triage-2026-11-02.md), 59 flagged packages, all build or test tooling, `--omit=dev` clean |

The dependencies in the execution order still hold: slice 3 merges after slice 1, and
slice 7 after slice 5 when both edit the MIDI startup in `App.tsx`.

- Implementation owner: Claude Code (acting) for every slice and for task D1.
- Branches: the proposed branch in each slice, each in its own worktree. Slices 1 and 15
  keep separate branches and ship in the same release.
- Verifier: a separate review agent session in the slice's named reviewer role, never
  the implementing session. For slice 1 the owner is the second verifier, through the
  Linux and Windows profile checks in sittings 1 and 2.
- Release gate for wave 1: slices 1 and 15 verified in both runtimes, as lane H's draft
  ADR requires of the carry-over release.
- Slice 2 runs before slice 0 because the deployed host is open now. Its tests run under
  the existing `npm run verify`; slice 0's CI then covers every later slice. The
  immediate mitigation (Cloudflare Access or `LUMAKEYS_WEB_ACCESS_TOKEN` on the running
  container) is the owner's and does not wait for the slice.

Task D1 (documentation from owner decision 3; not a finding). **Done 2026-10-21**:
branch `remediation/p11-docs-governance`, documentation review passed, merged to `main`
in `64a8160` (ADR 0002, `CONTEXT.md`, and the audit's citations):

- Turn lane H's [draft ADR](phase-11-lane-h-documentation-2026-10-19.md) for the rename
  into a new ADR in `docs/adr/`, with the removal floor set to 2027-01-31.
- `CLAUDE.md` and `AGENTS.md` stay gitignored. Move the architecture and runtime content
  the audit cites into tracked documents (`CONTEXT.md` or ADR 0001), correct lane H's
  stale statements on the way, and point the audit's citations there.
- Proposed branch: `remediation/p11-docs-governance`. Verifier: documentation reviewer.

## Remediation Progress, 2026-10-21

- The owner gave the go-ahead for wave 1 on 2026-10-21. All of wave 1's code is now on
  `main` (at `a84acb0`): slices 2, 0, 18, 1, 15 and 3, the slice 0 follow-up, and task D1.
  The three follow-ups the owner then chose (decisions 6, 7 and 11) are merged too, at
  `93ac583`.
  Owner proofs remain; they are in the Proof Owed table below and in the
  [user tests](phase-11-user-tests.md).
- Merged to `main`, each after an independent review:

  | Merge | Work | Findings | State after the merge |
  |---|---|---|---|
  | `ed07ce2` | Slice 2, web access | PH-OPS-002, PH-SEC-002, PH-SEC-003 | `fixed`; owner deploy and live checks owed (user tests A1) |
  | `d49b8a6` | Slice 0, CI and proof debt | PH-OPS-005; proof debt for PH-MUS-002, PH-PAR-001, PH-UI-003, PH-ARCH-001 | PH-OPS-005 `fixed` (GitHub runs owed); PH-ARCH-001 `verified`; the other three stay `fixed` |
  | `db86adc` | Slice 18, fresh-profile audio | PH-MUS-014 | `fixed`; the PulseAudio drivers and user tests B1 owed |
  | `64a8160` | Task D1, documentation | none | done |
  | `a7517ae` | Slice 0 follow-up (`0962217`) | PH-OPS-005 (CI reliability) | A `TheoryHubScreen.test.tsx` race that failed one in three full `verify` runs, found in the slice 3 review. With the mock delayed 30 ms the old assertions fail every time and the new ones pass; 15 of 15 runs pass |
  | `c95586b` | Slice 1, desktop migration | PH-DATA-005, PH-DATA-006, PH-OPS-006 | `fixed`. The first review gave REPAIR NEEDED (blocker: an orphan WAL could overwrite the current library with no backup); the re-review passed after repairs, and a follow-up fixed three small items. Packaged run with the real lock, real-display dialogs and Windows owed |
  | `8d73767` | Slice 15, browser rename carry-over | PH-DATA-004, PH-DATA-007 | PH-DATA-004 `fixed`, optional pack profile (B6) owed; PH-DATA-007 `verified` after the headless Electron run. Held until slice 1 merged, as the two ship together. Review passed after repairs |
  | `a84acb0` | Slice 3, Electron upgrade and window-open guard | PH-OPS-003, PH-SEC-005 | `fixed`. Electron 30.5.1 to 44.9.2 and better-sqlite3 12.8.0 to 13.0.3 (N-API). The review passed; a follow-up added a file-host check, passes the normalised URL to `openExternal`, tightened the test and documented the install-time node-gyp step. Merge check: a clean `npm ci` on Node 22.23.3 with the workflow's variables, then `npm run verify`, exits 0 (73 files, 471 tests, asset inventory 647). Real-display and Windows checks owed |
  | `8a0a764` | Follow-up f1, lead-in beats (owner decision 6) | PH-MUS-018 | `verified`. A missing or blank `leadInBeats` setting keeps the default of 2; a saved `0` stays 0. Two `App` tests; the reviewer reproduced the failure before the fix; the post-merge desktop and web runs below passed |
  | `d5507a6` | Follow-up f2, desktop file dialogs (owner decision 7) | PH-UI-021 | `fixed`. `src/main/dialogDefaults.ts` remembers the last folder per dialog kind until the app closes, wired into the 11 dialog calls in `src/main/index.ts`; 15 tests, and all 7 of the reviewer's mutations were caught. Real-display checks owed (B15, sitting 2 item 4) |
  | `93ac583` | Follow-up f3, slices 2 and 3 (owner decision 11) | PH-SEC-006; leads (a), (b), (f), (k) | PH-SEC-006 `fixed`: the cookie gets `Secure` behind a proxy that reports https. hono 4.13.13, `engines.node` `>=22.14.0`, the dead native rebuild path removed. `npm run verify` passed on Node 22.23.3 and 24.15.0; a test image passed the container checks. Redeploy and A2 owed |
  | `c7216e2` | Slice 6, audio output (merged 2026-11-02) | PH-PAR-006, PH-MUS-007, PH-MUS-015 | `fixed`; independently reviewed. `sitting1-audio-desktop.mjs` item 6 (needs PulseAudio; the lead runs it) and owner sitting 1 items 5 and 6 on speakers owed |
  | `ea89f3e` | Slice 4, practice input integrity (merged 2026-11-02) | PH-MUS-005, PH-MUS-012, PH-MUS-016, PH-UI-019 | `fixed`; independently reviewed. The Electron and web drivers (`paused-input.mjs`, `workflows.mjs`, `sitting1-visual-desktop.mjs` and `-chrome.mjs` for Ctrl+0, `pause-resume-focus.mjs`, `sitting4-midi-web.mjs` and `-desktop.mjs` item 7 with `seamMs = -15`, the Scale Practice 8-of-8 check) are run by the lead; owner sitting 4 item 4 and a Learn-mode loop on a MIDI keyboard owed |
  | `6f327c9` | Slice 9, timing (merged 2026-11-02) | PH-MUS-006, PH-MUS-008 | `fixed`; independently reviewed. The browser metronome driver rerun after `1a77e90` (lead) owed; owner sitting 1 item 7 by ear is optional; stored songs keep their old BPM until re-imported |
  | `ccc68c2` | Slice 5, MIDI device lifecycle (merged 2026-11-02) | PH-MUS-010, PH-MUS-011 | `fixed`; independently reviewed. The Electron run of the game path and the Settings MIDI card (lead) owed; owner sitting 4 item 3 (including listening that song audio keeps playing after an unplug) and item 6 owed |
  | `c03f220` | Slice 20, fingering preservation (merged 2026-11-02) | PH-MUS-017 | `fixed`; independently reviewed. The web-bridge Ignore to Left Hand sequence in headless Chromium (lead) owed; the Electron `proof-mus-003.mjs` already passes 27/27 |
  | `c8f9b1a` | Slice 19, destructive-operation failures (merged 2026-11-02) | PH-DATA-001 | `fixed` (reopened to `accepted` on 2026-10-21); independently reviewed. A real unwritable profile on Windows and macOS (owner) owed; the web 31/31 and Electron 40/40 integrity drivers ran on the branch build |
  | `8fc933f` | Slice 7, web startup without MIDI permission (merged 2026-11-02) | PH-PAR-007 | `fixed`; independently reviewed. The owner fresh-Chrome check with the prompt left unanswered for 30 s (sitting 1 item 8) owed |
  | `cb8926e` | Slice 21, ADR 0002 window items 3, 4, 6 and 7 (merged 2026-11-02) | none (ADR 0002 items) | Independently reviewed; no finding changes status. The Electron userdata probe rerun on a main build at `d393474` passed on 2026-11-02 (`--harness`, exit 0: the startup line "LumaKeys data directory: …/.config/lumakeys (legacy: yes\|no)"; legacy profiles E1 to E3, P1, P4 report yes, E4, E5 no; E6 and P2 exit 1 with the could-not-start dialog and nothing moved) |
  | `571571b` | Slice 12, learning flow (merged 2026-11-02) | PH-MUS-013, PH-UI-018, PH-DATA-009 | `fixed`; independently reviewed. The Electron learning driver run (lead) and owner sitting 1 capstone on a real MIDI keyboard owed |
  | `c1a1fbf` | Slice 8, delete confirmation (merged 2026-11-02) | PH-UI-006, PH-DATA-010 | `fixed`; independently reviewed. The `library-one-hand.mjs` A2/A3 rerun after its `toLibrary` change (lead) and the owner keyboard-only and screen-reader read of the delete prompt and the new Delete User Data wording owed |
  | `1b95e9a` | Slice 11, navigation focus and HUD zoom (merged 2026-11-02) | PH-UI-011, PH-UI-012, PH-UI-014 | `fixed`; independently reviewed. The Electron `keyboard-walk.mjs` parts (a) and (d) (lead), owner approval of the boxed top-bar look, owner real-zoom sittings 1 and 3 in Edge and Firefox, and a screen-reader pass owed |
  | `e1a3bf0` | Slice 10, dialogs and Escape (merged 2026-11-02) | PH-UI-010, PH-UI-013, PH-UI-017, PH-UI-020 | `fixed`; independently reviewed. The Electron `keyboard-walk.mjs` parts (b), (c) and (e) (lead) and owner sitting 3 item 3 in Edge and Firefox owed |
  | `fde3104` | Slice 23, lockfile and npm audit triage (merged 2026-11-02) | none | done; owner decision 16 |
  | `05dd7aa` | Slice 14, settings and key remap (merged 2026-11-02) | PH-DATA-008, PH-ARCH-003 | `fixed`; independently reviewed. The lead's web `keyboard-remap-persistence.mjs` and Electron `workflows.mjs` (settings "off") reruns passed on a main build at `c170bc3` on 2026-11-02 |
  | `2d6593d` | Slice 16, colour states (merged 2026-11-02) | PH-UI-015, PH-UI-016 | `fixed`; independently reviewed. The lead's `color-state-evidence.mjs` rerun with the `short-4-notes` fixture and the `grade-badge-contrast.mjs` rerun passed on a main build at `c170bc3` on 2026-11-02; the owner colour-vision sitting (sitting 1 item 10) and the Electron results-screen screenshot owed |
  | `5e1e67f` | Slice 13, import and restore (merged 2026-11-02) | PH-PAR-004, PH-UI-009, PH-ARCH-004, PH-SEC-004; follow-up to PH-DATA-003 | `fixed`; independently reviewed. The lead's `mscz-upload-no-musescore.mjs` and WF-004 (web and Electron) reruns passed on a main build at `c170bc3` on 2026-11-02; owed from the owner a parallel `.mscz` upload in Docker and the tampered-backup restore message in the UI |
  | `5336959` | Slice 24, web reattach (merged 2026-11-02) | PH-PAR-008 (new) | `fixed`; independently reviewed. The lead's web reattach driver run passed on a main build at `c170bc3` on 2026-11-02 (the client requested the Library snapshot after the reattach; the card itself was not checked visually) |
  | `750bb42` | Slice 17, library small fixes (merged 2026-11-02) | PH-UI-005, PH-UI-007, PH-UI-008, PH-MUS-009, PH-PAR-005 | `fixed`; independently reviewed. The lead's web `library-date-filter-timezone.mjs` and `library-organize-bulk.mjs` reruns (and the PH-PAR-005 and PH-MUS-009 drivers) passed on a main build at `c170bc3` on 2026-11-02; owed from the owner a PH-UI-008 keyboard and screen-reader pass and a PH-UI-005 desktop trouble spot |
  | `c170bc3` | Slice 22, beats per minute (merged 2026-11-02) | PH-MUS-019 (new); PH-MUS-008 doc follow-up | `fixed`; independently reviewed. No count-in driver exists (not run); the owner ear check of the count-in on a fast song and a 6/8 song owed |
  | `35063cb` | Slice 25, flex rows (merged 2026-11-03) | PH-UI-022 (new) | `fixed`; independently reviewed (PASS WITH NOTES; the note fixed in `ad223e4`). `f84d7fc` restores `display: flex` on the shared row containers and adds `src/renderer/stylesLayout.test.ts` (failed 8 of 10 before the fix); `ad223e4` stacks the soundboard popout headings. `npm run verify` passed (739 tests); Playwright before and after screenshots of the web build at 1280x800 and 420x800 in `/tmp/claude-1000/pw/s25/`. Not reached: the paused in-game control bar. The owner glance at the Library and recommendation cards in their own install and the Electron build owed |

- The owner ran `npm ci` in the main checkout on 2026-10-21, so its `node_modules` now holds
  Electron 44.9.2 and better-sqlite3 13.0.3 (user tests G1, pass). Since better-sqlite3 13,
  `npm ci` runs node-gyp at install, which needs Python, `make`, a C++ compiler and access to
  nodejs.org (see `BUILD_PORTABLE.md`).
- The owner redeployed the web app from the main checkout the same day. The agent's check of
  that image in throwaway containers passed, apart from lead (j) below (user tests
  section A); the live checks A1 to A3 are the owner's.
- Post-merge Electron 44 proofs (audit lead, 2026-10-21). A separate agent re-ran these on a
  clean copy of `a84acb0` (its own `npm ci` on Node 22.23.3, Electron 44.9.2,
  better-sqlite3 13.0.3), one Electron process at a time, all on throwaway profiles. Every
  result matches the pre-merge slice results:
  - `electron-userdata-probe.mjs --harness-only`, exit 0:
    - P1: `luma-keys` carried into `lumakeys/lumakeys.db` (1 song, 2 theory results).
    - P2: exit 1, one "LumaKeys could not start" dialog, both `pianohero.db` files unmoved,
      no renderer.
    - P3: the JSON song migrated.
    - P4: the empty current database backed up to `before-legacy-migration-*`, the earlier
      one opened.
  - `electron/window-open.mjs`: four PASS lines, `ERRORS []`.
  - `electron/workflows.mjs` and `electron/backup-reset-restore.mjs`: exit 0, `ERRORS []`,
    `integrity_check` ok.
  - `electron/sample-pack.mjs`: exit 0. The pack address is derived from the current profile
    (`…/.config/lumakeys/instrument-sample-packs/flute/`); only the known removal-path errors
    appear.
  - `browser/legacy-sample-packs.mjs` (slice 15) against the built web server: exit 0, all
    five cases as expected.
  - `npm run package:local` built `dist/LumaKeys-0.1.0.AppImage` (SHA-256 `bc06be42…4193e2`)
    and `dist/linux-unpacked`. The packaged binary aborts in the sandbox on the
    single-instance lock (`process_singleton_posix.cc: socket() failed: Operation not
    permitted`), so its window is owed (user tests G2, B7). Run as Node it reports
    Electron 44.9.2 and opens and writes a database through the unpacked better-sqlite3.
  - The owner's Linux build for group B is that package, in
    `/tmp/claude-1000/p11-owner-build`.
- Post-merge proofs at `93ac583` (audit lead, 2026-10-21), after the three follow-ups. A
  separate agent made a clean copy (`git archive`, `npm ci` on Node 22.23.3), all runs on
  throwaway profiles, one Electron process at a time. Evidence in
  `/tmp/claude-1000/p11-pm2/ev/`:
  - `npm run verify` exits 0: 74 test files passed and 1 skipped, 495 tests passed and
    1 skipped, both typechecks, both builds, asset inventory 647. Installed: hono 4.13.13,
    @hono/node-server 2.1.5, Electron 44.9.2, better-sqlite3 13.0.3.
  - The Electron 44 repeats match the `a84acb0` results: `electron-userdata-probe.mjs
    --harness-only` (P1 to P4), `window-open.mjs` (four PASS lines), `workflows.mjs` and
    `backup-reset-restore.mjs` (exit 0, `ERRORS []`, `integrity_check` ok). Only the timed
    Learn and Play scores differ, which is headless key-timing jitter.
  - PH-UI-021: `scripts/audit/electron/dialog-defaults.mjs` passes all 19 checks; a build of
    `8a0a764` fails the 9 second-use checks (see the finding).
  - PH-MUS-018: `scripts/audit/electron/leadin.mjs` and `scripts/audit/browser/leadin-web.mjs`
    time the count-in at about 4000 ms on a fresh profile and 3000 ms after saving None, in
    the desktop and the web build; a build of `6b57537` (before the fix) gives 3000 ms on a
    fresh profile. It moved to `verified`.
  - `npm run build:web` and `npm run package:local` built `dist/LumaKeys-0.1.0.AppImage`
    (SHA-256 `42b7a5f2…16a30`). The packaged window again aborts on the single-instance lock
    in the sandbox (G2, B7). The owner's copy is `/tmp/claude-1000/p11-owner-build-2`; its web
    server answered `GET /` and the bridge with 200.
  - Windows: the audit lead cross-built `LumaKeys-0.1.0-portable.exe` from a second clean
    copy of `93ac583` (SHA-256 `d27c97a5…ae0cfa70`, 179,720,909 bytes, path in user tests
    sitting 2). Only electron-builder ran outside the sandbox, as the owner allowed; it was
    built without wine, so it has no embedded version details.
  - Counts after these changes: 72 findings (13 verified, 19 fixed, 39 accepted,
    1 accepted-risk).
- A new finding from the slice 3 implementation and review:
  [PH-UI-021](findings/PH-UI-021.md) (P3, `reproduced` from the Electron 43 release notes
  and the code, not yet seen on a display): all 8 `showOpenDialog` calls in
  `src/main/index.ts`, including MIDI import, open in Downloads and forget the last
  folder, and the save dialogs pass a bare file name. It awaits the owner's decision on
  acceptance, design (in memory or persisted) and placement: a small follow-up to slice 3,
  or slice 14 "Settings values" if persisted.
- An earlier new finding, [PH-MUS-018](findings/PH-MUS-018.md) (P3, `reproduced`): on a
  fresh profile the lead-in beats load as 0 while Settings shows 2, so the count-in after
  the 3-2-1 countdown is lost. It was found during slice 18's review. It awaits the owner's
  decision on acceptance and placement. Proposed placement is slice 14 "Settings values"
  (deferred wave); it is a one-line fix plus one `App` test, so the owner may prefer to
  fold it into a wave 1 or wave 2 slice that edits the same effect in `App.tsx`.
- PH-DATA-007 moved to `verified` (audit lead, 2026-10-21): the headless Electron run of the
  preset carry-over passed on a profile an earlier `luma-keys` build wrote, with a control
  rebuild that lists no presets (see its Resolution).
- Counts after these changes: 71 findings (12 verified, 17 fixed, 39 accepted,
  2 reproduced, 1 accepted-risk). The planning record at the end of this document is
  unchanged.
- Owner decisions later on 2026-10-21 ([user tests](phase-11-user-tests.md) decisions 6,
  7, 10 and 11). PH-MUS-018 and PH-UI-021 are `accepted` and are fixed at once as wave 1
  follow-ups; PH-UI-021 remembers each dialog's folder until the app closes. A third
  follow-up takes leads (j) and (k), and (a), (b) and (f), with a redeploy after it; then
  the agent cross-builds a new Windows build. Lead (j) became
  [PH-SEC-006](findings/PH-SEC-006.md) (P3, `accepted`). Counts: 72 findings (12 verified,
  17 fixed, 42 accepted, 1 accepted-risk). The unpushed history was rewritten so that no commit
  records a personal author address; every hash in this document is the new one
  ([lookup table](commit-hash-rewrite-2026-10-21.md)).

### Leads From Wave 1 Reviews (Not Yet Findings)

Out-of-scope observations from the slice reviews. None has been reproduced as a finding;
the owner or the audit lead decides which become one.

- (a) Closed in `93ac583`: `npm run rebuild`, the `electron-rebuild` devDependency and both
  fallbacks in `scripts/ensure-native-module.cjs` are removed; a binary that does not load
  now stops the install with a message naming the fix. Was: they are dead with N-API
  better-sqlite3, and `electron-rebuild` 3.2.9 fails on Electron 44 (it cannot map the
  version to an ABI).
- (b) Closed in `93ac583`: `package.json` declares `engines.node` `>=22.14.0` (Node-API 10),
  and `BUILD_PORTABLE.md` names it. Was: no `engines` field, although better-sqlite3 13
  needs Node 22.14 or later in practice.
- (c) The packaged app carries all 8 better-sqlite3 prebuilds, about 16 MB.
- (d) `will-frame-navigate` and `will-redirect` are not guarded. Optional defence in depth
  beside the `will-navigate` handler in `src/main/windowGuard.ts`.
- (e) 24 of the 61 Soundboard credit links (`sourcePage` in
  `src/lib/audio/animalSoundboardManifest.json`) use `local://` and open nothing.
- (f) Closed in `93ac583`: the line is removed. Was: `Dockerfile:27` (`npm rebuild better-sqlite3`) is now a no-op. The [PH-OPS-003](findings/PH-OPS-003.md)
  Resolution infers (not traced in npm) that `npm rebuild` reads the package's real
  `package.json`, which declares no install script, and does nothing for it.
- (g) Since slice 2, an audit driver that starts the web server needs
  `LUMAKEYS_TRUST_UPSTREAM_AUTH=1` or an access token. These start it without either
  and need the variable (checked against `scripts/audit/` on `a84acb0`):
  `scripts/audit/browser/proof-data-common.mjs`,
  `scripts/audit/browser/proof-ph-arch-001-recovery.mjs`,
  `scripts/audit/browser/sitting1-audio-web.mjs`,
  `scripts/audit/legacy-brand-server-probe.mjs` (cases that set no token),
  `scripts/audit/proof-op017-musescore-limits.mjs`,
  `scripts/audit/proof-par003-unplayable-legacy.mjs`,
  `scripts/audit/electron-renderer-asset-probe.mjs`, and the two container checks
  `scripts/audit/musescore-measure-check.sh` and
  `scripts/audit/musescore-crafted-archive-check.sh`. `scripts/audit/browser/harness.mjs`
  and `csp-check.mjs` already set it.
- (h) From Electron 44, `scripts/audit/electron/keyboard-walk.mjs` shows Chromium focus
  changes: Escape returns focus to the trigger, and Free Play has 77 Tab stops instead of
  83. PH-UI findings reproduced on 30.5.1 must be judged against the web runtime, not
  closed by this upgrade.
- (i) A stray `pianohero.db-wal` of the same page size that is newer than `lumakeys.db`,
  in the data folder or in `PianoHero`, is still attached. The original is kept in
  `before-legacy-migration-*`, but only the console says so. Recorded in the residual risk
  of [PH-DATA-006](findings/PH-DATA-006.md).
- (j) Became [PH-SEC-006](findings/PH-SEC-006.md), fixed in `93ac583`. Was: the web access cookie never gets `Secure` behind the Cloudflare Tunnel.
  `setAccessCookie` in `src/server/webSecurity.ts` adds it only when
  `new URL(c.req.url).protocol` is `https:`, and the tunnel reaches the container over plain
  HTTP. Seen on 2026-10-21 in throwaway containers of the deployed image (`8c3a0bf9…`): no
  `Secure` with no header, with `X-Forwarded-Proto: https`, or with `Cf-Visitor`
  (evidence in [user tests](phase-11-user-tests.md) section A). `HttpOnly`,
  `SameSite=Strict` and `Path=/api` limit the exposure, but a browser still sends the cookie
  on a plain-HTTP request to `/api` that the user opens directly. A fix that cannot weaken
  anything: also add `Secure` when `X-Forwarded-Proto` is `https`, since a forged header
  only adds the flag. The live behaviour is the owner's check (user tests A2).
- (k) Closed in `93ac583`: `hono` ^4.13.13 and `@hono/node-server` ^2.1.5 (locked at those
  versions); `npm audit --omit=dev` finds no advisories, and OP-011's row is updated. Was:
  `npm ci` warns about advisories. `npm audit --omit=dev` finds only two shipped
  packages, `hono` 4.13.0 and `@hono/node-server` 2.1.0 (five moderate `hono` advisories);
  the rest are build and test tools (electron-builder, vite, vitest, jsdom, concurrently,
  electron-rebuild) that never run in the app or the server. Wave 1 lowered the full
  `npm audit` count from 74 to 68 (both lockfiles audited on 2026-10-21). Lane G's OP-011
  row is out of date on two points:
  - Fixed versions exist. `hono` 4.13.11 (released 2026-09-29) fixes all five, and the
    latest, 4.13.13, is inside the declared `^4.13.0`.
  - Slice 2 now calls `c.req.parseBody()` for the sign-in form. It uses the default
    `dot: false`, so the nesting advisory (GHSA-g6gw-c38x-mqfc) still does not apply, and
    `bodyLimit` caps the body. No server code uses `serveStatic` (GHSA-5r4p-p66f-jhc7).

  OP-011's revisit trigger ("re-check when hono publishes a fix") is met: the fix is a
  lockfile bump of `hono`.

## Shared Rules For Every Slice

- Work in a dedicated worktree, not the main checkout. That keeps `out/` and `dist/` in
  the main checkout, which the audit drivers use, unchanged.
- Use only isolated data: `$TMPDIR` data directories and Electron profiles. Never use
  `/media/storage/lumakeys`, the repository's `.lumakeys-data` or `.pianohero-data`, or
  a real `~/.config` profile. `~/.config/PianoHero` holds a copy of the owner's old
  desktop data.
- Reproduce the finding with the smallest failing check before changing code. The
  "Fails before fix" column below names that check.
- Keep hardening notes, unaccepted leads and unrelated cleanup out of the slice.
- After the fix, rerun the named audit driver. Record the result in the finding's
  Resolution section and move the finding to `fixed`. It moves to `verified` only when
  every proof in its table has passed, including the owner's sitting where one is
  named.
- Re-run `node scripts/audit/recount-coverage.mjs --check` after any ledger change.

## Slice 0: CI And Proof Debt

- Accepted finding IDs: PH-OPS-005
- Priority/order: 0, P3
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: any reviewer
- Proposed branch: `remediation/p11-s00-ci`

### User-Visible Outcome

None directly. A regression in any fixed finding fails a check on push instead of
reaching a user. The five proof gaps that re-verification found become tests.

### Boundaries Touched

- Deployment/packaging: `package.json` (`verify` script; `assert-electron-assets` in
  `package:*`), new `.github/workflows/verify.yml`
- Tests only: GameScreen, the two reduced-motion canvases, and parser meter fixtures

### Scope

Included:

- A `verify` script: `typecheck`, the server typecheck
  (`tsc --noEmit -p tsconfig.server.json`), `vitest run`, `build`, `build:web`, and
  `node scripts/assert-electron-assets.mjs`.
- One workflow running `npm ci` with `LUMAKEYS_SKIP_ELECTRON_REBUILD=1`, then
  `npm run verify` and `node scripts/audit/recount-coverage.mjs --check`.
- Proof-debt tests from the [re-verification](phase-11-reverification-2026-10-19.md#proof-gaps-found-by-re-verification):
  - PH-ARCH-001: a GameScreen test where `getSong` rejects and Retry and Back render.
  - PH-UI-003: `matchMedia('(prefers-reduced-motion: reduce)')` mocked; neither canvas
    schedules a decorative animation frame.
  - PH-MUS-002: a two-meter MIDI fixture under `src/` with measure-boundary
    assertions, plus a 6/8 case.
  - PH-PAR-001: `assert-electron-assets.mjs` runs inside every `package:*` script.
  - PH-UI-002: remove the claim of an automated tab-row height assertion from the
    finding. Layout stays runtime proof (sitting 1 item 2).

Excluded: packaging or Docker builds in CI, the Electron upgrade (slice 3), and any
product change.

### Failure And Data Safety Plan

No user data is involved: CI runs on a clean checkout. The only risk is a red build on
`main` from a flaky test. If that happens, quarantine the test with a linked issue
rather than weakening the job.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | no job exists | workflow green on `main` | GitHub Actions |
| Boundary/parity proof | breaking one test still merges | a branch with a deliberately broken test fails | throwaway branch |
| Recovery/integrity proof | each new proof-debt test passes on today's code, so instead | each fails when its Phase 9 fix line is reverted locally | local mutation check, not committed |
| Manual UI/hardware proof | not required | not required | n/a |

### Validation

- Narrow: `npm run verify`
- Affected lane rerun: none
- Required: the workflow passes on `main` and fails on the broken branch

## Slice 1: Desktop Startup Migration

- Accepted finding IDs: PH-DATA-005, PH-DATA-006, PH-OPS-006
- Priority/order: 1, P1
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: independent persistence verifier required (P1)
- Proposed branch: `remediation/p11-s01-desktop-migration`

### User-Visible Outcome

A desktop user who updates from any earlier build opens their own library, results,
streak, settings and sample packs. If the update stopped half way, the next start
finishes it without losing recent practice. If startup fails for any reason, a dialog
names the error and the app exits. It does not leave an invisible process running.

### Boundaries Touched

- Electron adapter: `src/main/index.ts`
  - pin `userData` to `<appData>/lumakeys` at module top level, before `ready`
  - move `app.setName` before `ready`, or remove it
  - a startup error boundary: `dialog.showErrorBox`, then `app.exit(1)`
  - `app.requestSingleInstanceLock()`
- Persistence/storage: `src/persistence/legacyBrandMigration.ts`
  - ordered candidate list: `luma-keys`, `piano-hero`, `PianoHero`
  - checkpoint before moving
  - sidecars first, main database last
  - finish a partial move
  - refusal text that names the safe action
- Web adapter/server: same-directory mode only; no server code change expected

### Scope

Included:

- Migrate from the single candidate that holds `pianohero.db`.
- If two or more candidates hold data, refuse with a visible message naming both
  directories.
- A destination `lumakeys.db` with no user rows (songs, results, practice days,
  achievements) is backed up and then replaced. Anything else needs an explicit
  choice; it is never overwritten silently.

Excluded:

- Browser-side stores (slice 15).
- Removing the legacy fallback (owner decision 3: a later release, no earlier than
  2027-01-31).
- Installer changes.
- The Electron upgrade (slice 3).

### Failure And Data Safety Plan

- Initial durable state: a legacy profile holding `pianohero.db` with committed rows
  only in `-wal`, built from a real WAL-bearing database. Variants: two candidates, and
  an empty pre-existing `lumakeys.db`.
- Failure and interruption points:
  - after the checkpoint
  - after each sidecar rename
  - after the main rename
  - after an empty destination is backed up and before it is replaced
- Recovery and cleanup:
  - `PRAGMA wal_checkpoint(TRUNCATE)` on the legacy database first, so only the main
    file carries data.
  - On start, a `lumakeys.db` without sidecars, next to legacy sidecars, means a move
    was interrupted. Finish it.
  - Nothing is deleted. A replaced empty database is kept as a timestamped backup.
- Backward compatibility: profiles already on `<appData>/lumakeys` are untouched. The
  web server keeps its same-directory behaviour.
- Rollback: reverting the build restores today's lookup. Migrated data stays in
  `lumakeys/`, so a downgraded build opens it as before. Nothing to undo.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | `legacyBrandMigration.test.ts` cases for `luma-keys`, `piano-hero`, `PianoHero`, two candidates, and an empty `lumakeys.db` | each migrates, refuses or asks as specified | unit, temp dirs |
| Boundary/parity proof | `scripts/audit/electron-userdata-probe.mjs --packaged` P1 shows an empty library | the legacy song count is in `lumakeys/lumakeys.db` | rebuilt Linux package in `$TMPDIR` |
| Recovery/integrity proof | WAL-only rows lost in states H2, H3, H4 | rows survive restart; `integrity_check` ok; `legacy-brand-server-probe.mjs` with an added H3 case passes | unit plus server probe |
| Startup failure | a thrown migration error leaves the process running with no window (probe case P2) | the error reaches the dialog callback and the process exits non-zero | extracted startup test plus probe P2 |
| Manual UI/hardware proof | sitting 2 item 1 shows the gap on Windows | sitting 2 items 1 and 6 pass on a real `%APPDATA%\luma-keys` profile | owner, Windows |

### Validation

- Narrow: `npx vitest run src/persistence`
- Affected lane rerun: lane B migration probes; `backup-reset-restore.mjs` (Electron)
- Required: `npm run verify`, `npm run package:local` in the worktree, probe P1 and P2
- Packaging/hardware: sitting 2

## Slice 2: Web Access

- Accepted finding IDs: PH-OPS-002, PH-SEC-002, PH-SEC-003 (PH-OPS-002 joined on 2026-10-20)
- Priority/order: 2, P0; first in wave 1
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: security reviewer
- Proposed branch: `remediation/p11-s02-web-access`

### User-Visible Outcome

Logging in to the web app never puts the access token in a URL, browser history, proxy
logs or a `Referer`. HTML responses tell the browser to refuse framing and foreign
scripts. The desktop renderer runs under the same Content-Security-Policy.

### Boundaries Touched

- Web adapter/server:
  - `src/server/webSecurity.ts` and its test: drop the `access_token` query parser and
    add `POST /api/access` that reads the token from the body or a header.
  - `src/server/index.ts`: one middleware for HTML responses that sets the CSP header
    (needed for `frame-ancestors`), `X-Content-Type-Options: nosniff`,
    `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`.
  - `src/server/staticFiles.test.ts`
- Renderer/UI: `src/renderer/index.html` gets a CSP `<meta>` for both builds, and a
  minimal login form if the POST route needs one.
- Documentation: `README.md` section 5a.
- PH-OPS-002 (confirmed by sitting 0 item 4): the default in `docker-compose.yml` and
  the README changes so a deployment without Cloudflare Access is not left open. The
  finding's recommended boundary is to refuse to start, or serve only the SPA, unless
  `LUMAKEYS_WEB_ACCESS_TOKEN` or an explicit `LUMAKEYS_TRUST_UPSTREAM_AUTH=1` is set. That
  design choice is recorded in the slice when it starts.

### Scope

Included: the three transports reduced to header and cookie, the login path, the
headers, and the CSP.

Excluded:

- Hardening notes L-11-002 (constant-time compare) and L-11-003 (separator in the
  containment check). These can be separate small changes.
- Cloudflare Access configuration on the owner's host.

### Failure And Data Safety Plan

- Initial state: an existing cookie session and a token in the environment.
- Failure points:
  - the owner locks themself out
  - the CSP blocks the main-menu video, the Tone.js sampler (`blob:` on the web,
    `file:` packs on the desktop), soundboard media, or Free Play export
- Mitigation: header login keeps working throughout. Each policy source is checked in
  a browser before merging.
- Backward compatibility: cookies minted earlier stay valid until they expire.
  Old bookmarks with `?access_token=` stop working, by design.
- Rollback: code revert.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | `webSecurity.test.ts`: a query-string token gets 200 and a cookie | 401 and no cookie; header and cookie still pass | unit |
| Boundary/parity proof | `staticFiles.test.ts`: no security headers on `/` or the SPA fallback | all four headers on both | unit |
| Web runtime | `scripts/audit/web-security-probe.sh` reports "query-string token accepted" | the line is gone; the "Response headers" section shows four PASS lines | built server on `$TMPDIR` data |
| Electron runtime | the harness logs Electron's insecure-CSP warning | no warning; `workflows.mjs`, `freeplay-export.mjs` and `sample-pack.mjs` unchanged | headless Electron |
| Manual UI/hardware proof | n/a | the owner logs in once through the new path in a private window, plays a song and opens the Soundboard with no CSP errors in the console | owner, after deploy |

### Validation

- Narrow: `npx vitest run src/server`
- Affected lane rerun: lane A probe
- Required: `npm run verify`

## Slice 3: Electron Upgrade And Window-Open Guard

- Accepted finding IDs: PH-OPS-003, PH-SEC-005
- Priority/order: 3, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: runtime reviewer
- Proposed branch: `remediation/p11-s03-electron`

### User-Visible Outcome

Desktop users run a supported Electron that still gets security fixes. A Soundboard
credit link opens in the system browser. The app window cannot be navigated away from
the app.

### Boundaries Touched

- Electron adapter: `src/main/index.ts` `createMainWindow`:
  - `setWindowOpenHandler` denies every window and calls `shell.openExternal` for
    `https:` only
  - a `will-navigate` handler denies navigation away from the app's own `file://` or
    dev-server origin
  - an explicit `sandbox: true`
- Deployment/packaging: `electron`, `electron-vite`, `electron-builder` and the
  `better-sqlite3` ABI rebuild in `package.json` and the lockfile; release checklist
  step to read `scripts/audit/dependency-triage.mjs` shipped-runtime section.
- Audit harness: rebuild the Electron-ABI `better-sqlite3` copy under `$TMPDIR` for the
  new version. This is audit-only and outside the product.

### Scope

Do PH-SEC-005 first as its own commit. It is small and it protects users on 30.5.1 too.
Then upgrade one supported major and review `BrowserWindow` defaults for breaking
changes.

Excluded: the CSP (slice 2), Node version changes for the server, and renderer
refactors.

### Failure And Data Safety Plan

- Initial durable state: a profile written by the 30.5.1 build, with songs, results,
  settings and an installed pack.
- Failure points: the native module ABI, the userData path, IPC behaviour, and media
  and sampler loading.
- Backward compatibility: same userData path and SQLite format. The new build must
  open the old profile unchanged.
- Rollback: revert the lockfile and rebuild. The profile stays readable because the
  schema does not change.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | `scripts/audit/electron/window-open.mjs` reports a child window with `bridge: "undefined"` | "no child window"; the stubbed `shell.openExternal` receives the URL | headless Electron |
| Handler unit | no handler exists | `deny` for every URL; `openExternal` only for `https:` | unit, if the window setup is extracted |
| Boundary/parity proof | `npm audit` lists 37 high advisories for electron | the shipped-runtime section shows a supported major | `dependency-triage.mjs` |
| Recovery/integrity proof | n/a | an old-build profile opens with all data; Electron drivers `workflows.mjs`, `backup-reset-restore.mjs`, `sample-pack.mjs` and `keyboard-walk.mjs` repeat their Phase 11 results | headless Electron |
| Manual UI/hardware proof | n/a | packaged Linux launch, main menu, one song, Settings read-back (sitting 1); Windows portable (sitting 2) | owner |

### Validation

- Narrow: `npm test`
- Affected lane rerun: lane D Electron-only bridge methods (Phase 4 parity table)
- Required: `npm run verify`, `npm run package:local`

## Slice 4: Practice Input Integrity

- Accepted finding IDs: PH-MUS-005, PH-MUS-012, PH-MUS-016, PH-UI-019 (the last two added
  2026-10-20; accepted in the ledger)
- Priority/order: 4, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: music-correctness reviewer
- Proposed branch: `remediation/p11-s04-input`

### User-Visible Outcome

Computer-keyboard notes play and score while an on-screen button has focus, including
straight after Resume. Space and Enter still press the button. Notes pressed before the
song starts, during the count-in or while paused still sound, but they are not judged.
In a loop, a press just before the seam counts for the loop's first note. Ctrl, Meta
and Alt shortcuts such as Ctrl+0 reach the browser instead of playing a note.

### Boundaries Touched

- Domain/practice engine:
  - `src/lib/input/computerKeyboardInputService.ts` `isEditableTarget`: a focused
    `BUTTON` blocks only Space and Enter. PH-UI-019: `handleKeyDown` and `handleKeyUp`
    return before `preventDefault` when Ctrl, Meta or Alt is held.
  - `src/lib/game/GameSession.ts` `ingestInputEvent`: held-note and sustain
    bookkeeping as now, but no `matchNote` while `isPlaying` is false. PH-MUS-016: with
    a loop set and the playhead within the hit window of `loopEndSec`, also match
    against the loop's first notes at the wrapped time.
- Renderer/UI: none. `GameScreen` keeps forwarding events so presses still sound.

### Scope

Included: the two guards. Excluded: undoing the PH-UI-001 focus return,
wait-for-input semantics, and capstone rules (slice 12).

### Failure And Data Safety Plan

No durable state changes. Stored results after the fix no longer include notes judged
while stopped. Results stored before the fix are left as they are.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | `computerKeyboardInputService.test.ts`: a note key with a focused button emits nothing | `noteon` emitted; Space and Enter are not | unit |
| Engine regression | `GameSession.test.ts`: a press before `play` and a press after `pause` near a note both score (cases from `scripts/audit/paused-input-probe.ts`) | neither scores; a press while playing still does | unit |
| Targeted regression (PH-MUS-016) | `GameSession.test.ts`: in a loop, a press `hitWindow - 1` ms before `loopEndSec` does not score the loop's first note, and Learn mode then waits on it | it scores, and Learn mode moves on | unit; web and Electron `sitting4-midi-*` item 7 with `seamMs = -15` |
| Targeted regression (PH-UI-019) | `computerKeyboardInputService.test.ts`: Ctrl+Digit0 emits a note and is default-prevented | no note, not prevented; Shift still plays louder | unit; `sitting1-visual-chrome.mjs` and `sitting1-visual-desktop.mjs` Ctrl+0 resets the zoom |
| Boundary/parity proof | GameScreen test: open the overlay, Resume, a note key is not ingested | it is ingested | component |
| Runtime | Electron `workflows.mjs`: D4 scores nothing after Resume; `paused-input.mjs` scores the pre-Space and count-in presses | D4 scores at once; Score 0 after the count-in | headless Electron; web `pause-resume-focus.mjs` |
| Manual UI/hardware proof | n/a | sitting 4 item 4 (pause and resume on a MIDI keyboard) | owner |

### Validation

- Narrow: `npx vitest run src/lib/game src/lib/input`
- Required: `npm run verify`

## Slice 5: MIDI Device Lifecycle

- Accepted finding IDs: PH-MUS-010, PH-MUS-011
- Priority/order: 5, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: music-correctness reviewer
- Proposed branch: `remediation/p11-s05-midi-devices`

### User-Visible Outcome

A keyboard that drops out and reconnects, or a second device being plugged in, does not
restart the song. A saved device that is no longer connected is shown as such in
Settings. Input and the screen agree on what is happening.

### Boundaries Touched

- Renderer/UI: `src/renderer/App.tsx`: memoise the GameScreen `source` per screen state.
  Alternatively, key the GameScreen song-load effect on `source.kind` and the song id.
- Domain: `src/lib/midi/midiInputService.ts` and the SettingsScreen device card.

### Scope

Included: stable source identity, and one rule for a missing saved device.

Recommended rule: keep the filter and make the card say "Saved device not connected:
<name or id>", with a one-click "Use any connected device". This is the smallest
change and never routes input from a device the player did not choose. The other
option, the service ignoring a filter for an absent device, is acceptable if the
implementer records why.

Excluded: PH-MUS-004 (fixed) and a hot-swap redesign.

### Failure And Data Safety Plan

The saved device setting is not rewritten unless the user picks a new option. No
other durable state changes.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | App or GameScreen test: changing the MIDI device list mid-run remounts the session and zeroes the score | same session object and score | component |
| Missing device | `midiInputService` test with a filter for an absent device; SettingsScreen card reads "Any connected device" | the card names the missing device; the chosen rule holds in the service | unit and component |
| Runtime | `scripts/audit/browser/midi-permission-fallback.mjs` disconnect, reconnect and absent-device cases | the HUD keeps its score; the card names the missing device | headless Chromium with scripted Web MIDI |
| Manual UI/hardware proof | sitting 4 item 3 shows the restart | sitting 4 items 3 and 6 pass | owner |

### Validation

- Narrow: `npx vitest run src/renderer src/lib/midi`
- Required: `npm run verify`

## Slice 6: Audio Output

- Accepted finding IDs: PH-PAR-006, PH-MUS-007, PH-MUS-015 (added 2026-10-20; accepted
  in the ledger)
- Priority/order: 6, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: audio reviewer
- Proposed branch: `remediation/p11-s06-audio`

### User-Visible Outcome

A web user who installs Flute, Marimba or Trumpet hears the installed samples. Honky-tonk
and warm pad become playable on the web. A desktop WAV export contains the recording.
An installed pack keeps the instrument's own release, so notes fade as the built-in
ones do.

### Boundaries Touched

- Domain: `src/lib/audio/audioEngine.ts` only.
  - PH-PAR-006: in `loadInstrument` and `renderRecordingToWav`, leave out the
    `baseUrl` key when there is none, instead of passing `null` or `undefined`.
  - PH-MUS-007: inside `renderRecordingToWav`, schedule and start on the `Tone.Offline`
    callback's own `context.transport`.
  - PH-MUS-015: pass the instrument's `release` into both custom-sampler constructions
    (live and offline).

### Scope

Three root causes in one file, with one listening session. Each gets its own test.
Excluded: new instruments, pack format changes, and web WAV export (PH-PAR-005 is
slice 17).

### Failure And Data Safety Plan

Packs already in IndexedDB start playing with no reinstall. WAV files saved earlier
stay silent; the user records again.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression (PH-PAR-006) | fake Tone records Sampler URLs starting with `undefined` for `{ urls: { C4: 'blob:x' }, baseUrl: null }` | no URL starts with `undefined` | unit |
| Targeted regression (PH-MUS-007) | an offline render of two notes is all zeros | energy after each onset | Chromium (`scripts/audit/browser/wav-render-probe.mjs` pattern) or an `OfflineAudioContext` shim |
| Web runtime | `sample-pack-engine-log.mjs` logs `Failed to load custom sampler` and a fallback | neither | headless Chromium |
| Electron runtime | `freeplay-export.mjs`: every sample is zero | non-zero peak; `sample-pack.mjs` unchanged | headless Electron |
| Targeted regression (PH-MUS-015) | fake Tone records the Flute custom sampler with no `release` | `release: 1.1` | unit; `sitting1-audio-desktop.mjs` item 6: the pack's decay matches the built-in's |
| Manual UI/hardware proof | n/a | sitting 1 items 5 and 6: listen to an exported take and compare the built-in and installed Flute | owner |

### Validation

- Narrow: `npx vitest run src/lib/audio`
- Required: `npm run verify`

## Slice 7: Web Startup Without MIDI Permission

- Accepted finding IDs: PH-PAR-007
- Priority/order: 7, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: runtime reviewer
- Proposed branch: `remediation/p11-s07-midi-startup`

### User-Visible Outcome

A first-time web visitor sees the main menu at once and can play with the computer
keyboard, whether or not they answer the browser's MIDI prompt. MIDI devices appear as
soon as permission is granted.

### Boundaries Touched

- Renderer/UI: `src/renderer/App.tsx` startup. Render once settings are ready, and let
  `midiInputService.init()` settle in the background. The existing permission-change
  listener updates the device state.

### Scope

Excluded: Electron (no prompt there), MIDI device UI (slice 5), and the setup guide.

### Failure And Data Safety Plan

Settings must still load before the first render, so defaults never overwrite stored
values. The MIDI device setting is not written while permission is pending.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | App test with a `requestMIDIAccess` that never settles stays on "Loading services..." | the main menu renders and computer keys play | component |
| Runtime | `midi-permission-fallback.mjs` "pending" case | the main menu appears without settling the promise | headless Chromium |
| Manual UI/hardware proof | sitting 1 item 8 shows the hang | the main menu appears with the prompt unanswered for 30 s | owner, fresh Chrome profile |

### Validation

- Narrow: `npx vitest run src/renderer/App.test.tsx`
- Required: `npm run verify`

## Slice 8: Delete Confirmation

- Accepted finding IDs: PH-UI-006, PH-DATA-010 (added 2026-10-21)
- Priority/order: 8, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: UI reviewer
- Proposed branch: `remediation/p11-s08-delete-confirm`

### User-Visible Outcome

`Delete` in the bulk bar and `Delete Song` in the metadata editor ask first. The prompt
names how many songs will go and says their results and practice history go too.
Cancel, which takes focus, leaves everything as it was. The Delete User Data card and
dialog in Settings name everything the reset removes (songs, playlists, folders, results,
practice history and streak, achievements, fingerings, trouble spots, saved settings and
installed instrument packs), and on the web say the data is on the server and affects
every browser that uses it.

### Boundaries Touched

- Renderer/UI: `src/renderer/components/LibraryScreen.tsx` and its test. Use a
  Settings-style confirmation modal with `useModalFocusTrap`.
- Renderer/UI (PH-DATA-010): the Delete User Data card and `ConfirmActionModal` copy in
  `src/renderer/components/SettingsScreen.tsx`, with the web wording under `IS_WEB`.

### Scope

Excluded: folder and playlist deletes (they do not remove songs), undo, and the
delete operation itself (atomic since PH-DATA-001).

### Failure And Data Safety Plan

Cancel makes no bridge call. Confirm calls the existing `bulkDeleteSongs` unchanged.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | `LibraryScreen.test.tsx`: Delete removes songs with no prompt | a prompt; Cancel keeps the song; Confirm deletes | component |
| Web runtime | `library-organize-bulk.mjs` deletes at once | modified driver: cancel, then confirm | headless Chromium |
| Electron runtime | `scripts/audit/electron/library-one-hand.mjs` (A2) deletes with no prompt | the same driver shows the prompt | headless Electron |
| Recovery/integrity proof | n/a | after Cancel, rows, MIDI files and results are intact | both runtimes |
| Targeted regression (PH-DATA-010) | `SettingsScreen.test.tsx`: the dialog names six stores | it names packs, history, fingerings and trouble spots; the web text says the data is on the server | component |
| Runtime (PH-DATA-010) | `proof-data002-web.mjs` and `proof-data002-electron.mjs` `dialog.json` copy omits packs | the captured copy matches the removed inventory | headless Chromium and Electron |

### Validation

- Narrow: `npx vitest run src/renderer/components/LibraryScreen.test.tsx src/renderer/components/SettingsScreen.test.tsx`
- Required: `npm run verify`

## Slice 9: Timing

- Accepted finding IDs: PH-MUS-006, PH-MUS-008
- Priority/order: 9, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: music-correctness reviewer
- Proposed branch: `remediation/p11-s09-timing`

### User-Visible Outcome

The in-game metronome clicks on the beat at any practice tempo, accents barlines in
every meter, and follows tempo changes. A MIDI file whose first tempo event is after
the start plays with continuous timing, and the library shows the tempo it starts at.

### Boundaries Touched

- Domain:
  - `src/lib/midi/midiFileParser.ts`: when the first tempo is after tick 0, insert
    `{ ticks: 0, bpm: 120 }` and call `header.update()` before reading times. Report
    the tick-0 tempo as `bpm`.
  - `src/lib/game/types.ts`: `ParsedSong` carries the tempo map.
  - A new pure helper in `src/lib/game/` maps song time to a beat index and a downbeat
    flag, from the tempo map and `measureBoundaries`. Song time is its only clock
    input.
- Renderer/UI: the GameScreen metronome effect calls the helper. The count-in and
  lead-in code is unchanged.

### Scope

Order inside the slice: the parser first, then the tempo map in `ParsedSong`, then the
metronome. Excluded: recomputing stored song metadata (see below) and audible click
sounds.

### Failure And Data Safety Plan

Songs imported before the fix keep their stored BPM and duration until re-imported.
The implementer records whether a one-off recompute is wanted. If it is, that is a
separate, reviewed data change. This slice does not rewrite the database.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression (PH-MUS-006) | helper absent; `scripts/audit/metronome-replay-probe.ts` shows wall gaps of 2.0 s at 50 % | 4/4 at 120 BPM: gaps of 1.0, 0.5 and 0.333 s at tempo 0.5, 1 and 1.5; accents on barlines for 3/4, 6/8 and a 6/8-to-3/4 change; spacing doubles after 120 to 60 BPM | unit |
| Targeted regression (PH-MUS-008) | `midiFileParser.test.ts`, first tempo 60 BPM at tick 1920: the note at 1920 is misplaced | starts at 2.0 s; the tick-1440 note lasts 0.5 s; boundaries [0, 2] and [2, 6] s; `bpm` 120 | unit, fixture under `src/` |
| Web runtime | `metronome-and-quiz.mjs` part B: 50 % gaps 2.0 s | 1.00 s | headless Chromium |
| Manual UI/hardware proof | n/a | optional: sitting 1 item 7, by ear | owner |

### Validation

- Narrow: `npx vitest run src/lib/game src/lib/midi`
- Required: `npm run verify`

## Slice 10: Dialogs And Escape

- Accepted finding IDs: PH-UI-010, PH-UI-013, PH-UI-017, PH-UI-020 (added 2026-10-21)
- Priority/order: 10, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: accessibility reviewer
- Proposed branch: `remediation/p11-s10-dialogs`

### User-Visible Outcome

A keyboard user can run latency calibration: focus moves into the dialog, Tab stays
inside, Enter on a button presses it, and Escape closes only the dialog. On the
Soundboard, Escape always toggles the session menu. Closing a Settings confirmation
returns focus to the button that opened it. When a practice session fails to load, focus
moves to Retry, so a keyboard user can act at once.

### Boundaries Touched

- Renderer/UI:
  - `src/renderer/components/LatencyWizard.tsx`: `useModalFocusTrap`; the Space and
    Enter shortcut limited to the tapping phase when focus is not on a button.
  - `src/renderer/components/NoveltySoundboardScreen.tsx`: register the Escape
    handler once, with refs, as Free Play does.
  - `src/renderer/App.tsx`: add `soundboard` to the Escape exclusion list.
  - `src/renderer/components/SettingsScreen.tsx` `ConfirmActionModal`: record the
    trigger once on mount, or reuse `useModalFocusTrap`.
  - `src/renderer/components/GameScreen.tsx` (PH-UI-020): focus the Retry button when
    `loadError` is set.

### Scope

Excluded: the HUD and navigation (slice 11) and the latency measurement itself.

### Failure And Data Safety Plan

Apply by keyboard must persist `audio.latencyCompMs`. Cancel and Escape persist
nothing.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression (PH-UI-010) | new `LatencyWizard.test.tsx`: focus stays on "Calibrate...", Escape leaves Settings, Enter on close starts measuring | focus inside; Escape closes only the dialog; Enter on close closes; Enter on Apply applies | component |
| Targeted regression (PH-UI-013) | `App.test.tsx` "lets soundboard own Escape": the third Escape exits | the screen stays | component |
| Targeted regression (PH-UI-017) | `SettingsScreen.test.tsx`: focus on `body` after Cancel and Escape | focus on the trigger | component |
| Targeted regression (PH-UI-020) | `GameScreen` test: a rejected `getSetting` leaves focus on `body` | focus is on Retry | component |
| Runtime | web `latency-wizard-keyboard.mjs`, `escape-semantics.mjs`, `confirm-dialog-focus-restore.mjs`; Electron `keyboard-walk.mjs` parts (b), (c), (e); web `proof-ph-arch-001-recovery.mjs` reaches Retry with no Tab walk | corrected behaviour in each | headless Chromium and Electron; Edge and Firefox for the recovery driver |
| Manual UI/hardware proof | n/a | sitting 3 item 3 in Edge and Firefox | owner |

### Validation

- Narrow: `npx vitest run src/renderer`
- Required: `npm run verify`

## Slice 11: Navigation Focus And HUD Zoom

- Accepted finding IDs: PH-UI-011, PH-UI-012, PH-UI-014
- Priority/order: 11, P2
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: accessibility reviewer
- Proposed branch: `remediation/p11-s11-hud`

### User-Visible Outcome

- The top bar shows which button has keyboard focus and which page is current, by more
  than colour.
- At 150 to 200 % zoom the HUD on Free Play, Soundboard and Game does not overlap
  itself, and every button is clickable.
- Closed popouts are not in the Tab order.

### Boundaries Touched

- Renderer/UI:
  - `src/renderer/styles.css`: scoped top-bar focus and current-page styles (define
    the variables on `.app-topbar`, or an explicit `:focus-visible` outline using
    `--color-accent`), and a HUD breakpoint for roughly 780 to 1100 px.
  - `App.tsx`: only if a current-page marker element is needed.
  - The four popout components (instrument list, visual-mode list, sound key map,
    soundboard mode list): `inert` when closed, and a toggle that opens in one press.

### Scope

Excluded: Settings tab layout (PH-UI-002, fixed) and the Library sticky sidebar.

### Failure And Data Safety Plan

No durable state. `inert` works in the Chromium that Electron 30 ships, so the slice
does not depend on slice 3.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression (PH-UI-014) | closed popout has focusable descendants | `inert` (or `visibility: hidden`); none reachable | component |
| PH-UI-011 runtime (no jsdom layout) | `keyboard-focus-matrix.mjs PART=destinations` and `focus-hud-nav-visual.mjs`: only a 1 px shift | a strong indicator on every nav stop; a pixel diff far above the 1 px shift | headless Chromium; Electron `keyboard-walk.mjs` (a) |
| PH-UI-012 runtime | `zoom-hud-overlap.mjs`: nav covered at 150 and 175 % | no covered button at any size | headless Chromium emulation |
| PH-UI-014 runtime | `hidden-focus-stops.mjs`: 71 of 83 Free Play stops invisible | zero stops inside `aria-hidden` | headless Chromium; Electron `keyboard-walk.mjs` (d) |
| Manual UI/hardware proof | sitting 1 item 2 at real zoom | no overlap; Settings clickable; sitting 3 items 2 and 3 in Edge and Firefox | owner |

### Validation

- Narrow: `npx vitest run src/renderer`
- Required: `npm run verify`

## Slice 12: Learning Flow

- Accepted finding IDs: PH-MUS-013, PH-UI-018, PH-DATA-009
- Priority/order: 12, P3
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: music-correctness reviewer
- Proposed branch: `remediation/p11-s12-learning`

### User-Visible Outcome

- A tier capstone plays at its tempo without waiting for each note, so the 85 % gate
  measures timing. Owner decision, 2026-10-20.
- A capstone run cannot be switched to Learning mode, another hand, a loop or another
  tempo mid-run.
- A drill that falls short shows the score and the pass mark, for example "72 % of
  80 % needed. Try again."
- Lesson progress that fails to save says so.

### Boundaries Touched

- Renderer/UI:
  - `src/renderer/App.tsx` `startCapstone` (around lines 1098 to 1118):
    `buildSessionConfig('luma-keys', …)` with `waitForInput: false`, keeping the
    capstone's `tempoMultiplier` and `handFilter`.
  - `onLessonDrillFinished` (around lines 1747 to 1752) carries the attempt's accuracy
    into the `lesson` screen state.
  - `src/renderer/components/GameScreen.tsx`: hide or lock the mode, hand, loop and
    tempo controls when the source is a capstone. Alternatively, store the result only
    when the run kept the capstone's mode, tempo, hand and full range.
  - `LessonScreen.tsx`: shows the last attempt.
- Domain: `src/lib/learning/learningProgress.ts`: the save leaves the state updater,
  is awaited, and on failure shows the same session-only message and toast that
  Settings uses.

### Scope

Excluded: curriculum content, gate thresholds and drill generation.

### Failure And Data Safety Plan

- Existing `capstoneResults` and unlocked tiers stay. A learner who passed under wait
  mode keeps the unlock; nothing is recomputed.
- A failed progress save leaves the in-memory step complete for the session and says
  it was not saved. A reload shows the stored truth.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression (PH-MUS-013) | `scripts/audit/capstone-accuracy-probe.ts`: presses 2 s late (L2) score 100 % | on-time (L1) still passes; L2 below the gate | engine probe against the new config |
| Capstone config | App test: `startCapstone` builds a learning config | Play mode, `waitForInput: false`; a run whose mode, tempo, hand or range changed is not stored | component |
| Targeted regression (PH-UI-018) | App test: a drill finished at 50 % returns with no score | the lesson shows 50 % and the target | component |
| Targeted regression (PH-DATA-009) | App test with a rejecting `setSetting`: an unhandled rejection and no message | the error toast and no unhandled rejection | component |
| Runtime | Electron `lesson-pass.mjs` (waits for each note); web `lesson-progression.mjs` failed-drill case | with presses timed against the moving clock, a passing result is stored and the next tier unlocks; the failed drill shows its score | headless Electron and Chromium |
| Manual UI/hardware proof | n/a | the owner plays the novice capstone once (sitting 1 after the fix) | owner |

### Validation

- Narrow: `npx vitest run src/lib/game src/lib/learning src/renderer/App.test.tsx`
- Required: `npm run verify`

## Slice 13: Import Outcomes

- Accepted finding IDs: PH-PAR-004, PH-UI-009, PH-ARCH-004, PH-SEC-004
- Priority/order: 13, P3
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: any reviewer
- Proposed branch: `remediation/p11-s13-import`

### User-Visible Outcome

- A failed import says why ("corrupt: <parser reason>").
- An import where nothing was added does not ask the user to review metadata.
- A web upload's response is about the size of its metadata and names no server path.
- Several `.mscz` files in one upload all convert, one after another.

### Boundaries Touched

- Domain: `src/lib/midi/midiFileParser.ts`. Wrap the `Midi` constructor and rethrow
  `new Error(String(thrown))`, or add a shared `errorMessage(unknown)` helper for the
  three import catch blocks (`src/main/index.ts`, `src/server/midiRouter.ts`).
- Renderer: `src/renderer/services/libraryService.ts` `formatMidiImportResult` appends
  the hint only when `songs.length > 0`. Optionally add a next step to the
  no-MuseScore server error.
- Web adapter/server:
  - `src/server/midiRouter.ts` maps `ImportedSong` to the fields the client reads;
    optionally `fileData` and `destPath` become optional in `src/shared/ipc.ts`.
  - `src/server/museScore.ts`: a one-slot promise queue with a per-request cap
    replaces the `converting` flag.

### Scope

Excluded:

- MuseScore sandboxing (open lead L-11-006).
- Import UI redesign.
- The PH-DATA-003 restore message. A song title, not just its id, may be added here
  if the owner wants it; see the proof-owed table below.

### Failure And Data Safety Plan

No stored data changes. The queue keeps the existing 45 s timeout and `prlimit`. The
cap stops one request from holding the converter indefinitely, and its rejection
message is distinct from a bad file.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| PH-PAR-004 | parser test: corrupt bytes reject with a non-`Error` (`undefined` message) | an `Error` with a non-empty message; `midiRouter` returns a string `message` | unit |
| PH-UI-009 | `libraryService.test.ts` with only errors ends "Review the metadata before playing." | no hint | unit |
| PH-ARCH-004 | `midiRouter.test.ts`: the response holds `fileData` and `destPath` | neither present; size a small multiple of the metadata | unit |
| PH-SEC-004 | `museScore.test.ts`: the second of two concurrent stubbed conversions is rejected | both resolve in order; one beyond the cap fails with a queue message | unit |
| Runtime | Electron `workflows.mjs` WF-004 shows "empty: undefined"; web `mscz-upload-no-musescore.mjs` | parser reasons shown; no false hint | headless Electron and Chromium |
| Manual UI/hardware proof | n/a | sitting 0 item 2 after the fix: two parallel `.mscz` uploads in Docker both import | owner |

### Validation

- Narrow: `npx vitest run src/server src/lib/midi src/renderer/services`
- Required: `npm run verify`

## Slice 14: Settings Values

- Accepted finding IDs: PH-DATA-008, PH-ARCH-003
- Priority/order: 14, P3
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: any reviewer
- Proposed branch: `remediation/p11-s14-settings`

### User-Visible Outcome

A key the user unbinds, or moves to another note, stays that way after a restart, so
two notes no longer share one key. Skipping first-run setup with reminders off shows
0 in Settings, and the browser stops logging a parse error.

### Boundaries Touched

- Domain: `src/lib/input/settings.ts` `parseKeyboardMapping`. An explicit `null` means
  unbound; only a missing key gets the default.
- Renderer: `src/renderer/App.tsx` setup save writes `'0'`, not `'off'`. The read path
  maps a stored `"off"` to 0.

### Scope

Excluded: validating every setting against the registry in the bridge. That would be a
broader change; propose it separately if wanted.

### Failure And Data Safety Plan

Mappings already stored with `null` read back as unbound, which is what the user set.
A user who now has a doubled key keeps it until they rebind; nothing is rewritten
automatically. A legacy `"off"` reads as 0 and is written as `'0'` on the next save.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| PH-DATA-008 | `settings.test.ts`: `{ "note-0": null }` parses to the default key | unbound; `{}` still gives the default | unit |
| PH-ARCH-003 | the setup save writes `'off'`; Settings shows an empty box for `"off"` | writes `'0'`; shows 0 | unit and component |
| Runtime | `keyboard-remap-persistence.mjs`: labels differ after reload; Electron `workflows.mjs` stores `"off"` | labels match; stores `"0"` | headless Chromium and Electron |

### Validation

- Narrow: `npx vitest run src/lib/input src/renderer`
- Required: `npm run verify`

## Slice 15: Browser Rename Carry-Over

- Accepted finding IDs: PH-DATA-004, PH-DATA-007
- Priority/order: 15, P3
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: persistence reviewer
- Proposed branch: `remediation/p11-s15-browser-legacy`

### User-Visible Outcome

Sample packs and library filter presets saved before the August rename appear after
updating. The old browser stores do not linger, and "Reset all user data" clears both
names.

### Boundaries Touched

- Renderer/UI:
  - `src/renderer/webBridge.ts`: on first open, copy records from
    `pianohero-instrument-sample-packs` into the new IndexedDB store, then delete the
    old database. `resetUserData` deletes both names.
  - A small renderer start-up helper, or `LibraryScreen.tsx`: copy
    `pianohero-filter-presets` to `lumakeys-filter-presets` when the new key is absent,
    then remove the old key.

### Scope

Both carry-overs are removed in the same release as the Node-side legacy fallback. Owner
decision 3 sets that release no earlier than 2027-01-31 and after the carry-over
release. Slice 15 itself ships in the carry-over release, with slice 1. Excluded: the desktop profile
(slice 1).

### Failure And Data Safety Plan

- Copy only when the new store or key is absent.
- Delete the legacy store only after the copy transaction commits.
- If both exist, keep the new one and leave the legacy one untouched until reset or
  the end date, so nothing is lost by a merge.
- Rollback: code revert. Records already copied stay in the new store.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| PH-DATA-004 | `webBridge.test.ts` with a fake IndexedDB holding only the legacy name: packs not installed | packs installed; the legacy database gone; reset clears both names | unit |
| PH-DATA-007 | `LibraryScreen` test seeding the legacy key: no preset chip | the chip "Legacy Preset" shows | component |
| Runtime | `legacy-filter-presets.mjs` case L lists nothing | lists "Legacy Preset" | headless Chromium |
| Manual UI/hardware proof | n/a | optional: sitting 1 item 9 if the owner's browser has a pre-rename pack; Electron filter presets after slice 1 | owner |

### Validation

- Narrow: `npx vitest run src/renderer/webBridge.test.ts src/renderer/components/LibraryScreen.test.tsx`
- Required: `npm run verify`

## Slice 16: Colour

- Accepted finding IDs: PH-UI-015, PH-UI-016
- Priority/order: 16, P3
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: accessibility reviewer
- Proposed branch: `remediation/p11-s16-colour`

### User-Visible Outcome

In colour-blind mode, a missed note no longer looks like a pending right-hand note,
and a good hit no longer looks like a pending left-hand note. Grade letters on the
results screen are readable in the dark theme.

### Boundaries Touched

- Renderer/UI:
  - `src/renderer/components/FallingNotesCanvas.tsx` `noteFill`: a distinct treatment
    for judged notes, such as lightness, a border or a glyph, plus a new test file.
  - `src/renderer/styles.css`: theme-aware grade colours.

### Scope

Excluded: the default palette for non-colour-blind mode, and theme redesign.

### Failure And Data Safety Plan

No durable state.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| PH-UI-015 | new `FallingNotesCanvas.test.tsx`: in colour-blind mode, `noteFill` for `miss` equals pending right, and `good` equals pending left | each pair differs | unit |
| PH-UI-016 | `grade-badge-contrast.mjs`: D and F at 1.7:1, A at 3.0:1 | every grade at or above 3:1 (large bold text) in every theme | headless Chromium |
| Runtime | `color-state-evidence.mjs` montage; `palette-cvd-distance.py` | judged and pending states separable under simulated deficiencies | headless Chromium |
| Manual UI/hardware proof | n/a | sitting 1 item 10: a person with a colour-vision deficiency plays a short song in both palettes | owner |

### Validation

- Narrow: `npx vitest run src/renderer/components/FallingNotesCanvas.test.tsx`
- Required: `npm run verify`

## Slice 17: Small Independent Fixes

- Accepted finding IDs: PH-UI-005, PH-UI-007, PH-UI-008, PH-MUS-009, PH-PAR-005
- Priority/order: 17, P3
- Implementation owner: Claude Code (acting), owner decision 4
- Verifier: any reviewer
- Proposed branch: `remediation/p11-s17-small`, or one branch per finding

### User-Visible Outcome

- PH-UI-005: the Progress dashboard names the same measure numbers as Results.
- PH-UI-007: the "Date Added" filter includes songs imported on the chosen days, in
  every time zone.
- PH-UI-008: playlist rows can be reordered with Move up and Move down buttons, by
  keyboard.
- PH-MUS-009: quiz and interval answers are in a uniformly random position.
- PH-PAR-005: web Free Play no longer promises an export that does not exist.

### Boundaries Touched

- PH-UI-005: `ProgressDashboardScreen.tsx` label adds 1 to both values. Storage and the
  Practice loop range stay as they are.
- PH-UI-007: `LibraryScreen.tsx` `withinDateRange`. Parse `date_added` as UTC; build
  the From and To bounds from local date parts.
- PH-UI-008: `PlaylistView.tsx` buttons call the existing
  `onReorderSong(songId, newOrder)` and announce the result.
- PH-MUS-009: one Fisher-Yates `shuffle` in `src/lib/theory/` replaces the helpers in
  `TheoryQuizScreen.tsx` and `IntervalTrainerScreen.tsx`.
- PH-PAR-005: `FreePlayScreen.tsx` status and Backing Track copy become runtime-aware
  under `IS_WEB`. A browser MIDI download is a larger product choice and not in
  scope.

### Scope

Each fix is one file plus its test. They do not depend on each other.

### Failure And Data Safety Plan

Only PH-UI-008 writes data, through the existing reorder call. The order must persist
after a reload.

### Test-First Proof

| Finding | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| PH-UI-005 | `ProgressDashboardScreen` test: a trouble spot at 0 to 0 reads "Measures 0–0" | "Measures 1–1" | component |
| PH-UI-007 | `withinDateRange` test under a western and an eastern `TZ` excludes same-day songs | included | unit; web `library-date-filter-timezone.mjs`, all four zones PASS |
| PH-UI-008 | `PlaylistView` test: no Move down control | `onReorderSong` called; order persists after reload | component; extended `library-organize-bulk.mjs` |
| PH-MUS-009 | shuffle test: 20,000 shuffles of 4 items put position 1 far from 25 % (`shuffle-bias-probe.cjs`) | each position within 1.5 points of 25 %; a seeded source gives a known permutation | unit |
| PH-PAR-005 | `FreePlayScreen.test.tsx` web case: "You can replay or export it now." | runtime-aware text; desktop wording and export unchanged | component; web `freeplay-recording-export.mjs` |

### Validation

- Narrow: each finding's test file
- Required: `npm run verify`

## Slice 18: Fresh-Profile Audio Defaults

- Accepted finding IDs: PH-MUS-014 (added 2026-10-20)
- Priority/order: 18, P1; wave 1 after slice 0 (owner decision 5, 2026-10-21)
- Implementation owner: Claude Code (acting)
- Verifier: audio reviewer
- Proposed branch: `remediation/p11-s18-audio-defaults`

### User-Visible Outcome

A new user, or a user after "Delete User Data", hears the instrument and the metronome at
the volumes the Settings screen shows (master 80, reverb 20, metronome 65).

### Boundaries Touched

- Renderer/UI: `src/renderer/App.tsx` `parseStoredAudioNumber` returns the fallback for a
  missing (`null`) or empty value. The other `Number(raw…)` reads in the same effect are
  checked for the same pattern.

### Scope

Included: the parser and its callers in that effect. Excluded: seeding settings rows on
first run, and any change to the slider defaults.

### Failure And Data Safety Plan

No stored data changes. Users who already moved a slider keep their saved value.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | parser test: `null` and `''` give `0` | the fallback; a stored number is kept | unit |
| Boundary proof | App test with no stored audio settings: `setMasterVolume(0)` | `setMasterVolume(80)`, `setMetronomeVolume(65)`, `setReverbLevel(20)` | component |
| Runtime | `sitting1-audio-desktop.mjs` with `VOLUMES=fresh`, and the first-launch pass of `sitting1-audio-web.mjs`, peak about 58 dB below the saved-slider run | within 1 dB of it | Electron and web, null sink |
| Manual UI/hardware proof | n/a | user tests B1: a fresh install is audible on speakers | owner |

### Validation

- Narrow: `npx vitest run src/renderer`
- Required: `npm run verify`

## Slice 19: Destructive-Operation Failures

- Accepted finding IDs: PH-DATA-001 (reopened 2026-10-21 at P2)
- Priority/order: 19, P2; wave 2
- Implementation owner: Claude Code (acting), owner decision 12 (wave 2 go-ahead, 2026-11-02)
- Verifier: persistence reviewer
- Proposed branch: `remediation/p11-s19-destructive-failures`

### User-Visible Outcome

When a delete, bulk delete or restore fails on the filesystem, the message says the library
is unchanged and names the retry, with no raw OS error and no misleading `EISDIR`. A reset
retry reports success only when the old files are gone. A restart with a locked leftover
directory still opens the app.

### Boundaries Touched

- Renderer/UI: the failure messages in `src/renderer/components/LibraryScreen.tsx` and
  `SettingsScreen.tsx`.
- Storage/persistence: `src/storage/midiStorage.ts` and `recoverDurableOperations` in
  `src/persistence/database.ts`: the restore error that hides the rename failure, the
  reset retry that does not see the hidden `.midi-files-reset-<id>` directory, and the
  stale `restore-library:prepared` row.
- Host startup: the recovery call in `src/server/index.ts` and `src/main/index.ts`, so a
  locked leftover does not stop startup. The visible startup error belongs to slice 1
  ([PH-OPS-006](findings/PH-OPS-006.md)).

### Scope

Excluded: the rollback of delete, bulk delete and restore, which the proof run showed
works, and any new journal. Reset after a database commit either rolls back or keeps
failing until the files are gone; the slice picks one and records why.

### Failure And Data Safety Plan

No stored data is rewritten. The reset leftover stays recoverable. Rollback: code revert.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | a failing delete or restore shows `EACCES ... mkdir '.delete-<id>'`; restore on the 2nd file shows `EISDIR` | a message that names the retry and says the library is unchanged | unit and component |
| Targeted regression | a reset retry with the fault present says "User data deleted" | the failure repeats until the hidden directory is gone | unit |
| Web runtime | `scripts/audit/browser/proof-data001-web.mjs` | criteria (a) to (c) of the finding pass | headless Chromium |
| Electron runtime | `scripts/audit/electron/proof-data001-electron.mjs` | the same, and a locked leftover leaves the app with a window or a visible error | headless Electron |
| Recovery/integrity proof | the web server exits 1 with a locked leftover | startup completes; `integrity_check` ok | both runtimes |

### Validation

- Narrow: `npx vitest run src/persistence src/storage src/server`
- Required: `npm run verify`

## Slice 20: Fingering Preservation

- Accepted finding IDs: PH-MUS-017 (added 2026-10-21)
- Priority/order: 20, P2; wave 2
- Implementation owner: Claude Code (acting), owner decision 12 (wave 2 go-ahead, 2026-11-02)
- Verifier: music-correctness reviewer
- Proposed branch: `remediation/p11-s20-fingering-preserve`

### User-Visible Outcome

Changing a track's assignment in the session overlay keeps every saved fingering for the
song.

### Boundaries Touched

- Renderer/UI: `handleAssignmentChange` in `src/renderer/components/GameScreen.tsx` stops
  calling `clearCustomFingerings`. The fingerings are keyed by note id (PH-MUS-003), which
  an assignment change does not shift.

### Scope

Excluded: the explicit reset of fingerings (`handleResetFingerings`), which clears on request, and the restart prompt for
judged notes.

### Failure And Data Safety Plan

No stored data changes. If a reason to clear remains, the handler asks first and names the
fingerings.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | a `GameScreen` test: an assignment change calls `clearCustomFingerings` | it is not called, and the row remains | component |
| Electron runtime | `scripts/audit/electron/proof-mus-003.mjs` Ignore then Left Hand: row count 1 to 0 | the count stays 1 | headless Electron |
| Web runtime | the same sequence through the web bridge | the count stays 1 | headless Chromium |

### Validation

- Narrow: `npx vitest run src/renderer/components`
- Required: `npm run verify`

## Slice 21: ADR 0002 Window Items

- Accepted finding IDs: none. [ADR 0002](../../adr/0002-legacy-pianohero-compatibility-window.md)
  items 3, 4, 6 and 7 (owner decisions 8 and 14, 2026-11-02)
- Priority/order: 21; wave 2. They gate only the removal release (`0.3.0`): each must
  ship in a release before it, and the item 3 warning must be in the current release
  for a full release cycle first
- Implementation owner: Claude Code (acting), owner decision 14
- Verifier: runtime reviewer
- Proposed branch: `remediation/p11-s21-legacy-window`

### User-Visible Outcome

An operator sees at startup where the data lives and whether a legacy name found it, and
is warned while any `PIANOHERO_*` variable or a `.pianohero-data` directory is in use. A
blank or relative `LUMAKEYS_DATA_DIR` no longer starts an unexpected library: blank is
unset, and a relative path stops startup with a message that names it. `README.md` tells
a pre-rename install what to change.

### Boundaries Touched

- Web host: `resolveDataDir` in `src/server/index.ts` (the startup line, the warning,
  trimming, blank as unset, the absolute-path check) and `resolveWebAccessPolicy` in
  `src/server/webSecurity.ts` (already trims; gets the marker and the warning).
- Desktop host: the startup line in `src/main/index.ts` after the legacy profile lookup
  in `src/persistence/legacyBrandMigration.ts`, naming the profile directory and whether
  a legacy profile was carried over.
- Tooling: `scripts/ensure-native-module.cjs` (`LUMAKEYS_SKIP_ELECTRON_REBUILD` trimmed,
  the `PIANOHERO_*` warning). `src/server/museScore.ts` (`LUMAKEYS_MUSESCORE_PATH`
  trimmed, blank is unset).
- Markers: every shim gets `legacy-brand: remove in 0.3.0 (ADR 0002)` in place of its
  "one release" or "ponytail" comment: the two above, `src/server/bridgeRouter.ts`
  (the `piano-hero` mode alias), `legacyBrandMigration.ts`, `src/main/index.ts`,
  `src/renderer/webBridge.ts` and `src/renderer/legacyFilterPresets.ts`. The
  `game_results.mode` normalization is a data migration that stays (ADR item 5), so it is
  marked `legacy-brand: keep (ADR 0002 item 5)` instead.
- Docs: the upgrade note in `README.md` (item 7).

### Scope

Excluded: removing any shim, the tombstone check (item 5, the removal release's own
work), and the "ponytail" comments that are not legacy-brand shims
(`instrumentSamplePackStore.ts`, `museScore.ts` line 10). `PORT` is not a `LUMAKEYS_*`
variable and keeps its handling.

### Failure And Data Safety Plan

No stored data changes and no shim is removed. The only new refusal is a relative or
otherwise non-absolute `LUMAKEYS_DATA_DIR`, which today resolves against the working
directory and can open an empty library; the message names the value and the fix.
Docker sets `/data`, which is absolute. Rollback: code revert.

### Test-First Proof

| Proof | Fails before fix | Expected after fix | Runtime/fixture |
|---|---|---|---|
| Targeted regression | `resolveDataDir` with `LUMAKEYS_DATA_DIR` set to `''`, `'   '`, `'rel/data'` and `' /abs'` (legacy probe cases V1, V2, V3 and V5) | blank and whitespace are unset; `' /abs'` is trimmed; `'rel/data'` throws a message naming it | unit |
| Targeted regression | no startup line; no warning with `PIANOHERO_DATA_DIR` or a cwd `.pianohero-data` | one line naming the resolved directory and `legacy: yes/no`; one warning naming the legacy variable or directory | unit, both hosts |
| Web runtime | `scripts/audit/legacy-brand-server-probe.mjs` cases V1 to V8 and S1 to S9 | V3 exits 1 with the message; the others keep their data result and log the line | built server |
| Electron runtime | `scripts/audit/electron-userdata-probe.mjs` | the startup line names `<appData>/lumakeys` and whether a legacy profile was used | headless Electron |
| Marker inventory | `grep -rn "legacy-brand:"` finds nothing | it lists every shim above and nothing else | repository |

### Validation

- Narrow: `npx vitest run src/server src/persistence src/main`
- Required: `npm run verify`

### Resolution

- Fix branch/commit: `remediation/p11-s21-legacy-window`, `c2a6d16`, implemented
  2026-11-02, awaiting independent review; not merged. Branch base `c8f9b1a`.
- What changed: `resolveDataDir` moved to `src/server/dataDir.ts` (so it is testable without
  starting the server) and returns the directory with the legacy names that picked it.
  `LUMAKEYS_DATA_DIR` is trimmed, blank is unset, and a non-absolute value throws before
  anything is created. Shared `dataLocationLine` and `legacyNamesWarning` in
  `legacyBrandMigration.ts`. The web server logs `LumaKeys data directory: <dir> (legacy:
  yes|no)` and one warning naming the legacy variables or directory in use, values never
  printed; `resolveWebAccessPolicy` reports `legacyVariable` when the legacy token applied.
  Electron main logs the same line (`desktopDataLocationLine`) after the profile lookup.
  `ensure-native-module.cjs` trims both skip variables, names the one used, and warns for
  the legacy name. `LUMAKEYS_MUSESCORE_PATH` is trimmed. Markers placed as listed above;
  README gets "Upgrading From PianoHero".
- Tests (source identity `1180731`), each failed on `c8f9b1a` and passes after:
  `src/server/dataDir.test.ts` (V1, V2+V4, V3, V5, S5, S1/S2; module missing);
  `src/server/index.test.ts` "web server data directory" (V3 started instead of exiting 1;
  no `LumaKeys data directory:` line; no warning naming `PIANOHERO_WEB_ACCESS_TOKEN`);
  `webSecurity.test.ts` legacy-token cases (no `legacyVariable`); `desktopStartup.test.ts`
  `desktopDataLocationLine` (not a function); `museScore.test.ts` whitespace path (reached
  the converter check); `scripts/ensureNativeModule.test.mjs` (whitespace `' 1 '` did not
  skip). Base run: 6 files, 10 tests failed. `npm run verify` passes (586 tests).
- Driver result: `legacy-brand-server-probe.mjs` (now records `startupLog`) against the
  built server, `$TMPDIR` root: V3 exits 1 with the message and creates no data directory;
  every other case keeps its data result (S7 still refuses, as before) and logs the line;
  S1, S5, S8, V4, V6, V7, V8 log one warning naming the variable or directory; the token
  value never appears in a log. `electron-userdata-probe.mjs --harness` (now records
  `startupLine`) under `flock`: E1-E3, P1, P4 `legacy: yes`; E4, E5, P3 `legacy: no`;
  E6 and P2 refuse before the line, as before.
- Proof owed (agent-runnable): none beyond independent review. Human-only: none.
- Residual risk: the desktop host prints no warning, because Electron main reads no
  `PIANOHERO_*` variable or `.pianohero-data`; a carried-over profile is shown by `legacy:
  yes` and the existing "Migrated legacy profile" message. A deployment with a relative
  `LUMAKEYS_DATA_DIR` now refuses to start until it is set absolute.
- Revisit trigger: the removal release (`0.3.0`, on or after 2027-01-31), which removes
  every `legacy-brand: remove` site and adds the tombstone check (item 5).

## Proof Owed By Fixed Findings

These 60 findings are `fixed`, not `verified`. None needs new product code unless noted.
The owner sittings run by the agent on 2026-10-20
([report](phase-11-owner-sittings-2026-10-20.md)) moved PH-PAR-002, PH-UI-001, PH-UI-002
and PH-UI-004 to `verified`. The [agent proofs](phase-11-agent-proofs-2026-10-21.md) of
2026-10-21 moved PH-PAR-003, PH-ARCH-002, PH-MUS-003 and PH-DATA-002 to `verified`, and
removed them from this table. PH-DATA-001 failed its proof run and was reopened at P2; it
was `accepted` again and moved to slice 19, which merged on 2026-11-02 (below). On 2026-10-21 slice 0 (`d49b8a6`) added the
GameScreen recovery test, the last proof PH-ARCH-001 owed, so it moved to `verified` and
left this table. The same merge discharged the slice 0 parts of PH-MUS-002, PH-PAR-001
and PH-UI-003. Slices 2, 0 and 18 moved five findings from `accepted` to `fixed` (PH-OPS-002,
PH-SEC-002, PH-SEC-003, PH-OPS-005, PH-MUS-014), so they joined it. On the same day slices
1, 15 and 3 added seven more (PH-DATA-005, PH-DATA-006, PH-OPS-006, PH-DATA-004,
PH-DATA-007, PH-OPS-003, PH-SEC-005); PH-DATA-007 then passed its headless Electron run, moved
to `verified` and left this table. The follow-ups merged at `93ac583` fixed three more:
PH-SEC-006 and PH-UI-021 joined, and PH-MUS-018 passed its desktop and web runs and went
straight to `verified`. On 2026-11-02 wave 2 slices 6, 4 and 9 merged (`c7216e2`, `ea89f3e`, `6f327c9`) and moved nine more from `accepted` to `fixed`: PH-PAR-006, PH-MUS-007, PH-MUS-015, PH-MUS-005, PH-MUS-012, PH-MUS-016, PH-UI-019, PH-MUS-006, PH-MUS-008. Then slices 5, 20, 19 and 7 merged (`ccc68c2`, `c03f220`, `c8f9b1a`, `8fc933f`) and moved five more to `fixed`: PH-MUS-010, PH-MUS-011, PH-MUS-017, PH-DATA-001, PH-PAR-007. Then slices 21, 12 and 8 merged (`cb8926e`, `571571b`, `c1a1fbf`; slice 21 has no finding rows) and moved five more to `fixed`: PH-MUS-013, PH-UI-018, PH-DATA-009, PH-UI-006, PH-DATA-010. Then slices 11 and 10 merged (`1b95e9a`, `e1a3bf0`) and moved seven more to `fixed`: PH-UI-011, PH-UI-012, PH-UI-014, PH-UI-010, PH-UI-013, PH-UI-017, PH-UI-020. Then slices 23, 14, 16, 13, 24, 17 and 22 merged (`fde3104`, `05dd7aa`, `2d6593d`, `5e1e67f`, `5336959`, `750bb42`, `c170bc3`; slice 23, the lockfile, has no finding rows) and moved thirteen more from `accepted` to `fixed` and added two new findings already `fixed`: PH-DATA-008, PH-ARCH-003, PH-UI-015, PH-UI-016, PH-PAR-004, PH-UI-009, PH-ARCH-004, PH-SEC-004, PH-UI-005, PH-UI-007, PH-UI-008, PH-MUS-009, PH-PAR-005, PH-PAR-008, PH-MUS-019. The proof each of the 60 still owes follows. The
packaged runs "with the real lock" cannot run in the agent sandbox (the single-instance
lock needs a Unix socket); they run outside it, if the owner allows that through
`/sandbox`, or the real-display checks cover them:

| Finding | Severity | Owed proof | Where |
|---|---|---|---|
| PH-OPS-002 | P0 | Deploy with the token (the untracked compose override already reads it from `.env`), then repeat user tests A1 from a phone on mobile data: `/` sends a signed-out browser to `/login`, signing in loads the app, `/api/*` answers 401 without the cookie. Not run: `docker compose config` and a container start. The agent proved the unit and process tests and the probe (0 WARN) on a built server | owner A1 |
| PH-MUS-001 | P1 | Pause and resume on a real MIDI keyboard keeps judged state. A scripted Web MIDI device passed on both runtimes (sitting 4 item 4) | owner C3 |
| PH-MUS-002 | P1 | A musician's check of labels and loop bounds. The meter fixtures landed in slice 0 (`d49b8a6`); the MuseScore meter map (sitting 0 item 3) and an Electron non-4/4 loop (sitting 4 item 7) passed | owner C5 |
| PH-PAR-001 | P1 | A Windows package. It also exercises the asset assertion, now wired into `package:*` by slice 0 (`d49b8a6`). The capstone, the main-menu video and a pack install passed in a packaged Linux profile (sitting 1 item 1) | sitting 2 |
| PH-MUS-014 | P1 | The PulseAudio drivers `sitting1-audio-desktop.mjs` with `VOLUMES=fresh` and `sitting1-audio-web.mjs`, which the sandbox blocks (agent, outside the sandbox). A fresh install audible on speakers: the piano and metronome sound without touching a slider and Settings reads 80, 20 and 65. The unit and App tests passed | agent drivers; owner B1 |
| PH-DATA-003 | P2 | The required proof says the restore error names the affected song and the retry path. The observed message names the song id only. Either accept the id or add the title in slice 13 | owner decision at slice 13 |
| PH-MUS-004 | P2 | A held note stops when a real keyboard is unplugged. A scripted device released within 1 ms on both runtimes (sitting 4 item 2) | owner C2 |
| PH-UI-003 | P2 | GNOME's own reduced-motion switch. The canvas tests landed in slice 0 (`d49b8a6`); the OS setting through GTK and XSETTINGS passed in Chrome and the packaged app on X11 (sitting 1 item 3) | owner B3 |
| PH-SEC-002 | P2 | After the deploy, sign in once at `/login` in a private window; an old `?access_token=` link returns 401. The unit tests, the probe and the Chromium sign-in passed | owner A1 |
| PH-SEC-003 | P3 | A play-through with sound and the console open: in a real browser on the deployed web build and in the built desktop app, play a song, Free Play, Soundboard and Install Better Sounds; expect no CSP error other than the known PH-PAR-006 `undefinedblob:` ones. The headless Chromium and Electron CSP checks passed | owner A1 |
| PH-OPS-005 | P3 | Push `main`; a green `verify` workflow on GitHub; then a throwaway branch with one broken test that goes red, deleted afterwards. The clean-copy local CI runs and the wiring tests passed. The next `package:win` build runs the new asset assertion | owner push |
| PH-DATA-005 | P1 | The packaged Linux binary with the real single-instance lock over a carried-over profile (`electron-userdata-probe.mjs --packaged`), outside the sandbox. The question dialog and the carried-over library seen on a real display. Windows portable build over a real `%APPDATA%\luma-keys` profile, on a new build from `main` at `a84acb0` or later. Unit tests, the throwaway-app probe and the harness runs on the built `out/` passed | agent outside the sandbox; owner B10 to B12; sitting 2 item 1 |
| PH-DATA-006 | P3 | The same packaged rerun with the real lock. Whether Windows deletes `lumakeys.db-wal` and `-shm` on close, since the migration refuses while either is left. Unit, function-level and web cases passed | agent outside the sandbox; sitting 2 item 7 |
| PH-OPS-006 | P2 | The packaged exit code and the error dialog with the real lock, on a real display. Windows with two earlier profiles that both hold `pianohero.db`. The harness run (exit 1, dialog called once, both folders named) passed | owner B13, B14; sitting 2 item 6 |
| PH-DATA-004 | P3 | A browser profile that really installed a pack on the pre-rename release (optional; the owner may have none, then record it as not reproducible at runtime). The unit tests and the headless Chromium driver passed. Release gate: slices 1 and 15 verified in both runtimes | owner B6 (optional) |
| PH-OPS-003 | P2 | The packaged Linux app on a real display: launch, main menu, one song, a setting read back; an existing profile still opens. The Windows portable build. The clean `npm ci` and `npm run verify` on the merged tree, and the post-merge Electron 44 driver runs and Linux package build (Remediation Progress), passed | owner B7, B9; sitting 2 |
| PH-SEC-005 | P3 | A real click on a Soundboard credit link in the packaged app: the system browser opens and no LumaKeys window does. The unit tests, the driver on Electron 30.5.1 and 44.9.2, and the post-merge `window-open.mjs` run passed | owner B8; sitting 2 item 8 |
| PH-UI-021 | P3 | The system file dialog on a real display starts in the folder the app passes, on Linux (GNOME portal) and Windows. The unit tests and the headless `dialog-defaults.mjs` run (19 of 19, with a failing control) passed | owner B15; sitting 2 item 4 |
| PH-SEC-006 | P3 | After a redeploy from `93ac583` or later, the live site's `lumakeys_web_access` cookie shows `Secure`. The unit tests and the throwaway-container check of a `93ac583` image passed | owner A2 |
| PH-PAR-006 | P2 | `sitting1-audio-desktop.mjs` item 6 (needs PulseAudio; the lead runs it) and owner sitting 1 items 5 and 6 on speakers. Slice 6 merged in `c7216e2`; the web sample-pack and log driver passed in the slice | lead; owner sitting 1 items 5, 6 |
| PH-MUS-007 | P2 | The same PulseAudio item 6 and the speaker check; the WAV render probe and the Electron export driver passed in the slice | lead; owner sitting 1 items 5, 6 |
| PH-MUS-015 | P3 | The same PulseAudio item 6 and the speaker check of the release tail with an installed pack | lead; owner sitting 1 items 5, 6 |
| PH-MUS-005 | P2 | Owner sitting 4 item 4 and a Learn-mode loop on a MIDI keyboard. Slice 4 merged in `ea89f3e`; the Electron and web drivers passed on a main build | owner sitting 4 item 4 |
| PH-MUS-012 | P3 | None left. The driver reruns (`paused-input.mjs`, `workflows.mjs`, `pause-resume-focus.mjs`) and the Scale Practice 8-of-8 check passed on a main build | none |
| PH-MUS-016 | P3 | A Learn-mode loop on a MIDI keyboard (owner sitting 4 item 4). `sitting4-midi-web.mjs` and `sitting4-midi-desktop.mjs` item 7 with `seamMs = -15` passed on a main build | owner sitting 4 item 4 |
| PH-UI-019 | P3 | `sitting1-visual-chrome.mjs PHASE=ctrl0` in real Chrome (Ctrl+0 resets 125 % to 100 %), which needs Chrome and Xvfb outside the sandbox and was not run. The desktop `sitting1-visual-desktop.mjs` Ctrl+0 passed on a main build, and a headless Chromium substitute passed | lead |
| PH-MUS-006 | P2 | Optionally owner sitting 1 item 7 by ear. Slice 9 merged in `6f327c9`; the browser metronome driver passed on a main build (accents not proven) | owner sitting 1 item 7 (optional) |
| PH-MUS-008 | P3 | The same browser metronome driver rerun; stored songs keep their old BPM until re-imported, so a song imported before the fix stays as it was | lead |
| PH-MUS-010 | P2 | Owner sitting 4 item 3 with a real keyboard unplugged and replugged mid-song, listening that the song audio keeps playing after the unplug. Slice 5 merged in `ccc68c2`; the web driver and unit tests passed in the slice, and the Electron run (scripted device) on a main build | owner sitting 4 item 3 |
| PH-MUS-011 | P2 | Owner sitting 4 item 6 with two real keyboards if available. Slice 5 merged in `ccc68c2`; the Electron run of the Settings MIDI card (scripted device) passed on a main build | owner sitting 4 item 6 |
| PH-MUS-017 | P2 | None left. Slice 20 merged in `c03f220`; the Electron `proof-mus-003.mjs` already passes 27/27, and the web-bridge Ignore to Left Hand sequence passed in headless Chromium on a main build (checked in the store, not the finger shown on the note) | none |
| PH-DATA-001 | P2 | A real unwritable profile on Windows and macOS. Slice 19 merged in `c8f9b1a`; the web 31/31 and Electron 40/40 integrity drivers ran on the branch build | owner |
| PH-PAR-007 | P2 | Fresh Chrome with the MIDI permission prompt left unanswered for 30 s: the app loads (owner sitting 1 item 8). Slice 7 merged in `8fc933f` | owner sitting 1 item 8 |
| PH-MUS-013 | P3 | Owner sitting 1 capstone on a real MIDI keyboard: late presses no longer pass the gate. Slice 12 merged in `571571b`; the Electron `lesson-pass.mjs` run passed on a main build | owner sitting 1 |
| PH-UI-018 | P3 | The Electron learning driver run (lead): a drill that falls short returns to the lesson with its score and target. Slice 12 merged in `571571b`; `lesson-pass.mjs` passed on a main build but did not exercise the failed-drill wording | lead |
| PH-DATA-009 | P3 | The Electron learning driver run (lead): a lesson progress save that fails shows the error toast. Slice 12 merged in `571571b`; `lesson-pass.mjs` passed on a main build but did not exercise the save-failure banner | lead |
| PH-UI-006 | P2 | The owner keyboard-only and screen-reader read of the delete prompt. Slice 8 merged in `c1a1fbf`; the `library-one-hand.mjs` A2/A3 rerun passed on a main build | owner |
| PH-DATA-010 | P3 | The owner keyboard-only and screen-reader read of the new Delete User Data wording, on both runtimes. Slice 8 merged in `c1a1fbf` | owner |
| PH-UI-011 | P2 | The owner look at the boxed top-bar styling and owner sitting 3 items 2 and 3 in Edge and Firefox. Slice 11 merged in `1b95e9a`; Electron `keyboard-walk.mjs` (a) passed on a main build | owner |
| PH-UI-012 | P2 | Owner real-zoom check at 150 to 200 % with Settings clickable (sitting 1 item 2), in Edge and Firefox; the driver only emulates widths. Slice 11 merged in `1b95e9a` | owner sitting 1 |
| PH-UI-014 | P3 | A screen-reader pass over the pinned and closed popouts. Slice 11 merged in `1b95e9a`; Electron `keyboard-walk.mjs` (d) passed on a main build | owner |
| PH-UI-010 | P2 | The Edge and Firefox pass of the same walk (owner sitting 3 item 3). Slice 10 merged in `e1a3bf0`; Electron `keyboard-walk.mjs` parts (b), (c) and (e) passed on a main build | owner sitting 3 |
| PH-UI-013 | P3 | The owner keyboard pass in Edge and Firefox (sitting 3 item 3). Slice 10 merged in `e1a3bf0`; Electron `keyboard-walk.mjs` parts (b), (c) and (e) passed on a main build | owner sitting 3 |
| PH-UI-017 | P3 | The owner pass in Edge and Firefox (sitting 3 item 3). Slice 10 merged in `e1a3bf0`; Electron `keyboard-walk.mjs` parts (b), (c) and (e) passed on a main build | owner sitting 3 |
| PH-UI-020 | P3 | The owner pass in Edge and Firefox (sitting 3 item 3) and a screen-reader read of the error panel. The web recovery driver passed on the main build (83 of 83); the `keyboard-walk.mjs` parts once listed here never applied to this finding. Slice 10 merged in `e1a3bf0` | owner sitting 3 |
| PH-DATA-008 | P3 | None left. Slice 14 merged in `05dd7aa`; the web `keyboard-remap-persistence.mjs` rerun passed on a main build (`c170bc3`, 2026-11-02) | none |
| PH-ARCH-003 | P3 | None left. Slice 14 merged in `05dd7aa`; the Electron `workflows.mjs` rerun passed on a main build (`c170bc3`, 2026-11-02): `Electron settings with "off" []` | none |
| PH-UI-015 | P3 | The owner colour-vision play of a short song in both palettes (sitting 1 item 10, B5). Slice 16 merged in `2d6593d`; the `color-state-evidence.mjs` rerun with the `short-4-notes` fixture passed on a main build (`c170bc3`, 2026-11-02; the earlier "n/a" hit-loop failure no longer reproduces) | owner sitting 1 |
| PH-UI-016 | P3 | An Electron results-screen screenshot (sitting 1, under the Electron lock; not run); the colour-vision sitting (B5) covers the grade letter too. Slice 16 merged in `2d6593d`; `grade-badge-contrast.mjs` passed on a main build (`c170bc3`, 2026-11-02): every grade at least 3:1 in all 4 themes | lead; owner sitting 1 |
| PH-PAR-004 | P3 | None left. Slice 13 merged in `5e1e67f`; the Electron `workflows.mjs` WF-004 rerun and a web WF-004 run passed on a main build (`c170bc3`, 2026-11-02) | none |
| PH-UI-009 | P3 | An owner glance at the status line in the real window. Slice 13 merged in `5e1e67f`; the `mscz-upload-no-musescore.mjs` rerun and WF-004 passed on a main build (`c170bc3`, 2026-11-02) | owner |
| PH-ARCH-004 | P3 | None left. Slice 13 merged in `5e1e67f`; the `mscz-upload-no-musescore.mjs` rerun passed on a main build (`c170bc3`, 2026-11-02): 0 `fileData` or `destPath` leaks | none |
| PH-SEC-004 | P3 | Two parallel `.mscz` uploads in the Docker image (sitting 0 item 2); both should convert, the second after the first. Slice 13 merged in `5e1e67f`; the `mscz-upload-no-musescore.mjs` rerun passed on a main build (`c170bc3`, 2026-11-02) | owner sitting 0 |
| PH-UI-005 | P3 | A real trouble spot compared across Results and Progress in the desktop app. Slice 17 merged in `750bb42` | owner |
| PH-UI-007 | P3 | None left. Slice 17 merged in `750bb42`; the web `library-date-filter-timezone.mjs` rerun passed on a main build (`c170bc3`, 2026-11-02): 4 time zones, same day 1, adjacent days 0 | none |
| PH-UI-008 | P3 | The owner keyboard-only pass and a screen reader listening to the move announcement. Slice 17 merged in `750bb42`; the web `library-organize-bulk.mjs` rerun passed on a main build (`c170bc3`, 2026-11-02): 99 passed, 0 failed with the keyboard-reorder block committed in `d0a1da9` | owner |
| PH-MUS-009 | P3 | None beyond review; the unit tests cover it. Slice 17 merged in `750bb42`; `metronome-and-quiz.mjs` with the `metro-3-4-late-note.mid` fixture passed on a main build (`c170bc3`, 2026-11-02): 0.24 against 0.25 expected | none |
| PH-PAR-005 | P3 | None beyond review; a browser MIDI download is outside this finding. Slice 17 merged in `750bb42`; `freeplay-recording-export.mjs` passed on a main build (`c170bc3`, 2026-11-02) | none |
| PH-PAR-008 | P2 | None left. Slice 24 merged in `5336959`; the web reattach driver passed on a main build (`c170bc3`, 2026-11-02), and the client requested the Library snapshot after the reattach (the card itself was not checked visually) | none |
| PH-MUS-019 | P2 | The owner listens to the count-in on a fast song and a 6/8 song. Slice 22 merged in `c170bc3`; no count-in driver exists, so nothing was run (`leadin*.mjs` cover PH-MUS-018's lead-in length) | owner |
| PH-UI-022 | P1 | The owner looks at the Library and recommendation cards in their own install after updating, and the Electron build, which was not screenshotted. Slice 25 merged in `35063cb`; the web before and after screenshots (1280x800 and 420x800) show the cards fixed; the paused in-game control bar was not reached | owner |

Agent-runnable proofs run on a main build at `d393474` on 2026-11-02; results in each finding's Resolution. The `keyboard-walk.mjs` run did not cover PH-UI-012; PH-UI-020's real driver, the web `proof-ph-arch-001-recovery.mjs`, passed 83 of 83 on the same build, and the PulseAudio item 6 for PH-PAR-006, PH-MUS-007 and PH-MUS-015 did not run (no PulseAudio server on this host).

Wave 3 agent-runnable proofs ran on a main build at `c170bc3` on 2026-11-02, in a detached worktree with throwaway data directories; results are in each finding's Resolution. The proof agent patched only its own copies of two drivers: `harness.mjs` read a port from `LK_PORT`, and `reattach-and-overlay.mjs` got request logging and a wider wrong-file pattern (its first run printed null from a regex miss; the product was fine). Not run: the Electron results-screen screenshot for PH-UI-016, and any count-in driver for PH-MUS-019 (none exists).

## Phase 11 Remediation Start Gate

Before a slice starts:

- The owner gives the go-ahead for the slice's wave. Owners, verifiers and branches are
  set under [Owner Selection](#owner-selection-2026-10-20).
- The implementer reproduces the "Fails before fix" check on the current `main` and
  records the source identity if `main` has moved past `4466626`.
- Data stays isolated as described under the shared rules.

## Phase 11 Planning Completion

- Accepted findings planned: 51 of 51 (updated 2026-10-21 after the agent proofs).
- P0 planned: 1 of 1 (PH-OPS-002, slice 2).
- P1 planned: 2 of 2 (PH-DATA-005, slice 1; PH-MUS-014, slice 18).
- P2 planned: 16 of 16 (PH-DATA-001, slice 19; PH-MUS-017, slice 20).
- P3 planned: 32 of 32 (PH-DATA-010, slice 8; PH-UI-020, slice 10).
- Findings merged or dropped: 0.
- Findings held back: 1. PH-OPS-004 is `accepted-risk` (owner decision 2).
- Product changes made: 0.
- Remaining gate: the owner's go-ahead for wave 1. Selection and assignment are done
  (owner decision 4).
- Progress, 2026-10-21: the go-ahead was given and wave 1 is under way. See
  [Remediation Progress](#remediation-progress-2026-10-21). The counts above are the
  planning record and stay as written.
