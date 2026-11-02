#!/usr/bin/env bash
# Phase 11 lane C, user-test sitting 0 (lead L-11-017): put MuseScore-converted MIDI through
# the measure-map probe and the hand-written oracle.
#
# Run on the Docker host, from anywhere, after `docker compose build` (sitting 0 item 2):
#   bash scripts/audit/musescore-measure-check.sh 2>&1 | tee "${TMPDIR:-/tmp}/musescore-measure-check.out"
#
# It never mounts /media/storage/lumakeys: every container gets a throwaway directory from mktemp.
#   1. Converts scripts/audit/fixtures/musescore/{meter-tempo,pickup}.mscz with the image's
#      MuseScore (falls back to the .mscx source if the hand-built .mscz is rejected).
#   2. Starts the image's web server on 127.0.0.1:${LUMAKEYS_PROBE_PORT:-3799} with an empty data
#      dir, uploads each .mscz through POST /api/midi/upload, and downloads the stored MIDI.
#   3. Runs scripts/audit/measure-map-probe.ts on both sets with the oracle.
# Override the image with LUMAKEYS_IMAGE=<name> if `docker compose config --images` is unavailable.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
fixtures="$repo/scripts/audit/fixtures/musescore"
img="${LUMAKEYS_IMAGE:-$(cd "$repo" && docker compose config --images | head -1)}"
port="${LUMAKEYS_PROBE_PORT:-3799}"
work="$(mktemp -d)"
mkdir -p "$work/data" "$work/direct" "$work/served"
echo "image $img; work dir $work"

mscore=(docker run --rm --user "$(id -u):$(id -g)" --entrypoint /opt/musescore/bin/mscore4portable
  -e HOME=/tmp -e XDG_RUNTIME_DIR=/tmp -e QT_QPA_PLATFORM=offscreen -e MU_QT_QPA_PLATFORM=offscreen -e LANG=C.UTF-8
  -v "$fixtures:/fixtures:ro" -v "$work/direct:/out" "$img")

# 1. Direct conversion.
for s in meter-tempo pickup; do
  if "${mscore[@]}" -o "/out/$s.mid" "/fixtures/$s.mscz" >"$work/direct/$s.log" 2>&1 && [ -s "$work/direct/$s.mid" ]; then
    echo "direct $s: converted from the hand-built .mscz"
  else
    echo "direct $s: hand-built .mscz rejected (log: $work/direct/$s.log); using the .mscx source"
    "${mscore[@]}" -o "/out/$s.mid" "/fixtures/$s.mscx" >>"$work/direct/$s.log" 2>&1 || echo "direct $s: .mscx conversion failed too"
    "${mscore[@]}" -o "/out/$s.mscz" "/fixtures/$s.mscx" >>"$work/direct/$s.log" 2>&1 || true
  fi
done

# 2. Product upload path (server-side conversion), isolated data dir.
cid="$(docker run -d --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e PORT=3001 -e LUMAKEYS_DATA_DIR=/data -e LUMAKEYS_TRUST_UPSTREAM_AUTH=1 \
  -v "$work/data:/data" -p "127.0.0.1:$port:3001" "$img" node dist/server/index.cjs)"
trap 'docker stop "$cid" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do curl -fsS -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null && break; sleep 1; done
for s in meter-tempo pickup; do
  src="$fixtures/$s.mscz"
  [ -s "$work/direct/$s.mscz" ] && src="$work/direct/$s.mscz"
  curl -sS -o "$work/served/$s.upload.json" -F "files=@$src;filename=$s.mscz" "http://127.0.0.1:$port/api/midi/upload" || true
  id="$(node -e 'try { const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(j.songs?.[0]?.songId ?? ""); } catch { console.log(""); }' "$work/served/$s.upload.json")"
  if [ -n "$id" ]; then
    curl -sS -o "$work/served/$s.mid" "http://127.0.0.1:$port/api/midi/$id"
    echo "served $s: song $id, $(wc -c <"$work/served/$s.mid") bytes"
  else
    echo "served $s: upload did not import: $(head -c 400 "$work/served/$s.upload.json" 2>/dev/null)"
  fi
done
docker stop "$cid" >/dev/null 2>&1 || true

# 3. Probe both sets against the SMF reference and the oracle.
cd "$repo"
for set in direct served; do
  echo
  echo "######## $set"
  mids=()
  for s in meter-tempo pickup; do [ -s "$work/$set/$s.mid" ] && mids+=("$work/$set/$s.mid"); done
  if [ "${#mids[@]}" -eq 0 ]; then echo "no MIDI produced"; continue; fi
  npx tsx scripts/audit/measure-map-probe.ts "${mids[@]}" --oracle "$fixtures/musescore.oracle.json" || true
done
echo
echo "work dir kept for inspection: $work"
