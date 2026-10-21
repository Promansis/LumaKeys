# PH-MUS-018: On a fresh profile the count-in after the 3-2-1 countdown is lost while Settings shows 2 lead-in beats

- Lane: MUS
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: the slice 18 reviewer (independent), 2026-10-21
- Verifier: TBD
- Affected runtime: both
- Coverage rows: WF-009, WF-018, MOD-002, MOD-003
- Related/duplicate findings: PH-MUS-014 (same defect class in the same load effect: a missing stored value read as `0` instead of the default; not a duplicate, because the lead-in value is a different setting with a different consumer and the PH-MUS-014 fix does not touch it)
- First observed against: `main` at source identity `4466626`; the code is older than the Phase 11 baseline. Found 2026-10-21 during the slice 18 implementation and review.

## User Impact

On a fresh profile, or any profile that has never saved the lead-in setting, a song starts
with no count-in beats after the 3-2-1 countdown, so the learner gets no beat to settle
into before the first note falls. Settings, Gameplay, Lead-in Beats reads 2, which is the
product default, and "Reset to defaults" in the renderer also sets 2. The learner sees one
value and gets another until they open Settings and choose a value once. The effect is a
lost cue, not lost data, and a user who notices can set the value, so P3. It affects every
runtime, because the code is shared renderer code.

## Expected Behavior Or Oracle

A setting that has never been saved takes the default the Settings screen shows. The
renderer's own defaults agree on 2: `useState(2)` at `src/renderer/App.tsx:316`, the
Settings fallback `'gameplay.leadInBeats': '2'` at `SettingsScreen.tsx:319` and
`values['gameplay.leadInBeats'] ?? '2'` at `SettingsScreen.tsx:1662`, and
`setLeadInBeats(2)` in `resetUiStateToDefaults` at `App.tsx:932`. A saved `0` is a valid
choice and must stay 0 (PH-MUS-014 applies the same rule to the volumes).

## Evidence

### Environment

- Commit/patch identity: `main` at `64a8160`; product source equal to `4466626` plus the
  slice 18 change (`db86adc`), which does not touch the lead-in read.
- OS/runtime/browser: jsdom (Vitest), renderer code only.
- Data profile/fixture: a throwaway App test with the bridge stubbed so that every
  `getSetting` resolves `null`, which is what a fresh profile returns.

### Reproduction

1. Mount `App` with every `window.appBridge.getSetting` returning `null`.
2. Let the startup effect settle, then start a practice session.
3. The session config passed to the game carries `leadInBeats = 0`.
4. Settings, Gameplay, Lead-in Beats shows 2 for the same profile.

Seen once in the reviewer's throwaway test (not committed); the cause is in shared code
(below). A runtime driver run is not yet done.

### Artifacts

- `src/renderer/App.tsx:651-654`: `const parsedLeadIn = Number(rawLeadInBeats);` then
  `if (Number.isFinite(parsedLeadIn) && parsedLeadIn >= 0) { setLeadInBeats(Math.round(parsedLeadIn)); }`.
  `Number(null)` is `0`, which passes both tests, so `setLeadInBeats(0)` replaces the
  `useState(2)` default at line 316. The value is read at line 542
  (`getSetting('gameplay', 'leadInBeats')`).
- `src/renderer/App.tsx:140`: `buildSessionConfig` carries `leadInBeats` into the session
  config (callers at lines 1094, 1114 and 1134).
- `src/renderer/components/GameScreen.tsx:880-886`: the countdown loop runs
  `leadInBeats` times (`countdownConfig.leadInBeats ?? 0`), so 0 runs no beats.
- The same parse at `App.tsx:894-898` (the live settings-change path) receives the string
  just chosen in the Settings select, so it does not meet `null`.

## Root Cause

The startup read converts a missing stored value with `Number(...)` and then treats the
result as stored data. `Number(null)` is `0`, and `0 >= 0` is accepted as a valid saved
count-in. The loader cannot tell "never saved" from "saved 0". The owning boundary is the
settings load effect in `src/renderer/App.tsx`, the same one in which PH-MUS-014 found the
audio levels read the same way.

## Recommended Remediation Boundary

Treat `null`, an empty string and a blank value as "not set" before parsing, and leave the
`useState(2)` default in place. The PH-MUS-014 helper `parseStoredAudioNumber` is the
model for this; a small shared parser would serve both, but a one-line guard on
`rawLeadInBeats` is enough. A saved `0` must still be kept. `src/renderer/App.tsx` only.
This is not implementation authorization.

## Required Regression Proof

- Deterministic unit/integration proof: an `App` test with every `getSetting` returning
  `null` starts a session whose config has `leadInBeats = 2`; a companion case with a
  stored `'0'` keeps `0`, so the fix does not over-correct.
- Electron proof: not required beyond the shared-code test; a fresh-profile run shows the
  count-in beats after the 3-2-1 countdown.
- Web proof: the same fresh-profile run through the web build.
- Data/recovery proof: not applicable; no stored data changes and no settings row is
  seeded.
- Manual hardware/UI proof: none needed.
- Broader regression command: `npx vitest run src/renderer`

## Challenge Record

- Independent reproduction attempt: the slice 18 reviewer wrote a throwaway App test with
  every `getSetting` returning `null` and read `leadInBeats = 0` in the session config,
  2026-10-21. The test was not committed.
- Alternative explanations tested: that `0` is an intended "no count-in" default was
  rejected, because Settings, the initial state and the reset path all say 2.
- Scope/severity changes: P3, a settings inconsistency with a recoverable, low-cost effect.
  It is not folded into PH-MUS-014 (P1, audibility) so that the P1 fix and its proof stay
  narrow.
- Deduplication decision: new. PH-MUS-014 owns the audio levels; PH-ARCH-003 owns a
  different stored-value defect in an integer setting ("off" in the reminder setting).
- Challenger conclusion and date: reproduced, 2026-10-21. Acceptance and placement are the
  owner's.

## Resolution

- Accepted/rejected rationale: accepted by the owner on 2026-10-21 ("fix"), to be fixed at once as a wave 1 follow-up (user tests decision 6).
- Fix branch/commit/issue: branch `remediation/p11-f1-lead-in`, commit `19c10f5` (not pushed).
- Verification evidence: two App tests added in `src/renderer/App.test.tsx` (fresh profile gives `leadInBeats = 2`; saved `'0'` stays 0). Before the fix the fresh-profile test failed (expected 2, received 0); after it, `src/renderer/App.test.tsx` passes 21/21. Full vitest 73 files passed, 1 skipped; 473 tests passed, 1 skipped. Both `tsc` projects clean; `npm run verify` (both builds and the Electron asset check) passed. Electron and web share this renderer code path; no runtime launch was done.
- Residual risk: the fix is a guard on the startup read only. No fresh-profile run through the Electron or web build has been done. Other settings in the same effect were checked: `latencyCompMs` also reads null as 0, but its default is 0, so it is harmless; `hitWindowMs` and `beatsVisible` require a value above 0, so null is already rejected.
- Revisit trigger: the owner's decision on acceptance and placement.
