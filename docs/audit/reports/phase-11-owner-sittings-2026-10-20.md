# Phase 11: Owner Sittings Run By The Agent

- Status: in progress. Sitting 0 is done; sittings 1, 3 and 4 are running; sitting 2 needs a
  Windows machine.
- Source identity: `main` at `6e549b6` plus audit-only commits (HEAD `9aa8fe7` when the run
  started). No product source changed after the baseline.
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

Pending.

## Sitting 2: Windows

Not run. It needs a Windows machine and the owner's Windows profile.

## Sitting 3: Edge And Firefox

Pending.

## Sitting 4: MIDI Keyboard

Pending.

## Evidence

- `$TMPDIR/p11/S0/build.log`: image build
- `$TMPDIR/p11/S0/item1.out`: item 1
- `$TMPDIR/p11/S0/item2.*`: item 2 data directory and upload replies
- `$TMPDIR/p11/S0/item3.out`: item 3
- `$TMPDIR/p11/S0/crafted-check.out`: crafted archives
