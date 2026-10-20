# PH-MUS-004: MIDI Device Disconnect Leaves Held Notes Active

- Lane: music correctness
- Severity: P2
- Confidence: high
- Status: fixed
- Owner: Codex (acting)
- Challenger: Codex, fresh isolated-fixture challenge
- Verifier: Claude Code (acting), Phase 11 re-verification and runtime lanes
- Affected runtime: both
- Coverage rows: WF-002, WF-009, RT-011, MOD-003, MOD-011
- Related/duplicate findings: none
- First observed against: `808e6739e55b5186e8a9565f2c4e9267c4894a6c` plus the chartered audit patch identity

## User Impact

If a MIDI keyboard disconnects while a key is held, LumaKeys removes the device from
the picker but never sends a release for that device's active notes. The falling-note
session and live instrument can retain a stuck key/highlight and audio can continue
until the user exits or another path clears all notes. This breaks an explicit MIDI
disconnect/reconnect practice workflow.

## Expected Behavior Or Oracle

An input source that disappears must release its held notes before or while the
device lifecycle changes. The app already models input ownership by source ID and
only stops audio when the last source releases a note, so a removed source needs an
equivalent synthetic release path.

## Evidence

### Environment

- Commit/patch identity: charter baseline above.
- OS/runtime: Linux x86_64, Node v24.15.0.
- Data profile/fixture: fake Web MIDI access and input in memory; no user data.
- Hardware: no physical device available.

### Reproduction

1. Provide the production MidiInputService with a fake access object containing one
   input named `keyboard-1`.
2. Subscribe, initialize, and emit MIDI Note On for C4.
3. Remove the input from the access map and dispatch the production `statechange`
   listener.
4. Record emitted input events and reported devices.

The fresh probe printed:

```text
{"events":["noteon:60"],"deviceCountAfterDisconnect":0}
```

No Note Off was emitted for C4.

### Artifacts

- MidiInputService refreshes/binds device inputs on state change but maintains no
  held-note inventory and emits no releases: `src/lib/midi/midiInputService.ts:77-115`.
- GameSession retains a note in its source-keyed active map until it receives a
  Note Off: `src/lib/game/GameSession.ts:172-182`.
- GameScreen's HeldNoteTracker likewise stops audio only after a source release:
  `src/renderer/components/GameScreen.tsx:437-502`.
- Existing `heldNotes.test.ts` proves correct last-source behavior when release
  events exist; it does not cover source disappearance.

## Root Cause

The device lifecycle and note lifecycle are independent. MidiInputService reports a
new device list but does not track notes by input ID or synthesize releases when an
input is removed.

## Recommended Remediation Boundary

Track active MIDI notes per input in MidiInputService, or maintain an equivalent
source-release registry at the GameScreen boundary. On disconnect, emit deterministic
Note Off events for every held note from the removed source before notifying device
subscribers. Preserve multi-source semantics so a computer-keyboard or another MIDI
source holding the same pitch remains active.

## Required Regression Proof

- Deterministic unit/integration proof: Note On then source disconnect emits exactly
  one Note Off per active MIDI pitch; duplicate inputs and sustain behavior preserve
  other active sources.
- Electron proof: unplug/reconnect a named MIDI keyboard during a disposable
  session; no stuck visual/audio note remains and the device list recovers.
- Web proof: repeat in supported desktop browser(s) using Web MIDI permission and
  a named device.
- Data/recovery proof: no false game result, combo, or active input remains after
  disconnect/reconnect.
- Manual hardware/UI proof: record device, OS, browser/Electron, connection type,
  repeated disconnects, and observed recovery.
- Broader regression command: `npm test`, `npm run build`, and `npm run build:web`.

## Challenge Record

- Independent reproduction attempt: a fresh fake MIDIAccess fixture reproduced the
  missing release without audio, database, or test-environment timing.
- Alternative explanations tested: device list correctly changed to zero, proving
  the statechange handler ran; only note cleanup is absent.
- Scope/severity changes: hardware availability is an evidence gap, but the
  deterministic service behavior is runtime-independent and reproducible.
- Deduplication decision: separate from PH-MUS-001 because it is source lifecycle,
  not score-state configuration.
- Challenger conclusion and date: accepted by Codex, 2026-07-11.

## Resolution

- Accepted rationale: a normal device-removal event can leave the practice instrument and key state stuck.
- Fix branch/commit/issue: `d5839aa`, Phase 9 slice 10 ([Phase 9 report](../phase-9-remediation-2026-07-30.md)). This file said "accepted" until the Phase 11 consolidation reconciled it with the ledger on 2026-10-20.
- Verification evidence: Phase 9 tracks held notes per device and releases them before it reports the new device list. Phase 11: `midiInputService.test.ts` "releases held notes before reporting a disconnected device" and the `GameSession.test.ts` source-disconnect test pass with a fake `MIDIAccess` ([re-verification](../phase-11-reverification-2026-10-19.md)). There is no runtime proof: headless Chromium exposes no MIDI devices and the sandbox has no virtual MIDI port ([lane C](../phase-11-lane-c-music-correctness-2026-10-19.md)).
  [Sitting 4](../phase-11-owner-sittings-2026-10-20.md#sitting-4-midi-keyboard) item 2, 2026-10-20, run by the agent with a scripted Web MIDI device on both runtimes: a held D4 is released within 1 ms of unplug (desktop: unplug at 1077.4 ms, `Sampler.triggerRelease` at 1077.7 ms; web: 989.6 ms, then 990.3 ms), and E4 plays after replug with no restart. A web variant that keeps the disconnected port in `access.inputs` with state "disconnected" did not release D4: the key was still lit 700 ms later and after replug. `handleStateChange` in `src/lib/midi/midiInputService.ts` builds the connected set from `access.inputs.keys()` and never reads `input.state`. The default run models Blink, which drops the port from `inputs`.
- Residual risk: unplugging a real keyboard is still owed ([user test C2](../phase-11-user-tests.md)). The release depends on the browser removing the port from `access.inputs`; which browsers keep a disconnected port there has not been checked. The song restarting when a device reconnects is a separate finding, [PH-MUS-010](PH-MUS-010.md).
- Revisit trigger: before MIDI-device workflow or release readiness sign-off.
