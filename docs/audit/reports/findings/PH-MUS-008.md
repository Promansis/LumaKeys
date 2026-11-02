# PH-MUS-008: A MIDI file whose first tempo event comes after tick 0 is timed with a jump at that event

- Lane: MUS
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), lane C, 2026-10-19
- Verifier: TBD
- Affected runtime: runtime-independent (shared parser, used by import metadata in both runtimes and by every practice screen)
- Coverage rows: WF-004, WF-008, MOD-011
- Related/duplicate findings: PH-MUS-002 (canonical for tempo-change measure symptoms; this root cause is in the parser's tempo map, not in the measure-boundary code, see Challenge Record)
- First observed against: `main` at source identity `4466626`, Phase 11 lane C

## User Impact

Standard MIDI files default to 120 BPM until the first Set Tempo event. When that
event sits later than tick 0, LumaKeys times everything before it at 120 BPM but
places the event itself as if the new tempo had applied from the start. The result is
a jump at the event: the note sounding there is held too long or cut short, and every
later note, barline, loop range, and the song length are shifted. The library also
stores and shows the later tempo as the song's BPM. In the fixture (first tempo of
60 BPM at the start of bar 2) the fourth note lasts 2.5 s instead of 0.5 s, the second
bar starts at 4 s instead of 2 s, and the song is 8 s long instead of 6 s.

Measure numbering, loop scheduling, and scoring stay internally consistent (they use
the same shifted times), so practice still works, just to the wrong timing. The bundled
curriculum files are not affected (all four set the tempo at tick 0), and how many
user files have this shape is unknown; the error grows with the distance of the first
tempo event from tick 0. Bounded impact on uncommon files: P3.

## Expected Behavior Or Oracle

Standard MIDI File 1.0 tempo rule: until a Set Tempo meta event occurs, the tempo is
120 BPM (500,000 microseconds per quarter note). Note and barline times are the sum of
tick durations at the tempo in force for each segment.

## Evidence

### Environment

- Commit/patch identity: `4466626`; `@tonejs/midi` 2.0.28
- OS/runtime/browser: Linux, Node 24 with tsx
- Data profile/fixture: `scripts/audit/fixtures/midi/late-first-tempo.mid` (ppq 480; 4/4 at tick 0; no tempo at tick 0; 60 BPM at tick 1920; eight quarter notes from tick 0), sha256 `2af80503be853306a1be213f334213999e986ea018282ee3f4981124cdffb63b`
- Hardware, if applicable: none

### Reproduction

1. Hand oracle written before the probe ran (`scripts/audit/fixtures/midi/measure-fixtures.oracle.json`):
   bars [0, 2] s and [2, 6] s; notes at ticks 1920, 2400, 3360 start at 2, 3, 5 s;
   song BPM 120; duration 6 s.
2. `node --import tsx scripts/audit/measure-map-probe.ts scripts/audit/fixtures/midi/late-first-tempo.mid --oracle scripts/audit/fixtures/midi/measure-fixtures.oracle.json`
3. Observed: bars [0, 4] s and [4, 8] s; notes from tick 1920 start at 4, 5, 6, 7 s
   (each 2 s late); the note at tick 1440 starts at 1.5 s and lasts 2.5 s; song BPM 60;
   duration 8 s. 9 checks fail, all for this file; the seven other fixtures pass. The
   probe's independent SMF reference (built from raw events with `midi-file`) agrees
   with the hand oracle.
4. Import path: `computeSongMetadata` (used by uploads and imports) stores `bpm: 60`
   and `durationSec: 8` for the same file (`$TMPDIR/p11/C/late-tempo-metadata.out`).
   Repeat count: the probe gave the same output on three runs.

### Artifacts

- File/line: `src/lib/midi/midiFileParser.ts:89` (`bpm = midi.header.tempos[0]?.bpm ?? 120`) and `:165-166` (`midi.header.ticksToSeconds`); `node_modules/@tonejs/midi/dist/Header.js:118-124` (`update()` times the first tempo event with its own BPM: `lastBPM = index > 0 ? tempos[index - 1].bpm : tempos[0].bpm`) and `:152-154` (ticks before the first tempo are converted at 120 BPM)
- Test/command output summary: `$TMPDIR/p11/C/measure-probe-final.out`, `$TMPDIR/p11/C/late-tempo-metadata.out`
- Screenshot/video/trace path and hash: none
- Durable-state before/after comparison: not applicable

## Root Cause

`@tonejs/midi` computes the time of the first tempo event as if that tempo had been in
force since tick 0, while it converts earlier ticks at 120 BPM, so its tempo map is
discontinuous when the first event is after tick 0. The parser trusts that map and also
reports the first event's BPM as the song tempo. Owning boundary: `parseMidiFile`, which
is where LumaKeys adopts the third-party tempo map.

## Recommended Remediation Boundary

In `parseMidiFile`, when `midi.header.tempos` is non-empty and its first entry has
`ticks > 0`, insert `{ ticks: 0, bpm: 120 }` and call `midi.header.update()` before
reading any times (note times are computed from the header on access). Report `bpm` as
the tempo in force at tick 0.

## Required Regression Proof

- Deterministic unit/integration proof: `midiFileParser.test.ts` case with a file whose first tempo (60 BPM) is at tick 1920: note at tick 1920 starts at 2.0 s, note at tick 1440 lasts 0.5 s, boundaries [0, 2] and [2, 6] s, `bpm` 120
- Electron proof: not needed (runtime-independent parser)
- Web proof: not needed beyond the unit test; optionally upload the fixture and check the library BPM and length
- Data/recovery proof: songs imported before the fix keep the stored BPM and duration until re-imported; the lead should decide whether metadata needs recomputing
- Manual hardware/UI proof: none
- Broader regression command: `npm run test`

## Challenge Record

- Independent reproduction attempt: hand oracle, independent SMF reference in the probe, and the import metadata function all agree on the discrepancy.
- Alternative explanations tested: the fixture could be malformed (ruled out: the raw dump shows a 4/4 signature at tick 0, a single Set Tempo of 1,000,000 µs at tick 1920 in the conductor track, and well-formed note pairs); the SMF default might not be 120 BPM (it is, per the SMF 1.0 specification, and `@tonejs/midi` itself uses 120 for ticks before the first event).
- Scope/severity changes: P3 because the bundled curriculum files are unaffected and the frequency in user libraries is unknown; raise to P2 if real-world files with a late first tempo turn up.
- Deduplication decision: the ledger makes PH-MUS-002 canonical for tempo-change measure symptoms unless a consumer has an independent root cause. This one is not in the measure-boundary code that PH-MUS-002 fixed; it shifts note times as well as barlines and comes from the tempo map the parser adopts. Raised separately; the lead may merge it under PH-MUS-002 as a follow-up if preferred.
- Challenger conclusion and date: reproduced, 2026-10-19
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s09-timing`, slice 9, implemented 2026-11-02, awaiting
  independent review; not merged.
- What changed: `parseMidiFile` (`src/lib/midi/midiFileParser.ts`) inserts `{ ticks: 0, bpm: 120 }`
  at the front of the tempo list when the first tempo event is after tick 0, and calls
  `header.update()` before any time is read. Note times, durations, barlines and the song length are
  now continuous, and `bpm` is the tempo at tick 0. `ParsedSong` carries the resulting `tempoMap`
  (`{ ticks, bpm, timeSec }` per entry; a single 120 BPM entry when the file has no tempo event),
  which the PH-MUS-006 metronome helper reads. Files with a tick-0 tempo parse exactly as before.
- Tests (`src/lib/midi/midiFileParser.test.ts`, new fixture
  `src/lib/midi/fixtures/late-first-tempo.mid`, a byte copy of the audit fixture, sha256
  `2af80503...fb63b`): `keeps 120 BPM until the first tempo event and reports the tick-0 tempo`
  failed before (`expected 60 to be 120`) and passes (note at tick 1920 at 2 s, tick-1440 note 0.5 s,
  boundaries [0, 2] and [2, 6] s, duration 6 s); `carries the continuous tempo map on the parsed
  song`, `carries a single 120 BPM entry when the file has no tempo event` and `leaves a file with a
  tick-0 tempo unchanged` failed before (`tempoMap` undefined) and pass. Source identity for the
  reproduction: `ea89f3e` (product code of the branch base).
- Driver result: `measure-map-probe.ts` and the library upload were not run; the unit test covers the
  parser. Web upload of the fixture to check the library BPM is optional and owed to no one.
- Stored data: songs imported before the fix keep their stored BPM and duration until they are
  re-imported. No recompute was done here. Only files whose first tempo event is after tick 0 differ,
  and the owner's library is not known to contain any; if the lead wants stored metadata corrected, that
  is a separate, reviewed data change (re-parse `midi-files` with `computeSongMetadata` and update
  `bpm` and `durationSec`).
- Proof owed: none beyond review; no hardware or owner proof.
- Residual risk: a file with several tempo events at tick 0 or unsorted events relies on
  `@tonejs/midi` ordering, as before.
- Revisit trigger: reviewer verification; a decision on recomputing stored metadata.
