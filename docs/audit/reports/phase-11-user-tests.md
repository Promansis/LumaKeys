# User Test Batch: Phase 11

The owner's batch. The agent (Claude Code, acting audit lead) adds an item here only
when the proof needs a person, other hardware, another operating system, another
browser, or a real display; everything else the agent runs itself. Items follow
`../templates/user-test-batch.md`. Run a sitting when it is marked **ready**.

Status legend: `staging` (agent still preparing), `ready`, `done`.

Revised 2026-10-20. The headless Electron runs
([report](phase-11-electron-runtime-2026-10-20.md)) proved the window-open probe, the
Electron half of PH-MUS-005, and the Electron halves of WF-001, WF-004, WF-005, WF-007,
WF-008, WF-010, WF-011, WF-012, WF-013, WF-014, WF-015 and WF-017 to WF-024, so those
items are gone. Electron checks that need no person moved to the agent (last section).

**Never point a test at your real data.** Every command below uses a throwaway data
directory or container. Do not use `docker compose up` or your normal desktop profile
for these tests. `~/.config/PianoHero` on this machine holds a copy of your old desktop
data, and a desktop build run without an isolated profile migrates it.

## Sitting 0: Host terminal on this machine (~20 min) — ready

Commands the agent cannot run from its sandbox (no Docker socket, no access to the
live hostname). Paste each result back into the Result column or into chat.

Preconditions already satisfied by the agent:

- The Dockerfile is unchanged since the baseline; building fetches the pinned
  MuseScore AppImage. Building an image does not touch the running container.
- `scripts/audit/fixtures/musescore/meter-tempo.mscz` serves as the `.mscz` for item 3.
- Items 2 to 4 run the image in throwaway containers with throwaway data. None of them
  mounts `/media/storage/lumakeys`.

Run once first: `cd /media/storage/LumaKeys && docker compose build && IMG=$(docker compose config --images | head -1) && echo $IMG`

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | OP-017, WF-025, MOD-012, BASE-11-001 | `docker run --rm "$IMG" npx vitest run src/server/museScore.integration.test.ts` | 1 test passed (the integration test that is skipped outside Docker) | | |
| 2 | PH-SEC-004, WF-023 | `D=$(mktemp -d); CID=$(docker run -d --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e PORT=3001 -e LUMAKEYS_DATA_DIR=/data -v "$D:/data" -p 127.0.0.1:3797:3001 "$IMG" node dist/server/index.cjs); sleep 5; for i in 1 2; do curl -s -o $D/up$i.json -F "files=@scripts/audit/fixtures/musescore/meter-tempo.mscz;filename=score$i.mscz" http://127.0.0.1:3797/api/midi/upload & done; wait; cat $D/up1.json $D/up2.json; echo; docker restart $CID; sleep 5; curl -s -X POST -H 'content-type: application/json' -d '{"args":[]}' http://127.0.0.1:3797/api/bridge/getAllSongs \| head -c 300; echo; docker stop $CID` | One upload imports the score; the other says "Another MuseScore score is being converted". After the restart, `getAllSongs` still lists the imported song | | |
| 3 | WF-004, WF-008, L-11-017, PH-MUS-002 | `bash scripts/audit/musescore-measure-check.sh 2>&1 \| tee "${TMPDIR:-/tmp}/musescore-measure-check.out"`. It uses only throwaway directories and port 3799 on 127.0.0.1 | Two probe sections (direct and served), each ending `2 file(s), 0 failed check(s)`. A "rejected" line for the hand-built `.mscz` is acceptable if the `.mscx` fallback converts | | |
| 4 | OP-014, PH-OPS-002 | In a private browser window open `https://<your hostname>/`; then `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{"args":[]}' https://<your hostname>/api/bridge/getAllSongs` | The browser goes to the Cloudflare login before the app loads; curl prints 302 or 403, never 200 | | |

## Sitting 1: This Linux machine with a display and speakers (~35 min) — ready

Real zoom, the OS reduced-motion setting, a visible window, and listening.

Set up once, in a terminal at the repository root:

```bash
npm run package:local         # fresh Linux package from the current source (also rebuilds out/)
npm rebuild better-sqlite3    # packaging may leave this module built for Electron; this restores the web server's copy
P=$(mktemp -d); mkdir -p "$P/.config"; ln -s ~/.config/dconf "$P/.config/dconf"
XDG_CONFIG_HOME="$P/.config" ./dist/linux-unpacked/lumakeys --no-sandbox &   # desktop app, throwaway profile
D=$(mktemp -d); LUMAKEYS_DATA_DIR="$D" PORT=3998 node dist/server/index.cjs & # web app, throwaway data
```

The desktop app keeps its data in `$P`. The `dconf` link lets it read your real
reduced-motion setting. The web app is at `http://127.0.0.1:3998`. In both, choose
"Skip for now" on the setup guide. If the package's executable is not named
`lumakeys`, use the one executable in `dist/linux-unpacked/`.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | WF-026, RT-012, BR-067, PH-PAR-001 | Desktop app: (a) watch the main-menu background for 5 s. (b) Settings (Audio opens first), set Instrument to Flute, press "Install Better Sounds". (c) Guided Lessons, open the Novice tier capstone (Ode to Joy), press Space, then Escape and Main Menu | (a) The neon background moves (video), not a still image. (b) "Flute Enhanced Pack ready." appears. (c) The capstone loads in the packaged app and notes fall | | |
| 2 | RT-006, PH-UI-002, PH-UI-012 | Chrome at the web app, window at its usual size: zoom to 125, 150, 175 and 200 percent (Ctrl and +). At each: open Settings and click every tab. At 150 and 175: open Free Play, press Tab once to expand the top HUD, click SETTINGS, then go back and click PROGRESS. Repeat in the desktop app if Ctrl and + zooms it; if it does not, write "no zoom" | Every Settings tab opens at every zoom. Today (emulated): at 150 and 175 percent the instrument button sits over SETTINGS and the HUD overlaps the status cards; not at 125 or 200 | | |
| 3 | RT-009, RT-012, WF-026, PH-UI-003 | Turn the OS setting on: `gsettings set org.gnome.desktop.interface enable-animations false` (or Settings, Accessibility, Reduce Animation). Reload the web app's main menu and open Free Play; in the desktop app go to the main menu and open Free Play. Turn it off again with `gsettings set org.gnome.desktop.interface enable-animations true` | Under the setting the main menu does not play the video, and the Free Play background does not animate while no key is pressed; pressed keys still light up. With it off, the video and animation come back | | |
| 4 | WF-026, RT-012, L-11-015 | Desktop app on the main menu: open the system monitor, note the app's CPU, minimise the window for 30 s and note the CPU again, then restore | CPU drops while minimised and the video resumes on restore. Record the two numbers | | |
| 5 | WF-015, WF-016, WF-013, WF-009 | Desktop app, speakers on: (a) Free Play, press a few keys (Z, X, C). (b) Soundboard, press several keys quickly. (c) Interval Trainer, answer two questions by ear. (d) Free Play, Menu, Load Track, pick any `.mp3` or `.wav`, press Play | (a) A piano sound per key. (b) Animal sounds, none stacking into a long overlap. (c) Two distinct notes per question. (d) The track plays | | |
| 6 | WF-019, PH-PAR-006 | Desktop app (Flute installed in item 1): Free Play, play C D E with the pack, then Settings, Audio, "Use Built-in Sounds", then play C D E again. Web app: Settings, Audio, Instrument Flute, "Install Better Sounds", then Free Play C D E | Desktop: the installed pack sounds different from the built-in Flute. Web: expected today to sound like the built-in Flute, because the web never uses the pack (PH-PAR-006) | | |
| 7 | PH-MUS-006 (optional) | Desktop app: Settings, Gameplay, turn on Start With Metronome. Open any song, press Escape, drag Tempo to 50 percent, Resume, press Space and listen for 10 s while watching the notes reach the line | Today: one click every second beat, because the practice tempo is applied twice | | |
| 8 | PH-PAR-007 | `google-chrome --user-data-dir=$(mktemp -d) http://127.0.0.1:3998` (a fresh profile). When Chrome asks to allow MIDI devices, do not answer for 30 s, then click Block | Today: "Loading services..." stays for the whole 30 s and the app starts only after Block | | |
| 9 | PH-DATA-004 (optional) | Only if your normal Chrome profile installed an instrument pack before the LumaKeys rename: open your own deployment in it, Settings, Audio, and read the pack status | Expected today: the pack shows "not installed". Skip if you never installed one on the old build | | |
| 10 | RT-010, PH-UI-015, PH-UI-016 | Needs a person with a colour-vision deficiency, or a colleague with a calibrated display. Web app: upload `scripts/audit/fixtures/midi/pmus-16.mid`, play it in Play mode missing some notes on purpose, once with Settings, Visual, Colour-blind mode off and once on, then read the results screen. Can they tell a missed note from an upcoming right-hand note, and a good hit from an upcoming left-hand note, without the MISS popup? Is the grade letter legible? | Today: in colour-blind mode a missed note and a pending right-hand note are the same pink-red; a low grade letter is barely visible against its badge. Record their answers | | |

Afterwards: stop both apps (`kill %1 %2`), and turn the OS animation setting back on if
item 3 left it off.

## Sitting 2: Windows machine (~25 min) — ready

Needs a portable `.exe` built from the current source: `npm run package:win`. The
executable in `dist/win-unpacked` dated 2026-08-07 is stale and still uses the old
names, so it cannot be used. After building on this machine, run
`npm rebuild better-sqlite3` before starting the web server again.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | DATA-017, PH-DATA-005 | Before launching anything: `dir "%APPDATA%\piano-hero" "%APPDATA%\luma-keys" "%APPDATA%\PianoHero" "%APPDATA%\lumakeys"`. If `luma-keys` or `piano-hero` exists, back it up: `robocopy "%APPDATA%\luma-keys" "%USERPROFILE%\lumakeys-profile-backup" /E` (same for `piano-hero`). Launch the new exe, open the library, close the app, run the `dir` again | Today: the library is empty; `%APPDATA%\lumakeys\lumakeys.db` is new; `%APPDATA%\luma-keys\pianohero.db` is unchanged. If no old folder exists, write "no pre-rename profile" | | |
| 2 | WF-023, RT-001, WF-026 | Launch the exe again; watch the main-menu background for 5 s; close the app | The main menu renders, the background moves, the app closes cleanly | | |
| 3 | WF-001 | Reopen the setup guide from the main-menu card, set a 20-minute reminder and Large hands, Start Practice, restart the app, open Settings | The reminder and hand size are kept | | |
| 4 | WF-004 | Import one `.mid` from Downloads; start it | The song appears in the library and starts | | |
| 5 | WF-019 | Settings, Audio, Instrument Flute, "Install Better Sounds"; Free Play, press a few keys | "Flute Enhanced Pack ready." and the Flute plays. This is the first run of the pack's `file:///C:/…` path | | |
| 6 | OP-015, PH-OPS-006 (optional) | Only if item 1 found `%APPDATA%\luma-keys\pianohero.db`: copy it into `%APPDATA%\lumakeys\`, launch the exe, wait 15 s, check Task Manager, end the LumaKeys process, then delete the copied `%APPDATA%\lumakeys\pianohero.db` | Today: no window and no message, while a LumaKeys process keeps running | | |

## Sitting 3: Edge and Firefox (~25 min) — ready

On any machine that has both browsers. Start a throwaway web server on this machine
(`D=$(mktemp -d); LUMAKEYS_DATA_DIR="$D" PORT=3998 node dist/server/index.cjs`). Open
`http://127.0.0.1:3998` if the browsers are on this machine. From another machine use
`http://<this machine's LAN address>:3998`; Web MIDI is then unavailable, so skip item 4.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | RT-002 | In Edge, then Firefox: Library, upload any `.mid` (for example `scripts/audit/fixtures/midi/pmus-16.mid`), start it | The game canvas renders in both | | |
| 2 | RT-006, PH-UI-002, PH-UI-012 | In both: zoom to 150 and 200 percent, click every Settings tab; at 150 percent open Free Play, press Tab once, click SETTINGS | Every tab opens. Today: the HUD collision at 150 percent | | |
| 3 | RT-008, PH-UI-010, PH-UI-011, PH-UI-013, PH-UI-014, PH-UI-017 | Keyboard only, in both: (a) Progress, Tab through the top bar. (b) Settings, Audio, Calibrate, press Escape. (c) Soundboard: press Escape three times. (d) Free Play: Tab through the page, counting stops you cannot see. (e) Settings, Practice, open Clear Learning Progress, press Escape, then Tab | Today (Chrome and, from agent item A4, Electron): (a) no visible focus on the top bar; (b) the dialog closes and Settings is left; (c) the third press leaves to the main menu; (d) most stops invisible; (e) focus restarts from the page top. Record which hold in each browser | | |
| 4 | WF-002, RT-011 | Firefox: open the app and Settings, Input | A clear message or a permission prompt; the computer keyboard still plays | | |
| 5 | BR-008, MOD-009, PH-PAR-002 | In both: Library, "Upload MIDI / MSCZ", press Cancel in the file dialog; then press it again and pick a `.mid` | After Cancel the button returns from "Importing..." within 1 s and is enabled; the second try imports the song | | |

## Sitting 4: MIDI keyboard and speakers (~30 min) — ready

A USB MIDI keyboard on this machine. Write its make and model in item 1's Seen column.
Use the desktop app from sitting 1 (a new throwaway profile is fine), then repeat items 1
and 3 in Chrome at the throwaway web server.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | WF-002, RT-011 | Plug in the keyboard, open Settings, Input, MIDI Device | The device is listed by name | | |
| 2 | PH-MUS-004 | In Free Play hold a key, unplug the keyboard, plug it back in, play a note | The held note stops on unplug; the keyboard works again without a restart | | |
| 3 | PH-MUS-010 | Start any song, play a few notes, unplug the keyboard, plug it back in | Today: the song reloads and starts over each time a device comes or goes | | |
| 4 | WF-009, PH-MUS-001 | Play a song on the keyboard, pause and resume halfway | Notes judged before the pause keep their state | | |
| 5 | WF-009 latency | Play a steady beat at the default latency setting | No lag you would call wrong; note the setting | | |
| 6 | PH-MUS-011 (optional, needs a second MIDI keyboard) | Settings, Input, MIDI Device: select the first keyboard by name. Close the app, unplug it, plug in the second, reopen the app, open Settings, Input, then play the second keyboard in Free Play | Today: the MIDI Device select is blank and the summary reads "Any connected device", while notes from the second keyboard are ignored | | |
| 7 | PH-MUS-002 | Library, Upload MIDI, pick `scripts/audit/fixtures/midi/6-8-then-3-4-reached.mid` (two bars of 6/8, then two of 3/4). Learn, Escape, set the loop to measures 3 to 4, Set Loop, Resume, Space, and play the looped notes on the keyboard twice round | The overlay reads "Looping measures 3–4"; the loop starts on the first 3/4 bar and repeats exactly the last two bars (six notes), as a musician reading the bars would expect. Record anything that looks one bar off | | |

## Owner Decisions (not tests)

| # | Decision | State |
|---|---|---|
| 1 | PH-MUS-013: what the capstone gate measures | Decided 2026-10-20: capstones run in Play mode at the capstone tempo, and the run's settings are locked |
| 2 | PH-OPS-004: the database in git history | Decided 2026-10-20: accept the risk; no history rewrite. The agent read all six blobs and none holds personal data |
| 3 | Lane H: end date for the legacy-name fallback (suggested 2027-01-31), and whether `CLAUDE.md` and `AGENTS.md` are tracked | Decided 2026-10-20: removal no earlier than 2027-01-31, and only in a release after the carry-over release. `CLAUDE.md` and `AGENTS.md` stay gitignored; what the audit relies on moves into tracked docs (task D1) |
| 4 | Which findings enter remediation | Decided 2026-10-20: waves, owners and branches as in the plan's [Owner Selection](phase-11-remediation-plan-2026-10-20.md#owner-selection-2026-10-20). Nothing starts until you say go |

## Moved To The Agent (headless Electron)

These were owner items. They need the desktop app but no person, so the agent ran them
with `scripts/audit/electron/` on 2026-10-20. The
[Electron runtime report](phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)
has the detail.

| # | Coverage row / finding | Check | Came from | Result |
|---|---|---|---|---|
| A1 | WF-008, WF-009, PH-MUS-001, PH-MUS-003 | Tempo change keeps judged notes; a structural change asks first; a fingering set inside a loop binds to the right note through IPC | lane C proposed item 8 | done: same values as the web; PH-MUS-001 and PH-MUS-003 stay fixed |
| A2 | WF-007, PH-UI-006 | Library UI: move ticked songs into a folder, relaunch, still there; bulk delete removes them with no confirmation | lane F library item 9 | done: the move survives a relaunch; PH-UI-006 reproduces with no prompt at any layer |
| A3 | WF-008 | One-hand session from the overlay, six judged notes, hand assignment kept across relaunch and hand choice reset | lane F library item 10 | done: 6 judged notes and 0 misses; the assignment survives a relaunch and the hand choice resets |
| A4 | RT-008, PH-UI-010, PH-UI-011, PH-UI-013, PH-UI-014, PH-UI-017 | Sitting 3 item 3's keyboard walk in Electron | lane E proposed item 3 | done: all five web results hold on the desktop; Edge and Firefox stay in sitting 3 |

## Returned To The Agent

- Date the batch was run:
- Items the agent must re-stage or clarify:
