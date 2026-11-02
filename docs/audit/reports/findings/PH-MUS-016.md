# PH-MUS-016: In a loop, a downbeat played slightly early at the seam is dropped

- Lane: MUS
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both
- Coverage rows: WF-009, WF-002
- Related/duplicate findings: PH-MUS-002 (loop bars on non-4/4 meters, fixed); none duplicate
- First observed against: `main` at source identity `4466626`, sitting 4 item 7 run 2026-10-20

## User Impact

When a player loops a passage in Learn mode, the first note of each new pass sits exactly
on the loop seam. A real player anticipates it by a few milliseconds as often as not. If
the key goes down before the playhead has wrapped, the press is matched against the end
of the old pass, finds nothing, and is thrown away. The playhead then wraps and Learn
mode waits on that same note, so the player has to play it again. The loop stalls on
its own downbeat. Looping a hard bar is a core practice tool, but each stall costs
one repeated note with no data loss, so P3.

## Expected Behavior Or Oracle

A press within the hit window of the loop's first note counts for that note, whether
it lands just before or just after the seam. That is the window `matchNote` gives any
other note.

## Evidence

### Environment

- Commit/patch identity: source `4466626`
- OS/runtime/browser: the web build in Chromium and Electron 30.5.1 (`out/`), Linux; a
  scripted Web MIDI device ("Audit Keys 61")
- Data profile/fixture: fresh profile and data directory; a 3/4 fixture with six
  eighth-to-quarter notes in bars 3–4 (C4 at 3 s to A4 at 5.5 s), Learn mode

### Reproduction

1. Load the fixture, set the loop to measures 3–4 ("Looping measures 3-4"), start.
2. Play the six notes on the beat. Each scores perfect.
3. Play the second pass's C4 15 ms before the beat (2985 ms after the first note),
   and the rest on the beat.
4. The early C4 is not judged. The HUD resets to `0 | 0` at the wrap, Learn mode
   shows "Progress pauses until the correct note is played", and it is still at
   `0 | 0` 1.2 s later. D4 to A4 on the beat are not judged either, because the
   playhead is held at C4.
5. Control: the same run with C4 20 ms late (3020 ms) judges all six second-pass
   notes perfect.

The same result in both runtimes.

### Artifacts

- `src/lib/game/GameSession.ts:159-166` (`getCurrentTimeSec`): the playhead wraps only
  when `nextTime >= loopEndSec`, by calling `restart` and `play`.
- `matchNote` compares the press with the unwrapped song time, so a press at 5.985 s
  is 2.985 s from the C4 at 3 s and outside every window.
- `$TMPDIR/p11/S4/web.out` lines 52–55, `$TMPDIR/p11/S4/desktop.out` lines 42–45,
  `web-item7-seam-early-15ms-end.png`, `desktop-item7-seam-early-15ms-end.png`.
- Driver: `scripts/audit/browser/sitting4-midi-common.mjs` (`item7`, `seamMs`).

## Root Cause

Note matching has no notion of the loop. Near the seam, the notes at the start of the
loop are a few milliseconds away in practice but more than a loop length away in song
time.

## Recommended Remediation Boundary

In `GameSession`, when a loop is set and the playhead is within the hit window of
`loopEndSec`, also match the press against the loop's first notes at the wrapped time
(or wrap first and then match). `src/lib/game/GameSession.ts`.

## Required Regression Proof

- Deterministic unit/integration proof: a `GameSession` test with a loop where a press
  `hitWindow - 1` ms before `loopEndSec` scores the loop's first note, and Learn mode
  does not wait on it after the wrap.
- Web and Electron proof: `sitting4-midi-web.mjs` and `sitting4-midi-desktop.mjs`
  item 7 with `seamMs = -15` judge all twelve notes.
- Broader regression command: `npx vitest run src/lib/game`

## Challenge Record

- Independent reproduction attempt: the lead read `getCurrentTimeSec` and the matching
  path and confirmed the unwrapped comparison; the late-press control passes.
- Alternative explanations tested: scripted dispatch timing. The dispatch log shows the
  early C4 sent 0 to 0.5 ms from its target in both runtimes, and the round 1 notes on
  the same clock all scored perfect.
- Scope/severity changes: none. Note: the HUD also resets to `0 | 0` at every wrap
  because the wrap calls `restart`. That is the current design, not this finding.
- Deduplication decision: new.
- Challenger conclusion and date: accepted at P3, 2026-10-20.

## Resolution

- Accepted/rejected rationale: accepted 2026-10-20.
- Fix branch/commit/issue: `remediation/p11-s04-input`, slice 4, commit `418d6fe`; implemented and independently reviewed 2026-11-02; merged to `main` in `ea89f3e`; `fixed`, not `verified`: input-integrity driver reruns (lead runs them) and owner sitting 4 item 4 plus a Learn-mode loop on a MIDI keyboard are owed.
- What changed: in a loop, when a note-on matches no pending note at the song clock and sits within one hit window before `loopEndSec`, `GameSession` checks whether a loop-start note answers it at the wrapped time (`loopStart + (press - loopEnd)`). If one does, the press is held (`seamPresses`) and judged against the fresh first pass the moment the playhead wraps, because the wrap resets the schedule and a judgement made before it would be wiped. Held presses expire after the remaining time to the seam plus one hit window, and are dropped on pause, seek, restart, config change and song load. A press after the seam behaves as before. The HUD still resets at the wrap, which is the current design.
- Judging rule settled by this slice (slice 12 capstone accuracy depends on it): a press is judged only against a running song clock. While the transport is stopped (before Space, during the 3-2-1 count-in and lead-in, while paused) a press sounds, lights the keyboard and updates held-note and sustain state, but is never judged, so it cannot add score, combo or accuracy, and a pending note stays pending for the real press. While playing, a press is matched against the note within the hit window of the song clock; in a loop, a press up to one hit window before the loop end also answers a note at the start of the loop, at the wrapped time, with the same timing tiers.
- Tests (`GameSession.test.ts`, `a press just before the loop seam`): `counts a press hitWindow - 1 ms early for the loop first note` failed before the fix (`expected +0 to be 1`, okCount), `scores a 15 ms early press as perfect and lets the rest of the pass score` failed before it (`expected +0 to be 1`, perfectCount) and `does not wait on the first note after the wrap in Learn mode` failed before it (`expected 2 to be greater than 2`, the playhead stayed on the first note); all pass after. `still counts a press just after the seam, as before`, `does not carry an early press across a pause`, `ignores a press near the seam that no loop-start note answers` and `does not treat a non-loop song end as a seam` pass before and after. Source identity for the reproduction: `1180731`.
- Driver result: not run, needs the web and Electron `sitting4-midi-*` drivers with `seamMs = -15` (a Web MIDI device, a rebuilt app, Playwright), which this worktree cannot launch; see PH-MUS-012 for why the Electron harness would not test this branch.
- Proof owed (agent-runnable, needs the lead): `sitting4-midi-web.mjs` and `sitting4-midi-desktop.mjs` item 7 with `seamMs = -15` judge all twelve notes. Human-only: a real MIDI keyboard loop of a hard bar in Learn mode (owner sitting).
- Residual risk: the early window is the hit window, so with a wide window a stray same-pitch press near the seam can claim the loop's first note. In Learn mode a press held while the clock is blocked at the pass's last note expires rather than carrying over. The held press also expires one hit window after the seam on the wall clock, so if the first frame after the seam is more than about one hit window late (a stall over roughly 100 ms at the default window) the press is dropped; the reviewer reproduced a drop at a 120 ms stall and a keep at 90 ms. The lead-in in `GameScreen.tsx` captures `now` before awaiting `playSessionAudio` and calls `play(now)` after it, so a press in that await (a few milliseconds) is unjudged although the clock is anchored as running; slice 12 should account for it.
- Revisit trigger: reviewer verification and the runtime proofs above.
