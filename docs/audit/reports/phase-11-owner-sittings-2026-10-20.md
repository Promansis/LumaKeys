# Phase 11: Owner Sittings Run By The Agent

- Status: done for everything this host can run. Sittings 0, 1, 3 and 4 ran; sitting 2
  needs a Windows machine. What still needs the owner is listed in
  [What Still Needs The Owner](#what-still-needs-the-owner).
- Source identity: `main` at `4466626` plus audit-only commits (HEAD `c357a97` when the run
  started). No product source changed after the baseline.
- New findings: [PH-MUS-014](findings/PH-MUS-014.md) (P1),
  [PH-MUS-015](findings/PH-MUS-015.md) (P3), [PH-MUS-016](findings/PH-MUS-016.md) (P3) and
  [PH-UI-019](findings/PH-UI-019.md) (P3). [PH-OPS-002](findings/PH-OPS-002.md) is accepted
  and raised to P0.
- Runner: Claude Code (acting), with parallel agent sessions for sittings 1, 3 and 4
- Date: 2026-10-20
- Batch: [phase-11-user-tests.md](phase-11-user-tests.md)

## Why This Run Exists

On 2026-10-20 the owner asked the agent to "do the sitting items". The sittings had been
staged for the owner because the audit sandbox has no Docker socket, no display, no audio
device and no MIDI device. Outside the sandbox this host has Docker, `Xvfb` with the
`xfwm4` window manager, and a PipeWire audio server whose null sinks record audio without
playing it. The agent used them to run each item as closely as the host allows, and this
report says for each item how close that is and what still needs the owner.

Safety for the whole run:

- No item touched the running `lumakeys` container, its `lumakeys-lumakeys` image, or
  `/media/storage/lumakeys`, and no item ran `docker compose`.
- No item touched a real profile. Every container, server, browser and Electron profile
  used a throwaway directory under `$TMPDIR`.
- No item modified the repository's `node_modules`, `dist/` or `out/`.

## Sitting 0: Docker Image And Live Host

Image: `docker build -t lumakeys-audit:p11 .` from the working tree. The Dockerfile has not
changed since the baseline. The separate tag leaves the running container's image as it
is. Every container ran with `--user $(id -u):$(id -g)`, a `mktemp` data directory and a
port bound to `127.0.0.1`.

| # | Rows | Result |
|---|---|---|
| 1 | OP-017, WF-025, MOD-012, BASE-11-001 | Pass. `src/server/museScore.integration.test.ts` in the image: 1 test passed (3.4 s) |
| 2 | PH-SEC-004, WF-023 | Pass. Of two parallel uploads of the same score, `score2` imported (22 notes, 8.5 s, 120 BPM) and `score1` got "Another MuseScore score is being converted. Please try again in a moment." After `docker restart`, `getAllSongs` lists `score2`, and `GET /api/midi/<id>` returns its 446-byte MIDI from `midi-files/` |
| 3 | WF-004, WF-008, L-11-017, PH-MUS-002 | Pass. Both hand-built `.mscz` files converted directly, with no `.mscx` fallback. The direct and served sections each end `2 file(s), 0 failed check(s)`. `meter-tempo` bars are at 0–2, 2–4, 4–5.5 and 5.5–8.497917 s, matching the SMF reference and the oracle |
| 4 | OP-014, PH-OPS-002 | **Fails.** See below |

### Item 4: the live hostname

The README and `/etc/cloudflared/config.yml` both give `piano.a173d20e27.com`, routed to
`http://localhost:3001`. `/etc/hosts` has no entry for it. At 2026-10-20 03:12 UTC the
agent sent unauthenticated requests from this host and kept only the status codes:

| Request | Status | Expected |
|---|---|---|
| `GET /` | 200, no redirect | redirect to the Cloudflare login |
| `POST /api/bridge/getAllSongs` | 200 | 302 or 403 |
| `GET /api/access` | 200 | 302 or 403 |
| `POST /api/midi/upload`, no file | 500 from the app | 302 or 403 |
| `POST /api/library/import`, no file | 400 from the app | 302 or 403 |

The agent's permission layer refused a follow-up request for response headers only. No
further requests went to the live host, and nothing in production was changed.

This cannot rule out an Access policy that lets this host's own public address through.
The owner's private-window check from this machine would have had the same limit. To
settle it, open the site from another network, for example a phone on mobile data. The
consequence is recorded in [PH-OPS-002](findings/PH-OPS-002.md): it is accepted at P0, and
under owner decision 4's gate slice 2 moves to the front of wave 1.

Owner follow-up (user tests A1), 2026-10-20: from a phone on mobile data the app opened
with no Cloudflare login, so the exposure is not limited to this host's address. The
owner said the site looks like an old version. Read-only image metadata shows the image
was built 13 seconds after commit `4466626`, and only audit docs have changed since; see
[PH-OPS-002](findings/PH-OPS-002.md) step 5.

### Added: crafted archives (OP-017)

The lane A gap for OP-017 was a crafted archive run in the image. Sitting 0 had no item for
it. [`scripts/audit/musescore-crafted-archive-check.sh`](../../../scripts/audit/musescore-crafted-archive-check.sh)
now runs it against any image tag; output `$TMPDIR/p11/S0/crafted-check.out`.

| Archive | Result |
|---|---|
| `traversal.mscz`: the valid score plus `../../../../tmp/lk-escape-1.txt`, `/tmp/lk-escape-2.txt`, `../lk-escape-3.txt` and a symlink entry to `/data` | Converted from the valid score. No `lk-escape` file anywhere on the container's filesystem, no symlink, temp directory removed |
| `bomb.mscz`: the score padded to about 300 MB (307 kB zipped) | "Unable to convert this MuseScore score…" after 0.45 s; temp directory removed |
| `long60000.mscz`: a valid score with 180,008 bars | MuseScore reached 1.56 GB resident after 3 s, then "Unable to convert…" after 4.0 s, which fits the 2 GiB address-space limit. While it converted, a second upload got the busy message in 2 ms and `getAllSongs` answered 200 in 2 ms. Afterwards no MuseScore process was left, the temp directory was gone, and a normal upload converted |

Not reached:

- the 45 s timeout and the 30 s CPU limit, because the memory limit stops the oversized
  score first
- the 10 MB output limit

Observation (no finding): MuseScore's Qt layer writes two zero-byte, fixed-name semaphore
files (`/tmp/qipc_systemsem_musescore…`) outside its temp directory. They are reused, not
accumulated: the same two files were there after four conversions.

## Sitting 1: Linux Display And Speakers

The sitting was split into two runs:

- **Audio items 5 to 7:** these used the unpacked Electron build in `out/` with an
  offscreen window, and the web build in Chromium. The output was recorded from a
  PulseAudio null sink with `parec`, so nothing played on the host's speakers.
- **Visual items 1 to 4 and 8:** these used a packaged Linux app built from HEAD in a
  throwaway copy (`electron-vite build`, then `electron-builder --linux dir`), plus real
  Chrome 151. Both ran in real windows on `Xvfb` with the `xfwm4` window manager. Every
  key press, click, minimise and restore was a real X event sent through XTEST.

Every run used a fresh HOME and profile under `$TMPDIR`. The session bus pointed at a
dead path, so nothing read the owner's desktop settings.

Harness note: while Playwright is attached, it forces `prefers-reduced-motion:
no-preference` and keeps a minimised Electron window `visible`. Item 3 was measured with
that emulation turned off, and item 4 with raw CDP and no Playwright. Earlier runs that hit
these traps are not cited.

| # | Rows | Result |
|---|---|---|
| 1 | WF-026, RT-012, BR-067, PH-PAR-001 | Pass in the packaged app. (a) The main-menu video plays: `currentTime` went from 1.99 to 7.32 s in 5 s, and 23.75 % of pixels changed. (b) "Flute Enhanced Pack ready." appeared, with 10 pack files in the profile. (c) The capstone is locked on a fresh profile, so the agent marked the six Novice lessons complete through `appBridge.setSetting` and reloaded. Ode to Joy then started on a real Space; 8 real presses drew 10 distinct canvas frames, and the score reached 200. Escape opens the pause overlay, whose way out is "Back to Learn Hub", not "Main Menu" |
| 2 | RT-006, PH-UI-002, PH-UI-012 | Every Settings tab opens at every zoom level, so the PH-UI-002 fix holds. Chrome reached exactly 125, 150, 175 and 200 % with real Ctrl+=. The packaged app zooms only with Ctrl+Shift+=, in steps of 110, 120, 131, 144, 158, 173, 189 and 207 %. PH-UI-012 reproduces in the HUD. In Chrome, SETTINGS is covered at 150 % (by the Electric Piano control) and at 175 % ("Show instrument controls"). In the packaged app it is covered at 158 and 173 %, and at 189 % PROGRESS is covered too. New: Ctrl+0 does not reset the zoom ([PH-UI-019](findings/PH-UI-019.md)) |
| 3 | RT-009, RT-012, WF-026, PH-UI-003 | Pass through the OS path on X11, tested two ways: `gtk-enable-animations=false` in GTK's `settings.ini`, and separately an XSETTINGS daemon publishing `Gtk/EnableAnimations=0` (what GNOME's `enable-animations` becomes on X11). With either, Chrome and the packaged app report `reduce`. There is no main-menu video, 0 % of pixels change, and Free Play idles at 0 frames per second; holding four keys still draws (8 to 9 distinct frames). With no setting, the video plays and Free Play idles at 30 to 40 frames per second. A live change does not reach a page that is already open: Chrome needs a new tab (a reload keeps the old value), and the desktop app needs a restart |
| 4 | WF-026, RT-012, L-11-015 | Pass in the packaged app, measured with raw CDP. Visible, the app used 183.7 % of one core; this is inflated because `Xvfb` renders in software. Minimised by the window manager, it used 0.2 %, with `visibilityState` hidden and the video paused. When restored, the video resumes |
| 5 | WF-015, WF-016, WF-013, WF-009 | Pass. (a) Free Play: C3, D3 and E3 sound in both runtimes. (b) The Soundboard plays with no overlap, and a one-shot lock drops presses that land while a sound plays. It opens on Classic, not Animals. PH-MUS-005 reproduces: after Resume, focus stays on the menu button. (c) Interval Trainer, desktop: each of 8 questions played two distinct notes at the stated interval. The driver always picked the first answer, so most answers were wrong, and the app judged every answer correctly. (d) WAV and MP3 backing tracks both play (a 440 Hz test tone) |
| 6 | WF-019, PH-PAR-006 | Desktop: the pack sounds different from the built-in sampler. Web: the pack sounds identical to the built-in one, and the console shows "Failed to load custom sampler" with `undefinedblob:` URLs, so PH-PAR-006 reproduces. New: the desktop pack cuts notes off 0.1 s after release ([PH-MUS-015](findings/PH-MUS-015.md)) |
| 7 | PH-MUS-006 | Reproduces. At 50 % tempo the metronome clicks every 2.00 s against a 1.00 s beat. At 100 % it is on the beat |
| 8 | PH-PAR-007 | Reproduces. In a fresh Chrome profile launched without Playwright, "Loading services..." showed at 0, 5, 10, 15, 20, 25 and 30 s while the MIDI prompt waited. A real click on Block started the app 44 ms later |
| 9 | PH-DATA-004 | Not run: it needs the owner's own Chrome profile |
| 10 | RT-010, PH-UI-015, PH-UI-016 | Not run: it needs a person's colour vision |

Found while running items 5 to 7: on a fresh profile the app plays about 60 dB too quietly,
while Settings shows the default volumes ([PH-MUS-014](findings/PH-MUS-014.md), P1).

| Runtime | Fresh profile (peak) | After each slider is moved once (peak) |
|---|---|---|
| Desktop | −69 dBFS | −10.5 dBFS |
| Web | −74 dBFS | −16 dBFS |

Items 5 to 7 were judged from the runs after the sliders were saved. The analysis script
named the second and third notes of the web Free Play run after the nudge as A1. The
spectrum's strongest peaks for the three notes are 130.9, 146.9 and 164.7 Hz (C3, D3, E3),
so that label was a pitch-detector error, not a wrong note.

### Added: the packaged app with its menu video missing (WF-026, RT-012)

Lane E proposed this step, but it never reached the batch. It needs no person. The agent
copied the packaged build and removed `out/renderer/assets/main-menu/mainmenu-neonbackground.webm`
(7.4 MB) from `app.asar` with `@electron/asar` 3.4.1. It then repacked the archive, keeping
`better-sqlite3` unpacked, and launched the copy twice with fresh profiles, as in item 1.
The original build was not changed.

- The video element stays in the page with `error` 4 ("Format error"), `readyState` 0 and
  `networkState` 3. This was the same at 0.5, 2 and 5 s.
- The still background image paints behind it. Swapping it for the plain page colour
  changes 38.4 % of the content pixels; restoring it leaves 4.1 %, which is the menu's
  own CSS animation.
- All 8 menu cards appear by 2 s. A real click on each reached its screen, and each
  returned to the menu.
- Nothing is shown to the user. Each time the menu opens, the console logs one
  `net::ERR_FILE_NOT_FOUND` for the file. There are no page errors.

This matches the source: `MainMenuScreen.tsx` sets no `poster` and no `onError`, and the
still image is the screen's own CSS background. It also matches lane E's web result. Output:
`$TMPDIR/p11/S1V/missing-asset-{1,2}.out`; screenshots: `$TMPDIR/p11/S1V/missing-asset-ev/`.

## Sitting 2: Windows

Not run. It needs a Windows machine and the owner's Windows profile.

## Sitting 3: Edge And Firefox

The browsers were Edge 155 (unpacked from Microsoft's Linux package) and Playwright's
Firefox 142 build, both on `Xvfb`. They ran against the web server with a throwaway data
directory.

| # | Rows | Result |
|---|---|---|
| 1 | RT-002 | Pass in both: the upload imports and the game canvas animates |
| 2 | RT-006, PH-UI-002, PH-UI-012 | Every Settings tab opens at 150 and 200 % in Edge and Firefox with emulated zoom, and in Firefox with its own zoom (`layout.css.devPixelsPerPx`). The Library preset-name input and the "Show play HUD" tab also work at 150 %. PH-UI-012 reproduces at 150 %: a real click on SETTINGS in Free Play does not open it. Edge's own zoom was not run |
| 3 | RT-008, PH-UI-010, PH-UI-011, PH-UI-013, PH-UI-014, PH-UI-017 | (a) to (d) hold in both browsers. (a) The Progress top bar shows no visible focus. (b) Escape in Calibrate also leaves Settings. (c) The third Escape in the Soundboard leaves to the main menu. (d) Most Free Play focus stops are invisible: 72 of 83 in Edge, 74 of 85 in Firefox. (e) does not hold in either browser: focus returns to the Clear Learning Progress button. It still reproduces in real Chrome 151, so [PH-UI-017](findings/PH-UI-017.md) depends on timing |
| 4 | WF-002, RT-011, PH-PAR-007 | Firefox stays on "Loading services..." for 6 to 12 s until `requestMIDIAccess` rejects with "SecurityError: WebMIDI requires a site permission add-on to activate". Settings, Input then shows a card saying the app cannot access the MIDI keyboard, with a Try MIDI Again button, and the computer keyboard plays |
| 5 | BR-008, MOD-009, PH-PAR-002 | Pass in both, with the real GTK file dialog cancelled by Escape. The button returns from "Importing" within 2 to 4 ms, and a second pick imports. This was the proof PH-PAR-002 still owed |

## Sitting 4: MIDI Keyboard

This host has no MIDI keyboard, and `/dev/snd/seq` is denied even outside the sandbox. In
its place the agent injected a scripted Web MIDI device, "Audit Keys 61", into the page in
both runtimes. The device follows Chrome's Web MIDI behaviour: ports open implicitly,
`statechange` fires on unplug and replug, and messages are real `MIDIMessageEvent`s
timestamped when the key went down. This exercises everything the app does from
`requestMIDIAccess` up. It does not exercise a real device's driver, the OS MIDI stack, or
Chrome's permission prompt for a real device.

| # | Rows | Result |
|---|---|---|
| 1 | WF-002, RT-011 | Pass in both: Settings, Input lists "Audit Keys 61" |
| 2 | PH-MUS-004 | Pass in both: a held note is released within 1 ms of the unplug, and the device plays again after the replug with no restart |
| 3 | PH-MUS-010 | Reproduces in both: the song reloads and starts over on the unplug and again on the replug |
| 4 | WF-009, PH-MUS-001 | Pass in both: all 16 notes were judged perfect across a pause and resume. The results screen shows 100 %, and the stored result row matches |
| 5 | WF-009 latency | Not run: the feel of the latency needs a person and a real keyboard |
| 6 | PH-MUS-011 | Reproduces in both. After the remembered device is swapped for another, the select shows "Any connected device", not a blank value |
| 7 | PH-MUS-002 | Pass in both runtimes, including the Electron non-4/4 loop. The label reads "Looping measures 3-4", each pass has six notes, and all 12 are judged perfect. The HUD resets to `0 \| 0` at each wrap; that is the current design |

New, from a variant of item 7: in a loop, a downbeat played 15 ms early at the seam is
dropped, and Learn mode then waits on that note
([PH-MUS-016](findings/PH-MUS-016.md), P3). The same run with the downbeat 20 ms late
judges all twelve notes.

## What Still Needs The Owner

| Sitting | What | Why the agent could not |
|---|---|---|
| 0 | Open the live site from another network, for example a phone on mobile data | This host's own address may be allowed through Access, and the agent's permission layer stops further live requests |
| 1 | Item 1: watch it once; items 5 to 7: listen on speakers | Only a person can judge it on a real screen and real speakers |
| 1 | Item 3 on the real GNOME or Wayland session | The agent tested X11 through GTK and XSETTINGS only |
| 1 | Item 4: the system-monitor numbers on real hardware | `Xvfb` renders in software |
| 1 | Item 9 (optional) and item 10 | The owner's own Chrome profile; a person's colour vision |
| 2 | All of it | It needs Windows |
| 3 | Item 2 with Edge's own zoom | Only emulated zoom was run in Edge |
| 4 | Items 1 to 4 and 6 with a real keyboard; item 5 (latency feel) | The device was scripted |

## Evidence

- `$TMPDIR/p11/S0/build.log`: image build
- `$TMPDIR/p11/S0/item1.out`: item 1
- `$TMPDIR/p11/S0/item2.*`: item 2 data directory and upload replies
- `$TMPDIR/p11/S0/item3.out`: item 3
- `$TMPDIR/p11/S0/crafted-check.out`: crafted archives
- `$TMPDIR/p11/S1A/`: sitting 1 audio captures and `analysis.txt` per run (`desktop-fresh`,
  `desktop-nudged`, `web-1`). Drivers: `scripts/audit/electron/sitting1-audio-desktop.mjs`,
  `sitting1-audio-rec.mjs`, `sitting1-audio-analyse.py`, and
  `scripts/audit/browser/sitting1-audio-web.mjs`
- `$TMPDIR/p11/S1V/`: sitting 1 visual output per item (`d-item1.out`, `c-zoom.out`,
  `d-zoom.out`, `d-zoom2.out`, `c-ctrl0.out`, `d-ctrl0.out`, `c-motion-*`, `d-motion-*`,
  `d-cpu-raw.out`, `c-midi-observe.out`, `c-midi-block.out`), screenshots in `ev/`, and the
  packaged build in `build/dist/linux-unpacked`. Drivers:
  `scripts/audit/browser/sitting1-visual-chrome.mjs`, `sitting1-visual-probes.mjs`, and
  `scripts/audit/electron/sitting1-visual-desktop.mjs` (its `missing` phase is the
  missing-asset run), `sitting1-visual-cpu-raw.mjs`, `sitting1-visual-xtest.py`,
  `sitting1-visual-xsettings.py`
- `$TMPDIR/p11/S3/`: sitting 3 output, screenshots in `shots/`. Drivers:
  `scripts/audit/browser/sitting3-*.mjs` and `sitting3-xkey.py`
- `$TMPDIR/p11/S4/`: sitting 4 output (`web.out`, `desktop.out`) and screenshots. Drivers:
  `scripts/audit/browser/sitting4-midi-common.mjs`, `sitting4-midi-web.mjs`, and
  `scripts/audit/electron/sitting4-midi-desktop.mjs`
