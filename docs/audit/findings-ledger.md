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
|---|---|---|---|---|---|---|---|---|---|
| PH-SEC-001 | Desktop sample-pack removal allows path traversal deletion | SEC | P0 | high | Electron | verified | DATA-014, OP-003, OP-006, OP-013, MOD-008 | [PH-SEC-001](reports/findings/PH-SEC-001.md) | Codex (acting) |
| PH-DATA-001 | Cross-store destructive operations commit SQLite before filesystem work | DATA | P2 | high | both | accepted | DATA-001, DATA-002, DATA-013, OP-002, OP-005, OP-007, OP-009, OP-015 | [PH-DATA-001](reports/findings/PH-DATA-001.md) | Codex (acting) |
| PH-DATA-002 | Full user-data reset leaves instrument sample packs behind | DATA | P2 | high | both | verified | DATA-014, DATA-015, OP-006, OP-009 | [PH-DATA-002](reports/findings/PH-DATA-002.md) | Codex (acting) |
| PH-DATA-003 | Backup restore does not verify MIDI content IDs | DATA | P2 | high | both | fixed | DATA-002, DATA-013, OP-005 | [PH-DATA-003](reports/findings/PH-DATA-003.md) | Codex (acting) |
| PH-MUS-001 | Live session controls erase judged practice state | MUS | P1 | high | both | fixed | WF-009, WF-010, MOD-003, MOD-011 | [PH-MUS-001](reports/findings/PH-MUS-001.md) | Codex (acting) |
| PH-MUS-002 | Imported MIDI measure maps are replaced by a fixed 4/4 grid | MUS | P1 | high | both | fixed | WF-004, WF-008, WF-009, DATA-004, DATA-012, MOD-011 | [PH-MUS-002](reports/findings/PH-MUS-002.md) | Codex (acting) |
| PH-MUS-003 | Custom fingerings bind to a filtered session index | MUS | P2 | high | both | verified | WF-008, WF-009, DATA-007, BR-032, BR-033, BR-034, MOD-003, MOD-011 | [PH-MUS-003](reports/findings/PH-MUS-003.md) | Codex (acting) |
| PH-MUS-004 | MIDI device disconnect leaves held notes active | MUS | P2 | high | both | fixed | WF-002, WF-009, RT-011, MOD-003, MOD-011 | [PH-MUS-004](reports/findings/PH-MUS-004.md) | Codex (acting) |
| PH-PAR-001 | Electron production output omits required public runtime assets | PAR | P1 | high | Electron | fixed | WF-011, WF-016, WF-019, BR-060, BR-067, OP-006, MOD-012 | [PH-PAR-001](reports/findings/PH-PAR-001.md) | Codex (acting) |
| PH-PAR-002 | Browser file-picker cancellation leaves import promises pending | PAR | P2 | high | web | verified | WF-004, WF-006, WF-020, BR-008, BR-010, BR-058, OP-001, OP-005, MOD-004, MOD-009 | [PH-PAR-002](reports/findings/PH-PAR-002.md) | Codex (acting) |
| PH-PAR-003 | Supported legacy MIDI migration loads only in Electron | PAR | P2 | high | both | verified | DATA-002, WF-004, WF-006, WF-008, WF-009, BR-011, BR-059, OP-002, MOD-008, MOD-009 | [PH-PAR-003](reports/findings/PH-PAR-003.md) | Codex (acting) |
| PH-UI-001 | Immersive session dialogs do not contain keyboard focus | UI | P2 | high | both | verified | WF-009, WF-015, WF-016, WF-024, RT-008, MOD-003, MOD-006 | [PH-UI-001](reports/findings/PH-UI-001.md) | Codex (acting) |
| PH-UI-002 | Settings tabs are clipped at required desktop zoom | UI | P1 | high | both | verified | WF-003, WF-018, WF-019, WF-021, WF-022, RT-006, RT-008, MOD-005, MOD-007 | [PH-UI-002](reports/findings/PH-UI-002.md) | Codex (acting) |
| PH-UI-003 | Immersive canvases ignore reduced-motion preference | UI | P2 | high | both | fixed | WF-015, WF-016, RT-009, MOD-006 | [PH-UI-003](reports/findings/PH-UI-003.md) | Codex (acting) |
| PH-UI-004 | Escape exits Settings while cancelling a destructive confirmation | UI | P2 | high | both | verified | WF-018, WF-021, WF-022, WF-024, RT-008, MOD-002, MOD-005 | [PH-UI-004](reports/findings/PH-UI-004.md) | Codex (acting) |
| PH-ARCH-001 | Practice-session prerequisite failures leave the session loading | ARCH | P2 | high | both | verified | WF-008, WF-009, BR-015, BR-032, BR-053, MOD-003 | [PH-ARCH-001](reports/findings/PH-ARCH-001.md) | Codex (acting) |
| PH-ARCH-002 | Keyboard mapping reports success before its durable write settles | ARCH | P2 | high | both | verified | WF-003, WF-018, BR-054, MOD-002, MOD-005 | [PH-ARCH-002](reports/findings/PH-ARCH-002.md) | Codex (acting) |
| PH-OPS-001 | Docker build context can embed default user data and environment files | OPS | P1 | high | web | verified | OP-014, MOD-012 | [PH-OPS-001](reports/findings/PH-OPS-001.md) | Codex (acting) |
| PH-SEC-002 | Access token accepted in the URL query string and documented as the login path | SEC | P2 | high | web | fixed | OP-014, OP-018, MOD-010 | [PH-SEC-002](reports/findings/PH-SEC-002.md) | Claude Code (acting) |
| PH-SEC-003 | Web HTML responses carry no Content-Security-Policy or related security headers, and the desktop renderer has no CSP either | SEC | P3 | high | both | fixed | OP-016, MOD-010, MOD-013, MOD-014 | [PH-SEC-003](reports/findings/PH-SEC-003.md) | Claude Code (acting) |
| PH-SEC-004 | One MuseScore conversion blocks every other import for up to 45 seconds | SEC | P3 | high | web | accepted | OP-017, WF-025, MOD-013 | [PH-SEC-004](reports/findings/PH-SEC-004.md) | Claude Code (acting) |
| PH-SEC-005 | Soundboard source links open remote sites inside an Electron window with no navigation guard | SEC | P3 | high | Electron | fixed | MOD-014, OP-013, MOD-008 | [PH-SEC-005](reports/findings/PH-SEC-005.md) | Claude Code (acting) |
| PH-SEC-006 | The web access cookie is never marked Secure behind the Cloudflare Tunnel | SEC | P3 | high | web | fixed | OP-014, MOD-010 | [PH-SEC-006](reports/findings/PH-SEC-006.md) | Claude Code (acting) |
| PH-OPS-002 | Default web deployment exposes `/api/*` with no app-level gate | OPS | P0 | high | web | fixed | OP-014 | [PH-OPS-002](reports/findings/PH-OPS-002.md) | Claude Code (acting) |
| PH-OPS-003 | Shipped desktop runtime Electron 30.5.1 is past end of life | OPS | P2 | high | Electron | fixed | MOD-012, MOD-008, OP-013 | [PH-OPS-003](reports/findings/PH-OPS-003.md) | Claude Code (acting) |
| PH-OPS-004 | A default-state SQLite database remains in git history | OPS | P3 | high | runtime-independent | accepted-risk | MOD-012, DATA-003, DATA-004 | [PH-OPS-004](reports/findings/PH-OPS-004.md) | Claude Code (acting) |
| PH-OPS-005 | No continuous integration enforces the typecheck, test, or asset baseline | OPS | P3 | high | runtime-independent | fixed | MOD-012 | [PH-OPS-005](reports/findings/PH-OPS-005.md) | Claude Code (acting) |
| PH-DATA-004 | Web sample packs installed before the rename are orphaned in the browser | DATA | P3 | high | web | fixed | DATA-015, DATA-017, OP-006, OP-009, MOD-009 | [PH-DATA-004](reports/findings/PH-DATA-004.md) | Claude Code (acting) |
| PH-MUS-005 | Computer-keyboard notes are ignored whenever an on-screen button has focus | MUS | P2 | high | both | accepted | WF-003, WF-009, WF-014, WF-015, RT-008 | [PH-MUS-005](reports/findings/PH-MUS-005.md) | Claude Code (acting) |
| PH-PAR-004 | A corrupt MIDI upload reports "undefined" instead of the parser's reason | PAR | P3 | high | both | accepted | WF-004, WF-005 | [PH-PAR-004](reports/findings/PH-PAR-004.md) | Claude Code (acting) |
| PH-UI-005 | Progress dashboard shows trouble-spot measures one lower than every other screen | UI | P3 | high | both | accepted | WF-017 | [PH-UI-005](reports/findings/PH-UI-005.md) | Claude Code (acting) |
| PH-ARCH-003 | First-run setup stores "off" in an integer setting | ARCH | P3 | high | both | accepted | WF-001, WF-018 | [PH-ARCH-003](reports/findings/PH-ARCH-003.md) | Claude Code (acting) |
| PH-DATA-005 | Desktop update opens an empty library because the legacy profile lookup misses every real pre-rename `userData` directory | DATA | P1 | high | Electron | fixed | DATA-017, OP-015 | [PH-DATA-005](reports/findings/PH-DATA-005.md) | Claude Code (acting) |
| PH-DATA-006 | An interrupted legacy database rename is not finished on restart; WAL-only commits are dropped or startup is refused | DATA | P3 | high | both | fixed | DATA-017, OP-015 | [PH-DATA-006](reports/findings/PH-DATA-006.md) | Claude Code (acting) |
| PH-DATA-007 | Library filter presets saved before the rename are no longer offered | DATA | P3 | high | both | verified | DATA-016, DATA-017 | [PH-DATA-007](reports/findings/PH-DATA-007.md) | Claude Code (acting) |
| PH-MUS-006 | In-game metronome applies the practice tempo twice and ignores meter and tempo changes | MUS | P2 | high | both | accepted | WF-009, MOD-011 | [PH-MUS-006](reports/findings/PH-MUS-006.md) | Claude Code (acting) |
| PH-MUS-007 | Free Play WAV export renders silence because it schedules on the live Transport inside `Tone.Offline` | MUS | P2 | high | Electron | accepted | WF-015 | [PH-MUS-007](reports/findings/PH-MUS-007.md) | Claude Code (acting) |
| PH-MUS-008 | A MIDI file whose first tempo event comes after tick 0 is timed with a jump at that event | MUS | P3 | high | runtime-independent | accepted | WF-004, WF-008, MOD-011 | [PH-MUS-008](reports/findings/PH-MUS-008.md) | Claude Code (acting) |
| PH-MUS-009 | Theory quiz and interval trainer place the correct answer first or last more often than chance | MUS | P3 | high | both | accepted | WF-012, WF-013 | [PH-MUS-009](reports/findings/PH-MUS-009.md) | Claude Code (acting) |
| PH-OPS-006 | A desktop startup failure leaves a running process with no window and the error only on stderr | OPS | P2 | high | Electron | fixed | OP-015, DATA-017 | [PH-OPS-006](reports/findings/PH-OPS-006.md) | Claude Code (acting) |
| PH-UI-006 | Deleting songs has no confirmation and silently removes their practice history | UI | P2 | high | both | accepted | WF-007 | [PH-UI-006](reports/findings/PH-UI-006.md) | Claude Code (acting) |
| PH-UI-007 | The library "Date Added" filter mixes UTC and local time and misplaces songs by up to a day | UI | P3 | high | both | accepted | WF-007 | [PH-UI-007](reports/findings/PH-UI-007.md) | Claude Code (acting) |
| PH-UI-008 | Playlist order can only be changed by dragging | UI | P3 | high | both | accepted | WF-007 | [PH-UI-008](reports/findings/PH-UI-008.md) | Claude Code (acting) |
| PH-UI-009 | A failed upload still tells the user to "Review the metadata before playing" | UI | P3 | high | both | accepted | WF-025, WF-004 | [PH-UI-009](reports/findings/PH-UI-009.md) | Claude Code (acting) |
| PH-UI-010 | Latency calibration dialog is not keyboard operable and its Escape leaves Settings | UI | P2 | high | both | accepted | RT-008, WF-018, MOD-005 | [PH-UI-010](reports/findings/PH-UI-010.md) | Claude Code (acting) |
| PH-UI-011 | Top-bar navigation has no visible keyboard focus or current-page indicator | UI | P2 | high | both | accepted | RT-008, WF-024, MOD-007 | [PH-UI-011](reports/findings/PH-UI-011.md) | Claude Code (acting) |
| PH-UI-012 | Immersive HUD bar collides with its own controls at 150 to 189 percent zoom | UI | P2 | high | both | accepted | RT-006, RT-003, MOD-007 | [PH-UI-012](reports/findings/PH-UI-012.md) | Claude Code (acting) |
| PH-UI-013 | Soundboard Escape leaves the screen after the session menu has been opened once | UI | P3 | high | both | accepted | RT-008, WF-016, WF-024, MOD-002 | [PH-UI-013](reports/findings/PH-UI-013.md) | Claude Code (acting) |
| PH-UI-014 | Closed HUD popouts stay in the Tab order as aria-hidden, invisible controls | UI | P3 | high | both | accepted | RT-008, WF-015, WF-016, MOD-003, MOD-006 | [PH-UI-014](reports/findings/PH-UI-014.md) | Claude Code (acting) |
| PH-UI-015 | Colour-blind palette paints missed notes the same colour as pending right-hand notes | UI | P3 | high | both | accepted | RT-010, WF-009, MOD-003 | [PH-UI-015](reports/findings/PH-UI-015.md) | Claude Code (acting) |
| PH-UI-016 | Results grade letter fails text contrast in the default theme | UI | P3 | high | both | accepted | RT-010, WF-010 | [PH-UI-016](reports/findings/PH-UI-016.md) | Claude Code (acting) |
| PH-UI-017 | Settings confirmation dialog drops focus to the page body when it closes | UI | P3 | high | both | accepted | RT-008, WF-018, WF-021, WF-022, MOD-005 | [PH-UI-017](reports/findings/PH-UI-017.md) | Claude Code (acting) |
| PH-PAR-005 | Web Free Play records a take but offers no way to keep it, and says it can be exported | PAR | P3 | high | web | accepted | WF-015 | [PH-PAR-005](reports/findings/PH-PAR-005.md) | Claude Code (acting) |
| PH-ARCH-004 | The web upload response echoes every imported MIDI back as a JSON object and discloses the server path | ARCH | P3 | high | web | accepted | WF-004, WF-025 | [PH-ARCH-004](reports/findings/PH-ARCH-004.md) | Claude Code (acting) |
| PH-PAR-006 | Web "Install Better Sounds" stores the pack but never plays it | PAR | P2 | high | web | accepted | WF-019 | [PH-PAR-006](reports/findings/PH-PAR-006.md) | Claude Code (acting) |
| PH-MUS-010 | Connecting or disconnecting any MIDI device restarts the song being played | MUS | P2 | high | both | accepted | WF-002, WF-009, RT-011 | [PH-MUS-010](reports/findings/PH-MUS-010.md) | Claude Code (acting) |
| PH-MUS-011 | A saved MIDI device that is gone keeps filtering input while Settings reads "Any connected device" | MUS | P2 | high | both | accepted | WF-002, WF-018, RT-011 | [PH-MUS-011](reports/findings/PH-MUS-011.md) | Claude Code (acting) |
| PH-PAR-007 | The web app stays on "Loading services..." until the MIDI permission prompt is answered | PAR | P2 | high | web | accepted | WF-001, WF-002, RT-011 | [PH-PAR-007](reports/findings/PH-PAR-007.md) | Claude Code (acting) |
| PH-DATA-008 | Unbinding a key does not survive a reload, so remapped keys come back doubled | DATA | P3 | high | both | accepted | WF-003, DATA-016 | [PH-DATA-008](reports/findings/PH-DATA-008.md) | Claude Code (acting) |
| PH-UI-018 | A lesson drill that falls short returns to the lesson with no score and no target | UI | P3 | high | both | accepted | WF-011 | [PH-UI-018](reports/findings/PH-UI-018.md) | Claude Code (acting) |
| PH-DATA-009 | Lesson progress that fails to save is lost without a message | DATA | P3 | high | both | accepted | WF-011, DATA-016 | [PH-DATA-009](reports/findings/PH-DATA-009.md) | Claude Code (acting) |
| PH-MUS-012 | Notes pressed while the song is not playing (before Space, during the count-in, or while paused) are judged against the frozen clock and score | MUS | P3 | high | both | accepted | WF-009, WF-011, WF-014, MOD-003, MOD-011 | [PH-MUS-012](reports/findings/PH-MUS-012.md) | Claude Code (acting) |
| PH-MUS-013 | Capstone accuracy in wait-for-input mode rewards waiting and penalises anticipation, so the tier gate does not measure timing | MUS | P3 | high | both | accepted | WF-011, MOD-011 | [PH-MUS-013](reports/findings/PH-MUS-013.md) | Claude Code (acting) |
| PH-MUS-014 | On a fresh profile the app plays about 60 dB too quietly while Settings shows the default volumes | MUS | P1 | high | both | fixed | WF-015, WF-016, WF-018, WF-009 | [PH-MUS-014](reports/findings/PH-MUS-014.md) | Claude Code (acting) |
| PH-MUS-015 | Installed instrument packs cut notes off 0.1 s after release | MUS | P3 | high | Electron | accepted | WF-019 | [PH-MUS-015](reports/findings/PH-MUS-015.md) | Claude Code (acting) |
| PH-MUS-016 | In a loop, a downbeat played slightly early at the seam is dropped | MUS | P3 | high | both | accepted | WF-009, WF-002 | [PH-MUS-016](reports/findings/PH-MUS-016.md) | Claude Code (acting) |
| PH-UI-019 | Ctrl+0 cannot reset the zoom because the computer keyboard takes Digit0 as a note | UI | P3 | high | both | accepted | RT-006 | [PH-UI-019](reports/findings/PH-UI-019.md) | Claude Code (acting) |
| PH-MUS-017 | Changing a track assignment silently deletes every saved fingering for the song | MUS | P2 | high | both | accepted | WF-008, DATA-007, BR-034, MOD-003 | [PH-MUS-017](reports/findings/PH-MUS-017.md) | Claude Code (acting) |
| PH-DATA-010 | The reset confirmation does not name packs, practice history or fingerings, and on the web says "from this device" for server-side data | DATA | P3 | high | both | accepted | DATA-014, OP-009, WF-022 | [PH-DATA-010](reports/findings/PH-DATA-010.md) | Claude Code (acting) |
| PH-UI-020 | The song-load error panel does not take focus, and Retry is about 54 Tab presses away | UI | P3 | high | both | accepted | WF-009, RT-008, MOD-003 | [PH-UI-020](reports/findings/PH-UI-020.md) | Claude Code (acting) |
| PH-MUS-018 | On a fresh profile the count-in after the 3-2-1 countdown is lost while Settings shows 2 lead-in beats | MUS | P3 | high | both | verified | WF-009, WF-018, MOD-002, MOD-003 | [PH-MUS-018](reports/findings/PH-MUS-018.md) | Claude Code (acting) |
| PH-UI-021 | Since the Electron 44 upgrade every desktop file dialog opens in Downloads and forgets the last folder | UI | P3 | high | Electron | fixed | WF-004, WF-005, WF-006, WF-020, MOD-008 | [PH-UI-021](reports/findings/PH-UI-021.md) | Claude Code (acting) |

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
- Phase 11 re-audited the delta from `0bd40f5` to `4466626` on `main`. All 18
  earlier findings still hold. PH-SEC-001 moved to `verified` after its desktop and
  web runtime proof on 2026-10-20. 44 new findings were raised: PH-SEC-002 to 005,
  PH-OPS-002 to 006, PH-DATA-004 to 009, PH-MUS-005 to 013, PH-PAR-004 to 007,
  PH-UI-005 to 018, and PH-ARCH-003 and 004. The consolidation also found 11 finding
  files that still read "accepted" although this ledger has said `fixed` since
  Phase 9, and corrected the files. See
  [the Phase 11 consolidation](reports/consolidation-2026-10-20.md).
- Phase 11 owner decisions, 2026-10-20: PH-OPS-004 moved to `accepted-risk` at P3 after
  the agent read every database blob in history and found no personal data; history is
  not rewritten (decision 2). The legacy-name fallback may be removed no earlier than
  2027-01-31 and only in a release after the carry-over release (decision 3). The owner
  accepted the remediation waves and assignments in
  [the remediation plan](reports/phase-11-remediation-plan-2026-10-20.md#owner-selection-2026-10-20);
  no slice has started (decision 4). On 2026-10-21 the owner added slice 18
  (PH-MUS-014) to wave 1, after slice 0 (decision 5).
- Phase 11 owner sittings, 2026-10-20: the agent ran sittings 0, 1, 3 and 4 itself
  (Docker, the packaged Linux app, real Chrome, Edge and Firefox, null-sink audio, a
  scripted MIDI device); sitting 2 (Windows) and the hardware, speaker and
  colour-vision checks still need the owner. See
  [the sittings report](reports/phase-11-owner-sittings-2026-10-20.md). PH-OPS-002
  moved to `accepted` at P0: the live host serves `/api` with no login, and the owner's
  phone on mobile data got the app with no login too (user tests A1). PH-PAR-002,
  PH-UI-001, PH-UI-002 and PH-UI-004 moved to `verified`. Four new findings were
  raised: PH-MUS-014 (P1), PH-MUS-015, PH-MUS-016 and PH-UI-019 (P3). PH-UI-012 is
  now confirmed under real zoom. Coverage stands at 154 of 156 rows; RT-010 (colour
  vision) and RT-011 (real MIDI hardware) stay blocked.
- Phase 11 agent proofs, 2026-10-21: the agent ran the proof each `fixed` finding still
  owed on this host, on throwaway profiles (see
  [the agent proofs report](reports/phase-11-agent-proofs-2026-10-21.md)).
  PH-PAR-003, PH-ARCH-002, PH-MUS-003 and PH-DATA-002 moved to `verified`.
  PH-ARCH-001 stays `fixed`: its browser proof passed in Edge, Firefox and Chromium, and
  only the slice 0 GameScreen test is owed. PH-DATA-001 failed re-verification and was
  reopened (`fixed` to `reproduced` to `accepted` the same day) at P2, lowered from P1:
  the data-loss path is fixed, and what is left is error wording, a reset retry that
  reports success while old files remain, and a startup that stops while the leftover is
  locked; it moves to new slice 19. Three findings were raised: PH-MUS-017 (P2),
  PH-DATA-010 and PH-UI-020 (P3). The OP-017 residual is closed: the MuseScore timeout,
  CPU and output limits all fired through real uploads. Coverage stays 154 of 156.
- Phase 11 wave 1 merges, 2026-10-21: the owner gave the go-ahead for wave 1, and slices
  2, 0 and 18 and task D1 merged to `main` (`ed07ce2`, `d49b8a6`, `db86adc`, `64a8160`)
  after independent review. PH-OPS-002, PH-SEC-002, PH-SEC-003, PH-OPS-005 and PH-MUS-014
  moved from `accepted` to `fixed`; each still owes runtime or owner proof (deploy with
  the token and repeat user tests A1, a green and a red GitHub run, the PulseAudio drivers
  and speaker test B1). PH-ARCH-001 moved from `fixed` to `verified`: its last owed proof,
  the GameScreen recovery test, landed with slice 0. PH-MUS-002, PH-PAR-001 and
  PH-UI-003 stay `fixed` with their slice 0 proof discharged. One finding was raised:
  PH-MUS-018 (P3), found during slice 18's review, `reproduced` and awaiting the owner's
  decision. Counts: 70 findings (11 verified, 11 fixed, 46 accepted, 1 reproduced,
  1 accepted-risk). See [the remediation plan](reports/phase-11-remediation-plan-2026-10-20.md#remediation-progress-2026-10-21).
- Phase 11 wave 1 merges, 2026-10-21, second half: slice 0's follow-up `a7517ae` (a
  `TheoryHubScreen` test race that failed one in three full `verify` runs), slice 1 (`c95586b`),
  slice 15 (`8d73767`) and slice 3 (`a84acb0`) merged after independent review; slice 1 passed
  its re-review after repairs for a blocker (an orphan WAL could overwrite the current
  library with no backup). PH-DATA-005, PH-DATA-006, PH-OPS-006, PH-DATA-004, PH-DATA-007,
  PH-OPS-003 and PH-SEC-005 moved from `accepted` to `fixed`. None is `verified`: each still
  owes a packaged-binary run with the real single-instance lock, the owner's real display,
  Windows sitting 2 on a new build, or (PH-DATA-004) a browser profile that installed a pack
  before the rename. All of wave 1's code is on `main`; the owner proofs remain. One
  finding was raised: PH-UI-021 (P3), found in the slice 3 implementation and review, a
  desktop regression from the Electron 43 dialog change, `reproduced` from the release notes
  and the code and awaiting the owner's decision. Counts: 71 findings (11 verified, 18 fixed,
  39 accepted, 2 reproduced, 1 accepted-risk). PH-DATA-007 then moved to `verified` after a
  headless Electron run of the preset carry-over on a carried-over profile: 12 verified,
  17 fixed. See
  [the remediation plan](reports/phase-11-remediation-plan-2026-10-20.md#remediation-progress-2026-10-21).
- Owner decisions, 2026-10-21: PH-MUS-018 and PH-UI-021 moved from `reproduced` to
  `accepted`, both to be fixed at once as wave 1 follow-ups (PH-UI-021 remembers each
  dialog's folder until the app closes). Plan lead (j) became PH-SEC-006 (P3, `accepted`):
  the web access cookie is never marked `Secure` behind the Cloudflare Tunnel. Counts:
  72 findings (12 verified, 17 fixed, 42 accepted, 1 accepted-risk). The same day the five unpushed commits that recorded a
  personal author address were rewritten to the GitHub noreply address, which gave all 78
  unpushed commits new hashes; tracked files cite the new ones
  ([lookup table](reports/commit-hash-rewrite-2026-10-21.md)).
- Phase 11 wave 1 follow-ups, 2026-10-21: three merged to `main` after independent review,
  `8a0a764` (PH-MUS-018), `d5507a6` (PH-UI-021) and `93ac583` (PH-SEC-006, plus plan leads
  (a), (b), (f) and (k): hono 4.13.13, `engines.node`, and the dead native rebuild path
  removed). PH-SEC-006 and PH-UI-021 moved from `accepted` to `fixed`; they owe the owner's
  redeploy and A2, and B15 and sitting 2 item 4. PH-MUS-018 moved from `accepted` to
  `verified` after the post-merge desktop and web runs on a clean copy of `93ac583`, with a
  pre-fix control. Counts: 72 findings (13 verified, 19 fixed, 39 accepted,
  1 accepted-risk). See
  [the remediation plan](reports/phase-11-remediation-plan-2026-10-20.md#remediation-progress-2026-10-21).

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
- PH-DATA-001 was reopened on 2026-10-21 at P2 and keeps the cross-store failure
  handling: error wording, reset retry and startup with a locked leftover. A reset that
  fails after the database commit stays here, not in a new finding.
- PH-MUS-017 owns the unconditional fingering clear on a track-assignment change. Do not
  merge it with PH-MUS-003, which owns fingering note identity.
- PH-DATA-010 owns the Delete User Data confirmation copy. Do not merge it with PH-UI-006,
  which owns the missing song-delete confirmation, or with PH-DATA-002, which owned the
  packs left behind.
- PH-UI-020 owns focus placement in the song-load error panel. Do not merge it with
  PH-UI-017 (focus restore after a Settings dialog) or PH-ARCH-001 (the panel's existence).
- PH-MUS-018 owns the lead-in count read as `0` on a profile that never saved it. Do not
  merge it with PH-MUS-014, which owns the audio levels read the same way, or with
  PH-ARCH-003, which owns the integer setting that first-run setup writes as "off".
- PH-UI-021 owns the desktop file dialogs' start folder (Downloads, no remembered folder)
  since Electron 43. Do not merge it with PH-OPS-003, whose fix is the upgrade itself, or
  with PH-PAR-004 and PH-UI-009, which own what an import reports after a file is picked.
