# PH-MUS-019: Beats per minute come out very strange (stored tempo is the first tempo event, count-in is a fixed 60 BPM)

- Lane: MUS
- Severity: P2
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), wave 3 investigation, 2026-11-02
- Verifier: TBD
- Affected runtime: runtime-independent (shared parser and game code, used by import metadata in both runtimes and by GameScreen)
- Coverage rows: WF-004, WF-008, MOD-011
- Related/duplicate findings: PH-MUS-008 (late first tempo, same `bpm` line), PH-MUS-006 (metronome follows the tempo map), PH-MUS-002 (measure map across tempo changes)
- First observed against: `main` at source identity `cc40b63`, owner report (decision 16)

## User Impact

The owner reported that beats per minute "come out very strange". Three places derive a
tempo from a MIDI file and each can disagree with the music:

- The Library shows, and the difficulty score reads, the first tempo event of the file. A
  song with a 40 BPM intro and a 160 BPM body is listed as 40 BPM. A file that starts with
  a 120 BPM "setup" tempo and then states its real 90 BPM at the same tick is listed as
  120 BPM, although the clock plays it at 90.
- The count-in before play always clicks once a second (60 BPM) whatever the song is. At 190
  BPM the player hears clicks 1 s apart and then a song at 316 ms per beat, so the count-in
  teaches the wrong tempo. A 6/8 piece at 120 BPM has a felt pulse of 750 ms, not 1 s.
- The falling-note lane length is eight beats at the stored tempo, so after a tempo change the
  lane shows too many or too few beats.

Smaller defects came along: the stored BPM carried float residue (89.9999550000225,
190.0002850004275), a Set Tempo of 0 microseconds per beat made the BPM Infinity and every
later time NaN, and an SMPTE time-division file produced a NaN duration (it also hung the
measure-boundary loop).

## Expected Behavior Or Oracle

- The song's BPM is the tempo it spends the most time at while notes play, a whole number
  when the file says a whole number.
- Same-tick Set Tempo events collapse to the last in file order, which is the one the clock
  plays.
- The count-in clicks at the song's pulse (a quarter note at the starting tempo, the dotted
  unit in 6/8, a half note in 2/2), divided by the practice tempo.
- The lane holds eight beats at the song's stored tempo, now the dominant tempo, so it fits most
  of the song; it does not rescale at a tempo change (rescaling moved every visible note at once).
- A malformed tempo does not poison the song; an unsupported time division is refused, not
  imported with a NaN duration.

## Evidence

### Environment

- Commit/patch identity: `cc40b63`; `@tonejs/midi` 2.0.28
- OS/runtime/browser: Linux, Node 24 with tsx
- Data profile/fixture: files built from raw SMF events with `midi-file` (probe in `$TMPDIR/w3/bpm/`, notes in `/tmp/claude-1000/w3/bpm-investigation.md`)
- Hardware, if applicable: none

### Reproduction

Observed against the parser and the count-in at `cc40b63`, versus the expected value:

| Fixture | Stored / observed | Expected |
|---|---|---|
| `slow-intro-fast-body` (40 BPM for 4 beats, 160 BPM for 20) | bpm 40 | 160 |
| `setup-120-then-90-tick0` (120 then 90 at tick 0) | bpm 120, `tempoMap` length 2 | 90, length 1 |
| late first tempo (90 BPM from tick 1920 on) | bpm 120 (the inserted placeholder) | 90 (the tempo that lasts) |
| 190 BPM count-in | clicks at 0, 1000, 2000 ms | 0, 316, 632 ms |
| 6/8 at 120 BPM | count-in 1000 ms, felt pulse 750 ms | 750 ms |
| 90 BPM file | bpm 89.9999550000225 | 90 |
| 190 BPM file | bpm 190.0002850004275 | 190 |
| tempo of 0 us per beat | bpm Infinity, durations NaN | 120 default, finite |
| SMPTE division (0xE728) | NaN duration, loop never ends | import error |

### Artifacts

- File/line: `src/lib/midi/midiFileParser.ts:93` (`bpm = tempoMap[0].bpm`); `src/renderer/components/GameScreen.tsx:903-908` (fixed 1000 ms count-in step); `src/lib/game/GameSession.ts:438-441` (lead time from `song.bpm`)
- Test/command output summary: `/tmp/claude-1000/w3/bpm-investigation.md`
- Screenshot/video/trace path and hash: none
- Durable-state before/after comparison: not applicable (see Stored data in Resolution)

## Root Cause

`parseMidiFile` reported the first tempo event as the song's one BPM, so the number said
nothing about the rest of the song, ignored same-tick duplicates the clock itself resolves
to the last one, and carried float residue. The count-in and the lane length were written
against that single number (or a constant): the count-in step is a literal 1000 ms and the
lane length reads `song.bpm`, so neither follows the tempo map or the meter that the
metronome (PH-MUS-006) already follows. Owning boundaries: `parseMidiFile` for the stored
number and the malformed inputs, `GameScreen.runCountdown` for the count-in; the lane
(`GameSession.buildVisibleNotes`) follows the stored number.

## Recommended Remediation Boundary

Compute the stored BPM from the tempo map as the duration-weighted dominant tempo over the
notes' span (a helper with its own tests); collapse same-tick tempos before the tempo map is
built; round the stored BPM to 2 decimals; drop zero or non-finite tempos and reject SMPTE
division in the parser; take the count-in step from the beat clock's pulse at the starting
tempo; leave the lane on the stored (now dominant) tempo. Leave the Library
label (quarter-note BPM) and stored rows alone.

## Required Regression Proof

- Deterministic unit proof: parser, helper, beat clock, GameSession and GameScreen tests (named in Resolution)
- Electron proof: not needed (parser, clock and count-in are covered by unit tests)
- Web proof: not needed beyond the unit tests
- Data/recovery proof: stored `songs.bpm` keeps its old value until a song is re-imported or "recompute difficulties" runs; no migration here
- Manual hardware/UI proof: owner listens to the count-in on a fast song and a 6/8 song (agent can stage; the ear check is human-only)
- Broader regression command: `npm run verify`

## Challenge Record

- Independent reproduction attempt: probe in `$TMPDIR/w3/bpm/` built the fixtures from raw SMF events and read them back through `parseMidiFile`.
- Alternative explanations tested: a UI rounding issue (ruled out: the stored value itself carries the residue); the file being malformed (ruled out for all but the tempo-0 and SMPTE cases).
- Scope/severity changes: P2 because the count-in teaches the wrong tempo on every non-60 BPM song and the Library BPM is wrong on every multi-tempo file; the number is not used for timing, so no scoring errors.
- Deduplication decision: separate from PH-MUS-008 (placement of the first tempo) and PH-MUS-006 (metronome); this finding covers the stored number, the count-in and the lane.
- Challenger conclusion and date: reproduced, 2026-11-02

## Resolution

- Accepted/rejected rationale: implemented and independently reviewed 2026-11-02 (PASS WITH NOTES); the review notes are addressed on the branch (see Review follow-up); merged to `main` in `c170bc3`; `fixed`, not `verified`: the owner ear check of the count-in on a fast song and a 6/8 song is owed.
- Fix branch/commit/issue: `remediation/p11-s22-bpm` (base `30165ff`; product code equals `cc40b63`); commits `b600ad0` (dominant tempo), `ded52ba` (same-tick tempos), `ac5ef11` (count-in), `be9ab9b` (rounding, malformed tempo, SMPTE), plus the docs commit and the review follow-up commits. `b29a1a2` (lane lead time from the tempo map) was reverted after review.
- What changed:
  - `src/lib/midi/dominantTempo.ts` (new): `getDominantTempo(tempoMap, spanStartSec, spanEndSec)` weights each tempo by seconds in force within the notes' span, merges entries equal to 2 decimals, breaks ties toward the earlier tempo. `parseMidiFile` stores it, rounded to 2 decimals. The `tempoMap` keeps the raw values.
  - `parseMidiFile`: `collapseSameTickTempos` keeps the last tempo per tick (file order); `dropMalformedTempos` removes zero or non-finite tempos (the 120 default then applies); an SMPTE division or a division of 0 ticks per quarter note throws `Unsupported MIDI time division: the file uses SMPTE frame timing or 0 ticks per quarter note.`, which `importSongFromBuffer`, `reattachSongFromBuffer` and `recomputeAllSongDifficulties` already report as an import error.
  - `src/lib/game/beatClock.ts`: exported `getBpmAtSongTime` and `getPulseDurationSec`. `GameScreen.runCountdown` clicks 3-2-1 and the lead-in at that pulse divided by the practice tempo. `GameSession.buildVisibleNotes` is unchanged (it reads `song.bpm`).
  - Two PH-MUS-008 test expectations changed: `late-first-tempo` and `3-4-to-4-4-tempo` now report 60 (the dominant tempo) instead of 120.
- Tests (source identity `cc40b63` for "failed before"):
  - `midiFileParser.test.ts`, `song tempo (PH-MUS-019)`: `reports the dominant tempo of a slow intro and a longer fast body, not the first tempo` (failed: `expected 40 to be 160`), `reports the longer slow body of a fast intro` (`expected 160 to be 60`), `does not let the inserted 120 BPM placeholder win over a later first tempo that lasts` (`expected 120 to be 90`).
  - `importMetadata.test.ts`: `stores the dominant tempo of a slow intro and a longer fast body, not the first tempo` (`expected 40 to be 160`); `stores a 190 BPM file as exactly 190, not 190.0002850004275` (`expected 190.0002850004275 to be 190`).
  - `midiFileParser.test.ts`, `several tempo events at the same tick (PH-MUS-019)`: three tests failed. The first two failed on `bpm` (`expected 120 to be 90`, `expected 90.00009000009 to be 120`), the third on the tempo map ticks (`[0,1920,1920]` versus `[0,1920]`).
  - `GameScreen.test.tsx`, `count-in clicks (PH-MUS-019)`: 190 BPM (`expected 684.2 to be <= 1`), start tempo 40 versus later 160 (`expected 1000 to be close to 1500`), 6/8 pulse (`expected 1000 to be close to 750`). The 0.5x and 2/2 cases pass before and after.
  - `midiFileParser.test.ts`, `stored tempo precision (PH-MUS-019)`: 89.9999550000225 and 190.0002850004275 failed (`expected ... to be 90 / 190`); `reads a 0 microsecond tempo as the 120 BPM default with finite times` failed (`expected Infinity to be 120`); `rejects an SMPTE time division instead of returning a NaN duration` hung the old parser (killed after 40 s); `importSong.test.ts` `rejects an SMPTE time-division file and leaves no row or final file` covers the import path.
  - New `dominantTempo.test.ts` (12, one added at the review follow-up) and `beatClock.test.ts` `getBpmAtSongTime and getPulseDurationSec` are new files or blocks, so they did not exist before.
- `song.bpm` consumer audit:
  - `importMetadata.calculateDifficulty` (tempo score): the dominant tempo is more representative; fine.
  - `computeSongMetadata` to `songs.bpm`, `importSong.ts`, `database.ts`, bridge: pass-through storage; fine.
  - Library (`LibraryScreen.tsx` `Math.round(song.bpm)`): shows the dominant quarter-note BPM; fine.
  - No Library BPM sort or filter, no use in recommendations or `ResultsScreen`.
  - `GameSession.buildVisibleNotes`: reads `song.bpm`, now the dominant tempo; unchanged.
  - `GameScreen` count-in: replaced with the pulse.
  - `GameScreen.tsx` SongRow copies: informational only.
  - `audioEngine.ts` `Transport.bpm`: scheduling is in seconds; no timing effect.
  - `songUtils.ts` fallbacks: only when there are no `measureBoundaries` (constant-tempo drills); fine.
  - `beatClock.ts` fallback, drills, `LessonScreen`, free play, scale practice: use their own tempo specs.
- Driver result: not run. The parser, beat clock and count-in are covered by unit tests; no Electron or web driver was needed.
- Stored data: songs imported before the fix keep their stored BPM until they are re-imported or `recomputeAllSongDifficulties` runs (it re-parses every song and updates `bpm`, `difficulty`, `durationSec`, `noteCount`). No migration or backfill was added.
- Main-build proof, 2026-11-02 (`c170bc3`): no driver run: no count-in driver exists (`leadin*.mjs` cover PH-MUS-018's lead-in length). Unit tests cover it; the owner ear check stays owed.
- Proof owed: agent-runnable, none beyond review; human-only, owner listens to the count-in on a fast song and a 6/8 song.
- Residual risk:
  - Existing songs keep their stored BPM until re-imported or recomputed.
  - The Library label stays quarter-note BPM, so 6/8 and 2/2 show a number that differs from the felt pulse.
  - The lane keeps one length per song, so in a section far from the dominant tempo it shows more or fewer than eight beats.
  - Dominant-tempo weighting is by song-seconds, so slower tempos get more weight per beat. An even accelerando (60, 80, 100, 120 BPM for 4 beats each) reports 60, its slowest step, because that step lasts the most seconds (`dominantTempo.test.ts`, `reports the slowest step of an even accelerando`).
  - A Library backup that contains an SMPTE MIDI now fails restore as a whole; the error names the song.
  - A setup tempo placed at tick 1 (not the same tick) is not collapsed.
  - The Library shows one number, with no range such as "40-160".
- Revisit trigger: reviewer verification; owner ear check of the count-in; a decision on recomputing stored BPM or labelling compound meters.
- Review follow-up, 2026-11-02 (lead), after the independent Opus review (PASS WITH NOTES):
  - Lane: the lane rescaled in one frame at a tempo change, and visible notes jumped or vanished. `b29a1a2` was reverted; the lane reads `song.bpm` again, which is now the dominant tempo. Its three `GameSession.test.ts` tests were removed with it.
  - Count-in race: pausing and pressing Play again inside one beat reset the shared cancel flag, and the old run resumed after its sleep, so two count-ins clicked and the game started twice. Each run now takes a number (`countdownRunRef`) and stops when a newer run starts. `GameScreen.test.tsx` `runs one count-in when Play is pressed, cancelled and pressed again inside one beat` failed before and passes. Corrected at the second review: the first version pressed all three keys inside one `act()`, so the middle press did not cancel; each press is now its own `act()`, so the screen re-renders and the middle press cancels. Before `e2c5505` it gives clicks at 0, 400, 1500, 1900, 3000, … (the cancelled run clicks again at 1500 ms); after, 0, 400, 1900, 3400, 4900, 6400 ms and `play` once.
  - Time-division wording: ppq 0 was reported as SMPTE; the error now names both cases. `midiFileParser.test.ts` `rejects a division of 0 ticks per quarter note without calling it SMPTE only` failed before (old wording) and passes.
  - Restore naming: `importLibraryBackup` now wraps the parse of each backed-up MIDI and names the song by title and id (`describeBackupSong`, from slice 13): `MIDI backup file for "<title>" (id <id>) cannot be read: <reason>. Nothing was restored, and your library is unchanged.` `libraryBackup.test.ts` `names the song whose backed-up MIDI the parser refuses, and restores nothing (PH-MUS-019)` failed before (bare parser message) and passes; no row and no MIDI directory are left.
  - Second review (Opus, PASS WITH NOTES), lead fixes:
    - Stopped while the audio loads: a run checked only its number after `playSessionAudio`, so Restart pressed while the sampler loaded still started the game. It now checks the cancel flag too, and silences the song audio it started unless a newer run has asked for the audio since (`countdownAudioRunRef`). `GameScreen.test.tsx` `does not start the game when Restart is pressed while the song audio loads after the count-in` failed before (`play` called once) and passes. The test file's `ControlBar` mock gained a Restart button for it.
    - Other exits: only Pause and Restart stopped a count-in. A new session (another song, a dropped or picked MIDI, a setup or track change, all through `mountSession`) and leaving the screen now end it too. `stops the count-in when the screen closes` failed before (5 clicks instead of 1) and passes.
    - Empty parser message: the restore error falls back to `the MIDI parser refused it` instead of `cannot be read: .`. No test; no real input is known to produce an empty message.
  - Docs: `replaceSongFile` corrected to `reattachSongFromBuffer`; the same-tick failure modes corrected; the accelerando example added (with a test that pins it); PH-MUS-008 updated for the dominant tempo.
