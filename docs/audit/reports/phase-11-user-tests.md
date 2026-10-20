# User Test Batch: Phase 11

The owner's batch. The agent (Claude Code, acting audit lead) adds an item here only
when the proof needs a person, other hardware, another operating system, another
browser, or a real display; everything else the agent runs itself. Items follow
`../templates/user-test-batch.md`. Run a sitting when it is marked **ready**.

Status legend: `staging` (agent still preparing), `ready`, `done`, `done (agent)`.

Revised 2026-10-20. The headless Electron runs
([report](phase-11-electron-runtime-2026-10-20.md)) proved the window-open probe, the
Electron half of PH-MUS-005, and the Electron halves of WF-001, WF-004, WF-005, WF-007,
WF-008, WF-010, WF-011, WF-012, WF-013, WF-014, WF-015 and WF-017 to WF-024, so those
items are gone. Electron checks that need no person moved to the agent (last section).

Revised again 2026-10-20. At the owner's request ("do the sitting items") the agent ran
sittings 0, 1, 3 and 4 itself on this host, with Docker, `Xvfb`, null audio sinks and a
scripted MIDI device ([report](phase-11-owner-sittings-2026-10-20.md)). Their tables below
are now records with the agent's results. What still needs you is in the next section.
Sitting 2 (Windows) is unchanged.

**Never point a test at your real data.** Every command below uses a throwaway data
directory or container. Do not use `docker compose up` or your normal desktop profile
for these tests. `~/.config/PianoHero` on this machine holds a copy of your old desktop
data, and a desktop build run without an isolated profile migrates it.

## Still Needs You — ready

### A. The live site from another network (2 min, urgent)

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| A1 | OP-014, PH-OPS-002 | On a phone with Wi-Fi off (mobile data), open `https://<your hostname>/` in a private tab | Cloudflare's login page, not the app. On 2026-10-20 the app and its `/api` answered this machine with no login. If the phone also gets the app, the library is open to anyone who knows the hostname: put a Cloudflare Access application in front of it, or set `LUMAKEYS_WEB_ACCESS_TOKEN` and recreate the container ([PH-OPS-002](findings/PH-OPS-002.md)) | **fail**: the app opened over mobile data with no login. The owner said it looks like an old version; the image was built from `6e549b6`, the code this audit tested. Repeat after Access or the token is in place | owner, phone, 2026-10-20 |

### B. This machine's desktop, with speakers (~20 min)

Log in to the desktop session and open a terminal at the repository root. Use the package the agent built from the current source in
a throwaway copy, so nothing in the repository is rebuilt. It lives under `/tmp` and is gone
after a reboot; if so, ask the agent to rebuild it.

```bash
APP=/tmp/claude-1000/p11/S1V/build/dist/linux-unpacked/lumakeys
P=$(mktemp -d); mkdir -p "$P/.config"; ln -s ~/.config/dconf "$P/.config/dconf"
XDG_CONFIG_HOME="$P/.config" "$APP" --no-sandbox &                              # desktop app, throwaway profile
D=$(mktemp -d); LUMAKEYS_DATA_DIR="$D" PORT=3998 node dist/server/index.cjs &   # web app, throwaway data
```

In both, choose "Skip for now" on the setup guide.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| B1 | WF-015, PH-MUS-014 | Speakers at a normal level. Desktop app, Free Play, press Z, X, C. Then Settings, Audio, move Master Volume one step left and back, and do the same for Reverb and Metronome Volume. Free Play again, press Z, X, C | Today: the first three notes are close to silent ([PH-MUS-014](findings/PH-MUS-014.md)). After the sliders move, each key plays a clear piano note. Write whether the second set sounds right | | |
| B2 | WF-016, WF-019, PH-MUS-015 | Soundboard, press several keys quickly. Then Settings, Audio, Instrument Flute, "Install Better Sounds"; Free Play, hold C, D, E for a second each and release; Settings, "Use Built-in Sounds", and repeat | Soundboard sounds are clean. Today the pack's notes stop abruptly on release while the built-in Flute fades ([PH-MUS-015](findings/PH-MUS-015.md)). Write whether the pack sounds better apart from that | | |
| B3 | RT-009, PH-UI-003 | `gsettings set org.gnome.desktop.interface enable-animations false`. Then quit and restart the desktop app, and open the web app in a **new** tab of a throwaway Chrome (`google-chrome --user-data-dir=$(mktemp -d) http://127.0.0.1:3998`). In each, look at the main menu and Free Play. Afterwards `gsettings set org.gnome.desktop.interface enable-animations true` | No video on the main menu; the Free Play background is still until a key is pressed, and pressed keys light up. A running app or a reloaded tab keeps the old setting, so restart or open a new tab. The agent proved this on X11; this checks your real GNOME session | | |
| B4 | L-11-015 | Desktop app on the main menu: open the system monitor, note the app's CPU, minimise it for 30 s, note the CPU again, restore | CPU drops while minimised and the video resumes. Record the two numbers (the agent's software-rendered numbers are not representative) | | |
| B5 | RT-010, PH-UI-015, PH-UI-016 (needs another person) | Needs a person with a colour-vision deficiency, or a colleague with a calibrated display. Web app: upload `scripts/audit/fixtures/midi/pmus-16.mid`, play it in Play mode missing some notes on purpose, once with Settings, Visual, Colour-blind mode off and once on, then read the results screen. Can they tell a missed note from an upcoming right-hand note, and a good hit from an upcoming left-hand note, without the MISS popup? Is the grade letter legible? | Today: in colour-blind mode a missed note and a pending right-hand note are the same pink-red; a low grade letter is barely visible against its badge. Record their answers | | |
| B6 | PH-DATA-004 (optional) | Only if your normal Chrome profile installed an instrument pack before the LumaKeys rename: open your own deployment in it, Settings, Audio, and read the pack status | Expected today: the pack shows "not installed". Skip if you never installed one on the old build | | |

Afterwards: stop both apps (`kill %1 %2`), and turn the OS animation setting back on if
B3 left it off.

### C. A real MIDI keyboard (~15 min)

The agent ran these with a scripted Web MIDI device and they passed in both runtimes. What
is left is the real device's driver, the OS MIDI stack and the feel. Use the desktop app
and web server from B. Write the keyboard's make and model in C1's Seen column.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| C1 | WF-002, RT-011 | Plug in the keyboard. Desktop app, Settings, Input, MIDI Device. Then the throwaway Chrome at `http://127.0.0.1:3998`: allow MIDI when asked, Settings, Input | The device is listed by name in both, and Chrome shows its permission prompt | | |
| C2 | PH-MUS-004 | Desktop app, Free Play: hold a key, unplug the keyboard, plug it back in, play a note | The held note stops on unplug; the keyboard plays again with no restart | | |
| C3 | WF-009, PH-MUS-001 | Play a song on the keyboard, pause and resume halfway | Notes judged before the pause keep their state | | |
| C4 | WF-009 latency | Play a steady beat at the default latency setting | No lag you would call wrong; note the setting | | |
| C5 | PH-MUS-002 | Library, Upload MIDI, pick `scripts/audit/fixtures/midi/6-8-then-3-4-reached.mid` (two bars of 6/8, then two of 3/4). Learn, Escape, set the loop to measures 3 to 4, Set Loop, Resume, Space, and play the looped notes twice round | The overlay reads "Looping measures 3-4"; the loop repeats exactly the two 3/4 bars (six notes), as a musician reading the bars would expect. Today, a downbeat played slightly early at the seam is ignored ([PH-MUS-016](findings/PH-MUS-016.md)). Record anything that looks one bar off | | |

### D. Edge's own zoom (optional, 5 min, any machine with Edge)

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| D1 | RT-006, PH-UI-002 | Edge at the web app: zoom to 150 and 200 percent with Ctrl and +, click every Settings tab | Every tab opens. The agent ran Edge with emulated zoom only | | |

### E. Windows

Sitting 2 below, unchanged.

## Sitting 0: Host terminal on this machine — done (agent)

Run by the agent on 2026-10-20 with the image `lumakeys-audit:p11`, built from the working
tree under a separate tag, and throwaway containers on `127.0.0.1`. The running container
and its image were not touched. Item 4 continues as A1.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | OP-017, WF-025, MOD-012, BASE-11-001 | `docker run --rm "$IMG" npx vitest run src/server/museScore.integration.test.ts` | 1 test passed (the integration test that is skipped outside Docker) | pass (agent) | 1 passed, 3.4 s |
| 2 | PH-SEC-004, WF-023 | Two parallel uploads of `meter-tempo.mscz` to a throwaway container, `docker restart`, then `getAllSongs` | One upload imports the score; the other says "Another MuseScore score is being converted". After the restart, `getAllSongs` still lists the imported song | pass (agent) | `score2` imported, `score1` got the busy message; after the restart the song is listed and its MIDI (446 bytes) is served |
| 3 | WF-004, WF-008, L-11-017, PH-MUS-002 | `bash scripts/audit/musescore-measure-check.sh` | Two probe sections (direct and served), each ending `2 file(s), 0 failed check(s)` | pass (agent) | Both sections `2 file(s), 0 failed check(s)`; both `.mscz` files converted directly |
| 4 | OP-014, PH-OPS-002 | Unauthenticated requests to the live hostname | The browser goes to the Cloudflare login before the app loads; `/api` answers 302 or 403, never 200 | fail (agent) | `/` 200 with no login; `getAllSongs` and `/api/access` 200; upload 500 and import 400 from the app. Settled from another network by A1 |

Added by the agent: a crafted-archive run (traversal, symlink, a 300 MB bomb, a 180,008-bar
score) passed. See the [report](phase-11-owner-sittings-2026-10-20.md#added-crafted-archives-op-017).

## Sitting 1: This Linux machine with a display and speakers — done (agent)

Run by the agent on 2026-10-20: the visual items in a packaged build from the current
source on `Xvfb` with real X input; the audio items recorded from a null sink. What needs a
person's eyes and ears continues as B1 to B6.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | WF-026, RT-012, BR-067, PH-PAR-001 | Desktop app: (a) watch the main-menu background for 5 s. (b) Settings (Audio opens first), set Instrument to Flute, press "Install Better Sounds". (c) Guided Lessons, open the Novice tier capstone (Ode to Joy), press Space, then Escape and Back to Learn Hub. On a fresh profile the capstone is locked until the six Novice lessons are complete | (a) The neon background moves (video), not a still image. (b) "Flute Enhanced Pack ready." appears. (c) The capstone loads in the packaged app and notes fall | pass (agent) | Video played 5.3 s in 5 s; pack ready; capstone unlocked through settings, started on Space, scored on 8 presses |
| 2 | RT-006, PH-UI-002, PH-UI-012 | Chrome at the web app: zoom to 125, 150, 175 and 200 percent (Ctrl and +). At each: open Settings and click every tab. At 150 and 175: open Free Play, press Tab once to expand the top HUD, click SETTINGS, then go back and click PROGRESS. Repeat in the desktop app, which zooms with Ctrl, Shift and + | Every Settings tab opens at every zoom. Today: at 150 and 175 percent the instrument controls sit over SETTINGS | pass for Settings; HUD fails as expected (agent) | Chrome: SETTINGS covered at 150 and 175 %. Desktop (steps 110 to 207 %): SETTINGS covered at 158 and 173 %, PROGRESS too at 189 %. New: Ctrl+0 does not reset the zoom ([PH-UI-019](findings/PH-UI-019.md)) |
| 3 | RT-009, RT-012, WF-026, PH-UI-003 | Turn the OS setting on, then restart the desktop app and open the web app in a new tab (a reload keeps the old value). Main menu and Free Play in each. Turn it off again | Under the setting the main menu does not play the video, and the Free Play background does not animate while no key is pressed; pressed keys still light up. With it off, the video and animation come back | pass on X11 (agent) | Set through GTK and XSETTINGS: no video, 0 frames per second idle, keys still draw; off: video, 30 to 40 frames per second. GNOME continues as B3 |
| 4 | WF-026, RT-012, L-11-015 | Desktop app on the main menu: note the CPU, minimise for 30 s, note it again, restore | CPU drops while minimised and the video resumes on restore | pass (agent) | 183.7 % (software rendering) to 0.2 %; video paused while minimised, resumed on restore. Real numbers continue as B4 |
| 5 | WF-015, WF-016, WF-013, WF-009 | (a) Free Play, press Z, X, C. (b) Soundboard, press several keys quickly. (c) Interval Trainer, answer two questions by ear. (d) Free Play, Menu, Load Track, pick any `.mp3` or `.wav`, press Play | (a) A piano sound per key. (b) The Soundboard opens on Classic; its sounds do not stack into a long overlap. (c) Two distinct notes per question. (d) The track plays | pass (agent) | All four recorded; the Interval Trainer played each interval correctly and judged every answer correctly. New: on a fresh profile everything plays about 60 dB too quietly until a volume slider is moved ([PH-MUS-014](findings/PH-MUS-014.md)) |
| 6 | WF-019, PH-PAR-006 | Desktop: Free Play C, D, E with the pack, then "Use Built-in Sounds" and again. Web: install the Flute pack, Free Play C, D, E | Desktop: the pack sounds different. Web: today it sounds like the built-in Flute (PH-PAR-006) | as expected (agent) | Web: "Failed to load custom sampler". New: the desktop pack cuts notes off 0.1 s after release ([PH-MUS-015](findings/PH-MUS-015.md)) |
| 7 | PH-MUS-006 | Start With Metronome, Tempo 50 percent, Space, listen for 10 s | Today: one click every second beat | as expected (agent) | Clicks every 2.00 s against a 1.00 s beat; correct at 100 % |
| 8 | PH-PAR-007 | Fresh Chrome profile at the web app; leave the MIDI prompt for 30 s, then Block | Today: "Loading services..." stays for the whole 30 s and the app starts only after Block | as expected (agent) | Shown at every 5 s mark to 30 s; the app started 44 ms after Block |
| 9 | PH-DATA-004 (optional) | See B6 | | n/a | Needs your own Chrome profile; continues as B6 |
| 10 | RT-010, PH-UI-015, PH-UI-016 | See B5 | | n/a | Needs a person; continues as B5 |

## Sitting 2: Windows machine (~25 min) — ready

Needs a portable `.exe` built from the current source: `npm run package:win`. The
executable in `dist/win-unpacked` dated 2026-08-07 is stale and still uses the old
names, so it cannot be used. After building on this machine, run
`npm rebuild better-sqlite3` before starting the web server again. Alternatively, ask the
agent to cross-build the `.exe` in a throwaway copy, which leaves the repository's builds
alone.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | DATA-017, PH-DATA-005 | Before launching anything: `dir "%APPDATA%\piano-hero" "%APPDATA%\luma-keys" "%APPDATA%\PianoHero" "%APPDATA%\lumakeys"`. If `luma-keys` or `piano-hero` exists, back it up: `robocopy "%APPDATA%\luma-keys" "%USERPROFILE%\lumakeys-profile-backup" /E` (same for `piano-hero`). Launch the new exe, open the library, close the app, run the `dir` again | Today: the library is empty; `%APPDATA%\lumakeys\lumakeys.db` is new; `%APPDATA%\luma-keys\pianohero.db` is unchanged. If no old folder exists, write "no pre-rename profile" | | |
| 2 | WF-023, RT-001, WF-026 | Launch the exe again; watch the main-menu background for 5 s; close the app | The main menu renders, the background moves, the app closes cleanly | | |
| 3 | WF-001 | Reopen the setup guide from the main-menu card, set a 20-minute reminder and Large hands, Start Practice, restart the app, open Settings | The reminder and hand size are kept | | |
| 4 | WF-004 | Import one `.mid` from Downloads; start it | The song appears in the library and starts | | |
| 5 | WF-019 | Settings, Audio, Instrument Flute, "Install Better Sounds"; Free Play, press a few keys | "Flute Enhanced Pack ready." and the Flute plays. This is the first run of the pack's `file:///C:/…` path | | |
| 6 | OP-015, PH-OPS-006 (optional) | Only if item 1 found `%APPDATA%\luma-keys\pianohero.db`: copy it into `%APPDATA%\lumakeys\`, launch the exe, wait 15 s, check Task Manager, end the LumaKeys process, then delete the copied `%APPDATA%\lumakeys\pianohero.db` | Today: no window and no message, while a LumaKeys process keeps running | | |

## Sitting 3: Edge and Firefox — done (agent)

Run by the agent on 2026-10-20 with Edge 155 and Firefox 142 on `Xvfb`, against a
throwaway web server. Edge's own zoom continues as D1.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | RT-002 | In Edge, then Firefox: Library, upload any `.mid`, start it | The game canvas renders in both | pass (agent) | The canvas animates in both |
| 2 | RT-006, PH-UI-002, PH-UI-012 | In both: zoom to 150 and 200 percent, click every Settings tab; at 150 percent open Free Play, press Tab once, click SETTINGS | Every tab opens. Today: the HUD collision at 150 percent | pass for Settings; HUD fails as expected (agent) | Edge and Firefox emulated, Firefox also with its own zoom. Real clicks on SETTINGS at 150 % do not open it |
| 3 | RT-008, PH-UI-010, PH-UI-011, PH-UI-013, PH-UI-014, PH-UI-017 | Keyboard only, in both: (a) Progress, Tab through the top bar. (b) Settings, Audio, Calibrate, press Escape. (c) Soundboard: press Escape three times. (d) Free Play: Tab through the page, counting stops you cannot see. (e) Settings, Practice, open Clear Learning Progress, press Escape, then Tab | Today (Chrome and Electron): (a) no visible focus on the top bar; (b) the dialog closes and Settings is left; (c) the third press leaves to the main menu; (d) most stops invisible; (e) focus restarts from the page top | (a) to (d) as expected; (e) does not reproduce (agent) | (d) Edge 72 of 83, Firefox 74 of 85 invisible. (e) Focus returns to the button in Edge and Firefox, but still restarts from the top in real Chrome 151 |
| 4 | WF-002, RT-011 | Firefox: open the app and Settings, Input | A clear message or a permission prompt; the computer keyboard still plays | pass, slow start (agent) | "Loading services..." for 6 to 12 s, then a "cannot access your MIDI keyboard" card with Try MIDI Again; the keyboard plays |
| 5 | BR-008, MOD-009, PH-PAR-002 | In both: Library, "Upload MIDI / MSCZ", press Cancel in the file dialog; then press it again and pick a `.mid` | After Cancel the button returns from "Importing..." within 1 s and is enabled; the second try imports the song | pass (agent) | Real GTK dialog cancelled by Escape; back within 2 to 4 ms; the second pick imports |

## Sitting 4: MIDI keyboard and speakers — done (agent, scripted device)

Run by the agent on 2026-10-20 in the desktop app and the web app with a scripted Web MIDI
device, "Audit Keys 61". The real keyboard continues as C1 to C5.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | WF-002, RT-011 | Plug in the keyboard, open Settings, Input, MIDI Device | The device is listed by name | pass (agent) | "Audit Keys 61" in both |
| 2 | PH-MUS-004 | In Free Play hold a key, unplug the keyboard, plug it back in, play a note | The held note stops on unplug; the keyboard works again without a restart | pass (agent) | Released within 1 ms of the unplug; plays after the replug |
| 3 | PH-MUS-010 | Start any song, play a few notes, unplug the keyboard, plug it back in | Today: the song reloads and starts over each time a device comes or goes | as expected (agent) | Restarts on the unplug and on the replug, in both |
| 4 | WF-009, PH-MUS-001 | Play a song on the keyboard, pause and resume halfway | Notes judged before the pause keep their state | pass (agent) | 16 of 16 perfect; results and stored row agree |
| 5 | WF-009 latency | Play a steady beat at the default latency setting | No lag you would call wrong; note the setting | n/a | Needs a person; continues as C4 |
| 6 | PH-MUS-011 | Select the first keyboard by name, swap it for a second while the app is closed, reopen, play the second | Today: the select shows "Any connected device", while notes from the second keyboard are ignored | as expected (agent) | As expected; the select shows "Any connected device", not blank |
| 7 | PH-MUS-002 | `6-8-then-3-4-reached.mid`, Learn, loop measures 3 to 4, play the looped notes twice round | The overlay reads "Looping measures 3-4"; the loop repeats exactly the two 3/4 bars (six notes) | pass (agent) | 12 of 12 perfect in both. New: an early downbeat at the seam is dropped ([PH-MUS-016](findings/PH-MUS-016.md)). The musician's check continues as C5 |

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

Proof runs, 2026-10-21. These were owed by `fixed` findings and by the sitting 0 residual.
They need no person, so the agent ran them with throwaway profiles. The
[agent proofs report](phase-11-agent-proofs-2026-10-21.md) has the detail.

| # | Coverage row / finding | Check | Came from | Result |
|---|---|---|---|---|
| P1 | PH-PAR-003, DATA-002 | Hash-mismatched, unreadable, missing and no-source legacy rows leave no playable row, desktop and web | plan, proof owed | done: pass; PH-PAR-003 verified |
| P2 | OP-017, MOD-013 | The MuseScore 45 s timeout, 30 s CPU limit and 10 MB output limit, through real uploads | sitting 0 residual | done: all three fired, clean error, no child or temp dir; residual closed |
| P3 | PH-ARCH-001, WF-009 | A forced load failure in Edge, Firefox and Chromium | plan, proof owed | done: 78 of 78 checks in each; PH-ARCH-001 stays fixed (slice 0 test still owed); raised PH-UI-020 |
| P4 | PH-ARCH-002, WF-018 | A forced setting-write failure in Electron, by IPC override and by SQLite trigger | plan, proof owed | done: 19 of 19 checks each; PH-ARCH-002 verified |
| P5 | PH-MUS-003, WF-008 | Fingering save and re-open while hand and track controls vary, and a backup round trip | plan, proof owed | done: 24 of 24 checks; PH-MUS-003 verified; raised PH-MUS-017 |
| P6 | PH-DATA-002, OP-009 | The reset confirmation copy against what reset removes, on both runtimes | plan, proof owed | done: packs removed on both; PH-DATA-002 verified; raised PH-DATA-010 |
| P7 | PH-DATA-001, OP-005, OP-007, OP-009 | Forced filesystem failure during restore, delete and reset through the UI, with a safe retry | plan, proof owed | done: failed; rollback holds, the wording and the reset retry do not; PH-DATA-001 reopened at P2 |

## Returned To The Agent

- 2026-10-21: the agent ran the proof each `fixed` finding still owed on this host and the
  OP-017 limits residual, as P1 to P7 above
  ([report](phase-11-agent-proofs-2026-10-21.md)). Nothing in them needs the owner. A
  Windows `.exe` cross-build ran too and is held pending the owner's decision.
- Date the batch was run: sittings 0, 1, 3 and 4 by the agent on 2026-10-20; A to E not yet.
- Items the agent re-staged: sitting 1 item 1 (the capstone is locked on a fresh profile;
  the pause overlay's way out is "Back to Learn Hub"), item 3 (a reload does not pick up
  the OS setting), item 5 (the Soundboard opens on Classic), and sitting 4 item 6 (the
  select shows "Any connected device", not blank).
