# Phase 11 Lane E: UI, Accessibility, And Performance

- Lane owner: Claude Code (acting)
- Reviewer/challenger: Claude Code (acting); every candidate finding carries its own challenge record
- Baseline identity: `main` at `4466626` (later commits are audit documents only); web build from `dist/` as left by lane F
- Started: 2026-10-19
- Last updated: 2026-10-19
- Status: complete (web half); Electron, real zoom, Edge, Firefox, OS reduced-motion setting, and colour-vision proof are named below and owed to user sittings

## Scope

- Coverage rows: WF-026, RT-012, RT-009, RT-008, RT-006, RT-010; lead L-11-015; runtime re-verification of PH-UI-001 to PH-UI-004. Supplementary evidence for RT-003, RT-004, MOD-002, MOD-005, MOD-006, MOD-007.
- User journeys: main menu with its background video; Free Play and Soundboard idle and with keys held; keyboard-only walk of every main destination, Settings tabs, a library card, every dialog; Settings at six viewport sizes; results screen and theory quiz review.
- Runtimes: built web server (`dist/server/index.cjs`) driven by headless Chromium 141 (Playwright 1.56.1) on Linux, Node 24.15.0, isolated data directories under `$TMPDIR/p11/E/`.
- Data/privileged boundaries: no real data touched; no source, config, or shared audit file edited; nothing committed.
- Explicit exclusions: Electron (not launchable here), real browser zoom, Edge, Firefox, the OS reduced-motion setting, a truly hidden window, audio output, physical MIDI, mobile (out of scope per ADR 0001), a calibrated colour-vision review.

**Emulation note.** Headless Chromium has no browser zoom. Section "RT-006" shrinks the CSS viewport to what 125, 150, 175, and 200 percent of the default 1480x960 window would give and raises `deviceScaleFactor` to match. This is emulation. Layout depends on CSS pixels, so a collision seen here is expected to appear under real zoom, but "passes" here are not proof of real-zoom behaviour. Real zoom stays with sittings 1 and 3.

## Evidence Plan

| Surface | Oracle/invariant | Method/fixture | Runtime | Expected artifact |
|---|---|---|---|---|
| Main-menu video (WF-026, RT-012, L-11-015) | PH-UI-003: non-essential motion stops under `prefers-reduced-motion`; missing asset must not break the menu | `mainmenu-video-states.mjs`: `emulateMedia` before and after load, `page.route` abort and 404, visibility override, CDP network throttling, cold-cache byte count | web (Chromium) | Section "WF-026 / RT-012 / L-11-015" |
| Free Play and Soundboard canvases (RT-009) | PH-UI-003: no perpetual decorative loop under reduce, direct feedback kept | RAF counter init script, canvas pixel hashes, CSS animation census | web | Section "RT-009" |
| Keyboard-only (RT-008, PH-UI-001/004) | Visible focus indicator on every stop; modal contains focus, restores it, Escape closes only the top layer | computed-style walk plus pixel pairs; `Tab` and `Shift+Tab` containment; Escape sequences | web | Section "RT-008" |
| Zoom (RT-006, PH-UI-002) | 125 to 200 percent: controls visible and reachable | six emulated sizes, `elementFromPoint` at the centre of every control, pointer click on every Settings tab | web, emulated | Section "RT-006" |
| Colour-independent states (RT-010) | `PRODUCT.md` line 35 colour-blind-friendly states; `DESIGN.md` line 281 never colour alone | static read of four components, screenshots, palette arithmetic | web | Section "RT-010" |

Drivers (all in `scripts/audit/browser/`, all new in this lane; run on a data directory that has passed first-run setup, or let the driver skip the guide where it does):

| Driver | Rows / findings | What it proves | Port |
|---|---|---|---|
| `mainmenu-video-states.mjs` | WF-026, RT-012, L-11-015 | reduced motion before and after load, compact viewport, missing asset (abort and 404), visibility override, throttled cold-cache load, wire bytes | 3791 |
| `canvas-raf-reduced-motion.mjs` | RT-009, PH-UI-003 | RAF calls per second and canvas hash changes, idle and with keys, with and without reduce, live toggle | 3792 |
| `reduced-motion-redraw-probe.mjs` | RT-009 | when the Free Play canvas redraws after key taps under reduce | 3792 |
| `reduced-motion-css-animations.mjs` | RT-009 | running and infinite CSS animations per screen, with and without reduce | 3792 |
| `keyboard-focus-matrix.mjs` | RT-008, PH-UI-001/004, PH-UI-011/-8 | Tab walk with computed-style and pixel focus-indicator check; dialog containment; Escape; library card actions; env `PART`, `VP`, `ANIM` | 3793 |
| `focus-hud-nav-visual.mjs` | RT-008, PH-UI-011 | whole nav strip with and without focus on Progress, Settings, Theory | 3793 |
| `escape-semantics.mjs` | PH-UI-004, PH-UI-013 | Escape sequences on Soundboard, Free Play, Game, keyboard and mouse | 3793 |
| `latency-wizard-keyboard.mjs` | RT-008, PH-UI-010 | keyboard behaviour of the Latency Calibration dialog plus mouse control | 3793 |
| `hidden-focus-stops.mjs` | RT-008, PH-UI-014 | Tab stops inside closed `aria-hidden` HUD popouts per screen | 3793 |
| `freeplay-popout-pin-path.mjs` | RT-008, PH-UI-014 | whether the visual-mode popout can be reached and pinned by keyboard | 3793 |
| `confirm-dialog-focus-restore.mjs` | RT-008, PH-UI-017 | where focus lands after the Settings confirmation closes, with a `focus()` trace | 3793 |
| `zoom-emulation-hit-test.mjs` | RT-006, PH-UI-002, RT-003, RT-004 | Settings tab hit tests, overflow and reachability on 14 screens at six sizes | 3794 |
| `zoom-hud-overlap.mjs` | RT-006, PH-UI-012 | expanded HUD nav hit tests and overlaps at five sizes | 3794 |
| `zoom-library-sticky-sidebar.mjs` | RT-006 | why a library control read as "covered" (artefact check) | 3794 |
| `color-state-evidence.mjs` | RT-010, PH-UI-015/-7 | note-state screenshots in both palettes, results screen, quiz review | 3794 |
| `grade-badge-contrast.mjs` | RT-010, PH-UI-016 | computed grade badge colours | 3794 |
| `palette-cvd-distance.py` | RT-010, PH-UI-015 | simulated colour-vision distance between state colours (not a calibrated review) | none |

Raw output and screenshots stay under `$TMPDIR/p11/E/` and are not committed.

## Working Flows Confirmed

| Coverage row | Evidence | Conditions/limits | Disposition |
|---|---|---|---|
| WF-026 | Under reduce the `<video>` is absent and the still `mainmenu-neonbackground.webp` shows; with no preference the video is muted, looping, autoplaying, `readyState` 4, `currentTime` advancing 1.00 s per second | Chromium emulation, web only | video behaviour matches the intended design in `MainMenuScreen.tsx:498-558,741-757` |
| RT-009 | 0 RAF calls per second idle on Free Play and Soundboard under reduce (46 and 24 without), direct key feedback intact | emulated media, web | PH-UI-003 holds for both canvases |
| RT-008 / PH-UI-001 | 0 stops outside the dialog over 50 Tab and 4 Shift+Tab presses in the Free Play, Soundboard, and Game overlays and the Settings confirmations | Chromium web | holds; one new dialog fails (PH-UI-010) |
| RT-006 / PH-UI-002 | 30 of 30 Settings tab hit tests hit the tab and a pointer click selected it, at six sizes | emulation | holds under emulation |
| RT-003 / RT-004 | no horizontal overflow on 14 screens at 1180x780 and 1480x960 | web | supplementary to the existing "covered" status |

## Findings

Provisional IDs; the lead renumbers. Detailed files are under `findings/`.

| Finding | Why it belongs to this lane | Shared lanes |
|---|---|---|
| [PH-UI-010](findings/PH-UI-010.md) P2 | Latency Calibration dialog is not keyboard operable and Escape leaves Settings | Settings, audio |
| [PH-UI-011](findings/PH-UI-011.md) P2 | Top-bar navigation has no visible keyboard focus or current-page marker | all non-immersive screens |
| [PH-UI-012](findings/PH-UI-012.md) P2 | Immersive HUD collides at emulated 150 and 175 percent zoom | Free Play, Soundboard, Game |
| [PH-UI-013](findings/PH-UI-013.md) P3 | Soundboard Escape exits the screen after the menu was opened once | Soundboard, App routing |
| [PH-UI-014](findings/PH-UI-014.md) P3 | Closed HUD popouts stay in the Tab order as `aria-hidden` invisible controls | Free Play, Soundboard, Game |
| [PH-UI-015](findings/PH-UI-015.md) P3 | Colour-blind palette gives miss and pending-right-hand the same colour | Game canvas |
| [PH-UI-016](findings/PH-UI-016.md) P3 | Results grade letter fails text contrast in the default theme | Results |
| [PH-UI-017](findings/PH-UI-017.md) P3 | Settings confirmation drops focus to the body on close | Settings |

## WF-026 / RT-012 / L-11-015: Main-Menu Video

Intended behaviour from source: `MainMenuScreen.tsx` renders the `<video>` only when neither `(prefers-reduced-motion: reduce)` nor `(max-width: 780px)` matches, subscribes to both queries, and sets `aria-hidden`, `autoPlay`, `loop`, `muted`, `playsInline`, `preload="auto"`, `tabIndex={-1}`, with no poster and no `visibilitychange` handling. The still is the screen's CSS `background` (`image-set` of the `.webp` and `.png`, `main.tsx:13`). A repository search finds `visibilitychange` only in `computerKeyboardInputService.ts`.

Driver `mainmenu-video-states.mjs`, output lines quoted:

| Case | Observed |
|---|---|
| (a1) reduce set before load | `video:false`, `screenBg: image-set(url(.../mainmenu-neonbackground.webp)`, `runningCssAnimations:0`, `matchMedia(reduce)` true, no console output |
| (a2) no preference | `video:true paused:false readyState:4 muted:true loop:true autoplay:true`, `currentTime` 2.72 then 3.73 one second later, 63 infinite CSS animations running (`mainMenuScanLine`, `mainMenuNoteFall`, `mainMenuKeyIdle`, `mainMenuKeySpark`) |
| (a3) toggled to no-preference after load | video mounted and playing within 2.5 s (`currentTime` 2.31 then 3.31) |
| (a4) toggled back to reduce after load | video unmounted, 0 CSS animations; still remains |
| (a5) viewport 760 px wide | video omitted by the compact query (63 CSS animations still run); at 1280 px it returns and restarts (`currentTime` 1.39) |
| (b) asset aborted or 404 | `<video>` stays in the DOM, `paused:true readyState:0 networkState:3`, `error.code 4 "MEDIA_ELEMENT_ERROR: Format error"`; the `.webp` still shows (screenshot `E-video-B-missing-404.png`, SHA-256 prefix `16f303336c4f78a8`); console shows one `net::ERR_FAILED` (abort) or one `404` message; no user-visible message; all menu cards visible and Free Play opens (canvas present) |
| (c1) second page brought to front | first page still `visibilityState:"visible"`, video playing (`currentTime` 2.94 then 4.98) |
| (c2) `visibilityState` overridden to hidden plus `visibilitychange` | `paused:false`, `currentTime` 6.99 then 7.99: the app does not pause the video |
| (d) cold cache, latency 100 ms | 400 kbit/s: first paint 21.4 s, first contentful paint 22.4 s, menu and cards visible at 23.5 s, video `readyState` 3 at 29.1 s, still not playing at 75 s (4.9 of 15.1 s buffered); 1.5 Mbit/s: FCP 6.4 s, menu at 7.0 s, video playing at 31.4 s; 10 Mbit/s: FCP 1.5 s, menu 2.2 s, video playing 2.5 s. At every speed Free Play opened about 0.3 to 0.5 s after the click, before the video finished |
| (d) warm cache (assets are `immutable`) | 400 kbit/s: FCP 1.34 s, menu 1.44 s, video `readyState` 3 at 7.0 s |
| (d) wire bytes, cold, unthrottled | 1,113,486 bytes finished by menu render; JS 694,561, CSS 227,632 (neither compressed: no `content-encoding`), `.webp` 101,517, two fonts 57,384; the 7,387,097-byte `.webm` starts after mount and totals 8.5 MB within 6 s |

Reading:

- **Reduced motion.** The hidden-motion half of L-11-015 is rejected: the video and every menu CSS animation stop under reduce, both when set before load and when toggled after load, and the still image remains. PH-UI-003 is satisfied for the menu. The OS-level setting is the same media query; sitting 1 item 3 confirms it on a real desktop.
- **Missing asset.** The menu stays usable and keeps the `.webp` still; the failure is silent. Packaged Electron loads the video through `document.baseURI` under `file://`, which headless web cannot reproduce: the `.webm` is present in `out/renderer/assets/main-menu` and `scripts/assert-electron-assets.mjs` passed in the re-verification, but the missing-asset case in Electron is owed (proposed user-test item).
- **Hidden tab.** The app has no pause logic, and in this environment a window cannot be made truly hidden (a second page in front did not change `visibilityState`). Whether Chromium and Electron suspend a muted looping video in a minimised window on their own is unproven here. L-11-015 stays open on that half: next diagnostic is a person minimising the Electron window for 30 seconds while watching CPU and GPU use (proposed user-test item).
- **Bandwidth.** The menu appears before and without the video at every speed, and the still gives a complete picture meanwhile; the video only appears once the browser considers it playable through (`autoplay` waits for `readyState` 4), 31 s at 1.5 Mbit/s. On a 400 kbit/s link first paint (21 s) is driven by the 1.1 MB uncompressed script and stylesheet, not by the video. `preload="auto"` makes every web visitor download 7.4 MB regardless of connection. Observations, not findings: the web server sends no compression (behind the Cloudflare Tunnel in production Cloudflare normally compresses; confirm in lane A or G), and `dist/web/assets/main-menu` also holds three files no source references (`bck.jpg` 1.5 MB, a 108 KB `.jpeg`, `concert-stage.svg`; `git status` shows the first two as untracked, so a clean checkout would build without them while this working tree ships them) plus a 5.8 MB `.png` that is only the fallback in an `image-set` after the `.webp`. These ship in the Electron `out/renderer` too (lane D and G).

**L-11-015 disposition:** narrowed. Reduced-motion half rejected with evidence. Hidden-window half remains a lead with a named next diagnostic (sitting 1). No finding raised.

## RT-009: Reduced Motion On The Canvases

Driver `canvas-raf-reduced-motion.mjs` (RAF wrapped by an init script; a canvas hash is a 64x40 downsample hashed over its pixels), `reduced-motion-redraw-probe.mjs`, `reduced-motion-css-animations.mjs`:

```text
free-play no-preference: idle RAF/s 46; 8 of 8 idle canvas hashes distinct
free-play reduce:        idle RAF/s 0;  1 distinct hash in 8 idle samples; 19 distinct hashes while keys are tapped (direct feedback intact)
   after release: 4 distinct hashes in 6 samples, from one-shot redraws at about 4.2 s and 4.5 s when recent notes expire (probe: bursts at 6,151,270,396 ms during taps, then 4205 and 4469 ms)
   live toggle: reduce to no-preference RAF/s 43; back to reduce RAF/s 0; no-preference to reduce RAF/s 0 and 1 hash
soundboard no-preference: idle RAF/s 24; 8 of 8 hashes distinct
soundboard reduce:        idle RAF/s 0;  1 hash in 8 idle samples; 22 distinct hashes while tapping; after release 1 hash; live toggle 28.5 then 0
main menu (both):         RAF/s 0
CSS animations running (infinite): main menu 63 to 0, settings 2 to 0 (settingsTabScan, settingsIconTrace), library, learn, theory, progress, keyboard setup, free play, soundboard, game 0 in both
```

The Phase 9 proof gap (no RAF assertion for the two canvases) is closed at runtime for the web. The headless environment has no GPU and the driver's own pixel reads slow the loop, so RAF rates during tapping are not reported as performance numbers. PH-UI-003 holds. Source: `FreePlayCanvasScene.tsx:3027,3041` and `AnimalSoundboardCanvas.tsx:396,410` gate the next frame on `!reducedMotion` and redraw once per state change.

## RT-008: Keyboard Only, Visible Focus

Method: Tab from a blurred state through each screen; for each focused element compare the computed outline, box-shadow, and border against its blurred state (animations and transitions disabled for the comparison, then repeated with `ANIM=1`); screenshot focused and blurred clips for every stop without a strong indicator or with the browser default ring and compare pixels.

| Surface | Stops | Result |
|---|---|---|
| Main menu | 9 controls (Start Song, 4 primary cards, 4 secondary cards) | all 9: 3 px solid outline plus glow, accent colour per card |
| Settings tab row | 5 tabs | each 3 px outline; Tab reaches the row; ArrowRight cycles Audio, Visual, Gameplay, Input, Practice, Audio; Home returns to Audio |
| Settings panel (Audio) | 19 | 17 strong, the current-page nav button none, 8 top-bar nav buttons only a faint 0.14-alpha glow |
| Library | 52 | 42 strong (3 px outline or default ring); the 9 top-bar nav buttons have no indicator |
| Library card actions | Play, Learn, More, then Edit Metadata, Delete Song | all strong; More expands the card with Enter |
| Guided Lessons / Theory / Progress / Keyboard Setup | 22 / 13 / 11 / 14 | all page controls strong or default ring; all 8 or 9 top-bar nav buttons: none (PH-UI-011) |
| Confirmation dialogs (Clear Learning Progress, Delete User Data) | 2 buttons each | 3 px outline; focus starts on Cancel; 0 of 14 stops outside the dialog |
| Free Play, Soundboard, Game overlays | 24, 60, 22 | all strong or default ring; 0 of 54 stops outside the dialog |
| HUD bars (Free Play, Soundboard, Game) | 14 each | nav buttons show a border change; popout controls are invisible (PH-UI-014) |

The browser default ring (`outline: auto`, computed colour `rgb(16,16,16)`) is a two-tone ring that is clearly visible in a pixel comparison (3.5 to 4.4 percent of the clip changes, maximum channel delta 209 to 255) and screenshot `E-focus-auto-ring-pair` (checked by eye, not retained). It is used on Free Play mode cards, Soundboard clip cards, lesson tier headers, and lesson cards.

### PH-UI-001 to PH-UI-004 re-verification in Chromium

| Finding | Runtime result | Conclusion |
|---|---|---|
| PH-UI-001 | Free Play overlay: opens on Escape with focus on Resume; 50 Tab and 4 Shift+Tab, 0 stops outside the dialog; Escape closes and focus returns to the Menu button. Soundboard overlay (60 stops) and Game overlay (22 stops) the same. Settings confirmations: 0 of 14 outside | holds for the four named dialogs; the Latency Calibration dialog fails the same oracle (PH-UI-010) |
| PH-UI-002 | six sizes, 30 of 30 tab hit tests; tab row client height 46 to 62 px against tab heights 46 to 58 px (failing state was 4 px against 46 px) | holds under emulation; real zoom owed (sittings 1 and 3) |
| PH-UI-003 | canvases 0 RAF/s under reduce, video and CSS animations 0 | holds |
| PH-UI-004 | Settings confirmations: Escape closes the dialog and Settings stays; Escape with no modal on Settings returns to the Main Menu (intended); Free Play and Game: Escape toggles the overlay on every press; Soundboard: toggles twice then exits (PH-UI-013); Latency dialog: Escape closes it and leaves Settings (PH-UI-010) | holds for the Phase 9 scope; two adjacent defects found |

Interaction with the known PH-MUS-005: every overlay close returns focus to the Menu button, so computer-keyboard notes stay ignored until focus leaves it. Noted, not re-raised.

### Other keyboard observations (no finding)

- Library "Delete Song" (Edit Metadata panel) removes the song and, through `ON DELETE CASCADE`, its stats and results on one Enter, with no confirmation or undo (observed in the keyboard walk: songs 2 to 1, status "Deleted 1 song from the library.", no dialog; the Settings resets do use a confirmation dialog). Lane F raised this independently as provisional PH-UI-006 (P2); it is not repeated here. The keyboard walk adds only that the action is reachable and activates from the keyboard with the same result.
- Game uses `window.confirm` for two structural changes (`GameScreen.tsx:827,1021`); native dialogs were not inspected.
- Results screen: an "Achievement unlocked" toast with a Dismiss button is drawn over the Progress Check card in a 1480x960 viewport.

## RT-006: Zoom, Emulated

Emulation as described above. Sizes: 1180x780 at 100 percent; 1184x768 at 125; 987x640 at 150; 846x549 at 175; 740x480 at 200; 1480x960 at 100 (control). Driver `zoom-emulation-hit-test.mjs` (14 screens per size) and `zoom-hud-overlap.mjs`.

| Size | Tablist client height / tab height | Settings tab hit and selected (5 tabs) | Horizontal overflow, 14 screens | Controls failing hit test |
|---|---|---|---|---|
| 1180x780 | 50 / 46 | 5 of 5 | 0 px everywhere | 1: "Show play HUD" under the open game overlay (expected, the overlay covers it) |
| 1184x768 @1.25 | 46 / 46 | 5 of 5 | 0 | same 1 |
| 987x640 @1.5 | 50 / 46 | 5 of 5 | 0 | library preset input (artefact, below); Free Play nav "Settings" covered by the instrument toggle (PH-UI-012) |
| 846x549 @1.75 | 50 / 46 | 5 of 5 | 0 | library preset input and Add (artefact); "Settings" covered on Free Play, Soundboard, Game (PH-UI-012) |
| 740x480 @2 | 62 / 58 | 5 of 5 | 0 | same 1 as 100 percent |
| 1480x960 | 46 / 46 | 5 of 5 | 0 | same 1 |

- **Library "covered by sidebar" is an artefact, rejected.** `scrollIntoView({block:'center'})` parks the preset input behind the sticky library sidebar (318 px tall: 50 percent of a 640 px viewport, 58 percent of 549 px). A real click trial on the same input succeeds at 987x640, 846x549, and 1180x780, and a Tab walk of the library at 987x640 (52 stops) and 740x480 (43 stops) finds 0 stops covered or off screen. The sidebar's size at 150 and 175 percent is recorded as an observation only.
- **HUD collision at 150 and 175 percent is real under emulation** and is PH-UI-012. It does not occur at 125 or 200 percent.
- Main menu, Settings (all five tab panels), Library, Guided Lessons, Theory, Progress, Free Play, Soundboard, and Game HUD had no failing control and no horizontal overflow at any size. The main menu at 740 px drops the video (compact query) and kept 9 reachable controls.
- RT-003 and RT-004 get supplementary evidence: the 1180x780 and 1480x960 rows above.

## RT-010: Colour-Independent States

Static review plus screenshots (`color-state-evidence.mjs`, `palette-cvd-distance.py`):

| State | How it is conveyed | Colour alone? |
|---|---|---|
| Hit / miss on the falling-notes canvas | note body fill (`noteFill`), plus a 700 ms text popup PERFECT!, GOOD, OK, MISS at the hit line, plus particles (colour) | body fill: colour only after the popup fades; popup and HUD counters: text |
| Early / late | not modelled: `NoteJudgement` is `pending, perfect, good, ok, miss` | n/a, nothing displayed |
| Hand identity (left, right) | note and key cue colour only (`cue-left`, `cue-right`); optional finger digit and label letters are not hand-specific | colour only |
| Pressed key | key highlight | colour (plus the sound) |
| Results | stat cards titled PERFECT, GOOD, OK, MISS with counts; grade letter; stars; accuracy percent | text; colour is secondary |
| Theory quiz review | "Correct" or "Correct answer: X" per row; interval trainer "Correct." or "Incorrect. Answer: X."; scale drill "Correct: C" or "Incorrect" | text; the red or green row tint is secondary |
| Colour-blind mode | alternate palette (Tol blue, light blue, pink-red) | still colour; collides (PH-UI-015) |

Simulated colour-vision distance (Machado matrices at severity 1.0, CIE76): default palette pairs below 20 are good against miss (14.9, deuteranopia), good against pending-right (17.5, deuteranopia), good against ok (16.7, tritanopia), miss against pending-right (16.4, tritanopia); in colour-blind mode good equals pending-left and miss equals pending-right exactly (0.0). This is a numeric screen, not a calibrated review.

Because hit and miss body colours and hand identity are carried by colour alone once the popup fades, a calibrated review by a person is proposed (user-test item). Screenshots: `E-color-montage-cb-true.png` (SHA-256 prefix `1a3f129c6dd6d346`), `E-color-montage-cb-false.png` (`dba05ebca0ea85a2`), `E-color-results-cb-false.png` (`a1132a1328ace82c`), `E-color-quiz-review.png` (`045ff3b8336977da`). A separate contrast problem on the grade letter is PH-UI-016.

## Evidence Gaps

| Coverage row | Missing proof | Why blocked | Owner | Next action |
|---|---|---|---|---|
| WF-026, RT-012 | missing-asset behaviour in the packaged Electron build; hidden or minimised window behaviour; OS reduced-motion setting | Electron cannot launch here; headless Chromium cannot be hidden | owner, sitting 1 | proposed user-test rows 2 and 1 |
| RT-006 | real browser and Electron zoom, including the HUD collision | no real zoom in headless Chromium | owner, sittings 1 and 3 | proposed row 1 |
| RT-008 | Electron, Edge, and Firefox keyboard walk | Electron and the two browsers unavailable | owner, sittings 1 and 3 | proposed row 3 |
| RT-010 | colour-vision review | needs a person | owner or a volunteer | proposed row 4 |

## Runtime And Failure Coverage

- Electron: not run. Static facts only: the `.webm` and the unreferenced extras are present in `out/renderer`.
- Web: Chromium 141 headless, all rows above.
- Loading/empty/disabled: throttled load and cold cache covered for the menu; empty library covered by the first menu screenshots.
- Error/retry/recovery: video missing handled silently with the still; no retry (none needed).
- Destructive/interruption: Settings confirmations opened and cancelled only; nothing confirmed. The library song delete was run once on a fixture in the isolated profile.
- Accessibility or hardware proof: keyboard and contrast evidence in Chromium; screen readers, colour-vision review, real zoom, audio, MIDI not run.

## Challenge Summary

- Claims disproved or narrowed: L-11-015 reduced-motion half (video stops); "library controls covered at 150 and 175 percent" (artefact of `scrollIntoView`); "HUD popout controls are unreachable by keyboard" narrowed to "reachable only by pressing Enter twice on the toggle"; initial "no-focus-indicator on HUD nav everywhere" narrowed to the top bar only (the immersive HUD bars show a border change).
- Duplicates merged: none; PH-UI-010 and PH-UI-017 share an oracle with PH-UI-001 but not a root cause.
- Severity changes: PH-UI-014 held at P3 because the Menu overlay carries the same controls; PH-UI-010 held at P2 though a reviewer could argue P3.
- Environmental failures separated: the first draft of the hit-test sweep reported library "covered" controls; a driver artefact. Early drivers also failed once for a missing first-run skip; fixed in the drivers. The "hidden tab" case is an environment limit, not a result.

## Lane Exit Check

- [x] Every assigned coverage row has an owner.
- [x] Every assigned row has evidence and disposition, or an explicit gap.
- [x] All findings link to detailed reports and coverage rows.
- [x] P0/P1 leads were independently challenged (none raised).
- [x] Positive/working behavior is recorded.
- [x] Manual and hardware gaps are explicit.
- [ ] Coverage summary counts were updated (lead merges; see Proposed Matrix Updates).

## Sign-Off

- Lane owner/date: Claude Code (acting), 2026-10-19
- Challenger/date: Claude Code (acting), 2026-10-19
- Audit lead/date: pending merge

## Proposed Matrix Updates

- WF-026: `blocked`. Evidence "P11-E, WF-026 / RT-012 / L-11-015". Web proves reduced motion (before and after load), missing-asset fallback to the still, bandwidth behaviour, and no app-level hidden-tab pause; Electron missing-asset and hidden-window proof are owed (sitting 1, new row 2).
- RT-012: `blocked`. Evidence "P11-E, WF-026 / RT-012 / L-11-015". Web reduced motion and throttled bandwidth covered with numbers; packaged-Electron missing asset and OS setting owed (sitting 1 rows 3 and the new row 2).
- RT-009: `covered`. Evidence "P11-E, RT-009". Free Play and Soundboard schedule 0 RAF/s under reduce (46 and 24 without), live toggle works, 63 menu and 2 Settings CSS animations drop to 0; OS setting is confirmation only (sitting 1 item 3).
- RT-008: `blocked`. Evidence "P11-E, RT-008". Chromium keyboard matrix done (PH-UI-001 and 004 re-verified, 4 new findings: PH-UI-010, PH-UI-011, PH-UI-014, PH-UI-017, plus PH-UI-013); Electron, Edge, and Firefox keyboard walks owed (sittings 1 and 3, new row 3).
- RT-006: `blocked`. Evidence "P11-E, RT-006". Emulation only: PH-UI-002 holds at six sizes; PH-UI-012 found at 150 and 175 percent; real zoom owed (sittings 1 and 3, new row 1).
- RT-010: `blocked`. Evidence "P11-E, RT-010". Static review finds hit, miss, and hand identity carried by colour once the popup fades, and colour-blind mode collisions (PH-UI-015); the calibrated review needs a person (new row 4).
- RT-003: `covered` (unchanged). Add evidence "P11-E, RT-006": no overflow on 14 screens at 1180x780.
- RT-004: `covered` (unchanged). Add evidence "P11-E, RT-006": same at 1480x960.
- MOD-002: `covered` (unchanged). Add PH-UI-013 (listener order and missing `soundboard` exclusion in `App.tsx`).
- MOD-005: `covered` (unchanged). Add PH-UI-010 and PH-UI-017 (Latency dialog and confirmation focus restore).
- MOD-006: `covered` (unchanged). Add runtime RAF evidence for PH-UI-003.
- MOD-007: `covered` (unchanged). Add PH-UI-011, PH-UI-012, PH-UI-016 (CSS owners).
- WF-018: add note "Latency Calibration dialog keyboard defects (PH-UI-010); Settings confirmation focus restore (PH-UI-017)".
- WF-015, WF-016: add note "Keyboard walk and Escape semantics measured (PH-UI-013, PH-UI-014); recording, export, and audio remain with lane F and sitting 1".
- Ledger note: PH-UI-001, 002, 003, 004 re-verified in Chromium web (table above); status stays `fixed`; runtime proof in Electron and real zoom still owed.

## Proposed User-Test Items

Ready rows for `phase-11-user-tests.md`. Items 1 to 3 extend sitting 1; item 4 needs a person with colour-vision deficiency or a colleague with a calibrated display.

| # | Sitting | Coverage row / finding | Steps | Expected |
|---|---|---|---|---|
| 1 | 1 (extends item 1) | RT-006, PH-UI-012 | In the desktop app and in Chrome at the default 1480x960 window, set zoom to 150 percent then 175 percent. Open Free Play, press Tab once to expand the top HUD, and click the SETTINGS and PROGRESS buttons. Repeat on the Soundboard and in a song. | HUD text does not overlap; Settings and Progress open when clicked. Today (emulated): the instrument button sits over Settings and the nav strip overlaps the status cards at 150 and 175 percent, not at 125 or 200 |
| 2 | 1 (extends item 3) | WF-026, RT-012, L-11-015 | Electron only: (a) open the main menu, minimise the window for 30 seconds, watch CPU and GPU use in the system monitor, restore. (b) Copy `dist/linux-unpacked`, extract `resources/app.asar` with `npx @electron/asar extract`, delete `out/renderer/assets/main-menu/mainmenu-neonbackground.webm`, repack, launch the copy. | (a) use drops while minimised and the video resumes on restore; record the numbers. (b) the menu appears with the still image and all cards work; note any visible error |
| 3 | 1 and 3 (extends item 2) | RT-008, PH-UI-010, PH-UI-011, PH-UI-013, PH-UI-014, PH-UI-017 | Keyboard only in Electron, then Edge and Firefox: (a) Progress screen, Tab through the top bar. (b) Settings, Audio, Calibrate, press Escape. (c) Soundboard: press Escape three times. (d) Free Play: Tab through the whole page counting stops you cannot see. (e) Settings, Practice, open Clear Learning Progress, press Escape, press Tab. | Today (web): (a) no visible focus on the top bar; (b) the dialog closes and Settings is left; (c) third press leaves to the Main Menu; (d) most stops invisible; (e) focus restarts from the page top. Record which hold in each runtime |
| 4 | new, any display | RT-010, PH-UI-015, PH-UI-016 | Person with a colour-vision deficiency plays `short-4-notes` (or any short song) in Play mode, once with Settings, Visual, Colour-blind mode off and once on, and reads the results screen. Say whether they can tell a missed note from an upcoming right-hand note and a good hit from an upcoming left-hand note without the MISS popup, and whether the grade letter is legible. | Today: in colour-blind mode a missed note and a pending right-hand note are the same pink-red; the F grade letter is barely visible against its badge |

## Candidate Findings

| ID | Severity | Summary |
|---|---|---|
| PH-UI-010 | P2 | Latency Calibration dialog: no focus move or trap, Escape also leaves Settings, Enter and Space on the close button start the measurement, Apply and Try Again cannot be activated by keyboard |
| PH-UI-011 | P2 | Application top-bar navigation has no visible keyboard focus (1 px lift only) or current-page marker because `--product-deck-*` variables are undefined there |
| PH-UI-012 | P2 | Immersive HUD nav overlaps the status cards and the instrument toggle at emulated 150 and 175 percent zoom; the Settings button is covered (real zoom owed) |
| PH-UI-013 | P3 | Soundboard: after the session menu has been opened and closed once, Escape leaves the screen (listener re-registration order) |
| PH-UI-014 | P3 | Closed HUD popouts stay focusable under `aria-hidden` and `opacity: 0`: 71 of 83 Tab stops on Free Play, 52 of 64 on Soundboard, 42 of 53 on Game are invisible |
| PH-UI-015 | P3 | Colour-blind palette paints missed notes the same as pending right-hand notes and good hits the same as pending left-hand notes |
| PH-UI-016 | P3 | Results grade letter contrast 1.7 to 3.0:1 in the default dark theme |
| PH-UI-017 | P3 | Settings confirmation dialog leaves focus on the page body after Cancel or Escape |

## Files Created

- This report: `docs/audit/reports/phase-11-lane-e-ui-accessibility-2026-10-19.md`
- Candidate findings: `docs/audit/reports/findings/PH-UI-010.md` to `PH-UI-017.md`
- Drivers in `scripts/audit/browser/`: `mainmenu-video-states.mjs`, `canvas-raf-reduced-motion.mjs`, `reduced-motion-redraw-probe.mjs`, `reduced-motion-css-animations.mjs`, `keyboard-focus-matrix.mjs`, `focus-hud-nav-visual.mjs`, `escape-semantics.mjs`, `latency-wizard-keyboard.mjs`, `hidden-focus-stops.mjs`, `freeplay-popout-pin-path.mjs`, `confirm-dialog-focus-restore.mjs`, `zoom-emulation-hit-test.mjs`, `zoom-hud-overlap.mjs`, `zoom-library-sticky-sidebar.mjs`, `color-state-evidence.mjs`, `grade-badge-contrast.mjs`, `palette-cvd-distance.py`
- Not created or edited: `coverage-matrix.md`, `findings-ledger.md`, the plan, `phase-11-user-tests.md`, `scripts/audit/browser/README.md`, `harness.mjs` (the lead merges the proposals above; the README needs the 17 rows from the driver table).
