# PH-UI-016: Results Grade Letter Fails Text Contrast In The Default Theme

- Lane: UI/accessibility
- Severity: P3
- Confidence: high
- Status: accepted
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), computed styles and pixel sample
- Verifier: independent verifier recommended
- Affected runtime: both (CSS); web proven
- Coverage rows: RT-010, WF-010
- Related/duplicate findings: none
- First observed against: `main` at `6e549b6`

## User Impact

The large grade letter on the results screen (S, A, B, C, D, F) is the headline result. In the default dark theme its contrast against its badge is 1.7:1 (D, F), 2.4:1 (B, C), 2.7:1 (S), and 3.0:1 (A, just under the 3:1 threshold for 38 px bold text). The F in particular is barely visible. The same screen prints the percentage accuracy and star count in text, so the information is available; P3.

## Expected Behavior Or Oracle

- `PRODUCT.md` line 35: readable contrast.
- WCAG 2.2 SC 1.4.3: 3:1 for large text (2.4 rem bold counts as large).

## Evidence

### Environment

- Commit/patch identity: `6e549b6`; headless Chromium 141, Playwright 1.56.1, default theme (`data-theme="dark"`), 1480x960.

### Reproduction

Driver: `scripts/audit/browser/grade-badge-contrast.mjs` (computed colours) and `scripts/audit/browser/color-state-evidence.mjs` (results screenshot).

```text
Computed (animation disabled): S colour srgb(0.557,0.448,0.150) on rgba(245,197,66,0.18); A srgb(0.181,0.511,0.299) on rgba(64,181,106,0.16);
  B/C srgb(0.203,0.395,0.596) on rgba(74,144,217,0.16); D/F srgb(0.464,0.221,0.165) on rgba(255,107,157,0.14)
Composited over the sampled results-card background rgb(19,21,32): S 2.67:1, A 2.99:1, B/C 2.41:1, D/F 1.69:1
Pixel sample of the rendered F badge: glyph (118,56,42) on (52,33,49) = 1.68:1
```

Screenshot `$TMPDIR/p11/E/shots/E-color-results-cb-false.png` (SHA-256 prefix `a1132a1328ace82c`).

### Artifacts

- `src/renderer/styles.css:5021-5052`: grade colours are `color-mix(in srgb, <state colour> N%, black)` on a 14 to 18 percent tinted background; the mix with black suits a light theme and darkens the glyph on the dark theme.

## Root Cause

The grade styles were written for a light surface and the dark theme inherits them unchanged.

## Recommended Remediation Boundary

Use theme-aware grade colours (mix with white in dark themes). Owning module: `styles.css`.

## Required Regression Proof

- Deterministic unit/integration proof: none in jsdom (computed contrast); keep as runtime proof.
- Electron proof: results screen screenshot in sitting 1.
- Web proof: re-run `grade-badge-contrast.mjs` and recompute contrast.
- Data/recovery proof: none.
- Manual hardware/UI proof: none.
- Broader regression command: n/a.

## Challenge Record

- Independent reproduction attempt: the arithmetic and a pixel sample of the rendered screenshot agree (1.69 and 1.68).
- Alternative explanations tested: badge reveal animation still running at capture (ruled out: the probe disables the animation; the screenshot was taken after the 0.42 s reveal).
- Scope/severity changes: held at P3. Other themes were not measured.
- Deduplication decision: new.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P3. Accepted.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: none.
- Verification evidence: none yet.
- Residual risk: other themes unmeasured.
- Revisit trigger, if accepted-risk: n/a.
