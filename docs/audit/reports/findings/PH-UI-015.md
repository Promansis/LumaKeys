# PH-UI-015: Colour-Blind Palette Paints Missed Notes The Same Colour As Pending Right-Hand Notes

- Lane: UI/accessibility
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), screenshot and palette arithmetic
- Verifier: person with colour-vision deficiency (user test item proposed in the lane report)
- Affected runtime: both (canvas code); web proven
- Coverage rows: RT-010, WF-009, MOD-003
- Related/duplicate findings: none
- First observed against: `main` at `4466626`

## User Impact

The setting "Colour-blind mode" exists to make note states distinguishable. In that mode a missed note is drawn `#EE6677`, which is exactly the colour of a pending right-hand note, and a "good" hit is `#4477AA`, exactly the colour of a pending left-hand note. The state is told apart only by position (below or above the hit line) and by a 700 ms text popup that says MISS or GOOD. A player glancing at a note near the hit line cannot tell a miss from the next right-hand note, and a good hit from the next left-hand note, by colour. The failed note is also the one a learner most needs to notice. P3: position and the popup remain, and the results screen labels every state in text.

## Expected Behavior Or Oracle

- `PRODUCT.md` line 35: "color-blind-friendly states".
- `DESIGN.md` line 281: states "never rely on color alone".
- RT-010: "Color-independent musical/result states".

## Evidence

### Environment

- Commit/patch identity: `4466626`; headless Chromium 141, Playwright 1.56.1, built web server, default dark theme, 1480x960.
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
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s16-colour`, slice 16, implemented 2026-11-02, awaiting independent review; not merged. Status is left for the lead.
- What changed: in colour-blind mode `noteFill` (`src/renderer/components/FallingNotesCanvas.tsx`, now exported) no longer shares colours between hand identity and judgement. Pending notes keep the Tol blue `#4477AA` (left) and pink `#EE6677` (right). Judged notes use lightness steps away from both: good `#EEEEEE`, ok `#66CCEE`, miss `#222222`, perfect stays the theme gold. Judged notes are also outlined (dark outer, white inner line, readable on light and dark themes) and carry a shape drawn from the new exported pure helper `judgementMark`: star (perfect), check (good), ring (ok), cross (miss). Pending notes have neither. The default (non-colour-blind) palette, its code path and its tests are unchanged. `palette-cvd-distance.py` now lists the new colour-blind palette next to the old one.
- Tests (`src/renderer/components/FallingNotesCanvas.test.tsx`, new): `noteFill > colour-blind mode > paints a missed note differently from a pending right-hand note` failed before the fix (`expected '#EE6677' not to be '#EE6677'`), `... paints a good hit differently from a pending left-hand note` failed (`expected '#4477AA' not to be '#4477AA'`), and `... never paints any judged note the colour of a pending note of either hand` failed (`good left: expected [ '#4477AA', '#EE6677' ] to not include '#4477AA'`). All pass after. Of the other five tests, three (hands apart, one colour per judgement, default palette unchanged) pass before and after the colour change; the two `judgementMark` tests (shapes, no marks by default) cannot run on the base because that function is new in this fix. Source identity for the reproduction: product code equal to `cc40b63`.
- Driver result: `palette-cvd-distance.py` (Machado 2009, severity 1.0, CIE76): before, colour-blind mode had `good vs pending-left` and `miss vs pending-right` at dE 0.0 under normal, protan, deutan and tritan simulation; after, the script reports no pair below 20 under any of the four (it prints only that threshold result, not the smallest distance). Headless Chromium on a built web server (my worktree, Playwright 1.56): a four-note song played with colour-blind mode on shows the missed note as a dark note with a white outline and a white cross, next to nothing resembling the pink pending right-hand note. `color-state-evidence.mjs` ran, but its two-key hit loop did not register hits on my regenerated fixture (it printed `HUD after two hits: n/a`), so I did not capture a good-hit frame; the miss frame and the unit tests cover the two pairs the finding names.
- Proof owed (agent-runnable): none beyond a clean re-run of `color-state-evidence.mjs` with the original `short-4-notes` fixture, to capture a good hit. Human-only: sitting 1 item 10, a person with a colour-vision deficiency plays a short song in both palettes. The simulated distances are a numeric screen, not a calibrated colour-vision review.
- Residual risk: key cue colours in `PianoKeyboard.tsx` (`cue-left`, `cue-right`) were not touched; the mark and outline are drawn only on notes at least 6 px wide inside (a glyph needs a drawn width of at least 14 px, so black-key notes get none below about 1700 px of canvas width and no note gets one below about 1017 px; those notes are told apart from pending notes by the outline, but perfect, good, ok and miss differ only by colour and lightness, gold against `#EEEEEE` being about 1.4:1, plus the 700 ms popup). Non-text contrast (WCAG 1.4.11) of the judged note against the canvas was not measured: good `#EEEEEE` on the light and warm canvases is about 1.1:1 and miss `#222222` on the dark canvas about 1.2:1 by hand calculation, so the note's edge rests on the 0.75 px dark band or the 1.5 px white outline; owner sitting 1 item 10 judges it.
- Revisit trigger: reviewer verification and the owner's colour-vision sitting.
