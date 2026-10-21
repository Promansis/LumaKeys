# PH-DATA-007: Library filter presets saved before the rename are no longer offered

- Lane: DATA
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (web reproduced; Electron runs the same renderer code)
- Coverage rows: DATA-016, DATA-017
- Related/duplicate findings: PH-DATA-004 (same pattern for the web IndexedDB pack store; the lead may merge both into one "browser-side stores renamed without carry-over" finding), PH-DATA-005
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane B, 2026-10-19

## User Impact

Users can save named library filter presets (a "Preset name" field and "Save Filters" in the library). From
2026-04-03 (`56b21a7`) to the rename on 2026-08-07 (`489fe45`) they were stored in
`localStorage` under `pianohero-filter-presets`. The rename changed the key to
`lumakeys-filter-presets` in place and added no carry-over, so after updating the
library shows none of the presets the user saved. The old value stays in
`localStorage`, unused. In Electron the same applies even when the profile itself
is carried over, because `Local Storage` moves as a whole and the key inside it is
still the old one.

Severity P3: presets are a convenience the user can recreate, and nothing else is
lost, but it is durable user-created state that the rename drops silently.

## Expected Behavior Or Oracle

- `CONTEXT.md:114`, quality priority 1: "No user-data loss, arbitrary file access, or
  unsafe privileged operations."
- The rename's own contract in `src/persistence/legacyBrandMigration.ts:66-78`: a
  one-release boundary that carries legacy data into the new layout.
- DATA-016 lists browser `localStorage` as a durable store in scope.

## Evidence

### Environment

- Commit/patch identity: `6e549b6`; web build in `dist/` (current for this source).
- OS/runtime: Linux, headless Chromium 141 via Playwright 1.56.1, server on port
  3798 with `LUMAKEYS_DATA_DIR` under `$TMPDIR/p11/B/presets`.

### Reproduction

1. Case L: clear `localStorage`, set `pianohero-filter-presets` to one preset
   labelled "Legacy Preset", open the library.
2. Observed: the presets section renders, user preset chips `[]`, and the legacy key
   is still present.
3. Case C (control): the same JSON under `lumakeys-filter-presets` labelled
   "Control Preset": chips `["Control Preset"]`.
4. Expected: the preset saved under the old key is listed.
5. Repeat count: two runs, identical.

### Artifacts

- File/line: `src/renderer/components/LibraryScreen.tsx:191-198` (reads only
  `lumakeys-filter-presets`), `:646`, `:653`; no source reads
  `pianohero-filter-presets` (`grep -rn pianohero src` outside tests).
- Command: `cd $TMPDIR/pw && DATA=$TMPDIR/p11/B/presets PORT=3798 node legacy-filter-presets.mjs`
  (driver `scripts/audit/browser/legacy-filter-presets.mjs`); output
  `$TMPDIR/p11/B/legacy-filter-presets.out` (sha256 `198d2837…4b235901`).

## Root Cause

The rename replaced brand-named storage keys in place. Server-side and profile
stores got a fallback; browser-side keys did not.

## Recommended Remediation Boundary

In `LibraryScreen.tsx` (or a small renderer start-up helper shared with the
PH-DATA-004 fix): if `lumakeys-filter-presets` is absent and
`pianohero-filter-presets` is present, copy it across and remove the old key. Remove
the helper with the rest of the legacy fallback (see the lane H ADR draft).

## Required Regression Proof

- Deterministic unit/integration proof: a `LibraryScreen` test that seeds the legacy
  key and expects the preset chip.
- Web proof: rerun `legacy-filter-presets.mjs`; case L must list "Legacy Preset".
- Electron proof: sitting 2 or a headless Electron run after PH-DATA-005 is fixed.

## Challenge Record

- Independent reproduction attempt: the control case proves the driver reaches the
  library and that the chip selector matches real preset chips.
- Alternative explanations tested: a malformed fixture would also hide the chip, so
  both cases use the same JSON built from the current `FilterPreset` shape; only
  the key differs.
- Scope/severity changes: Electron half stated from source, not run; P3 kept.
- Deduplication decision: PH-DATA-004 covers the IndexedDB pack store, not
  `localStorage`; filed separately so the lead can choose to merge.
- Challenger conclusion and date: reproduced, 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: branch `remediation/p11-s15-browser-legacy`, commit f3b1fb8 (slice 15; ships in the carry-over release with slice 1). No issue.
- Verification evidence:

  What changed: new `src/renderer/legacyFilterPresets.ts`. `LibraryScreen` calls `carryOverLegacyFilterPresets()` in its preset state initialiser. When `lumakeys-filter-presets` is absent and `pianohero-filter-presets` exists, the value is copied across and the old key is removed once the copy reads back equal. When the current key exists it wins and the legacy key is left until reset. Storage errors are swallowed. `LibraryScreen` keeps its original key literals and gains only the one call, so removal is deleting that file and that call. Marked for removal no earlier than 2027-01-31 (owner decision 3). "Reset all user data" already calls `localStorage.clear()`, which clears both names, so reset needed no change and has no new test.
  Tests. Failed before the fix, pass after: `LibraryScreen.test.tsx` "lists a preset saved under the pre-rename key and moves it to the current key". Guard: "keeps the current presets and leaves the legacy key alone when both exist".
  Driver `legacy-filter-presets.mjs` (headless Chromium, isolated data): case L before `userChips: []`, `presetKeys: [pianohero-filter-presets]`; after `userChips: [Legacy Preset]`, `presetKeys: [lumakeys-filter-presets]`; case C (control) unchanged.
  Electron half: the renderer code is the same, so it follows the web result. A headless Electron run is owed after slice 1 lands (sitting 2 or an Electron probe on a carried-over profile).
- Residual risk: A user who saved presets under the current key after the rename and still has a legacy key keeps both until reset or the removal release. The carry-over runs when the library opens, so a legacy key lingers until then.
- Revisit trigger, if accepted-risk:
