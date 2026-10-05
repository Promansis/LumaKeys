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

Optional app-level gate:

Set `LUMAKEYS_WEB_ACCESS_TOKEN` in `docker-compose.yml`. API requests must include `x-lumakeys-access-token: <token>` once; successful token requests set an HttpOnly cookie scoped to `/api`.

Browser login check:

```text
https://piano.a173d20e27.com/api/access?access_token=change-this-long-random-token
```

After that returns `{"ok":true}`, reload the app in the same browser.

Example:

```yml
environment:
  PORT: 3001
  LUMAKEYS_DATA_DIR: /data
  LUMAKEYS_WEB_ACCESS_TOKEN: "change-this-long-random-token"
```

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
