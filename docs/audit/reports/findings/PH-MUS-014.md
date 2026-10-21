# PH-MUS-014: On a fresh profile the app plays about 60 dB too quietly while Settings shows the default volumes

- Lane: MUS
- Severity: P1
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both
- Coverage rows: WF-015, WF-016, WF-018, WF-009
- Related/duplicate findings: PH-MUS-006 (the metronome is also affected); none duplicate
- First observed against: `main` at source identity `4466626`, sitting 1 audio run 2026-10-20. The code dates from `ce84dd4` (2026-04-02), before the Phase 11 baseline.

## User Impact

Every new user, and every user after "Delete User Data", starts with master volume and
reverb at 0 and metronome volume at 0, not 80, 20 and 65. The instrument plays at
−60 dB of master gain, which is close to silent on normal speakers, and the metronome
is quieter still. The Settings screen shows the sliders at 80, 20 and 65, so nothing
tells the user why the piano app makes no sound. Moving each slider once saves a value
and fixes it, but nothing points the user there. The likely reaction is to turn the
system volume up, which then blasts the first time a value is saved. It reaches every
fresh install in both runtimes, and hearing the instrument is a core part of practice,
so P1.

## Expected Behavior Or Oracle

With no stored value, the engine uses the defaults the Settings screen shows
(`SettingsScreen.tsx:300`: `audio.masterVolume` `'80'`, with reverb 20 and metronome 65)
and the fallbacks the caller passes (`App.tsx:621-623`).

## Evidence

### Environment

- Commit/patch identity: source `4466626`
- OS/runtime/browser: Electron 30.5.1 (`out/`, offscreen) and the web build in Chromium,
  Linux; audio recorded from a PulseAudio null sink with `parec --monitor-stream`
- Data profile/fixture: fresh profile and fresh `LUMAKEYS_DATA_DIR`; setup guide skipped

### Reproduction

1. Fresh profile, Free Play, press Z X C. The capture peaks at −69 dBFS on the desktop
   and −74 dBFS on the web.
2. In Settings, Audio, move each slider one step left and one step right (the values
   read the same 80, 20, 65 and are now saved). Repeat step 1: −10.5 dBFS on the
   desktop, −16 dBFS on the web.
3. The other items show the same pattern on a fresh profile: a loaded WAV track
   plays at −84 dBFS against −26 dBFS after the nudge, and at 50 percent tempo no
   metronome click is detectable at all.

Twice per runtime, with the same result each time.

### Artifacts

- `src/renderer/App.tsx:145-148`: `parseStoredAudioNumber(value, fallback)` returns
  `Number(value)` whenever it is finite; `Number(null)` is `0`, so a missing setting
  never reaches `fallback`.
- `src/renderer/App.tsx:621-623`: master, metronome and reverb are set through it with
  fallbacks 80, 65 and 20.
- `src/persistence/database.ts:1551`: `getSetting` returns `null` for a missing key.
- `src/lib/audio/audioEngine.ts:39-46`: `percentToDb` maps 0 percent to −60 dB.
- Captures and analysis: `$TMPDIR/p11/S1A/desktop-fresh/analysis.txt`,
  `desktop-nudged/analysis.txt`, `web-1/analysis.txt`.

## Root Cause

The number parser treats "no stored value" as the number 0. The fallback branch only
catches values that are not finite, so it never runs for a missing setting.

## Recommended Remediation Boundary

Return the fallback when the stored value is `null` or empty, in
`parseStoredAudioNumber`, and check the other `Number(raw…)` reads in the same effect
for the same pattern. `src/renderer/App.tsx`.

## Required Regression Proof

- Deterministic unit/integration proof: the parser returns the fallback for `null` and
  `''`, and the stored number otherwise; an App-level test with no stored audio
  settings calls `setMasterVolume(80)`, `setMetronomeVolume(65)` and `setReverbLevel(20)`.
- Electron proof: fresh profile, Free Play capture at the same level as after the
  sliders are saved (`scripts/audit/electron/sitting1-audio-desktop.mjs` with
  `VOLUMES=fresh`).
- Web proof: the same with `scripts/audit/browser/sitting1-audio-web.mjs`.
- Manual hardware/UI proof: a fresh install is audible on speakers.
- Broader regression command: `npx vitest run src/renderer`

## Challenge Record

- Independent reproduction attempt: the lead read the code path from `getSetting`
  to `percentToDb` and confirmed the arithmetic; the captures show a 58 dB step on
  the desktop and the web when the sliders are saved.
- Alternative explanations tested: the setup guide was skipped in the run. No other
  code path saves `audio.masterVolume` (only `SettingsScreen.tsx` writes it), so
  finishing the guide does not seed it either.
- Scope/severity changes: none.
- Deduplication decision: new.
- Challenger conclusion and date: accepted at P1, 2026-10-20.

## Resolution

- Accepted/rejected rationale: accepted 2026-10-20. Owner decision 5 (2026-10-21): slice
  18 runs in wave 1, after slice 0
  ([Owner Selection](../phase-11-remediation-plan-2026-10-20.md#owner-selection-2026-10-20)).
- Fix branch/commit/issue: `remediation/p11-s18-audio-defaults`, slice 18, implemented and
  independently reviewed 2026-10-21; merged to `main` in `db86adc` on 2026-10-21. The finding is
  `fixed`, not `verified`: the two PulseAudio drivers and the speaker check are owed.
- What changed: `parseStoredAudioNumber` in `src/renderer/App.tsx` now returns the
  fallback for a `null`, empty or blank value, so a fresh profile starts the engine at
  master 80, metronome 65 and reverb 20. A saved number, including a saved `0`, is kept.
  The function is exported for its unit test. No stored data changes and no settings rows
  are seeded.
- Tests (`src/renderer/App.test.tsx`): `parseStoredAudioNumber > returns the fallback for a
  missing, empty or non-numeric value` and `App > starts a fresh profile at the audio
  defaults the settings screen shows` both failed before the fix (`null` gave 0 and
  `setMasterVolume(0)` was called) and pass after it. `parseStoredAudioNumber > keeps a
  stored number, including a saved zero` and `App > keeps saved audio levels, including a
  saved zero, over the defaults` pass before and after, and guard against over-correcting.
  Source identity for the reproduction: product code equal to `4466626`.
- Driver result: not run. `sitting1-audio-desktop.mjs` (`VOLUMES=fresh`) and
  `sitting1-audio-web.mjs` need a PulseAudio null sink, and the sandbox has no access to
  the PulseAudio socket. Owed, see below.
- Other reads in the same effect: hit window and beats visible ignore values that are not
  above 0, and latency compensation defaults to 0, so a missing value gives the right
  result for those three. `leadInBeats` does not: a missing value becomes `0`, but the
  Settings screen shows 2. That is outside this finding and is left for the lead to triage.
- Proof owed (agent-runnable, needs PulseAudio outside the sandbox): `VOLUMES=fresh` desktop
  run and the first-launch pass of the web run; the fresh peak should be within 1 dB of the
  saved-slider run. Human-only: user tests B1, a fresh install is audible on speakers.
- Residual risk: none expected beyond the owed runtime proof.
- Revisit trigger: reviewer verification and the runtime proofs above.
