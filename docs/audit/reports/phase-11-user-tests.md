# User Test Batch: Phase 11

Live batch for the repository owner. The agent (Claude Code, acting audit lead)
appends items as lanes hit proof that only a person can give, following
`../templates/user-test-batch.md`. Run a sitting when it is marked **ready**; items
are not ready until the agent has staged fixtures and written exact steps.

Status legend: `staging` (agent still preparing), `ready`, `done`.

## Sitting 0: Host terminal on this machine (~15 min) — ready

Four commands the agent cannot run from its sandbox (no display, no D-Bus, no Docker
socket, no access to the live hostname). Paste each result line back into the Result
column or into chat; the agent converts them into evidence.

Preconditions already satisfied by the agent:

- `scripts/audit/electron-window-open-probe.cjs` is in the repository and `npm run build` output exists in `out/`.
- The Docker image definition is unchanged; `docker compose build` will fetch the pinned MuseScore AppImage.
- Item 3 needs any `.mscz` file; export one from MuseScore or download a sample score. Put it at `$TMPDIR/score.mscz` or adjust the path.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | MOD-014, PH-SEC-005 | `npm run build && xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/audit/electron-window-open-probe.cjs 2>/dev/null \| grep -E 'PARENT_BRIDGE\|PROBE_RESULT'` | `PARENT_BRIDGE object`, then a `PROBE_RESULT` line with `"hasBridge":"undefined"` and `"preloadInherited":false`. A child window loading at all confirms PH-SEC-005; `"hasBridge":"object"` would raise it to P1 | | |
| 2 | OP-017, WF-025, BASE-11-001 | `docker compose build && docker compose run --rm lumakeys npx vitest run src/server/museScore.integration.test.ts` | 1 test passed (the integration test that is skipped outside Docker) | | |
| 3 | PH-SEC-004 | With the container running (`docker compose up -d`), run two uploads at once: `for i in 1 2; do curl -s -o $TMPDIR/up$i.json -F "files=@$TMPDIR/score.mscz;filename=score$i.mscz" http://127.0.0.1:3001/api/midi/upload & done; wait; cat $TMPDIR/up1.json $TMPDIR/up2.json` (add `-H "x-lumakeys-access-token: <token>"` if the token is set) | One response imports or reports "already in library"; the other contains "Another MuseScore score is being converted" | | |
| 4 | OP-014, PH-OPS-002 | In a private browser window open `https://<your hostname>/`; then run `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{"args":[]}' https://<your hostname>/api/bridge/getAllSongs` | Browser redirects to Cloudflare login before the app loads; curl prints 302 or 403, never 200 | | |

## Sitting 1: This Linux machine with a display (~20 min) — staging

Covers the runtime proof Phase 10 left owed on the only environment available
here: real zoom hit-testing, keyboard-only navigation, reduced motion with the OS
setting, and audible output. The agent will stage an isolated data directory, a
built web server, and a built Electron app, and give one command per item.

Preconditions the agent will satisfy before marking ready:

- Isolated web server running on a known port with a known token.
- Packaged Electron build launched with an isolated profile.
- OS reduced-motion setting location written down for this desktop.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | RT-006, PH-UI-002 | Chrome at 125, 150, 175, 200 percent zoom: open Settings, click every tab | Every tab reachable by pointer at every zoom | | |
| 2 | RT-008, PH-UI-001 | Keyboard only: open Free Play immersive dialog, Tab through, press Escape | Focus stays inside the dialog; Escape closes it without leaving the screen | | |
| 3 | RT-009, RT-012, WF-026, PH-UI-003 | Enable OS reduced motion, reload main menu and Free Play | Video background stops or is replaced; canvases do not animate | | |
| 4 | WF-015, WF-016 | Press keys in Free Play and the soundboard with speakers on | Audible piano and animal sounds; no overlapping animal audio | | |
| 5 | WF-009 | Play one short song with the computer keyboard to completion | Results screen shows a persisted result; it appears in Progress afterwards | | |

## Sitting 2: Windows machine (~15 min) — staging

Requires the portable `.exe` built by `npm run package:win`. The agent cannot build
or launch this here; the build must be produced on or copied to the Windows machine.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | WF-023, RT-001 | Launch the portable exe from a fresh folder | Main menu renders; app closes cleanly | | |
| 2 | WF-001 | Complete first-run setup, restart the app | Setup choices persist | | |
| 3 | WF-004 | Import one `.mid` from Downloads | Song appears in the library and starts | | |

## Sitting 3: Edge and Firefox (~15 min) — staging

Can be the Windows machine or any machine with both browsers, pointed at the
self-hosted web deployment or an isolated server the agent starts.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | RT-002 | Open the app in Edge, then Firefox; reach Library and start a song | Game canvas renders in both | | |
| 2 | RT-006, PH-UI-002 | Settings tabs at 150 and 200 percent zoom in both browsers | All tabs reachable | | |
| 3 | WF-002 | Firefox: observe the MIDI permission or fallback path | Clear fallback message; computer keyboard still works | | |

## Sitting 4: MIDI controller and speakers (~15 min) — staging

Requires a named USB MIDI keyboard. Record its make and model in the Seen column of
item 1; the report cites it.

| # | Coverage row / finding | Steps (already prepared) | Expected | Result | Seen |
|---|---|---|---|---|---|
| 1 | WF-002, RT-011 | Plug in the controller, open Keyboard Setup | Device listed by name | | |
| 2 | PH-MUS-004 | Hold a key, unplug the controller, replug | Held note stops on unplug; device reconnects without restart | | |
| 3 | WF-009, PH-MUS-001 | Play a song on the controller, pause and resume mid-song | Judged notes before the pause keep their state | | |
| 4 | WF-009 latency | Play a steady beat at the default latency setting | No audible lag the player would call wrong; note the setting used | | |

## Returned To The Agent

- Date the batch was run:
- Items the agent must re-stage or clarify:
