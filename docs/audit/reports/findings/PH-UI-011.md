# PH-UI-011: Application Top-Bar Navigation Has No Visible Keyboard Focus Or Current-Page Indicator

- Lane: UI/accessibility
- Severity: P2
- Confidence: high
- Status: fixed
- Owner: Claude Code (acting)
- Challenger: Claude Code (acting), pixel comparison and custom-property probe
- Verifier: independent verifier recommended
- Affected runtime: both (CSS; web, headless Electron, Edge 155 and Firefox 142 proven)
- Coverage rows: RT-008, WF-024, MOD-007
- Related/duplicate findings: none. PH-UI-001/004 concern dialogs, not the navigation bar.
- First observed against: `main` at `4466626`

## User Impact

On Library, Guided Lessons, Theory, Progress, and Keyboard Setup (and, faintly, on Settings) the application top bar is the only global navigation. A keyboard user Tabbing through it cannot see which button has focus: the focused button moves up by 1 px and nothing else changes. The same missing styling hides which destination is the current page (only `aria-current` carries it). Every one of these screens has nine such stops (eight destinations plus Back to Main Menu). The Free Play, Soundboard, and Game HUD nav bars are fine because they sit inside the immersive shell.

Severity P2: WCAG 2.4.7 Focus Visible (AA) failure on the primary navigation of most screens; pointer users and screen-reader users are not affected and the page body has strong focus rings, so no task is blocked.

## Expected Behavior Or Oracle

- WCAG 2.2 SC 2.4.7 Focus Visible and 1.4.11 Non-text Contrast (focus indicator 3:1).
- `PRODUCT.md` line 35: keyboard-accessible controls.
- RT-008 in the coverage matrix: "Keyboard-only navigation and visible focus".
- Every other focusable control the matrix walked has a 3 px outline (main menu cards, Settings tabs, dialogs) or the browser's default two-tone ring (verified visible in a screenshot).

## Evidence

### Environment

- Commit/patch identity: `4466626`
- OS/runtime/browser: Linux, headless Chromium 141, Playwright 1.56.1, built web server, 1480x960, default dark theme
- Data profile/fixture: empty isolated data directory plus two MIDI fixtures

### Reproduction

Drivers: `scripts/audit/browser/keyboard-focus-matrix.mjs` (`PART=destinations,settings,library`) and `scripts/audit/browser/focus-hud-nav-visual.mjs`.

```text
Computed-style walk (Tab through each screen, focused vs blurred state of each element)
dest-Guided-Lessons: 9 nav stops "NONE (weak: transform)"
dest-Theory-Trainer: 9 nav stops "NONE (weak: transform)"
dest-Progress:       9 nav stops "NONE (weak: transform)"
dest-Keyboard-Setup: 8 nav stops "NONE (weak: transform)"
library:             9 nav stops "NONE (weak: transform)"
settings-after-tablist: 8 of 9 nav stops "box-shadow + border" (a 0.14-alpha glow), current page NONE

Focused Progress screen nav button "Soundboard":
  outline=none 0px, border=rgb(244,246,255) (same as text colour), bg=rgba(0,0,0,0), transform=matrix(1,0,0,1,0,-1), boxShadow=none
Pixel diff of the 67-145 px wide clip, focused vs blurred (animations on): 2.2-5.3 percent of pixels differ, all from the 1 px shift of the glyphs
Custom properties on the top-bar button (Progress):  --product-deck-accent="" --product-deck-bg="" --product-deck-soft-line="" --product-deck-ink=""
Same button inside the Free Play HUD:                --product-deck-accent="oklch(82% .17 214)", border 1px solid, translucent background
```

Screenshots: `$TMPDIR/p11/E/shots/E-hudnav-Progress-pair.png` (SHA-256 prefix `4c0f8eaa586de88d`, unfocused above, focused below: the focused word sits 1 px higher and nothing else differs), `E-hudnav-Settings-pair.png` (`ba80a53c9d2b05c9`).

### Artifacts

- `src/renderer/styles.css:1916-1950`: `.immersive-hud-nav-btn` takes its border, background, and colour from `--product-deck-*`; the `:hover, :focus-visible` rule sets `outline: none` and replaces the indicator with `border-color`, `background`, and `color` expressed with those variables, plus `transform: translateY(-1px)`; `.active` also uses them.
- `src/renderer/App.tsx:1806-1830`: the top bar reuses `.immersive-hud-nav-btn` outside any element that defines `--product-deck-*`.
- `styles.css:7825-7850` adds a Settings-specific variant with a faint glow, which is why Settings is "weak" and not "none".

## Root Cause

`outline: none` is paired with a replacement indicator built from custom properties that are only defined inside the immersive shell. In the application top bar they are empty, so the replacement declarations are invalid at computed-value time and only the transform survives. The same loss removes the `.active` styling for the current page.

## Recommended Remediation Boundary

Give the top bar its own scoped styling (define the variables on `.app-topbar` or add an explicit `:focus-visible` outline using `--color-accent`), and add a non-colour-only current-page marker. Owning modules: `styles.css` (top-bar and HUD nav rules), `App.tsx` top bar only if a marker element is needed.

## Required Regression Proof

- Deterministic unit/integration proof: jsdom cannot compute the variables; keep as runtime proof.
- Electron proof: reproduced headless with `scripts/audit/electron/keyboard-walk.mjs` (agent item A4, 2026-10-20); after the fix the same driver must show the corrected behaviour.
- Web proof: re-run `keyboard-focus-matrix.mjs PART=destinations` and `focus-hud-nav-visual.mjs`; expect a strong indicator on every nav stop and a pixel diff far above the 1 px shift.
- Data/recovery proof: none.
- Manual hardware/UI proof: none.
- Broader regression command: `npx vitest run`.

## Challenge Record

- Independent reproduction attempt: two driver variants (computed-style walk with transitions disabled; screenshots with transitions enabled and a 450 ms wait) gave the same result. Reproduced in headless Electron 30.5.1 on 2026-10-20 (agent item A4, [Electron runtime report](../phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)): the eight top-bar buttons on Progress gained no outline, box shadow or border on focus (a pixel diff shows only the 1 px label shift), and the current page is marked only by `aria-current`.
- Alternative explanations tested: transition-disabling hid a glow (ruled out: re-run with `ANIM=1`, same numbers); the indicator is on a parent element (ruled out by the screenshot); hover state masking (mouse never moved from the origin).
- Scope/severity changes: held at P2 (AA failure, widespread, not task-blocking).
- Deduplication decision: new; shares the surface but not the cause of PH-UI-001.
- Challenger conclusion and date: reproduced, Claude Code (acting), 2026-10-19.
- Consolidation challenge, 2026-10-20: every template section is present and the root cause names an owning boundary; severity stays P2. Accepted.
- Owner sitting run by the agent, 2026-10-20: reproduced in Edge 155 and Firefox 142 in [sitting 3](../phase-11-owner-sittings-2026-10-20.md#sitting-3-edge-and-firefox) item 3(a). On Guided Lessons, Theory and Progress, all 9 top-bar stops (Main through Back to Main Menu, including the active page) show no focus indicator; on Keyboard Setup, 8 stops show none.

## Resolution

- Accepted/rejected rationale: accepted at the Phase 11 consolidation on 2026-10-20; the reproduction, root cause and remediation boundary survived the challenge.
- Fix branch/commit/issue: `remediation/p11-s11-hud`, slice 11, implemented and independently reviewed 2026-11-02; merged to `main` in `1b95e9a`; `fixed`, not `verified`: Electron `keyboard-walk.mjs` (a) (lead), owner approval of the boxed top-bar look, and owner sitting 3 items 2 and 3 in Edge and Firefox are owed.
- What changed: `src/renderer/styles.css`. `.app-topbar` joins the "Shared Product Deck Surface" variables-only selector list, so the `--product-deck-*` values the `.immersive-hud-nav-btn` rules read now resolve in the top bar (before, they sat on `.app-shell-immersive` and a few screens only, so the focus and active declarations were invalid there and the `translateY(-1px)` was the whole indicator). A new rule `.app-frame .app-topbar .immersive-hud-nav-btn:focus-visible` draws a 3 px accent outline inside the button (`outline-offset: -3px`, `clip-path: none`, so the nav scroller and the corner clip cannot hide it) and outranks the Settings-screen nav overrides. `[aria-current="page"]` now adds a 2 px underline and a 4 px bottom border, so the current page differs from the rest by more than colour. No `App.tsx` change was needed; the immersive HUD nav is untouched. `scripts/audit/browser/keyboard-focus-matrix.mjs` gets `context: { bypassCSP: true }` because its `addStyleTag` call is refused by the app CSP (`style-src 'self'`).
- Tests: jsdom cannot compute CSS, so there is no unit test; the proof is the runtime drivers below. Before the fix (source identity `c1a1fbf`), `keyboard-focus-matrix.mjs PART=destinations` reported every top-bar stop as `NONE (weak: transform)` (9 stops on Guided Lessons, Theory and Progress, 8 on Keyboard Setup) and `focus-hud-nav-visual.mjs` reported `outline=none 0px ... transform=translateY(-1px) boxShadow=none` on Progress and Theory.
- Driver result (headless Chromium, web build of the branch, 2026-11-02): `keyboard-focus-matrix.mjs PART=destinations` reports `outline 3px solid` on every `immersive-hud-nav-btn` stop on Guided Lessons, Theory Trainer and Progress, and "none on 0" for each destination. `focus-hud-nav-visual.mjs` reports `outline=solid 3px ... transform=none clipPath=none` on Progress, Settings and Theory. Screenshots of the top bar on Play, Progress and Settings show the ring on the focused button and the underline on the current page. Electron `keyboard-walk.mjs` (a) not run; owed to the lead.
- Proof owed: agent-runnable, Electron `keyboard-walk.mjs` (a). Human-only: sitting 3 items 2 and 3 in Edge and Firefox, and a look at the new top-bar styling.
- Residual risk: defining the deck variables on `.app-topbar` also gives the top-bar buttons the boxed deck look (border, background, muted text) on every screen that shows the top bar, where before they were bare text. The brand block and the Back button change look with it. The immersive HUD nav keeps `outline: none` with its own border and shift cue; it was not part of this finding.
- Revisit trigger: reviewer verification, the Electron walk, or a complaint about the new top-bar look.
