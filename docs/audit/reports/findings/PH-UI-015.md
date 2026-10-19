# PH-UI-015: Colour-Blind Palette Paints Missed Notes The Same Colour As Pending Right-Hand Notes

- Lane: UI/accessibility
- Severity: P3
- Confidence: high
- Status: reproduced
- Owner: remediation owner TBD
- Challenger: Claude Code (acting), screenshot and palette arithmetic
- Verifier: person with colour-vision deficiency (user test item proposed in the lane report)
- Affected runtime: both (canvas code); web proven
- Coverage rows: RT-010, WF-009, MOD-003
- Related/duplicate findings: none
- First observed against: `main` at `6e549b6`

## User Impact

The setting "Colour-blind mode" exists to make note states distinguishable. In that mode a missed note is drawn `#EE6677`, which is exactly the colour of a pending right-hand note, and a "good" hit is `#4477AA`, exactly the colour of a pending left-hand note. The state is told apart only by position (below or above the hit line) and by a 700 ms text popup that says MISS or GOOD. A player glancing at a note near the hit line cannot tell a miss from the next right-hand note, and a good hit from the next left-hand note, by colour. The failed note is also the one a learner most needs to notice. P3: position and the popup remain, and the results screen labels every state in text.

## Expected Behavior Or Oracle

- `PRODUCT.md` line 35: "color-blind-friendly states".
- `DESIGN.md` line 281: states "never rely on color alone".
- RT-010: "Color-independent musical/result states".

## Evidence

### Environment

- Commit/patch identity: `6e549b6`; headless Chromium 141, Playwright 1.56.1, built web server, default dark theme, 1480x960.
- Fixture: generated four-note song (C4 to F4, 120 BPM), Play mode, the first two notes hit with computer-keyboard keys, the last two left to miss.

### Reproduction

Driver: `scripts/audit/browser/color-state-evidence.mjs` (runs once with `visual.colorBlindMode=false`, once with `true`) and `scripts/audit/browser/palette-cvd-distance.py`.

```text
Palette arithmetic (src/renderer/components/FallingNotesCanvas.tsx:74-95)
  colour-blind mode: perfect #f5c542, good #4477AA, ok #66CCEE, miss #EE6677, pending left #4477AA, pending right #EE6677
  CIE76 distance (normal, protan, deutan, tritan simulation): good vs pending-left 0.0, miss vs pending-right 0.0
  default palette: good vs miss 14.9 under simulated deuteranopia; miss vs pending-right 16.4 and good vs ok 16.7 under simulated tritanopia; all other pairs above 20
```

Screenshot `$TMPDIR/p11/E/shots/E-color-montage-cb-true.png` (SHA-256 prefix `1a3f129c6dd6d346`) shows a pink-red MISS note on the hit line and a pending F4 note above it in the identical colour; the default-palette montage `E-color-montage-cb-false.png` (`dba05ebca0ea85a2`) shows the brown-red miss against a pink pending note.

### Artifacts

- `FallingNotesCanvas.tsx:74-82`: the colour-blind branch returns `'#4477AA'` for both `good` and pending-left, and `'#EE6677'` for both `miss` and pending-right.
- States carried by colour only after the 700 ms popup: judged note body fill (`drawNotes`), key cue colours in `PianoKeyboard.tsx` (`cue-left`, `cue-right`), hand identity.
- States with text or shape: judgement popup labels (PERFECT!, GOOD, OK, MISS), HUD score and combo, results screen stat cards labelled PERFECT, GOOD, OK, MISS, theory quiz review text "Correct" or "Correct answer: X", interval and scale feedback text. There is no early or late state in the model (`NoteJudgement` is `pending | perfect | good | ok | miss`), so none is displayed.

## Root Cause

The colour-blind palette reuses the two Tol-scheme colours for both hand identity and judgement outcome, so the two meanings share colours.

## Recommended Remediation Boundary

Give judged notes a different treatment from pending notes in colour-blind mode (a distinct lightness, a border or hatch, or a glyph such as a cross for a miss). Owning module: `FallingNotesCanvas.tsx` plus its test.

## Required Regression Proof

- Deterministic unit/integration proof: a test that `noteFill` returns different values for `miss` and pending-right and for `good` and pending-left in colour-blind mode.
- Electron proof: none (canvas code is shared).
- Web proof: re-run the driver and compare the montage.
- Data/recovery proof: none.
- Manual hardware/UI proof: one person with a colour-vision deficiency plays a short song in both palettes (proposed user-test item).
- Broader regression command: `npx vitest run src/renderer/components/FallingNotesCanvas.test.tsx`.

## Challenge Record

- Independent reproduction attempt: screenshot and arithmetic agree.
- Alternative explanations tested: the setting not taking effect (ruled out: the miss note in the `true` run is `#EE6677`-pink, in the `false` run brown-red); position cue making the difference irrelevant (kept: this is why the severity is P3).
- Scope/severity changes: held at P3.
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19. The simulated distances are a numeric screen, not a calibrated colour-vision review.

## Resolution

- Accepted/rejected rationale: pending lead.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: none.
- Revisit trigger, if accepted-risk: n/a.
