# PH-MUS-002: Imported MIDI Measure Maps Are Replaced By A Fixed 4/4 Grid

- Lane: music correctness
- Severity: P1
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, fresh isolated-fixture challenge
- Verifier: independent fresh-context verification agent; mixed-meter runtime proof pending
- Affected runtime: both
- Coverage rows: WF-004, WF-008, WF-009, DATA-004, DATA-012, MOD-011
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

For imported MIDI containing 3/4 or other non-4/4 meter, tempo changes, or a song
ending exactly at a bar boundary, LumaKeys assigns note accuracy to the wrong
measure and offers incorrect loop ranges. A one-bar 4/4 song exposes a selectable
second bar with a zero-second loop. Results and trouble-spot recommendations can
therefore direct a learner to the wrong musical section.

## Expected Behavior Or Oracle

Standard MIDI header meter and tempo events determine musical bars. The installed
`@tonejs/midi` parser exposes `header.timeSignatures`, `header.tempos`, ticks, and
`ticksToMeasures`; its parsed notes already use that tempo map for seconds. LumaKeys
must preserve or derive an equivalent measure map before presenting bar numbers,
looping by measure, or persisting measure accuracy.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime: Linux x86_64, Node v24.15.0.
- Data profile/fixture: fresh in-memory `@tonejs/midi` files only; no user data.
- Hardware: none.

### Reproduction

1. Create and parse a 120 BPM, 3/4 MIDI file with a note at tick 1440, the first
   beat of measure two.
2. Compare the parser's `ticksToMeasures(1440)` with LumaKeys's
   `getMeasureIndexForTime` on the parsed note time.
3. Request loop measure two from LumaKeys.
4. Create a 4/4 fixture with 120 BPM at tick zero and 60 BPM from tick 1920, then
   compare the measure of a note at tick 3840.
5. Create one 4/4 bar ending at tick 1920 and request the last selectable loop.

The fixtures printed:

```text
{"expectedMeasureAtNote":1,"pianoHeroMeasureAtNote":0,"pianoHeroLoopMeasure2":{"startSec":2,"endSec":2}}
{"expectedMeasureAtNote":2,"pianoHeroMeasureAtNote":3}
{"durationSec":2,"expectedMeasureCount":1,"pianoHeroMeasureCount":2,"phantomLoop":{"startSec":2,"endSec":2}}
```

### Artifacts

- The parser's local interface omits time signatures, tempo ticks, and measure
  conversion, then retains only the first BPM: `src/lib/midi/midiFileParser.ts:24-32`
  and `src/lib/midi/midiFileParser.ts:83-121`.
- All bar math assumes four beats at that one BPM: `src/lib/game/songUtils.ts:142-173`.
- GameSession uses this value for measure accuracy and loop bounds:
  `src/lib/game/GameSession.ts:243-264` and `src/lib/game/GameSession.ts:298-322`.
- GameScreen exposes the calculated total and loops to users:
  `src/renderer/components/GameScreen.tsx:217-225` and `src/renderer/components/GameScreen.tsx:1176-1190`.
- The existing MIDI parser test proves only a simple constant-tempo, default-meter
  file; the focused Phase 3 suite otherwise passed.

## Root Cause

The app converts a MIDI score into a seconds-only model before preserving its musical
measure metadata. Later code reconstructs bars from `durationSec` and a fixed 4/4
first-tempo grid. It also treats a note ending exactly at a bar boundary as evidence
of a following complete bar.

## Recommended Remediation Boundary

Extend the parsed-song contract with stable tick positions and a canonical measure
map derived from the MIDI header. Build loops, measure counts, scoring buckets,
trouble spots, and result serialization from that map rather than estimating from
seconds. Define the terminal-boundary rule so a song ending on a bar boundary has no
phantom trailing loop. Update parser, game utilities, session/result consumers, and
the affected bridge DTO only if persisted measure numbers require a migration.

## Required Regression Proof

- Deterministic unit/integration proof: 3/4, 6/8, time-signature-change,
  tempo-change, and exact-end-bar fixtures each produce expected measure indices,
  counts, loop ranges, and measure-accuracy buckets.
- Electron proof: import a disposable non-4/4 MIDI file, loop a named measure, and
  verify the rendered/playback start and end match the score.
- Web proof: identical imported bytes produce identical loop and result measure
  numbers in a desktop browser.
- Data/recovery proof: saved measure history/trouble spots use the same measure map
  after reload and backup/restore.
- Manual hardware/UI proof: a musician verifies visible measure labels and loop
  boundaries on a named mixed-tempo/non-4/4 file.
- Broader regression command: `npm test`, `npm run build`, and `npm run build:web`.

## Challenge Record

- Independent reproduction attempt: fresh three fixture families produced the same
  mismatch without storage, renderer timing, or audio involvement.
- Alternative explanations tested: `@tonejs/midi` retained the source tempo and
  time-signature maps, and its own tick conversion produced the expected bar numbers.
  LumaKeys's simple MIDI baseline test remains valid for its narrow fixture.
- Scope/severity changes: 3/4, tempo change, and phantom-bar symptoms were merged
  because they share the lost measure-map boundary.
- Deduplication decision: not PH-DATA-003; this is a musical interpretation defect,
  not MIDI-byte identity validation.
- Challenger conclusion and date: accepted by Codex, 2026-07-11; independent
  verifier required before a P1 fix is marked verified.

## Resolution

- Accepted rationale: common supported MIDI metadata produces wrong user-visible practice sections and persisted measure guidance.
- Fix branch/commit/issue: `d5839aa`, verified implementation in `d4ba395`.
- Verification evidence: parser/loop fixture tests and independent source review pass; 6/8, changing-meter, cross-runtime import, persistence, and musician proof remain in [Phase 10](../phase-10-verification-2026-08-07.md).
  Owner sittings run by the agent, 2026-10-20: [sitting 0](../phase-11-owner-sittings-2026-10-20.md#sitting-0-docker-image-and-live-host) item 3 ran `scripts/audit/musescore-measure-check.sh` in the Docker image; the direct and served sections each report "2 file(s), 0 failed check(s)", and the `meter-tempo` bars (4/4 then 3/4, 120 then 60 BPM) match the SMF reference and the oracle. [Sitting 4](../phase-11-owner-sittings-2026-10-20.md#sitting-4-midi-keyboard) item 7 imported `6-8-then-3-4-reached.mid` on the web and the desktop: the bar count reads "/ 4", the loop reads "Looping measures 3-4", each pass has six notes, and 12 of 12 are perfect in both runtimes. The HUD resets to 0 | 0 at each wrap, which is the current design.
- Residual risk: the 6/8 and two-meter fixtures are not yet regression tests under `src/` (slice 0), and the musician's check of bar labels and loop bounds is still owed ([user test C5](../phase-11-user-tests.md)). An early downbeat at the loop seam is dropped; that is a separate finding, [PH-MUS-016](PH-MUS-016.md).
- Slice 0 (2026-10-21, `remediation/p11-s00-ci`, run by the agent): the meter fixtures are now regression tests, which supersedes the first half of the residual risk above (the musician's check, user test C5, is still owed). `src/lib/midi/midiFileParser.test.ts` gains a `meter fixtures` group over byte copies of three lane C files in `src/lib/midi/fixtures/` (`pure-6-8.mid`, `6-8-then-3-4-reached.mid`, `3-4-to-4-4-tempo.mid`), with the hand-written seconds and ticks from `measure-fixtures.oracle.json`: pure 6/8 gives three 1.5 s measures and the right note-to-measure map and loop bounds; 6/8 then 3/4 gives four boundaries with the last 6/8 note in measure 1 and the first 3/4 note in measure 2, and loop 2-3 is 3.0 to 6.0 s; 3/4 then 4/4 with a 120 to 60 BPM change gives boundaries at ticks 1440, 2880, 4800 and 6240 (6.0 to 9.0 s) and ends at the last note-off, not the barline. Local mutation checks, not committed: forcing four beats per measure fails all three fixture tests and the earlier 3/4 test; ignoring a later signature event (`signatureIndex` never advances) fails the 3/4 then 4/4 test. The 6/8 to 3/4 change falls on a barline and both measures are 1440 ticks, so only the tempo and meter fixture detects a skipped signature event.
- Revisit trigger: before the next MIDI/gameplay release-readiness review.
