# LumaKeys Linux Server Deployment

This project can run as a normal web app on your Linux server.

The app will:

- serve the web UI on port `3001`
- store the database and uploaded MIDI files in `/media/storage/lumakeys`
- work behind your existing Cloudflare Tunnel
- protect API routes with Cloudflare Access or `LUMAKEYS_WEB_ACCESS_TOKEN`

## What This Setup Uses

- Docker
- Docker Compose
- Cloudflare Tunnel

## Files Added

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`

## Before You Start

Make sure these are installed on your server:

- Docker
- Docker Compose plugin
- Cloudflared

Also make sure port `3001` is free on your server.

## 1. Put the Project on the Server

Example:

```bash
cd /media/storage
git clone <your-repo-url> lumakeys-app
cd lumakeys-app
```

If you already copied the project there manually, just `cd` into the project folder.

## 2. Create the Data Folder

This is where LumaKeys will store its database and uploaded MIDI files.

```bash
mkdir -p /media/storage/lumakeys
```

## 3. Build and Start the Container

Set the access token first (section 5a). The server will not start without it.

From inside the project folder:

```bash
docker compose up -d --build
```

To check logs:

```bash
docker compose logs -f lumakeys
```

## 4. Test It Locally First

Before adding Cloudflare, make sure it works on your LAN:

```bash
curl http://127.0.0.1:3001
```

Or open:

```text
http://YOUR_SERVER_IP:3001
```

If it is working, you should see the LumaKeys web app.

## 5. Add It to Cloudflare Tunnel

Edit your Cloudflare Tunnel config:

```bash
sudo nano /etc/cloudflared/config.yml
```

Add a new ingress rule for LumaKeys.

Example:

```yml
tunnel: YOUR_TUNNEL_ID
credentials-file: /etc/cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: piano.a173d20e27.com
    service: http://localhost:3001
  - service: http_status:404
```

If you already have other ingress entries, add the new `piano` hostname above the final `http_status:404` rule.

Then restart Cloudflare:

```bash
sudo systemctl restart cloudflared
```

## 5a. Protect the Web APIs

LumaKeys web is a single-user deployment. Anyone who can reach `/api/*` can import songs, reset data, and mutate the shared library. Put the hostname behind Cloudflare Access before exposing it publicly.

Minimum Cloudflare Access smoke checklist:

- Add an Access application for `https://piano.a173d20e27.com/*`.
- Require your email or identity provider group.
- Confirm a private browser window redirects to Cloudflare login before the app loads.
- Confirm these API paths are not reachable without Access: `/api/bridge/getAllSongs`, `/api/midi/upload`, `/api/library/import`.

App-level token:

The server refuses to start until you choose a gate, so a missing or broken Access policy cannot leave the library open. Add a long random token to a `.env` file next to `docker-compose.yml` (create the file if it does not exist; `openssl rand -hex 32` makes a good token):

```text
LUMAKEYS_WEB_ACCESS_TOKEN=paste-your-long-random-token-here
```

Then run `docker compose up -d`. The placeholder in `docker-compose.yml` is refused. Keep `.env` private and out of Git.

Browser sign-in, once per browser session:

1. Open `https://piano.a173d20e27.com/login`.
2. Enter the token and select Sign in.

The form sends the token in the request body, never in the address. The server sets an HttpOnly cookie scoped to `/api` and returns you to the app. The cookie lasts until the browser closes; after that the app sends you back to `/login`. Old `/api/access?access_token=...` links no longer work.

Scripts can send the header `x-lumakeys-access-token: <token>` with each request, or `POST /api/access` with the JSON body `{"token":"<token>"}` to get the cookie.

Cloudflare Access only, with no token:

Delete the `LUMAKEYS_WEB_ACCESS_TOKEN` line from `docker-compose.yml` and set `LUMAKEYS_TRUST_UPSTREAM_AUTH: "1"`. Do this only when Access protects the host. The server logs a warning at start in this mode.

Local runs (`npm run start:web`, `npm run dev:web`) need one of the two settings too, for example `LUMAKEYS_WEB_ACCESS_TOKEN=<token> npm run start:web`, then sign in at `/login` on the address you opened (the Vite dev server passes `/login` and `/api` through to the server).

## 6. Open the Site

After DNS and tunnel routing are active, open:

```text
https://piano.a173d20e27.com
```

## Useful Commands

Start:

```bash
docker compose up -d
```

Stop:

```bash
docker compose down
```

Rebuild after code changes:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f lumakeys
```

Check running containers:

```bash
docker ps
```

## Where Data Is Stored

All persistent app data is stored here on the host:

```text
/media/storage/lumakeys
```

Inside the container that path is mounted as:

```text
/data
```

That folder contains:

- the SQLite database
- uploaded MIDI files

On startup the server logs one line naming the folder it uses, for example
`LumaKeys data directory: /data (legacy: no)`. `LUMAKEYS_DATA_DIR` must be an absolute path;
the server refuses to start with a relative one.

## Upgrading From PianoHero

LumaKeys was called PianoHero. This release still reads the old names, logs a warning naming
each one in use, and stops reading them in 0.3.0. Rename them before then:

| Old | New |
|---|---|
| Docker host folder `/media/storage/pianohero` | `/media/storage/lumakeys`, the folder `docker-compose.yml` mounts: move the old folder there |
| `PIANOHERO_DATA_DIR` | `LUMAKEYS_DATA_DIR` |
| `PIANOHERO_WEB_ACCESS_TOKEN` | `LUMAKEYS_WEB_ACCESS_TOKEN` |
| `PIANOHERO_SKIP_ELECTRON_REBUILD` | `LUMAKEYS_SKIP_ELECTRON_REBUILD` |
| `.pianohero-data` in the working directory | `.lumakeys-data` |

The desktop app keeps its library in `<appData>/lumakeys`. A library from an earlier build
(`luma-keys`, `piano-hero` or `PianoHero` in the same folder) is carried over automatically on
first start.

## Important Notes

- This is the web version of LumaKeys, not the full Electron desktop version.
- Browser uploads accept `.mid`, `.midi`, and `.mscz` (MuseScore) files, up to 10 MB each.
- MSCZ uploads are converted automatically into playable MIDI-backed library songs. The Linux x86-64 Docker image includes MuseScore Studio 4.7.5; no manual export is needed. This is song import, not MuseScore notation editing.
- For non-Docker Linux web servers, install MuseScore 4 and `prlimit` (util-linux), then set `LUMAKEYS_MUSESCORE_PATH` to the MuseScore executable. The Electron desktop importer remains MIDI-only.
- MuseScore conversion runs one score at a time with CPU, memory, output-size, and timeout limits. Invalid or unsupported scores report an import error without adding a library song.
- The bundled MuseScore binary is GPLv3. Its [license](https://github.com/musescore/MuseScore/blob/v4.7.5/LICENSE.txt) and [corresponding source](https://github.com/musescore/MuseScore/tree/v4.7.5) are available upstream; preserve the GPL distribution obligations if redistributing the Docker image.
- Some desktop-only actions are not available in web mode, such as native file picker features and some export/save helpers.
- Cloudflare Tunnel gives you HTTPS, which is useful for browser device APIs.
- Current web deployment is single-user only. The SQLite database and uploaded MIDI files are shared by anyone who can reach the site, so add auth before exposing it to multiple users.

## If You Want to Use a Different Domain

Just change this line in `/etc/cloudflared/config.yml`:

```yml
- hostname: piano.a173d20e27.com
```

For example:

```yml
- hostname: piano.yourdomain.com
```

## If You Want to Use a Different Port

Update both places:

1. In `docker-compose.yml`
2. In `/etc/cloudflared/config.yml`

Current default port:

```text
3001
```

## Troubleshooting

### The app does not start

Check logs:

```bash
docker compose logs -f lumakeys
```

If the log says no web access gate is set, or that the token is still the placeholder, set the token as described in section 5a. With `restart: unless-stopped`, Docker keeps restarting the container, with growing delays, and the log repeats the error each time until the setting is fixed.

### Cloudflare works but the site does not load

Check that:

- the container is running
- port `3001` is listening
- the tunnel points to `http://localhost:3001`
- the new ingress rule is above the catch-all `http_status:404`

### I changed code but nothing updated

Rebuild the container:

```bash
docker compose up -d --build
```

### I want to move the stored data

Change this line in `docker-compose.yml`:

```yml
- /media/storage/lumakeys:/data
```

For example:

```yml
- /some/other/path/lumakeys:/data
```
