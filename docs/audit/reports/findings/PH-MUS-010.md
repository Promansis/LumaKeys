# PH-MUS-010: Connecting or disconnecting any MIDI device restarts the song being played

- Lane: MUS
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared renderer code); reproduced with a scripted Web MIDI device in the web build and, on 2026-10-20, in Electron
- Coverage rows: WF-002, WF-009, RT-011
- Related/duplicate findings: PH-MUS-001 (fixed; a different trigger that also erased judged state), PH-MUS-004 (fixed; held notes on disconnect)
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

## User Impact

A player is part way through a song. Their USB keyboard drops for a moment, a
Bluetooth keyboard reconnects, or they plug in a pedal or a second device. The game
reloads the song: score, combo and judged notes go back to zero, playback stops, and
the player must press Space to start again from the top. Nothing explains why.
Severity P2: judged practice state is lost and the run must restart, but stored
results are not affected and the player can continue.

## Expected Behavior Or Oracle

A device list change updates the device line and releases held notes (PH-MUS-004's
fix). It does not reload the song. PH-MUS-001's oracle: live session controls must not
erase judged practice state.

## Evidence

### Environment

- Commit/patch identity: `4466626`, web bundle from `dist/`
- OS/runtime/browser: Linux, headless Chromium 141, fake `navigator.requestMIDIAccess` installed by `addInitScript` (`scripts/audit/browser/midi-permission-fallback.mjs`)
- Data profile/fixture: `repeat-c4.mid` (148 notes), Learning mode

### Reproduction

1. Start the song with one fake device connected; a MIDI C4 scores: HUD `100 | 1 x1.0`.
2. Remove the device and dispatch `statechange`.
3. Observed: HUD `0 | 0 x1.0`, status "Loaded repeat-c4 with 148 notes across 1 tracks.", and a computer key does not score until Space is pressed again.
4. Plug the device back in: the same reset happens again ("after replug: HUD 0 | 0 x1.0").
5. Same result with `retainDisconnected` true and false (the device marked disconnected, or removed from the map).

### Artifacts

- `src/renderer/App.tsx:385-386`: App stores the device list in state, so every device change re-renders App.
- `src/renderer/App.tsx:1657` (and `:1685`, `:1727` for lesson drills and capstones): `source={{ … }}` is a new object on every App render.
- `src/renderer/components/GameScreen.tsx:692`: the song-loading effect depends on `source`, so it re-runs and remounts the session.
- Output: `$TMPDIR/p11/FA/midi.final.out` sha256 `759061f4…607308e9`, cases "one-device disconnect/reconnect".

## Root Cause

GameScreen keys its song-load effect on object identity of a prop that App rebuilds
on every render. Any App state change during a run therefore restarts the run; the
device list is the most common such change.

## Recommended Remediation Boundary

Memoise `source` in App per screen state (or key the GameScreen effect on stable
fields such as `source.kind` and the song id). Add a guard test that an App re-render
does not remount the session.

## Required Regression Proof

- Deterministic unit/integration proof: App or GameScreen test that changes the MIDI device list mid-run and asserts the session object and score are unchanged.
- Web proof: rerun the FA disconnect/reconnect cases; HUD keeps its score.
- Electron proof: same test through the shared renderer.
- Manual hardware/UI proof: sitting 4, unplug and replug a real keyboard mid-song.

## Challenge Record

- Independent reproduction attempt: source trace from the device subscription to the effect dependency; the FA output shows the reload status string that only the load effect writes (`GameScreen.tsx:812`).
- Alternative explanations tested: PH-MUS-004's held-note release resetting the score (no: that path calls `allNotesOff` and does not touch the session).
- Scope/severity changes: any App re-render during a run has the same effect; the device change is the reproduced trigger.
- Deduplication decision: new trigger; PH-MUS-001 was fixed for explicit session controls.
- Challenger conclusion and date: reproduced, 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.
- Owner sitting run by the agent, 2026-10-20: reproduced on the web and the desktop in [sitting 4](../phase-11-owner-sittings-2026-10-20.md#sitting-4-midi-keyboard) item 3. Three MIDI C4s bring the HUD to 300 | 3; unplug resets it to 0 | 0, the status reads "Loaded repeat-c4 with 148 notes across 1 tracks.", and Space shows the count-in again. Replug resets it again (200 | 2 from computer keys to 0 | 0). A MIDI C4 after replug scores (100 | 1).

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s05-midi-devices`, slice 5, commits `ad4936d` (fix, tests) and the Resolution docs commit after the 2026-11-02 review round; implemented 2026-11-02, awaiting independent review; not merged. Fixes PH-MUS-010 and PH-MUS-011 together.
- What changed: `src/renderer/App.tsx` builds the GameScreen `source` once per screen state with `useMemo` keyed on `currentScreen` (one memo for the `game`, `lesson-drill` and `capstone` screens), instead of a new object literal on every App render. `GameScreen` now exports its `GameScreenSource` type for it. Review round 1 found the song's audio still stopped on a device change: GameScreen's animation-loop effect depended on `onGameFinished` and `onLessonDrillFinished`, which App recreates on every render, so its cleanup ran `audioEngine.pauseSong()` and the notes kept falling in silence. GameScreen now holds both callbacks in refs updated on each render and the effect no longer depends on them. No other GameScreen effect depends on those callbacks (checked). GameScreen's song-load effect is unchanged, so an App re-render caused by the device list, a setting or anything else no longer reloads the song. No stored data changes.
- Tests (`src/renderer/App.test.tsx`; the GameScreen mock re-creates GameScreen's `[source]` effect dependency, and a captured `subscribeDevices` listener changes the device list). Source identity `1180731`. Failed before the fix, pass after it: `App > keeps the running game session when the MIDI device list changes` (expected 1 source change, got 3), `App > keeps a running lesson drill when the MIDI device list changes` (expected 1, got 2), `App > keeps a running capstone when the MIDI device list changes` (expected 1, got 2). Added in review round 1, `GameScreen.test.tsx > keeps the song audio and session when only the finish callbacks change` (re-render with the same `source` and new callback props; failed before with `expected "spy" to be called +0 times, but got 1 times` on `pauseSong`, passes after; it also asserts no reload).
- Driver result: `scripts/audit/browser/midi-permission-fallback.mjs` run against this worktree's web build (a copy of the harness pointed at the worktree `dist/`, isolated `$TMPDIR` data, port 3781; the committed harness hardcodes the main checkout's `dist/`). Baseline against the main checkout's older `dist/` (Oct 19 build) reproduced the bug: after unplug `HUD 0 | 0`, status "Loaded repeat-c4 with 148 notes across 1 tracks.", and again after replug. With the fix, both retain variants: before unplug `HUD 100 | 1`, after unplug `HUD 100 | 1` and the status unchanged, a computer key then scores to `200 | 2`, after replug `200 | 2`, and a MIDI C4 after replug scores (`250 | 3`). The driver's own Space presses now pause the running game (status "Playback paused."), which is the driver script expecting the old reload; it is not a product fault. The driver prints results and has no assertions.
- Proof owed (agent-runnable): Electron run of the same renderer path (needs the lead's Electron launch under the lock). Human-only: sitting 4 item 3 with a real keyboard unplugged and replugged mid-song (owed, owner sitting); listen for the song's audio after an unplug, since the tests use a stubbed audio engine.
- Residual risk: a navigation that sets a new `currentScreen` object for the same song (for example a drill to its next step) still reloads, which is intended. Nothing else changes identity during a run.
- Revisit trigger: reviewer verification, the Electron run and the owner's sitting 4 item 3.
