# PH-MUS-017: Changing a track assignment silently deletes every saved fingering for the song

- Lane: MUS
- Severity: P2
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), 2026-10-21
- Verifier: TBD
- Affected runtime: both
- Coverage rows: WF-008, DATA-007, BR-034, MOD-003
- Related/duplicate findings: PH-MUS-003 (fingering identity, now verified; this is a separate cause); none duplicate
- First observed against: `main` at `d208ee2` (source identity `4466626`), agent proof run for PH-MUS-003, 2026-10-20

## User Impact

A learner who has entered fingerings for a song and then changes any track's assignment in
the session overlay (for example Accompaniment from Ignore back to Left Hand) loses every
saved fingering for that song. Nothing says so. The confirmation that exists ("Changing
track assignments restarts this run. Continue?") appears only when notes were already
judged in the run, and even then it speaks of the run, not the fingerings. Fingerings are
user-authored technique data that took time to enter, and the loss is complete for the
song. The learner can enter them again, so P2. The run observed Electron; the code is
shared renderer code, so the web is affected the same way.

## Expected Behavior Or Oracle

A change of hand or track assignment must not erase durable user-authored data. The
fingerings are keyed by `ParsedNote.id` (PH-MUS-003), which does not depend on the
assignment, so there is no data reason to clear them. If clearing is intended, the user
must be told and asked first.

## Evidence

### Environment

- Commit/patch identity: `main` at `d208ee2`; no product source changed since `4466626`.
- OS/runtime/browser: Electron 30.5.1 (`out/`), Linux, headless offscreen.
- Data profile/fixture: throwaway profile under `$TMPDIR`; the "Two Hand Study" fixture
  (Melody F4 G4 A4 B4 C5 C5 on Right Hand, Accompaniment C3 E3 G3 C3 E3 G3 on Left Hand).

### Reproduction

1. Import the "Two Hand Study" fixture and Learn it.
2. Press Escape for the overlay and set Accompaniment to Ignore.
3. Choose Edit Fingering, resume, click a melody note and pick a finger. One row is stored.
4. Open the overlay and set Accompaniment back to Left Hand.
5. The stored fingering row count goes from 1 to 0. No prompt appeared.

Seen once, in the Electron run for PH-MUS-003. The cause is in shared code (below).

### Artifacts

- `src/renderer/components/GameScreen.tsx`: `handleAssignmentChange` (line 1012) shows a
  confirm at line 1021 only when `hasJudgedNotes` is true, then calls
  `window.appBridge.clearCustomFingerings(updatedSongRecord.id)` at line 1041.
- Evidence: `$TMPDIR/p11/PF/electron/mus1/` (source profile, `positions.json`, `shots/`),
  output `$TMPDIR/p11/PF/electron/mus1.out`. Driver:
  `scripts/audit/electron/proof-mus-003.mjs`.

## Root Cause

The assignment handler treats a track change as invalidating fingerings and clears them
unconditionally. Since PH-MUS-003 the key is the note id, which a track change does not
shift, so the key no longer needs the clear, and nothing asks the user.

## Recommended Remediation Boundary

Remove the `clearCustomFingerings` call from `handleAssignmentChange`; the note-id key
keeps the rows valid across assignment changes. If a product reason to clear remains,
ask first and name the fingerings in the prompt. `src/renderer/components/GameScreen.tsx`.

## Required Regression Proof

- Deterministic unit/integration proof: a `GameScreen` test where a fingering exists, the
  assignment changes, and `clearCustomFingerings` is not called (or is called only after
  a confirmation that names fingerings).
- Electron proof: `scripts/audit/electron/proof-mus-003.mjs` with the Accompaniment
  Ignore then Left Hand sequence keeps the row count at 1.
- Web proof: the same sequence through the web bridge.
- Broader regression command: `npx vitest run src/renderer/components`

## Challenge Record

- Independent reproduction attempt: a source read on 2026-10-21 confirms the
  unconditional clear at line 1041 and the narrow confirm at line 1021 of
  `handleAssignmentChange`.
- Alternative explanations tested: none needed beyond the source read; the call is not
  conditional on anything but the song having a record.
- Scope/severity changes: none.
- Deduplication decision: new. PH-MUS-003 owns note identity; this is a separate delete
  path that survives that fix.
- Challenger conclusion and date: accepted at P2, 2026-10-21.

## Resolution

- Accepted/rejected rationale: accepted 2026-10-21; reproduced through the UI and located
  in the handler.
- Fix branch/commit/issue: `remediation/p11-s20-fingering-preservation`, slice 20,
  implemented 2026-11-02, awaiting independent review; not merged. Branch base `ea89f3e`.
- What changed: `handleAssignmentChange` in `src/renderer/components/GameScreen.tsx` no
  longer calls `clearCustomFingerings`, no longer empties the `customFingerings` state, and
  mounts the restarted session with the current `customFingerings` instead of `[]`. The
  note-id key (PH-MUS-003) is unaffected by an assignment change, so the rows stay valid.
  `handleResetFingerings` is unchanged and still clears on request. The judged-run restart
  confirm is unchanged. No stored data changes.
- Tests (`src/renderer/components/GameScreen.test.tsx`, `fingerings across a track
  assignment change (PH-MUS-017)`; source identity for the reproduction `ea89f3e`):
  `keeps saved fingerings, in memory and in the store, when a track assignment changes`
  failed before the fix (`expected "spy" to not be called at all, but actually been called
  2 times` for `clearCustomFingerings`; with only that call removed it still failed on
  `expected 3 to be 5`, because the session restarted with `[]`) and passes after it. It
  assigns Accompaniment to Ignore and back to Left Hand and checks the visible finger on the
  melody note, the fake persisted store and the bridge calls. `still clears fingerings on
  the explicit reset` passes before and after and guards the excluded path.
- Driver result: `scripts/audit/electron/proof-mus-003.mjs`, run headless against this
  worktree's build (copy of the harness with `REPO` pointed at the worktree, `$TMPDIR`
  profiles). T0 saved a finger on a melody note with Accompaniment ignored (row count 1);
  after Accompaniment back to Left Hand the row count stayed 1 ("T1 cleared by an
  assignment change: false", was true at `d208ee2`). 18 checks pass. 5 later checks fail
  only because the driver still assumes the old wipe: it expects exactly five rows after
  S1-S5 and the original finger on the T0 note, and the T0 row now correctly survives.
  The driver needs updating for the new behavior; that is outside this slice. Not run: the
  web-bridge variant (same handler, shared renderer code).
- Proof owed (agent-runnable): update the driver's S1-S5/export/restore expectations to
  include the retained T0 row, and the web-bridge Ignore then Left Hand sequence in
  headless Chromium. Human-only: none.
- Residual risk: with the Editor open, the effect that refreshes `fingeringEditorState`
  (`GameScreen.tsx`, depends on `fingeringEditorState` and sets a new object each run) loops
  in a jsdom test; seen while writing the test, not changed here (left for the lead to triage).
- Revisit trigger: reviewer verification and the runtime proofs above.
