# PH-DATA-008: Unbinding a key does not survive a reload, so remapped keys come back doubled

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-20
- Verifier: TBD
- Affected runtime: both (shared parser)
- Coverage rows: WF-003, DATA-016
- Related/duplicate findings: PH-MUS-005 (same input service, different defect)
- First observed against: `main` at source identity `4466626`, Phase 11 lane F (FA run 2026-10-19; source trace 2026-10-20)

## User Impact

In Keyboard Setup, binding a key that another note already uses moves it: the other
note shows "Unbound". **Clear** also leaves a note unbound. Both look right until the
next launch, when every unbound note gets its default key back. If the moved key was
that note's default, two notes now show the same key and only one of them plays.
Example: bind D4 to Z (C3's default). After reload, C3 reads Z and D4 reads Z;
pressing Z plays D4, so C3 has no working key while its label says it has one.
Severity P3: the player can rebind, and nothing else is affected.

## Expected Behavior Or Oracle

The mapping after a reload equals the mapping the screen showed before it. The status
messages "D4 set to Z." and "E4 was cleared." promise a durable change.

## Evidence

### Environment

- Commit/patch identity: `4466626`, web bundle from `dist/`
- OS/runtime/browser: Linux, headless Chromium 141 (`scripts/audit/browser/keyboard-remap-persistence.mjs`)

### Reproduction

1. Bind D4 to K while K is on C4: labels `C4=Unbound, D4=K`; stored `note-12: null`. After reload: `C4=,` (default back).
2. Bind D4 to Z (C3's default): labels `C3=Unbound, D4=Z`; stored `note-0: null`. After reload: `C3=Z, D4=Z`; pressing Z lights D4 only.
3. Clear E4: "E4 was cleared.", stored `note-16: null`. After reload: `E4=/`.
4. Controls in the same run: a plain rebind (C4 to K) survives reload and a server restart.

### Artifacts

- `src/lib/input/settings.ts:133-158` `parseKeyboardMapping`: a `null` entry is skipped, so the default from `createDefaultKeyboardMapping()` stays.
- `stringifyKeyboardMapping` (`:162`) writes the `null`, so the stored value is right; the parser discards it.
- Output: `$TMPDIR/p11/FA/kbd.final.out` sha256 `58475bf8…9e180a35`.

## Root Cause

The stored format can say "unbound" (`null`) but the parser reads `null` as "not set".
The owning boundary is `parseKeyboardMapping`.

## Recommended Remediation Boundary

Treat an explicit `null` in a parsed object as unbound; keep the default only for a
missing key. Add a parser test for both.

## Required Regression Proof

- Deterministic unit/integration proof: `settings.test.ts` cases for `{ "note-0": null }` (unbound) and `{}` (default).
- Web proof: rerun `keyboard-remap-persistence.mjs`; the post-reload labels match the pre-reload labels.
- Electron proof: shared code; one desktop rerun optional.

## Challenge Record

- Independent reproduction attempt: three separate cases in one run, each with a stored value that is correct and a reloaded label that is not.
- Alternative explanations tested: save failure (no: the stored JSON holds the `null`).
- Scope/severity changes: none.
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, 2026-10-20
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s14-settings`, slice 14, commit `b66e7b6`;
  implemented and independently reviewed 2026-11-02; merged to `main` in `05dd7aa`; `fixed`, not `verified`: the lead's web `keyboard-remap-persistence.mjs` rerun on `main` is owed.
- What changed: `parseKeyboardMapping` in `src/lib/input/settings.ts` now reads an
  explicit `null` as unbound. A missing entry, a non-string, a blank string or an
  unsupported code still gets the default. Every caller was checked: `App.tsx` startup and
  `KeyboardSetupScreen` load the mapping through the same parser; `stringifyKeyboardMapping`
  already wrote the `null`; `invertKeyboardMapping` already skips an unbound note. The only
  automatic write is the existing first-run save when no mapping is stored at all, so no
  stored mapping is rewritten. Both runtimes share the parser and the `getSetting`/`setSetting`
  string, so the `null` round-trips unchanged through IPC and HTTP.
- Tests (source identity `cc40b63` for the failures): `src/lib/input/settings.test.ts`
  `reads an explicit null as an unbound note, not as the default key` failed before
  (`expected 'KeyZ' to be null`) and `round-trips an unbound note through stringify and parse`
  failed before (`note-0` came back `'KeyZ'`); both pass after. `gives the default key to a
  note whose key is missing` and `still falls back to the default for an unusable stored
  value` pass before and after (guards). `KeyboardSetupScreen.test.tsx` `keeps a note the
  player unbound unbound after a reload` failed before (no `Bind C3 to Unbound` button) and
  passes after; it also asserts nothing is written on load.
- Driver result: web `keyboard-remap-persistence.mjs` run on this worktree's `dist/` with a
  `$TMPDIR` data dir. Post-reload labels equal pre-reload labels: bind D4 to K gave
  `C4=Unbound, D4=K` before and after reload; bind D4 to Z gave `C3=Unbound, D4=Z` before
  and after, with Z lighting only D4; Clear E4 gave `Unbound` after reload. Electron: shared
  parser, optional rerun not done (see PH-ARCH-003 for why Electron cannot run here).
- Proof owed: agent-runnable, none left. Human-only: none required.
- Main-build proof, 2026-11-02 (`c170bc3`): web `keyboard-remap-persistence.mjs` passed (a build of `main` at `c170bc3`, throwaway data directory; `harness.mjs` read a port from `LK_PORT` in the proof agent's own copy): a remap and a clear survive a reload and a server restart; the only errors are the induced 500s.
- Residual risk: a user who already has a doubled key keeps it until they rebind; nothing is
  rewritten. The first-run save still writes the full default mapping once.
- Revisit trigger: reviewer verification.
