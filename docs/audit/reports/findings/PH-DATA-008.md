# PH-DATA-008: Unbinding a key does not survive a reload, so remapped keys come back doubled

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: accepted
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
- Fix branch/commit/issue:
- Verification evidence:
- Residual risk:
- Revisit trigger, if accepted-risk:
