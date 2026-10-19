# PH-UI-005: Progress dashboard shows trouble-spot measures one lower than every other screen

- Lane: UI
- Severity: P3
- Confidence: high
- Status: reproduced
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), second pass 2026-10-19
- Verifier: TBD
- Affected runtime: both (shared renderer)
- Coverage rows: WF-017
- Related/duplicate findings: none
- First observed against: `main` at source identity `6e549b6`, Phase 11 lane F, 2026-10-19

## User Impact

After a run that misses measures 1 and 2, the Results screen lists "Measure 1" and
"Measure 2". The Progress dashboard lists the same trouble spots as "Measures 0–0"
and "Measures 1–1". A learner told to practise "measure 0" cannot find it.

## Expected Behavior Or Oracle

Every user-facing measure number is one-based. `ResultsScreen.tsx`,
`PerformanceGraph.tsx`, and `GameScreen.tsx` all add one to the stored zero-based index.

## Evidence

- Runtime: lane F scored three runs of a two-measure song; Results showed Measures 1 and 2; Progress showed "Measures 0–0" and "Measures 1–1".
- Source: `ProgressDashboardScreen.tsx` renders `Measures {spot.measureStart}–{spot.measureEnd}` with no offset; present since `32da881` (2026-04-08).

## Root Cause

The dashboard displays the stored zero-based index directly.

## Recommended Remediation Boundary

Add one to both values in the dashboard label. Leave storage and the Practice
button's loop range unchanged.

## Required Regression Proof

- Component: `ProgressDashboardScreen` test with a trouble spot at measures 0 to 0 expecting "Measures 1–1".

## Challenge Record

- The "100%" beside each spot is the latest accuracy; spots resolve after three runs above 85 percent, so that part is by design.
- Challenger conclusion and date: reproduced, 2026-10-19

## Resolution

- Accepted/rejected rationale: pending consolidation
