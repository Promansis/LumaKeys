# PH-MUS-015: Installed instrument packs cut notes off 0.1 s after release

- Lane: MUS
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: Electron (the web never uses the pack, PH-PAR-006)
- Coverage rows: WF-019
- Related/duplicate findings: PH-PAR-006
- First observed against: `main` at source identity `4466626`, sitting 1 audio run 2026-10-20

## User Impact

After "Install Better Sounds", the desktop plays the pack's samples with Tone's default
0.1 s release instead of the instrument's own release (Flute: 1.1 s). Notes stop
abruptly when the key comes up, so the "better" sound is clipped compared with the
built-in one. This affects every desktop user with a pack installed, on every note;
it is a sound-quality problem with no data or workflow impact, so P3.

## Expected Behavior Or Oracle

A pack replaces the samples, not the instrument's envelope. The built-in sampler takes
`release` from the instrument definition (`instrumentCatalog.ts:294`, Flute
`release: 1.1`); the pack sampler should too.

## Evidence

### Environment

- Commit/patch identity: source `4466626`
- OS/runtime/browser: Electron 30.5.1 (`out/`, offscreen), Linux; audio from a
  PulseAudio null sink
- Data profile/fixture: fresh profile, Flute pack installed, sliders saved

### Reproduction

1. Free Play, play C D E with the Flute pack, then switch to "Use Built-in Sounds"
   and play them again.
2. With the pack, each note falls to −30 dB 0.54 to 0.65 s after its onset; built-in
   Flute takes 0.93 to 2.5 s.

### Artifacts

- `src/lib/audio/audioEngine.ts:580` (live) and `:477` (offline render): the custom
  sampler is built from `urls` and `baseUrl` only; the built-in sampler at `:598`
  and `:481` passes `release`.
- `$TMPDIR/p11/S1A/desktop-nudged/analysis.txt`, item 6.

## Root Cause

The custom-sampler branch builds `Tone.Sampler` without the instrument definition's
options, so Tone's default release applies.

## Recommended Remediation Boundary

Pass the active instrument's `release` (and any other sampler options) into both
custom-sampler constructions in `src/lib/audio/audioEngine.ts`.

## Required Regression Proof

- Deterministic unit/integration proof: with custom URLs set for Flute, the sampler is
  constructed with `release: 1.1`.
- Electron proof: the item 6 capture shows the pack's decay matching the built-in's.
- Broader regression command: `npx vitest run src/lib/audio`

## Challenge Record

- Independent reproduction attempt: the lead read both constructor calls and
  confirmed the missing option.
- Alternative explanations tested: different samples in the pack. C3, D3 and C4 are
  byte-identical in the pack and the built-in set, and still decay faster with the
  pack, so the envelope is the cause.
- Scope/severity changes: none.
- Deduplication decision: new; PH-PAR-006 is the separate web-side gap.
- Challenger conclusion and date: accepted at P3, 2026-10-20.

## Resolution

- Accepted/rejected rationale: accepted 2026-10-20.
- Fix branch/commit/issue: `remediation/p11-s06-audio`, commit `662e621` (slice 6), implemented and independently reviewed 2026-11-02; merged to `main` in `c7216e2`; `fixed`, not `verified`: `scripts/audit/sitting1-audio-desktop.mjs` item 6 (needs PulseAudio; lead runs it) and owner sitting 1 items 5 and 6 on speakers are owed.
- What changed: both custom-sampler builds in `src/lib/audio/audioEngine.ts` (live and offline render) now take the active instrument's `release` through `customSamplerOptions`, as the built-in sampler does (Flute `1.1`). The key is left out when the instrument defines no sampler `release` (for example a synth voice), so Tone's default still applies there rather than an explicit `undefined`.
- Tests (`src/lib/audio/audioEngine.test.ts`): `gives the live custom sampler the instrument release` and `gives the offline custom sampler the instrument release` both failed before the fix (`expected undefined to be 1.1`) and pass after it. `leaves release unset for an instrument that defines none` passes before and after. Source identity for the reproduction: product code `1180731`.
- Driver result: `sitting1-audio-desktop.mjs` item 6 not run: it needs a PulseAudio null sink (`PULSE_SINK=lk_s1a`) and the sandbox has no access to the PulseAudio socket. `electron/sample-pack.mjs` unchanged (see PH-PAR-006).
- Proof owed: agent-runnable but needs PulseAudio outside the sandbox: `sitting1-audio-desktop.mjs` item 6, the pack's decay (-30 dB time) should match the built-in's instead of 0.54 to 0.65 s. Human-only: sitting 1 items 5 and 6, listen to the built-in and installed Flute.
- Residual risk: other Sampler options the instrument definitions might carry are not forwarded; only `release` exists on sampler instruments today.
- Revisit trigger: reviewer verification and the item 6 capture.
