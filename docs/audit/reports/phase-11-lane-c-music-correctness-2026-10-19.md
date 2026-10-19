# Phase 11 Lane C: Practice Engine And Music Correctness

- Lane owner: Claude Code (acting)
- Reviewer/challenger: Claude Code (acting); each candidate finding carries its own challenge record; lead challenge pending
- Baseline identity: `main` at `6e549b6` (later commits are audit docs only); web build in `dist/` from that source, not rebuilt by this lane
- Started: 2026-10-19
- Last updated: 2026-10-19
- Status: complete for the sandbox; owed runtime proof staged for sittings 0, 1, and 4

## Scope

- Coverage rows: WF-008 to WF-014, MOD-011
- User journeys: start a song session; measure map, loops, and per-measure results; tempo
  changes during a run; custom fingering inside a loop; scoring and the in-game
  metronome; theory quiz and interval trainer answer order; MuseScore-converted MIDI
  (lead L-11-017, staged)
- Runtimes: product code under Node 24 with tsx (controlled clock, no UI); the built web
  app in headless Chromium 141 (Playwright 1.56.1) on port 3795; Electron 30.5.1 run as
  Node for the JavaScript engine check only. The Electron UI was not run
- Data boundaries: isolated data directories under `$TMPDIR/p11/C/` only; no real data
- Explicit exclusions: lesson and capstone runtime (WF-011) beyond the measure maps of the
  bundled curriculum files (the lane F lessons run owns it); audible output; MIDI
  hardware; Docker (not reachable from the sandbox)

Delta in this lane's files (`git diff 0bd40f5..6e549b6 --stat -- src/lib src/renderer/components/GameScreen.tsx`):
8 files, 42 insertions and 17 deletions, almost all the `'piano-hero'` to `'luma-keys'`
session-mode rename plus an `importMetadata` title change. The database migration and the
bridge alias normalize old `'piano-hero'` rows. No scoring, timing, or measure logic
changed, so the Phase 3 oracles still apply; this lane re-ran them where the plan asked
and looked for defects Phase 3 did not cover.

## Evidence Plan

| Surface | Oracle/invariant | Method/fixture | Runtime | Expected artifact |
|---|---|---|---|---|
| Measure map (PH-MUS-002 gap) | SMF tempo and meter rules; hand oracle written before the run | `scripts/audit/measure-map-probe.ts` on 8 fixtures (7 generated, 1 from lane F) and 4 bundled curriculum files | Node + product code | PASS/FAIL per check |
| Measure consumers | Same bar for a note in the parser, `getMeasureIndexForTime`, loop scheduling, and result buckets | Same probe, `GameSession` with controlled clock at tempo 1 and 0.5 | Node + product code | Consumer checks |
| Quiz answer order | Position of the answer carries no information | Real builders extracted as text, 20,000 questions per type; engine matrices; UI run | Node 24, Electron 30, Chromium 141 | Position distributions |
| Scoring numbers | `ScoringEngine` windows and points | Code read against lane F's 275 and 350 | n/a | Arithmetic match |
| Metronome | One click per beat at the practice tempo; accent on the barline | Verbatim replay on the real clock; browser run logging `OscillatorNode.start` | Node; web | Click times |
| PH-MUS-001 tempo/structure | Tempo change keeps judged state; structural change asks first | `scripts/audit/browser/practice-runtime-proofs.mjs` part 1 | web | HUD before/after, dialog text |
| PH-MUS-003 fingering identity | Override binds to the musical note, not the scheduled index | Same driver part 2, plus `getCustomFingerings` | web | Popup text, stored row |
| MuseScore input (L-11-017) | Same measure oracle on converted MIDI | Hand-built `.mscz` fixtures, oracle, one-command host script | Docker (owner) | Staged for sitting 0 |

## Working Flows Confirmed

| Coverage row | Evidence | Conditions/limits | Disposition |
|---|---|---|---|
| WF-008, MOD-011 | Measure probe: 7 of 8 fixtures pass every check against both the hand oracle and an independent SMF reference (lane F's 6/8-then-3/4 file; pure 6/8; 6/8 then 3/4 with notes in the 3/4 bars; 3/4 to 4/4 with 120 to 60 BPM mid-bar; pickup as a 1/4 bar; pickup as rests; last note ending on a barline). The 8th (`late-first-tempo.mid`) fails only for PH-MUS-008. Bundled curriculum files: 4 of 4 pass, 0 failed checks | Product code, no UI; Electron shares the parser | covered for the measure map |
| WF-008, WF-009 | No terminal phantom measure: `exact-end-no-ts.mid` (last note ends on the barline at 4 s) gives 2 bars, and an out-of-range loop (0-based index 5) clamps to the last bar [2, 4] s | Product code | covered |
| WF-009, MOD-011 | One-bar loops schedule exactly that bar's notes and bucket results under the same measure index, including at tempo 0.5; hand filter keeps the boundaries | Product code, controlled clock | covered |
| WF-009 (PH-MUS-001) | Web, Learning mode, `pmus-16.mid`: four notes judged, HUD "400, combo 4"; tempo set to 75% in the session overlay: HUD still "400, combo 4"; after Resume the next note scores: "500, combo 5"; clicking Left Hand raised "Changing the session setup restarts this run. Continue?"; Cancel left "500, combo 5" and mode Learning | Chromium 141, isolated data; dialog dismissed by the driver | covered on web |
| WF-008 (PH-MUS-003) | Web: loop 2-2 set ("Looping measures 2-2"); Edit Fingering; first loop note E4 (`track-0-note-2`) popup "current 3"; finger 5 chosen; stored row `{noteIndex: -1, noteId: "track-0-note-2", finger: 5, hand: "right"}`; after Clear Loop, the full song's first note C4 shows "current 3" and E4 shows "current 5" | Chromium 141; notes clicked at positions computed from `GameSession` (`scripts/audit/note-positions.ts`) | covered on web |
| WF-009, WF-010 | Lane F scores match the code: Learning 275 = 100 + 75 + 50 + 50 (a late press in wait mode is judged at delta 0, so perfect; early presses inside the window grade good or ok); Play 350 = 2 × 100 + 2 × 75. Windows: perfect ≤ 25%, good ≤ 50%, ok ≤ 100% of `hitWindowMs` (default 100 ms); combo multiplier 1 + 0.1 per 10, cap 3 | Code read (`ScoringEngine.ts:4-6, 33-37, 48`; `GameSession.ts:338`) | covered |
| WF-012, WF-013 | Quiz and trainer content: in 20,000 questions per type no duplicated choice, no missing answer, no answer listed twice, always 4 choices (quiz) or 4/6 (trainer) | Real builders | covered for content; order defect PH-MUS-009 |

## Findings

No existing finding re-raised. Candidates (provisional IDs, for the lead to renumber):

| Finding | Why it belongs to this lane | Shared lanes |
|---|---|---|
| [PH-MUS-006](findings/PH-MUS-006.md) | Metronome rate and accents are a music-correctness rule | E (audible check, optional) |
| [PH-MUS-009](findings/PH-MUS-009.md) | Quiz scoring validity | none |
| [PH-MUS-008](findings/PH-MUS-008.md) | Parser tempo map | F (import metadata) |

## Re-Verification Records (PH-MUS-001 to 004)

| Finding | Fix present at `6e549b6` | Runtime proof done | Runtime proof owed | Verdict |
|---|---|---|---|---|
| PH-MUS-001 | yes; delta touches only the mode rename in `GameScreen.tsx` | web: tempo change keeps judged state, structural change asks and Cancel keeps the run (this lane); computer-keyboard completion and persisted history (lane F, `play-short-song.mjs`) | Electron completion and persistence: blocked, no display for Electron in the sandbox, owed to sitting 1 (item 5 and proposed item 8). MIDI controller: blocked, no device, owed to sitting 4 item 3 | holds |
| PH-MUS-002 | yes; `types.ts` change is the rename | product-code proof for 6/8, meter change, tempo change mid-bar, pickup forms, exact-bar end (this lane's probe). The re-verification proof gap is closed at probe level; the deterministic test in `src/` is still missing (see Missing Deterministic Tests) | MuseScore-converted MIDI: blocked, no Docker in the sandbox, owed to sitting 0 (proposed item 5) | holds; separate root cause raised as PH-MUS-008 |
| PH-MUS-003 | yes | web UI: override set in a loop binds to `track-0-note-2` and is shown on that note, not on the full song's first note | Electron (IPC instead of HTTP bridge): blocked, owed to sitting 1 (proposed item 8) | holds |
| PH-MUS-004 | yes (no change near) | none possible: headless Chromium exposes no MIDI devices and the sandbox has no virtual MIDI port | Physical unplug and replug: blocked, owed to sitting 4 item 2 | holds by unit tests |

## Evidence Gaps

| Coverage row | Missing proof | Why blocked | Owner | Next action |
|---|---|---|---|---|
| WF-004, WF-008 (L-11-017) | MuseScore-converted MIDI through the measure oracle | Docker socket not reachable | repository owner | Sitting 0 proposed item 5 |
| WF-008, WF-009, WF-010 | Electron run of the same practice proofs | no display for Electron | repository owner | Sitting 1 item 5 and proposed item 8 |
| WF-012, WF-013, WF-014 | Electron completion and persistence | no display for Electron | repository owner | Sitting 1 proposed item 9 |
| WF-009 | MIDI controller input, held-note release on disconnect | no device | repository owner | Sitting 4 items 2 and 3 |
| WF-011 | Lesson and capstone runtime | outside this lane's tasks | lane F lessons run | merge from lane F |

## Runtime And Failure Coverage

- Electron: not run (no display); the JavaScript engine of Electron 30.5.1 was used as Node to measure the shuffle bias it ships with.
- Web: Learning-mode runs with tempo change, structural-change confirmation, loop, and fingering edit; metronome click timing at 100 and 50 percent; 40 always-first Chord ID quizzes.
- Loading/empty/disabled: not in scope for this lane.
- Error/retry/recovery: structural change Cancel path (run kept).
- Destructive/interruption: none.
- Accessibility or hardware proof: none; audible metronome and MIDI proofs owed (sittings 1 and 4).

## MuseScore Fixtures (L-11-017)

Built by hand in `scripts/audit/fixtures/musescore/` from the minimal MuseScore 4 score
format the product's own integration test uses (`museScore.integration.test.ts`):

- `meter-tempo.mscx` / `.mscz`: two parts (Melody, Bass), measures 1-2 in 4/4 at 120 BPM,
  3/4 from measure 3, 60 BPM from measure 4. Expected MIDI at 480 ticks per quarter:
  4/4 at tick 0, 3/4 at 3840, 120 BPM at 0, 60 BPM at 5280; barlines at 0, 2, 4, 5.5, 8.5 s.
- `pickup.mscx` / `.mscz`: one-beat pickup (`<Measure len="1/4">`) under 4/4, then two full
  bars. MuseScore is expected to export the pickup as a 1/4 signature at tick 0; the
  conversion will confirm or refute that.
- Each `.mscz` is a zip of `META-INF/container.xml` and `score.mscx`, made by
  `build-mscz.sh`. XML is well formed (checked with Python's parser). Whether MuseScore
  4.7.5 accepts the hand-built archives is unverified; the host script falls back to the
  `.mscx` source and also has MuseScore write a proper `.mscz`.
- `musescore.oracle.json`: hand oracle (measure count, note-to-measure, note start
  seconds, one-bar loops, BPM). Boundaries are not asserted because the last bar ends at
  the last note-off, which depends on MuseScore's exported note lengths; the probe's SMF
  reference covers every boundary. The oracle path was tested on simulated exports of
  both scores: 0 failed checks.
- Owner command (sitting 0, after `docker compose build`):
  `bash scripts/audit/musescore-measure-check.sh 2>&1 | tee "${TMPDIR:-/tmp}/musescore-measure-check.out"`.
  It converts both scores with the image's MuseScore (`docker run` with only the fixture
  directory and a `mktemp` directory mounted; never `/media/storage/lumakeys`), then
  starts the image's web server on `127.0.0.1:3799` with an empty data directory, uploads
  each `.mscz` through `POST /api/midi/upload`, downloads the stored MIDI from
  `GET /api/midi/<songId>`, and runs the measure probe with the oracle on both the direct
  and the uploaded MIDI.
- Manual equivalent for one file:
  `docker run --rm --user "$(id -u):$(id -g)" --entrypoint /opt/musescore/bin/mscore4portable -e HOME=/tmp -e XDG_RUNTIME_DIR=/tmp -e QT_QPA_PLATFORM=offscreen -e MU_QT_QPA_PLATFORM=offscreen -e LANG=C.UTF-8 -v "$PWD/scripts/audit/fixtures/musescore:/fixtures:ro" -v "$OUT:/out" "$(docker compose config --images | head -1)" -o /out/meter-tempo.mid /fixtures/meter-tempo.mscz`
  then `npx tsx scripts/audit/measure-map-probe.ts "$OUT/meter-tempo.mid" --oracle scripts/audit/fixtures/musescore/musescore.oracle.json`.
- The `meter-tempo.mscz` fixture can also serve as the "any `.mscz`" for sitting 0 item 3.

## Observations (no finding)

- Lane F's `meter-6-8-then-3-4.mid` never reaches its 3/4 signature: the event is at tick
  2880 and the last note-off at 2870, so it proves two bars of 6/8 only. Use
  `scripts/audit/fixtures/midi/6-8-then-3-4-reached.mid` for the meter change.
- The final bar ends at the last note-off, not at the barline (the PH-MUS-002 fix's
  documented behavior). In `3-4-to-4-4-tempo.mid` the musical last barline is tick 6720
  (10 s); the product ends the bar at 6240 (9 s). A loop of the last bar stops at the last note.
- The parser has no pickup (anacrusis) handling. A pickup written as a short signature
  becomes measure 1; a pickup written as rests makes the rest bar measure 1. Either way the
  first full bar is "Measure 2", unlike printed scores. No product requirement asks for
  printed numbering, so this is not a finding; sitting 0 will show which form MuseScore uses.
- The scale quiz offers "Chromatic" as a distractor in 9,592 of 20,000 questions but never
  asks it (`TheoryQuizScreen.tsx:152` excludes it as an answer), so it can always be ruled out.
- Hit windows are measured in song time: at 50 percent tempo the 100 ms window is 200 ms
  of wall time. No product statement says otherwise.
- `GameScreen.tsx:1057` listens for a `lumakeys-shortcut` window event that nothing
  dispatches; at `0bd40f5` it listened for `pianohero-shortcut`, also never dispatched.
  Dead code, not a regression.
- The metronome never clicks song time 0 (the first sample only seeds its counter); left
  to the PH-MUS-006 remedy.
- The bundled curriculum MIDIs have no time-signature events (4/4 by default) and set the
  tempo at tick 0; `minuet-in-g.mid` is arranged in 4/4 rhythm, so the default matches.
- In the browser quiz run only 20 of 40 results were saved. The driver navigates away
  right after the last answer, which likely aborts the asynchronous save; driver
  artifact, not pursued.

## Missing Deterministic Tests

Not added to `src/` (read-only lane). Suggested:

1. `midiFileParser.test.ts`: two meters plus a mid-bar tempo change (the
   `3-4-to-4-4-tempo.mid` shape): boundaries `[0,1440]`, `[1440,2880]`, `[2880,4800]`,
   `[4800,6240]` ticks and `[0,1.5]`, `[1.5,3]`, `[3,6]`, `[6,9]` s; and pure 6/8 with bars
   of 1440 ticks. This closes the PH-MUS-002 proof gap in the re-verification report.
2. `midiFileParser.test.ts`: first tempo after tick 0 (PH-MUS-008).
3. A pure metronome beat helper test: click times at tempo 0.5, 1, 1.5 and accents on
   barlines for 3/4, 6/8, and a meter change (PH-MUS-006).
4. Shuffle uniformity with a seeded random source (PH-MUS-009).

## Challenge Summary

- Claims disproved or narrowed: the earlier 5 of 10 always-first quiz score is within
  chance under either engine (P = 0.12 to 0.27); the bias is real but was shown by the
  probes, not by that run. The lane F meter fixture does not test a meter change.
- Duplicates merged: none. PH-MUS-006 and PH-MUS-008 were checked against the PH-MUS-002
  ledger rule; both have independent root causes outside the measure-boundary code.
- Severity changes: PH-MUS-006 held at P2 (opt-in aid, no data or score impact), with a
  note that the lead may weigh P1. PH-MUS-008 held at P3 pending real-world frequency.
- Environmental failures separated: `npx tsx` fails in the sandbox (IPC socket EPERM), so
  probes ran with `node --import tsx`; the first browser runs stopped at the first-run
  setup guide and at the overlay-only tempo slider, both fixed in the drivers. A probe
  bug that skipped the first file when no `--oracle` was given was fixed before the
  final runs.

## Lane Exit Check

- [x] Every assigned coverage row has an owner.
- [x] Every assigned row has evidence and disposition, or an explicit gap.
- [x] All findings link to detailed reports and coverage rows.
- [x] P0/P1 leads were independently challenged (none raised).
- [x] Positive/working behavior is recorded.
- [x] Manual and hardware gaps are explicit.
- [ ] Coverage summary counts were updated (lead, at merge).

## Sign-Off

- Lane owner/date: Claude Code (acting), 2026-10-19
- Challenger/date: pending lead
- Audit lead/date: pending

## Proposed Matrix Updates

- WF-008: `gap`; [P11-C](reports/phase-11-lane-c-music-correctness-2026-10-19.md); web session start, measure maps for 6/8, meter and tempo changes, and fingering identity across a loop proven; Electron owed (sitting 1 item 8), MuseScore input owed (sitting 0 item 5); PH-MUS-008.
- WF-009: `gap`; [P11-C](reports/phase-11-lane-c-music-correctness-2026-10-19.md); web tempo change keeps judged state and structural changes ask first, loop scheduling and buckets proven on product code; metronome defect PH-MUS-006; Electron (sitting 1), MIDI and latency (sitting 4) owed.
- WF-010: `gap`; [P11-C](reports/phase-11-lane-c-music-correctness-2026-10-19.md); lane F's web scores (275, 350) match the scoring code and per-measure buckets match the measure map; Electron completion owed (sitting 1 item 5).
- WF-011: `gap`; [P11-C](reports/phase-11-lane-c-music-correctness-2026-10-19.md); measure maps of all four bundled curriculum MIDIs pass the probe; lesson and capstone runtime left to the lane F lessons run, Electron owed.
- WF-012: `gap`; [PH-MUS-009](reports/findings/PH-MUS-009.md); quiz content valid in 100,000 generated questions, but answer position is biased (36% first in Electron); Electron completion owed (sitting 1 item 9).
- WF-013: `gap`; [PH-MUS-009](reports/findings/PH-MUS-009.md); same bias in the interval trainer (29% first on 6-choice levels against 17%); Electron and audio owed (sitting 1).
- WF-014: `gap`; [P11-C](reports/phase-11-lane-c-music-correctness-2026-10-19.md); no new lane C evidence beyond lane F's web drill; Electron owed (sitting 1 item 9); PH-MUS-005 stands.
- MOD-011: `covered`; [P11-C](reports/phase-11-lane-c-music-correctness-2026-10-19.md); deterministic probes on the product code for measure maps, loops, buckets, scoring, and the metronome; new candidates PH-MUS-006 and PH-MUS-008; hardware and audio gaps stay explicit (sittings 1 and 4).

## Proposed User-Test Items

Sitting 0 (host terminal), new item 5, and a precondition update:

- Precondition for item 3: `scripts/audit/fixtures/musescore/meter-tempo.mscz` can be used as the `.mscz` (`cp scripts/audit/fixtures/musescore/meter-tempo.mscz $TMPDIR/score.mscz`); if item 5 reports the hand-built archive was rejected, use the MuseScore-written copy it leaves in its work directory.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 5 | WF-004, WF-008, L-11-017, PH-MUS-002 | After item 2's `docker compose build`, from the repository root: `bash scripts/audit/musescore-measure-check.sh 2>&1 \| tee "${TMPDIR:-/tmp}/musescore-measure-check.out"`. Paste the output or the file. It uses only throwaway directories and port 3799 on 127.0.0.1 | Two probe sections (direct and served), each ending `2 file(s), 0 failed check(s)`. Any FAIL line is evidence either way; a "rejected" line for the hand-built `.mscz` is acceptable if the `.mscx` fallback converts | | |

Sitting 1 (this Linux machine, desktop app with an isolated profile), new items 8 and 9:

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 8 | WF-008, WF-009, PH-MUS-001, PH-MUS-003 (Electron) | Import `scripts/audit/fixtures/midi/pmus-16.mid`, press Learn. Click the note area, press Space; after the 3-2-1 count play `,` `.` `/` `Q` as each note reaches the line. Press Escape, drag Tempo to 75%, click Resume, click the note area, play `,`. Press Escape, click Left Hand, choose Cancel. Then go back to the Library and press Learn on the same song again (fresh run, do not press Space). Press Escape, set Loop 2 to 2, click Set Loop, click Edit Fingering, click Resume, click the note nearest the keyboard and choose 5, Close. Press Escape, click Clear Loop, click Resume. Click the note nearest the keyboard, read the popup, Close; click the third note up from the keyboard, read the popup | Score 400 with combo 4 before the tempo change, still 400 after it, 500 after the next note; Left Hand asks "Changing the session setup restarts this run. Continue?" and Cancel keeps 500. First loop note is E4 ("current 3" before choosing 5). After clearing the loop the first note (C4) says "current 3" and the third (E4) says "current 5" | | |
| 9 | WF-012, WF-013, WF-014 (Electron) | Complete one Theory Trainer Chord ID quiz, one Interval Trainer session, and one Scale Practice C major drill (click the keyboard area after Start Drill, see PH-MUS-005). Open Progress | All three complete and appear in Progress | | |

Sitting 4 items 2 and 3 already cover PH-MUS-004 and PH-MUS-001 on a MIDI controller; no change.

## Candidate Findings

| ID | Severity | Summary |
|---|---|---|
| [PH-MUS-006](findings/PH-MUS-006.md) | P2 | In-game metronome applies the practice tempo twice (every second beat at 50%, off-grid at other tempos) and accents every fourth click regardless of meter or tempo changes |
| [PH-MUS-009](findings/PH-MUS-009.md) | P3 | Theory quiz and interval trainer shuffle with a random sort comparator; the answer is first 36% and first-or-last 67% of the time in the desktop runtime |
| [PH-MUS-008](findings/PH-MUS-008.md) | P3 | A first tempo event after tick 0 shifts all later notes and barlines (2 s in the fixture) and sets the stored BPM to the later tempo |

## Files Created

- `docs/audit/reports/phase-11-lane-c-music-correctness-2026-10-19.md` (this report)
- `docs/audit/reports/findings/PH-MUS-006.md`, `PH-MUS-009.md`, `PH-MUS-008.md`
- `scripts/audit/measure-map-probe.ts`: measure-map probe with SMF reference, consumer checks, optional oracle
- `scripts/audit/metronome-replay-probe.ts`: verbatim replay of the in-game metronome on the real clock
- `scripts/audit/note-positions.ts`: where `GameSession` draws notes at session start (input for the fingering driver)
- `scripts/audit/shuffle-bias-probe.cjs`: position matrix of the product's shuffle under Node or Electron
- `scripts/audit/musescore-measure-check.sh`: sitting 0 host script for L-11-017
- `scripts/audit/browser/metronome-and-quiz.mjs`: Chromium shuffle matrix, metronome click timing, always-first quiz run
- `scripts/audit/browser/practice-runtime-proofs.mjs`: PH-MUS-001 tempo/structure and PH-MUS-003 fingering identity in the web UI
- `scripts/audit/fixtures/midi/`: 9 generated MIDI fixtures plus a copy of lane F's 6/8-then-3/4 file, `build-fixtures.cjs` (rebuilds them byte for byte), `measure-fixtures.oracle.json` (hand oracle written before the first probe run, sha256 `0c8c224e69028ec6c27f0c5b530fe3ea4303b6146f0fae3ea7496f0e3068d9f9`)
- `scripts/audit/fixtures/musescore/`: `meter-tempo.mscx`, `meter-tempo.mscz`, `pickup.mscx`, `pickup.mscz`, `container.xml`, `build-mscz.sh`, `musescore.oracle.json`
- Not committed, under `$TMPDIR/p11/C/`: probe and driver outputs (`measure-probe-final.out`, `curriculum-probe.out`, `metronome-replay.out`, `metronome-and-quiz.out`, `practice-runtime-proofs.out`, `quiz-probe.out`, `interval-probe.out`, `electron-shuffle.out`, `node-shuffle.out`, `late-tempo-metadata.out`, `mscz-sim-probe.out`), the quiz-builder extraction scripts in `quiz/`, and the isolated data directories
