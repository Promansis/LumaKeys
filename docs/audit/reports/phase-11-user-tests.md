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

Revised 2026-10-21. Wave 1 started: slices 2 (web access), 0 (CI) and 18 (fresh-profile
audio) and task D1 are merged to `main` (`ed07ce2`, `d49b8a6`, `db86adc`, `64a8160`). A1 now
checks the fix after you deploy it, with new checks A2 to A4 beside it; B1 checks slice 18;
group F is new and covers the GitHub runs for slice 0. Nothing is deployed or pushed yet.

Revised again 2026-10-21, later. The rest of wave 1 is merged: slice 1 (`c95586b`, desktop
profile migration), slice 15 (`8d73767`, browser rename carry-over), slice 3 (`a84acb0`,
Electron 44 and the window-open guard) and the slice 0 follow-up (`a7517ae`). Group B gains
B7 to B15 for them, B6 is updated, group G is new (housekeeping and one run outside the
sandbox), and sitting 2 needs a new Windows build. Every B row below that starts the desktop
app uses the post-merge Linux build in `/tmp/claude-1000/p11-owner-build` (built from
`a84acb0`; see section B). Decisions 7 to 9 are new.

Revised again 2026-10-21, after your `npm ci` and redeploy. G1 passed. The agent checked
the image you deployed in throwaway containers (note under section A's table); A2 gains a
cookie check; A4 and section E no longer point at builds that are out of date.

Revised again 2026-10-21, after the three follow-ups you chose (decisions 6, 7 and 11)
merged at `93ac583`. Redeploy before A1 to A3 (section A's note); A2 now expects `Secure`.
Group B uses a new build, `/tmp/claude-1000/p11-owner-build-2`; B7 also listens for the
count-in and B15 now checks the fix. Sitting 2 has the new Windows build. G1 asks you to run
`npm ci` once more. Decisions 10 and 11 are done.

**Never point a test at your real data.** Every command below uses a throwaway data
directory or container. Do not use `docker compose up` or your normal desktop profile
for these tests. `~/.config/PianoHero` on this machine holds a copy of your old desktop
data, and a desktop build run without an isolated profile migrates it.

## Still Needs You — ready

### A. The live site and the web security changes (~15 min, urgent)

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| A1 | OP-014, PH-OPS-002 | Deploy `main` with the token. Put `LUMAKEYS_WEB_ACCESS_TOKEN=<long random value>` (for example from `openssl rand -hex 32`) in the `.env` next to the compose file, which your untracked compose override already reads, then rebuild and recreate the container the way you normally deploy. On a phone with Wi-Fi off (mobile data), open `https://<your hostname>/` in a private tab. Then, from any machine, `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<your hostname>/api/bridge/getAllSongs` | The phone is sent to `/login` (not the app); signing in with the token loads the app; the `curl` prints 401, and `/api/*` answers 401 to anything without the cookie. If the container stops instead of starting, `docker compose logs` names the missing or placeholder token ([PH-OPS-002](findings/PH-OPS-002.md)) | 2026-10-20, before the fix: **fail**. The app opened over mobile data with no login. The owner said it looks like an old version; the image was built from `4466626`, the code this audit tested. Repeat after the deploy | owner, phone, 2026-10-20 (before the fix) |
| A2 | OP-014, PH-SEC-002 | A private window on a computer. Open `https://<your hostname>/`, sign in at `/login` with the token. Close the whole browser, reopen it and visit the site again. Then, in a new private window, open the old style link `https://<your hostname>/api/access?access_token=<token>` | You land on `/login`; the token is not in the address bar; the app loads after sign-in. After the browser closes, the site sends you to `/login` again (the cookie ends with the browser session). The old link returns 401 and the next visit to `/` still goes to `/login` ([PH-SEC-002](findings/PH-SEC-002.md)). While signed in, F12, Application, Cookies: write down whether `lumakeys_web_access` has Secure ticked. After you redeploy from `main` at `93ac583` or later it should be ticked ([PH-SEC-006](findings/PH-SEC-006.md)); the 12:34 deploy leaves it unticked | | |
| A3 | OP-016, PH-SEC-003, PH-OPS-002 | Still signed in, in the private window with the browser console open (F12): upload any `.mid`, play it; Free Play, press Z, X, C; Soundboard, press several keys; Settings, Audio, Instrument Flute, "Install Better Sounds" | Everything plays with sound. The console shows no Content-Security-Policy error, except the `undefinedblob:` ones that "Install Better Sounds" raises and the web pack never playing ([PH-PAR-006](findings/PH-PAR-006.md)). Write down any other CSP error with its blocked URL ([PH-SEC-003](findings/PH-SEC-003.md)) | | |
| A4 | OP-016, PH-SEC-003, MOD-014 | The same play-through as A3 on the built desktop app, in the throwaway profile from section B (its post-merge build holds all of wave 1), with the console open where the build allows it | Song, Free Play, Soundboard and Install Better Sounds work with sound, and no Content-Security-Policy error appears beyond the one A3 allows | | |

Agent check of the deployed image, 2026-10-21. You redeployed at 12:34 (image
`lumakeys-lumakeys`, `sha256:8c3a0bf9…`, built from the main checkout at `af57d89`), and
the `lumakeys` container stays up, so it started with a real token. The agent ran the same
image in throwaway containers, with an empty in-memory `/data`, a made-up token and
loopback port 3297; your container and `/media/storage/lumakeys` were not touched:

- With no token, and with the compose placeholder, it exits 1 with the message naming the fix.
- With a token: `/login` 200; `POST /api/bridge/getAllSongs` 401 without the cookie; the old
  `?access_token=` link 401; a wrong token 401; the right one 303 to `/` with the cookie
  `Path=/api; HttpOnly; SameSite=Strict`, after which the bridge answers 200.
- `GET /` answers 200 without the cookie by design: the page loads, and its first refused API
  call sends the browser to `/login`. A1 on the phone is the real check of that.
- The cookie never gets `Secure`, not even with `X-Forwarded-Proto: https` (plan lead (j)).
- The image holds better-sqlite3 13.0.3 and hono 4.13.0. Evidence:
  `/tmp/claude-1000/p11-docker-check/check2.out` (SHA-256 `4559b106…b4a59108`).

**Redeploy once more before A1 to A3.** The follow-up merged in `93ac583` adds `Secure`
behind the tunnel (PH-SEC-006) and moves to hono 4.13.13 and @hono/node-server 2.1.5
(`npm audit --omit=dev` finds nothing). The agent built a test image from `93ac583`
(`lumakeys-p11-check:f3`) and ran the same throwaway-container checks: the refusals and the
sign-in gate behave as above; the cookie gets `Secure` with `X-Forwarded-Proto: https` and
with `Cf-Visitor: {"scheme":"https"}`, and not without them; the image holds hono 4.13.13.
Evidence: `/tmp/claude-1000/p11-docker-check/check-f3.out` (SHA-256 `c115fa4c…826d8`).

Cloudflare note for A2 and A3: if the zone injects scripts into your pages (Web Analytics or
Rocket Loader), the new policy blocks them, and the console shows CSP errors that are about
those scripts and not about the app. Note the blocked URL; turn the feature off in
Cloudflare, or tell the agent if you want it allowed. The app itself must still work.

### B. This machine's desktop, with speakers (~20 min)

Log in to the desktop session and open a terminal in the agent's post-merge build copy,
`cd /tmp/claude-1000/p11-owner-build-2`, so nothing in the repository is rebuilt (the web
server serves `dist/web` from the current folder, and the copy holds the whole tree). The
agent built it on 2026-10-21 from `main` at `93ac583` with `npm run build:web` and
`npm run package:local`; it holds all of wave 1 and the three follow-ups (lead-in beats,
dialog folders, the web and build clean-up). The earlier copy,
`/tmp/claude-1000/p11-owner-build` from `a84acb0`, lacks the follow-ups, so do not use it
for B7 or B15. Both live under `/tmp` and are gone after a reboot; if so, ask the agent to
rebuild.

- Unpacked app: `/tmp/claude-1000/p11-owner-build-2/dist/linux-unpacked/lumakeys` (SHA-256
  `84fa94067d7122fbc52adbbe9d0f89c2decb95da1e94cfac0ce79274b2d3aec5`, the Electron 44.9.2
  executable itself, so it is the same in every build; the app code is in
  `resources/app.asar`).
- AppImage: `~/LumaKeys-builds/p11-owner-build-2/LumaKeys-0.1.0.AppImage`, copied out of `/tmp` on 2026-11-02 (211,222,883
  bytes, SHA-256 `42b7a5f23dc3e390f1b86454ad74c7b4caf9410e7c8afc013509f2ebdd616a30`).
- The agent could not open its window: the single-instance lock aborts it inside the agent
  sandbox (G2). Run as Node, the packaged binary reports Electron 44.9.2 and opens and
  queries a database through the packaged better-sqlite3. The web server in the copy
  answered `GET /` and the bridge with 200.

```bash
APP="/tmp/claude-1000/p11-owner-build-2/dist/linux-unpacked/lumakeys"
newp() { local p; p=$(mktemp -d); mkdir -p "$p/.config"; ln -s ~/.config/dconf "$p/.config/dconf"; echo "$p"; }
run()  { XDG_CONFIG_HOME="$1/.config" "$APP" --no-sandbox; }                 # run "$P": desktop app on a throwaway profile
P=$(newp); run "$P" &                                                        # desktop app, throwaway profile
D=$(mktemp -d); LUMAKEYS_DATA_DIR="$D" LUMAKEYS_TRUST_UPSTREAM_AUTH=1 PORT=3998 node dist/server/index.cjs &   # web app, throwaway data, no login (loopback only)
```

In both, choose "Skip for now" on the setup guide. Since slice 2 the web server refuses to
start with no access gate, which is why the web line sets `LUMAKEYS_TRUST_UPSTREAM_AUTH=1`
(use it on loopback only).

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| B1 | WF-015, WF-009, WF-018, PH-MUS-014 | Needs a build with slice 18 (`db86adc`): the post-merge Linux build has it (the older package under `/tmp` predates it). Speakers at a normal level, a **fresh** throwaway profile (no saved audio settings). Desktop app, Free Play, press Z, X, C **without touching any slider**. Then Library, upload any `.mid`, Play mode, Start With Metronome, Space, listen for 5 s. Then Settings, Audio: read Master Volume, Reverb and Metronome Volume. Move Master Volume one step left and back, and do the same for Reverb and Metronome Volume; Free Play again, press Z, X, C. Repeat the first part in the web app at `http://127.0.0.1:3998` | The piano and the metronome are audible without touching a slider, and Settings, Audio reads **80, 20 and 65** (master, reverb, metronome). Moving the sliders and back changes nothing you can hear. Before the fix the first notes were close to silent, about 60 dB down ([PH-MUS-014](findings/PH-MUS-014.md), slice 18). Write whether the first and second sets sound the same | | |
| B2 | WF-016, WF-019, PH-MUS-015 | Soundboard, press several keys quickly. Then Settings, Audio, Instrument Flute, "Install Better Sounds"; Free Play, hold C, D, E for a second each and release; Settings, "Use Built-in Sounds", and repeat | Soundboard sounds are clean. The pack's notes stop abruptly on release while the built-in Flute fades ([PH-MUS-015](findings/PH-MUS-015.md)); slice 6 (`c7216e2`, merged 2026-11-02) fixed that, so this is now the speaker check and the finding stays `fixed` until you hear the pack release naturally. Write whether the pack sounds better apart from that | | |
| B3 | RT-009, PH-UI-003 | `gsettings set org.gnome.desktop.interface enable-animations false`. Then quit and restart the desktop app, and open the web app in a **new** tab of a throwaway Chrome (`google-chrome --user-data-dir=$(mktemp -d) http://127.0.0.1:3998`). In each, look at the main menu and Free Play. Afterwards `gsettings set org.gnome.desktop.interface enable-animations true` | No video on the main menu; the Free Play background is still until a key is pressed, and pressed keys light up. A running app or a reloaded tab keeps the old setting, so restart or open a new tab. The agent proved this on X11; this checks your real GNOME session | | |
| B4 | L-11-015 | Desktop app on the main menu: open the system monitor, note the app's CPU, minimise it for 30 s, note the CPU again, restore | CPU drops while minimised and the video resumes. Record the two numbers (the agent's software-rendered numbers are not representative) | | |
| B5 | RT-010, PH-UI-015, PH-UI-016 (needs another person) | Needs a person with a colour-vision deficiency, or a colleague with a calibrated display. Web app: upload `scripts/audit/fixtures/midi/pmus-16.mid`, play it in Play mode missing some notes on purpose, once with Settings, Visual, Colour-blind mode off and once on, then read the results screen. Can they tell a missed note from an upcoming right-hand note, and a good hit from an upcoming left-hand note, without the MISS popup? Is the grade letter legible? | Today: in colour-blind mode a missed note and a pending right-hand note are the same pink-red; a low grade letter is barely visible against its badge. Record their answers. Slice 16 (`2d6593d`, merged 2026-11-02) fixed PH-UI-015 and PH-UI-016; they stay `fixed` until this sitting, so expect the missed note and the pending note to read differently now | | |
| B6 | PH-DATA-004, PH-DATA-007 (optional) | Only if your normal Chrome profile installed an instrument pack, or saved a library filter preset, before the LumaKeys rename. Needs your deployment rebuilt from `main` at `8d73767` or later (after the access token is set, A1). Open it in that profile: Settings, Audio, read the pack status; Library, look for your saved filter presets; F12, Application, IndexedDB and Local Storage | Expected after slice 15: the pack shows installed and your presets are listed; `pianohero-instrument-sample-packs` is gone from IndexedDB and `pianohero-filter-presets` from Local Storage (the carry-over copies, then deletes). Before the fix the pack showed "not installed". Skip if you never installed one on the old build | | |
| B7 | WF-023, MOD-012, PH-OPS-003, PH-MUS-018 | Slice 3. `P=$(newp); run "$P"`. Choose "Skip for now", upload any `.mid` in Library, Play mode, press Space and listen, then play it for a few seconds. Settings, Gameplay, change one setting (for example Count-in Before Start), quit, `run "$P"` again, read the setting back | The packaged app (Electron 44.9.2) launches, shows the main menu with the moving background, plays the song with sound, and the setting reads back after the relaunch ([PH-OPS-003](findings/PH-OPS-003.md)). After the 3-2-1 you hear two more count-in beats before the song ([PH-MUS-018](findings/PH-MUS-018.md), verified by the agent; this is a listen, not an owed proof) | | |
| B8 | MOD-014, OP-013, PH-SEC-005 | Slice 3, the same profile. Soundboard, Show Credits, click a source link that starts with `https://`. Then click one that starts with `local://` | The page opens in your system browser and no LumaKeys window appears; the LumaKeys window stays on the Soundboard. A `local://` link opens nothing; that is a known lead (24 of 61 credit links), not a failure of this row ([PH-SEC-005](findings/PH-SEC-005.md)) | | |
| B9 | DATA-017, MOD-008, PH-OPS-003 | Slice 3. Only if you have a normal LumaKeys profile from the older build: `P=$(newp); cp -a ~/.config/lumakeys "$P/.config/lumakeys"` (a copy; never launch the new build on the real folder), then `run "$P"`. Skip it if you have none; B10 covers an old library | The app opens with your songs, results, settings and installed packs, shows no dialog, and an installed pack plays | | |
| B10 | DATA-017, OP-015, PH-DATA-005, PH-DATA-006 | Slice 1, a carried-over library. `P=$(newp); cp -a ~/.config/PianoHero "$P/.config/luma-keys"` (your old data copy; any folder holding a `pianohero.db` will do, and it is only copied), then `run "$P"`. Open Library, quit. `ls "$P/.config/luma-keys" "$P/.config/lumakeys"` | No dialog; the library shows the old songs and results; `lumakeys.db` is in `$P/.config/lumakeys`; `luma-keys` no longer holds `pianohero.db`; nothing was deleted ([PH-DATA-005](findings/PH-DATA-005.md)) | | |
| B11 | OP-015, PH-DATA-005 | Slice 1, the question dialog. `P=$(newp); run "$P"`, skip the guide, upload one `.mid`, quit. Then `cp -a ~/.config/PianoHero "$P/.config/luma-keys"` and `run "$P"`. First press Quit (or Enter or Escape, which also quit); run it again and press "Keep current library"; run it a third time | A question dialog titled "Earlier library found" names both folders and offers "Use earlier library", "Keep current library" and "Quit", with Quit as the default. Quit leaves everything as it was. "Keep current library" opens your one uploaded song. The third launch asks nothing | | |
| B12 | OP-015, PH-DATA-005 | Slice 1, the other answer. A new profile set up as in B11 (one uploaded song, then the old data copied into `luma-keys`); this time press "Use earlier library" | The old songs and results appear; your one-song library is kept in a `before-legacy-migration-<time>` folder inside `$P/.config/lumakeys`; the next launch asks nothing | | |
| B13 | OP-015, PH-OPS-006 | Slice 1, the error dialog. `P=$(newp); mkdir -p "$P/.config/luma-keys" "$P/.config/piano-hero"; cp ~/.config/PianoHero/pianohero.db "$P/.config/luma-keys/"; cp ~/.config/PianoHero/pianohero.db "$P/.config/piano-hero/"; sha256sum "$P"/.config/*/pianohero.db`, then `run "$P"; echo exit=$?`. Press OK. Repeat the `sha256sum` and `ls "$P/.config/lumakeys"` | A dialog titled "LumaKeys could not start" names both folders and says nothing was moved; no main window appears. After OK the app exits with `exit=1`, both folders and their hashes are unchanged, and no `lumakeys.db` is created ([PH-OPS-006](findings/PH-OPS-006.md)) | | |
| B14 | OP-015, PH-OPS-006 | Slice 1, the single-instance lock. With the app from B7 still open on `$P`, run `run "$P"` again in a second terminal; repeat with the first window minimised | No second window opens and the second process exits; the first window comes to the front, restored if it was minimised. This is the real lock, which the agent's harness stubs | | |
| B15 | WF-004, WF-005, WF-020, PH-UI-021 | The fix for the Electron 43 dialog change. In the desktop app: Library, Upload MIDI, pick a `.mid` from a folder that is not Downloads (for example `~/Documents`); open Upload MIDI again; then Export Library twice, saving the first one into a folder that is not Downloads. Quit, start again on the same profile, open Upload MIDI | The second Upload MIDI opens in the folder you picked from; the second Export Library opens in the folder you saved to, with the file name filled in. After the restart, Upload MIDI opens in the system's default folder again (folders are kept only while the app runs). The agent proved what the app passes to the dialog ([PH-UI-021](findings/PH-UI-021.md), `d5507a6`); this checks what your desktop's file dialog does with it. If it still opens in Downloads, write down your desktop environment: the GNOME portal may ignore the folder (see the finding's residual risk) | | |

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

Sitting 2 below, on the new Windows build from `main` at `93ac583` (its first paragraph
gives the path and SHA-256).

### F. GitHub, after you push (~10 min)

Slice 0 added `.github/workflows/verify.yml`. It runs on pushes to `main` and on pull
requests. The agent ran the same steps in a clean copy on this machine; GitHub is
unreachable from here and nothing is pushed yet, so only you can show the hosted runs.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| F1 | MOD-012, PH-OPS-005 | Push `main`. On GitHub, open the repository's Actions tab and the latest `verify` run | A green run: `npm ci`, `npm run verify` (typecheck, server typecheck, tests, both builds, the asset assertion), then the coverage recount | | |
| F2 | MOD-012, PH-OPS-005 | Make a throwaway branch, change one expectation in any test so it fails, push it, open a pull request from it, and watch the `verify` run. Afterwards close the pull request and delete the branch | The run goes red at the test step, and the builds do not run. A branch pushed without a pull request does not start the workflow | | |

`package:win` needs no separate step: it runs the asset assertion before electron-builder
([PH-PAR-001](findings/PH-PAR-001.md)). The new sitting 2 exe went through the same steps,
and the assertion passed (647 public files in `out/renderer`).

### G. Housekeeping, and one run outside the sandbox (~10 min)

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| G1 | MOD-012, PH-OPS-003 | The main checkout's installed `node_modules` still holds Electron 30.5.1 and better-sqlite3 12.8.0. Before `npm run dev` or a desktop build there: `cd /media/storage/LumaKeys && npm ci`. It needs Python 3, `make`, a C++ compiler and access to nodejs.org, because better-sqlite3 13 runs node-gyp at install; without them use `npm ci --ignore-scripts` and then `node scripts/postinstall.cjs` (`BUILD_PORTABLE.md`). Then `node_modules/.bin/electron --version` | `npm ci` exits 0 and Electron prints `v44.9.2`. `npm run dev` opens your normal profile, so use `XDG_CONFIG_HOME=$(mktemp -d) npm run dev` for anything that is a test | pass | Owner ran `npm ci` in the main checkout, 2026-10-21; the postinstall printed "better-sqlite3 is ready for electron". The agent then read Electron 44.9.2 and better-sqlite3 13.0.3 from `node_modules` (it loads in the host's Node 24.15.0); both typechecks pass; vitest 73 files, 471 tests pass. npm's deprecation and advisory warnings: plan lead (k). **Run `npm ci` in the main checkout once more**: `93ac583` changed the lockfile (hono 4.13.13; `electron-rebuild` and its dependencies gone, 700 entries down to 578), and the installed `node_modules` still has the old set |
| G2 | OP-015, PH-DATA-005, PH-DATA-006, PH-OPS-006 | The packaged binary with the real single-instance lock, which the agent sandbox blocks (`process_singleton_posix.cc: socket() failed: Operation not permitted`). Either allow the agent to run `node scripts/audit/electron-userdata-probe.mjs --packaged` against the post-merge build outside the sandbox (`/sandbox`), or treat B10 to B14, which run the same binary and lock on your display, as covering it | Case P1 shows the legacy song count in `lumakeys/lumakeys.db` and no `pianohero.db` left in the earlier folder; the two-profile case exits with code 1. If B10 to B14 pass, record "covered by B10 to B14" here | | |

## Sitting 0: Host terminal on this machine — done (agent)

Run by the agent on 2026-10-20 with the image `lumakeys-audit:p11`, built from the working
tree under a separate tag, and throwaway containers on `127.0.0.1`. The running container
and its image were not touched. Item 4 continues as A1.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | OP-017, WF-025, MOD-012, BASE-11-001 | `docker run --rm "$IMG" npx vitest run src/server/museScore.integration.test.ts` | 1 test passed (the integration test that is skipped outside Docker) | pass (agent) | 1 passed, 3.4 s |
| 2 | PH-SEC-004, WF-023 | Two parallel uploads of `meter-tempo.mscz` to a throwaway container, `docker restart`, then `getAllSongs` | One upload imports the score; the other says "Another MuseScore score is being converted". After the restart, `getAllSongs` still lists the imported song | pass (agent) | `score2` imported, `score1` got the busy message; after the restart the song is listed and its MIDI (446 bytes) is served. Slice 13 (`5e1e67f`, merged 2026-11-02) fixed PH-SEC-004; it stays `fixed` until the parallel upload is rerun against the new build in Docker |
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
| 1 | WF-026, RT-012, BR-067, PH-PAR-001 | Desktop app: (a) watch the main-menu background for 5 s. (b) Settings (Audio opens first), set Instrument to Flute, press "Install Better Sounds". (c) Guided Lessons, open the Novice tier capstone (Ode to Joy), press Space, then Escape and Back to Learn Hub. On a fresh profile the capstone is locked until the six Novice lessons are complete | (a) The neon background moves (video), not a still image. (b) "Flute Enhanced Pack ready." appears. (c) The capstone loads in the packaged app and notes fall | pass (agent) | Video played 5.3 s in 5 s; pack ready; capstone unlocked through settings, started on Space, scored on 8 presses. Slice 12 (`571571b`, merged 2026-11-02) fixed PH-MUS-013; it stays `fixed` until the lead's Electron learning driver run and your capstone sitting on a real MIDI keyboard |
| 2 | RT-006, PH-UI-002, PH-UI-012 | Chrome at the web app: zoom to 125, 150, 175 and 200 percent (Ctrl and +). At each: open Settings and click every tab. At 150 and 175: open Free Play, press Tab once to expand the top HUD, click SETTINGS, then go back and click PROGRESS. Repeat in the desktop app, which zooms with Ctrl, Shift and + | Every Settings tab opens at every zoom. Today: at 150 and 175 percent the instrument controls sit over SETTINGS | pass for Settings; HUD fails as expected (agent) | Chrome: SETTINGS covered at 150 and 175 %. Desktop (steps 110 to 207 %): SETTINGS covered at 158 and 173 %, PROGRESS too at 189 %. New: Ctrl+0 does not reset the zoom ([PH-UI-019](findings/PH-UI-019.md)) Slice 11 (`1b95e9a`, merged 2026-11-02) fixed PH-UI-012; it stays `fixed` until you repeat this at real zoom in Edge and Firefox |
| 3 | RT-009, RT-012, WF-026, PH-UI-003 | Turn the OS setting on, then restart the desktop app and open the web app in a new tab (a reload keeps the old value). Main menu and Free Play in each. Turn it off again | Under the setting the main menu does not play the video, and the Free Play background does not animate while no key is pressed; pressed keys still light up. With it off, the video and animation come back | pass on X11 (agent) | Set through GTK and XSETTINGS: no video, 0 frames per second idle, keys still draw; off: video, 30 to 40 frames per second. GNOME continues as B3 |
| 4 | WF-026, RT-012, L-11-015 | Desktop app on the main menu: note the CPU, minimise for 30 s, note it again, restore | CPU drops while minimised and the video resumes on restore | pass (agent) | 183.7 % (software rendering) to 0.2 %; video paused while minimised, resumed on restore. Real numbers continue as B4 |
| 5 | WF-015, WF-016, WF-013, WF-009 | (a) Free Play, press Z, X, C. (b) Soundboard, press several keys quickly. (c) Interval Trainer, answer two questions by ear. (d) Free Play, Menu, Load Track, pick any `.mp3` or `.wav`, press Play | (a) A piano sound per key. (b) The Soundboard opens on Classic; its sounds do not stack into a long overlap. (c) Two distinct notes per question. (d) The track plays | pass (agent) | All four recorded; the Interval Trainer played each interval correctly and judged every answer correctly. New: on a fresh profile everything plays about 60 dB too quietly until a volume slider is moved ([PH-MUS-014](findings/PH-MUS-014.md)) |
| 6 | WF-019, PH-PAR-006 | Desktop: Free Play C, D, E with the pack, then "Use Built-in Sounds" and again. Web: install the Flute pack, Free Play C, D, E | Desktop: the pack sounds different. Web: today it sounds like the built-in Flute (PH-PAR-006) | as expected (agent) | Web: "Failed to load custom sampler". New: the desktop pack cuts notes off 0.1 s after release ([PH-MUS-015](findings/PH-MUS-015.md)). Slice 6 (`c7216e2`, merged 2026-11-02) fixed PH-PAR-006 and PH-MUS-015; both stay `fixed` until the PulseAudio driver item 6 (lead) and your speaker check of this item |
| 7 | PH-MUS-006 | Start With Metronome, Tempo 50 percent, Space, listen for 10 s | Today: one click every second beat | as expected (agent) | Clicks every 2.00 s against a 1.00 s beat; correct at 100 %. Slice 9 (`6f327c9`, merged 2026-11-02) fixed PH-MUS-006 and PH-MUS-008; both stay `fixed` until the lead reruns the browser metronome driver after `1a77e90`; listening by ear here is optional |
| 8 | PH-PAR-007 | Fresh Chrome profile at the web app; leave the MIDI prompt for 30 s, then Block | Today: "Loading services..." stays for the whole 30 s and the app starts only after Block | as expected (agent) | Shown at every 5 s mark to 30 s; the app started 44 ms after Block Slice 7 (`8fc933f`, merged 2026-11-02) fixed PH-PAR-007; it stays `fixed` until you repeat this check on a fresh Chrome profile with the prompt left unanswered for 30 s |
| 9 | PH-DATA-004 (optional) | See B6 | | n/a | Needs your own Chrome profile; continues as B6 |
| 10 | RT-010, PH-UI-015, PH-UI-016 | See B5 | | n/a | Needs a person; continues as B5. Slice 16 (`2d6593d`, merged 2026-11-02) fixed PH-UI-015 and PH-UI-016; they stay `fixed` until your colour-vision sitting |

## Sitting 2: Windows machine (~25 min) — ready

**Use the new Windows build for every item.** The agent cross-built it on 2026-10-21 from
`main` at `93ac583`, which holds all of wave 1 and its three follow-ups, in a clean copy
(`git archive`, `npm ci` on Node 22.23.3). As you allowed (decision 11), only the
electron-builder step ran outside the sandbox; no workaround was needed.

- Path on this machine: `~/LumaKeys-builds/p11-win2/LumaKeys-0.1.0-portable.exe` (copied out of `/tmp` on 2026-11-02; same SHA-256). Built from `93ac583`, so it reports `0.1.0`; the code matches `0.2.0`.
  It is gone after a reboot, so copy it somewhere permanent first. If it is gone, ask the
  agent to rebuild it.
- Size 179,720,909 bytes; SHA-256
  `d27c97a501450f48043c235d62f2157df1b118a7864d2454246a3c82ae0cfa70`. On Windows, check it
  with `certutil -hashfile LumaKeys-0.1.0-portable.exe SHA256`.
- Electron 44.9.2. It packs better-sqlite3's own win32-x64 N-API binary (SHA-256
  `e21e5efd…8d240a`, identical to the npm package's), which has not yet been loaded on
  Windows: item 2 is its first run.
- It is unsigned and has no embedded version details (built without wine), so Windows
  SmartScreen warns on first launch: More info, Run anyway.

The earlier exe (SHA-256 `bbe3604b…f6f372`, built from `4466626` before slices 1 and 3, at
`/tmp/claude-1000/p11/PF/winbuild/src/dist/`) is superseded. Keep it only if you want a
"before" run for items 1 and 6. The executable in the main checkout's `dist/win-unpacked`,
dated 2026-08-07, is stale and still uses the old names, so do not use it.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | DATA-017, PH-DATA-005, PH-DATA-007 | Needs the new build. Before launching anything: `dir "%APPDATA%\piano-hero" "%APPDATA%\luma-keys" "%APPDATA%\PianoHero" "%APPDATA%\lumakeys"`. If `luma-keys` or `piano-hero` exists, back it up: `robocopy "%APPDATA%\luma-keys" "%USERPROFILE%\lumakeys-profile-backup" /E` (same for `piano-hero`). Launch the new exe, open the library, close the app, run the `dir` again | After slice 1: the library opens with your old songs, results, streak and settings, and an installed pack still plays; `%APPDATA%\lumakeys\lumakeys.db` now holds them and `%APPDATA%\luma-keys\pianohero.db` has moved there (the folder is not deleted). If `%APPDATA%\lumakeys` already held a library with songs, a question dialog "Earlier library found" appears instead and Quit is its default. Saved library filter presets are listed (PH-DATA-007). If no old folder exists, write "no pre-rename profile". Before the fix (the kept exe) the library is empty and `luma-keys\pianohero.db` is unchanged | | |
| 2 | WF-023, RT-001, WF-026 | Launch the exe again; watch the main-menu background for 5 s; close the app | The main menu renders, the background moves, the app closes cleanly | | |
| 3 | WF-001 | Reopen the setup guide from the main-menu card, set a 20-minute reminder and Large hands, Start Practice, restart the app, open Settings | The reminder and hand size are kept | | |
| 4 | WF-004, PH-UI-021 | Import one `.mid` from a folder that is not Downloads (for example Documents); start it. Note which folder the file dialog opens in, then open it again and note the folder again. Close the app, start it again and open the dialog a third time | The song appears in the library and starts. The second time, the dialog opens in the folder you picked from; after the restart it opens in Windows' default folder again, because the app remembers folders only while it runs ([PH-UI-021](findings/PH-UI-021.md), fixed in `d5507a6`). Write down all three folders | | |
| 5 | WF-019 | Settings, Audio, Instrument Flute, "Install Better Sounds"; Free Play, press a few keys. If item 1 carried over a profile that already had a pack installed, check that pack too | "Flute Enhanced Pack ready." and the Flute plays. This is the first run of the pack's `file:///C:/…` path. After slice 1 the desktop builds the pack address from the current profile (`%APPDATA%\lumakeys\instrument-sample-packs`) on every read, so a pack carried over from `luma-keys` plays too | | |
| 6 | OP-015, PH-OPS-006 | Do this last, on the new build, in a **throwaway Windows user account**, not your own, so your real profile is never renamed or overwritten. Create a local account (Settings, Accounts, Other users, Add account, "I don't have this person's sign-in information", "Add a user without a Microsoft account"), sign in to it, and copy the exe there. Before launching the portable build, make sure the profile has two earlier profile folders, for example `%APPDATA%\luma-keys` and `%APPDATA%\piano-hero`, each holding a `pianohero.db` (and no `%APPDATA%\lumakeys`). A copy of the `pianohero.db` from your item 1 backup works for both. Launch LumaKeys. Afterwards, delete the throwaway account | Expected: a "LumaKeys could not start" dialog names both folders and says nothing was moved, and the app exits after OK. Both folders are unchanged. Before slice 1 (the kept exe) there is no window and no message while a LumaKeys process keeps running | | |
| 7 | DATA-017, PH-DATA-006 | After item 1 and after item 2, with the app closed, wait 5 s and run `dir /a "%APPDATA%\lumakeys"`. Watch whether Windows deletes the sidecars on close | Neither `lumakeys.db-wal` nor `lumakeys.db-shm` is left once the app has closed. Write down if either remains, and whether it is gone after a minute (the migration refuses to move a library while its sidecar files are left) | | |
| 8 | MOD-014, OP-013, PH-SEC-005 | Needs the new build. Soundboard, Show Credits, click a source link that starts with `https://` | The page opens in your default browser and no LumaKeys window appears | | |
| 9 | OP-015, PH-OPS-006 | Needs the new build. With LumaKeys running, start the exe a second time | No second window; the first window comes to the front (restored if minimised) | | |

## Sitting 3: Edge and Firefox — done (agent)

Run by the agent on 2026-10-20 with Edge 155 and Firefox 142 on `Xvfb`, against a
throwaway web server. Edge's own zoom continues as D1.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | RT-002 | In Edge, then Firefox: Library, upload any `.mid`, start it | The game canvas renders in both | pass (agent) | The canvas animates in both |
| 2 | RT-006, PH-UI-002, PH-UI-012 | In both: zoom to 150 and 200 percent, click every Settings tab; at 150 percent open Free Play, press Tab once, click SETTINGS | Every tab opens. Today: the HUD collision at 150 percent | pass for Settings; HUD fails as expected (agent) | Edge and Firefox emulated, Firefox also with its own zoom. Real clicks on SETTINGS at 150 % do not open it Slice 11 (`1b95e9a`, merged 2026-11-02) fixed PH-UI-012; it stays `fixed` until your real-zoom check in Edge and Firefox |
| 3 | RT-008, PH-UI-010, PH-UI-011, PH-UI-013, PH-UI-014, PH-UI-017 | Keyboard only, in both: (a) Progress, Tab through the top bar. (b) Settings, Audio, Calibrate, press Escape. (c) Soundboard: press Escape three times. (d) Free Play: Tab through the page, counting stops you cannot see. (e) Settings, Practice, open Clear Learning Progress, press Escape, then Tab | Today (Chrome and Electron): (a) no visible focus on the top bar; (b) the dialog closes and Settings is left; (c) the third press leaves to the main menu; (d) most stops invisible; (e) focus restarts from the page top | (a) to (d) as expected; (e) does not reproduce (agent) | (d) Edge 72 of 83, Firefox 74 of 85 invisible. (e) Focus returns to the button in Edge and Firefox, but still restarts from the top in real Chrome 151 Slices 11 and 10 (`1b95e9a`, `e1a3bf0`, merged 2026-11-02) fixed PH-UI-011 and PH-UI-014, and PH-UI-010, PH-UI-013 and PH-UI-017; they stay `fixed` until the lead's Electron `keyboard-walk.mjs` run and your pass in Edge and Firefox |
| 4 | WF-002, RT-011 | Firefox: open the app and Settings, Input | A clear message or a permission prompt; the computer keyboard still plays | pass, slow start (agent) | "Loading services..." for 6 to 12 s, then a "cannot access your MIDI keyboard" card with Try MIDI Again; the keyboard plays |
| 5 | BR-008, MOD-009, PH-PAR-002 | In both: Library, "Upload MIDI / MSCZ", press Cancel in the file dialog; then press it again and pick a `.mid` | After Cancel the button returns from "Importing..." within 1 s and is enabled; the second try imports the song | pass (agent) | Real GTK dialog cancelled by Escape; back within 2 to 4 ms; the second pick imports |

## Sitting 4: MIDI keyboard and speakers — done (agent, scripted device)

Run by the agent on 2026-10-20 in the desktop app and the web app with a scripted Web MIDI
device, "Audit Keys 61". The real keyboard continues as C1 to C5.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | WF-002, RT-011 | Plug in the keyboard, open Settings, Input, MIDI Device | The device is listed by name | pass (agent) | "Audit Keys 61" in both |
| 2 | PH-MUS-004 | In Free Play hold a key, unplug the keyboard, plug it back in, play a note | The held note stops on unplug; the keyboard works again without a restart | pass (agent) | Released within 1 ms of the unplug; plays after the replug |
| 3 | PH-MUS-010 | Start any song, play a few notes, unplug the keyboard, plug it back in | Today: the song reloads and starts over each time a device comes or goes | as expected (agent) | Restarts on the unplug and on the replug, in both Slice 5 (`ccc68c2`, merged 2026-11-02) fixed PH-MUS-010 and PH-MUS-011; both stay `fixed` until the lead's Electron run and your check of this item, including listening that the song audio keeps playing after an unplug |
| 4 | WF-009, PH-MUS-001 | Play a song on the keyboard, pause and resume halfway | Notes judged before the pause keep their state | pass (agent) | 16 of 16 perfect; results and stored row agree |
| 5 | WF-009 latency | Play a steady beat at the default latency setting | No lag you would call wrong; note the setting | n/a | Needs a person; continues as C4 |
| 6 | PH-MUS-011 | Select the first keyboard by name, swap it for a second while the app is closed, reopen, play the second | Today: the select shows "Any connected device", while notes from the second keyboard are ignored | as expected (agent) | As expected; the select shows "Any connected device", not blank Slice 5 (`ccc68c2`, merged 2026-11-02) fixed PH-MUS-011 with PH-MUS-010; it stays `fixed` until the lead's Electron run of the Settings card and your check of this item |
| 7 | PH-MUS-002 | `6-8-then-3-4-reached.mid`, Learn, loop measures 3 to 4, play the looped notes twice round | The overlay reads "Looping measures 3-4"; the loop repeats exactly the two 3/4 bars (six notes) | pass (agent) | 12 of 12 perfect in both. New: an early downbeat at the seam is dropped ([PH-MUS-016](findings/PH-MUS-016.md)). The musician's check continues as C5. Slice 4 (`ea89f3e`, merged 2026-11-02) fixed PH-MUS-016 along with PH-MUS-005, PH-MUS-012 and PH-UI-019; they stay `fixed` until the lead reruns the drivers and you repeat item 4 and a Learn-mode loop on a MIDI keyboard |

## Owner Decisions (not tests)

| # | Decision | State |
|---|---|---|
| 1 | PH-MUS-013: what the capstone gate measures | Decided 2026-10-20: capstones run in Play mode at the capstone tempo, and the run's settings are locked |
| 2 | PH-OPS-004: the database in git history | Decided 2026-10-20: accept the risk; no history rewrite. The agent read all six blobs and none holds personal data |
| 3 | Lane H: end date for the legacy-name fallback (suggested 2027-01-31), and whether `CLAUDE.md` and `AGENTS.md` are tracked | Decided 2026-10-20: removal no earlier than 2027-01-31, and only in a release after the carry-over release. `CLAUDE.md` and `AGENTS.md` stay gitignored; what the audit relies on moves into tracked docs (task D1) |
| 4 | Which findings enter remediation | Decided 2026-10-20: waves, owners and branches as in the plan's [Owner Selection](phase-11-remediation-plan-2026-10-20.md#owner-selection-2026-10-20). Nothing starts until you say go |
| 5 | Slice 18 (PH-MUS-014, fresh-profile volume): which wave | Decided 2026-10-21: wave 1, after slice 0. Merged to `main` in `db86adc` the same day; B1 is the speaker check of the fix |
| 6 | PH-MUS-018 (lead-in beats read as 0 on a fresh profile, P3): accept it, and in which slice | Decided 2026-10-21: accepted; fix it now as a wave 1 follow-up ("fix"). Done: merged in `8a0a764`, then `verified` by the agent in the desktop and web builds. See [PH-MUS-018](findings/PH-MUS-018.md) |
| 7 | PH-UI-021 (desktop file dialogs open in Downloads and forget the last folder since Electron 43, P3): accept it, remember the folders in memory or persist them, and in which slice | Decided 2026-10-21: accepted; each dialog remembers the last folder until the app closes (in memory), as a follow-up to slice 3. Done: merged in `d5507a6`; the agent's headless proof passed; B15 and sitting 2 item 4 remain. See [PH-UI-021](findings/PH-UI-021.md) |
| 8 | ADR 0002 items 3, 4, 6 and 7 (a startup line naming the data location, uniform blank-environment handling, the `legacy-brand:` markers, the README upgrade note): must the carry-over release (proposed `0.2.0`) ship them, or do they gate only the removal release (`0.3.0`)? | Decided 2026-11-02: they gate the removal release only. `0.2.0` may ship without them; each must ship in a release before `0.3.0`, and the startup warning (item 3) must be in the current release for a full release cycle before removal. Scheduled as slice 21 (decision 14). See [ADR 0002](../../adr/0002-legacy-pianohero-compatibility-window.md) |
| 9 | ADR 0002 as a whole: confirm it | Decided 2026-11-02: confirmed as written, items 3 to 7 included. The ADR stays `accepted` |
| 10 | Pushing `main`: five unpushed commits recorded a personal author address, so GitHub's email-privacy push protection rejects the push (GH007) | Decided 2026-10-21: keep the protection on and never publish the personal address. The five commits now use the GitHub noreply address, as does this repository's git config; all 78 unpushed commits got new hashes ([lookup table](commit-hash-rewrite-2026-10-21.md)) |
| 11 | A small follow-up to slices 2 and 3: the `Secure` cookie behind the tunnel and the `hono` bump (plan leads (j) and (k)), plus a minimum Node version, the no-op `Dockerfile` line and the dead `npm run rebuild` (leads (b), (f) and (a)); then a new Windows build, cross-built by the agent outside the sandbox | Decided 2026-10-21: do all of it; a redeploy follows the web part. Done: merged in `93ac583` ([PH-SEC-006](findings/PH-SEC-006.md) `fixed`); the Windows build is in sitting 2. Your redeploy and A2 remain |
| 12 | Start wave 2 (plan slices 4 to 11, 19, 20, then 12 after 4) | Decided 2026-11-02: go. Each slice runs in its own worktree with a separate reviewer, as in wave 1 |
| 13 | Cut `0.2.0`, the ADR 0002 carry-over release | Decided 2026-11-02: cut at `1180731`. Version bump `6ef1ec1` on `main`, local branch `release/0.2`. The `v0.2.0` tag waits for the release gate (slices 1 and 15 verified in both runtimes: sittings 1 and 2) |
| 14 | Schedule ADR 0002 items 3, 4, 6 and 7 | Decided 2026-11-02: add them as plan slice 21 in wave 2 |
| 15 | Start the deferred wave (plan slices 13, 14, 16 and 17, all P3) and triage the open `npm audit` advisories | Decided 2026-11-02: go, as wave 3. Each slice runs in its own worktree with a separate reviewer, as in waves 1 and 2 |
| 16 | Name the song in the library-restore error (PH-DATA-003), and find out why beats per minute come out very strange | Decided 2026-11-02: the restore error names the song by title (id as fallback) and keeps the retry path, added to wave 3 slice 13, which merged 2026-11-02 (`5e1e67f`, `fixed`); owed from you: restore a tampered backup in the UI and read the message. The BPM report became PH-MUS-019; slice 22 (`c170bc3`, merged 2026-11-02) made it `fixed`; owed from you: an ear check of the count-in on a fast song and on a 6/8 song. The strange numbers you saw on the cards were also a display bug, PH-UI-022 (the duration, difficulty and BPM ran together after `775924d`); slice 25 (`35063cb`, merged 2026-11-03) made it `fixed`; owed from you: a glance at the Library and recommendation cards after updating |

## Moved To The Agent (headless Electron)

These were owner items. They need the desktop app but no person, so the agent ran them
with `scripts/audit/electron/` on 2026-10-20. The
[Electron runtime report](phase-11-electron-runtime-2026-10-20.md#agent-items-a1-to-a4)
has the detail.

| # | Coverage row / finding | Check | Came from | Result |
|---|---|---|---|---|
| A1 | WF-008, WF-009, PH-MUS-001, PH-MUS-003 | Tempo change keeps judged notes; a structural change asks first; a fingering set inside a loop binds to the right note through IPC | lane C proposed item 8 | done: same values as the web; PH-MUS-001 and PH-MUS-003 stay fixed |
| A2 | WF-007, PH-UI-006 | Library UI: move ticked songs into a folder, relaunch, still there; bulk delete removes them with no confirmation | lane F library item 9 | done: the move survives a relaunch; PH-UI-006 reproduces with no prompt at any layer. Slice 8 (`c1a1fbf`, merged 2026-11-02) fixed PH-UI-006 and PH-DATA-010; both stay `fixed` until your keyboard-only and screen-reader read of the delete prompt and the new Delete User Data wording. The lead's `library-one-hand.mjs` A2/A3 rerun on a main build (`d393474`) passed on 2026-11-02: done (agent) |
| A3 | WF-008 | One-hand session from the overlay, six judged notes, hand assignment kept across relaunch and hand choice reset | lane F library item 10 | done: 6 judged notes and 0 misses; the assignment survives a relaunch and the hand choice resets |
| A4 | RT-008, PH-UI-010, PH-UI-011, PH-UI-013, PH-UI-014, PH-UI-017 | Sitting 3 item 3's keyboard walk in Electron | lane E proposed item 3 | done: all five web results hold on the desktop; Edge and Firefox stay in sitting 3 Slices 11 and 10 (`1b95e9a`, `e1a3bf0`, merged 2026-11-02) fixed these findings and PH-UI-020; the Electron `keyboard-walk.mjs` parts a to f passed on a main build (`d393474`) on 2026-11-02: done (agent). PH-UI-020's own proof is the web recovery driver `proof-ph-arch-001-recovery.mjs`, which passed 83 of 83 on the same build |

Proof runs, 2026-10-21. These were owed by `fixed` findings and by the sitting 0 residual.
They need no person, so the agent ran them with throwaway profiles. The
[agent proofs report](phase-11-agent-proofs-2026-10-21.md) has the detail.

| # | Coverage row / finding | Check | Came from | Result |
|---|---|---|---|---|
| P1 | PH-PAR-003, DATA-002 | Hash-mismatched, unreadable, missing and no-source legacy rows leave no playable row, desktop and web | plan, proof owed | done: pass; PH-PAR-003 verified |
| P2 | OP-017, MOD-013 | The MuseScore 45 s timeout, 30 s CPU limit and 10 MB output limit, through real uploads | sitting 0 residual | done: all three fired, clean error, no child or temp dir; residual closed |
| P3 | PH-ARCH-001, WF-009 | A forced load failure in Edge, Firefox and Chromium | plan, proof owed | done: 78 of 78 checks in each; PH-ARCH-001 stays fixed (slice 0 test still owed); raised PH-UI-020 |
| P4 | PH-ARCH-002, WF-018 | A forced setting-write failure in Electron, by IPC override and by SQLite trigger | plan, proof owed | done: 19 of 19 checks each; PH-ARCH-002 verified |
| P5 | PH-MUS-003, WF-008 | Fingering save and re-open while hand and track controls vary, and a backup round trip | plan, proof owed | done: 24 of 24 checks; PH-MUS-003 verified; raised PH-MUS-017; PH-MUS-017 is `fixed` since slice 20 (`c03f220`, merged 2026-11-02), owing the web-bridge Ignore to Left Hand sequence |
| P6 | PH-DATA-002, OP-009 | The reset confirmation copy against what reset removes, on both runtimes | plan, proof owed | done: packs removed on both; PH-DATA-002 verified; raised PH-DATA-010 |
| P7 | PH-DATA-001, OP-005, OP-007, OP-009 | Forced filesystem failure during restore, delete and reset through the UI, with a safe retry | plan, proof owed | done: failed; rollback holds, the wording and the reset retry do not; PH-DATA-001 reopened at P2; slice 19 (`c8f9b1a`, merged 2026-11-02) made PH-DATA-001 `fixed`, owing a real unwritable profile on Windows and macOS |

## Returned To The Agent

- 2026-10-21: the agent ran the proof each `fixed` finding still owed on this host and the
  OP-017 limits residual, as P1 to P7 above
  ([report](phase-11-agent-proofs-2026-10-21.md)). Nothing in them needs the owner. A
  Windows `.exe` cross-build ran too and is held pending the owner's decision.
- 2026-10-21: after the wave 1 merges the agent staged A2 to A4 and F1 and F2, and
  re-staged A1 and B1. Two proofs for PH-MUS-014 stay with the agent and are not on your
  list: `sitting1-audio-desktop.mjs` with `VOLUMES=fresh` and `sitting1-audio-web.mjs`
  need a PulseAudio null sink, which this session's sandbox blocks, so they run outside
  it. B1 is the human half.
- 2026-10-21, later: after the second half of wave 1 the agent staged B7 to B15, G1 and G2,
  updated B6, and re-staged sitting 2 for a new build. Left with the agent, not on your
  list: the packaged `--packaged` userdata run,
  which needs the sandbox off (G2).
- 2026-11-02: wave 2 slices 6, 4 and 9 merged to `main` (`c7216e2`, `ea89f3e`, `6f327c9`), moving PH-PAR-006, PH-MUS-007, PH-MUS-015, PH-MUS-005, PH-MUS-012, PH-MUS-016, PH-UI-019, PH-MUS-006 and PH-MUS-008 to `fixed`. The driver reruns stay with the agent (PulseAudio item 6, the input and metronome drivers); owed from you: the speaker checks (sitting 1 items 5 and 6, B2), sitting 4 item 4 with a Learn-mode loop on a MIDI keyboard, and optionally sitting 1 item 7 by ear.
- 2026-11-02, later: wave 2 slices 5, 20, 19 and 7 merged to `main` (`ccc68c2`, `c03f220`, `c8f9b1a`, `8fc933f`), moving PH-MUS-010, PH-MUS-011, PH-MUS-017, PH-DATA-001 and PH-PAR-007 to `fixed`. The lead keeps the Electron run of the game path and Settings MIDI card and the web-bridge Ignore to Left Hand sequence; owed from you: sitting 4 items 3 (listen that the song audio keeps playing after an unplug) and 6, a real unwritable profile on Windows and macOS, and sitting 1 item 8 on a fresh Chrome profile with the prompt left unanswered for 30 s.
- 2026-11-02, later still: wave 2 slices 21, 12 and 8 merged to `main` (`cb8926e`, `571571b`, `c1a1fbf`), moving PH-MUS-013, PH-UI-018, PH-DATA-009, PH-UI-006 and PH-DATA-010 to `fixed` (slice 21, the ADR 0002 window items, has no finding rows). The lead keeps the Electron userdata probe rerun on a main build, the Electron learning driver run and the `library-one-hand.mjs` A2/A3 rerun; owed from you: sitting 1 capstone on a real MIDI keyboard, and a keyboard-only and screen-reader read of the delete prompt and the new Delete User Data wording.
- 2026-11-02, later again: wave 2 slices 11 and 10 merged to `main` (`1b95e9a`, `e1a3bf0`), moving PH-UI-011, PH-UI-012, PH-UI-014, PH-UI-010, PH-UI-013, PH-UI-017 and PH-UI-020 to `fixed`. The lead keeps the Electron `keyboard-walk.mjs` parts (a) and (d) (slice 11) and (b), (c) and (e) (slice 10), all since passed on a main build (PH-UI-020 is covered by the web recovery driver instead); owed from you: approval of the boxed top-bar look, real-zoom sittings 1 and 3 in Edge and Firefox, sitting 3 item 3 in Edge and Firefox, and a screen-reader pass over the popouts and the error panel.
- 2026-11-02, after wave 2: the lead ran the agent-runnable driver proofs on a main build at `d393474` (A2/A3 `library-one-hand.mjs`, `keyboard-walk.mjs` a to f, `lesson-pass.mjs`, the slice 21 userdata probe, the input, paused-input, MIDI-device, metronome and fingering drivers). All passed; results are in each finding's Resolution. Not run: real-Chrome Ctrl+0 for PH-UI-019 and `sitting1-audio-desktop.mjs` item 6 (no PulseAudio server). The owner items above are unchanged.
- 2026-11-02, latest: wave 3 slices 23, 14, 16, 13, 24, 17 and 22 merged to `main` (`fde3104`, `05dd7aa`, `2d6593d`, `5e1e67f`, `5336959`, `750bb42`, `c170bc3`), moving PH-DATA-008, PH-ARCH-003, PH-UI-015, PH-UI-016, PH-PAR-004, PH-UI-009, PH-ARCH-004, PH-SEC-004, PH-UI-005, PH-UI-007, PH-UI-008, PH-MUS-009, PH-PAR-005, PH-PAR-008 and PH-MUS-019 to `fixed` (slice 23, the lockfile, has no finding rows). The lead's driver reruns passed on a main build at `c170bc3` on 2026-11-02 (see the next line); owed from you: the colour-vision sitting (B5, sitting 1 item 10), a parallel `.mscz` upload in Docker (sitting 0 item 2), a tampered-backup restore message in the UI, a status-line glance for PH-UI-009, PH-UI-008 with the keyboard and a screen reader, PH-UI-005 on a desktop trouble spot, and the count-in ear check on a fast song and a 6/8 song.
- 2026-11-02, after wave 3: the lead ran the agent-runnable driver proofs on a main build at `c170bc3` (web `keyboard-remap-persistence.mjs`, Electron `workflows.mjs` settings "off" and WF-004, web WF-004, `color-state-evidence.mjs` with `short-4-notes`, `grade-badge-contrast.mjs`, `mscz-upload-no-musescore.mjs`, the web reattach driver, `library-date-filter-timezone.mjs`, `library-organize-bulk.mjs`, `freeplay-recording-export.mjs`, `metronome-and-quiz.mjs`). All passed; results are in each finding's Resolution. Not run: the Electron results-screen screenshot for PH-UI-016 and a count-in driver for PH-MUS-019 (none exists). The owner items above are unchanged.
- 2026-11-03: slice 25 merged to `main` (`35063cb`), moving PH-UI-022 (new, raised from your report of 2026-11-02 that the beats per minute "come out very strange") to `fixed`. The stored BPM values were correct; the shared row containers had lost `display: flex`, so a Library card read "1:31100 BPM". The lead's before and after web screenshots (1280x800 and 420x800) show the Library, recommendation, playlist and game-menu rows fixed; owed from you: a glance at the Library and recommendation cards in your own install after updating, and the Electron build (not screenshotted).
- 2026-11-04: main (`53098f0`) pushed and your Docker install rebuilt from it; you confirmed the Library and recommendation cards are fixed on the web. PH-UI-022 stays `fixed` until the Electron build is checked.
- Date the batch was run: sittings 0, 1, 3 and 4 by the agent on 2026-10-20; A to G not yet.
- Items the agent re-staged: sitting 1 item 1 (the capstone is locked on a fresh profile;
  the pause overlay's way out is "Back to Learn Hub"), item 3 (a reload does not pick up
  the OS setting), item 5 (the Soundboard opens on Classic), and sitting 4 item 6 (the
  select shows "Any connected device", not blank).
