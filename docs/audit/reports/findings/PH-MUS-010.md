# PH-MUS-010: Connecting or disconnecting any MIDI device restarts the song being played

- Lane: MUS
- Severity: P2
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared renderer code); reproduced in the web build with a scripted Web MIDI device
- Coverage rows: WF-002, WF-009, RT-011
- Related/duplicate findings: PH-MUS-001 (fixed; a different trigger that also erased judged state), PH-MUS-004 (fixed; held notes on disconnect)
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

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

- Commit/patch identity: `6e549b6`, web bundle from `dist/`
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

## Resolution

- Accepted/rejected rationale: pending consolidation
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
