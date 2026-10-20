#!/usr/bin/env bash
# Phase 11 OP-017 / WF-025: crafted .mscz archives against the image's MuseScore converter.
#
# Run on the Docker host after building an image (any tag; it never uses the running container):
#   LUMAKEYS_IMAGE=lumakeys-audit:p11 bash scripts/audit/musescore-crafted-archive-check.sh
#
# Every container gets a throwaway data directory from mktemp; /media/storage/lumakeys is never mounted.
#   1. traversal.mscz: the valid meter-tempo score plus entries named ../../../../tmp/lk-escape-1.txt,
#      /tmp/lk-escape-2.txt, ../lk-escape-3.txt and a symlink entry to /data.
#   2. bomb.mscz: the score entry padded to about 300 MB of whitespace (about 300 kB zipped).
#   3. long60000.mscz: a valid score with 180,000 bars, to push MuseScore into its memory limit,
#      with a second upload and a bridge call sent while it converts.
# After each upload it lists MuseScore processes and temp dirs, searches the container for the
# escape names, and finally checks that a normal upload still converts (busy flag released).
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
fixtures="$repo/scripts/audit/fixtures/musescore"
img="${LUMAKEYS_IMAGE:?set LUMAKEYS_IMAGE to an image built from this repository}"
port="${LUMAKEYS_PROBE_PORT:-3798}"
work="$(mktemp -d)"
mkdir -p "$work/data"
echo "image $img; work dir $work"

python3 -I - "$fixtures/meter-tempo.mscz" "$work" <<'EOF'
import os, re, stat, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    entries = {i.filename: z.read(i.filename) for i in z.infolist()}
with zipfile.ZipFile(f'{out}/traversal.mscz', 'w', zipfile.ZIP_DEFLATED) as z:
    for n, d in entries.items(): z.writestr(n, d)
    z.writestr('../../../../tmp/lk-escape-1.txt', b'escape1')
    z.writestr('/tmp/lk-escape-2.txt', b'escape2')
    z.writestr('../lk-escape-3.txt', b'escape3')
    link = zipfile.ZipInfo('lk-escape-link'); link.create_system = 3
    link.external_attr = (stat.S_IFLNK | 0o777) << 16
    z.writestr(link, '/data')
score = entries['score.mscx']
with zipfile.ZipFile(f'{out}/bomb.mscz', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr('META-INF/container.xml', entries['META-INF/container.xml'])
    with z.open('score.mscx', 'w', force_zip64=True) as f:
        head, tail = score.split(b'<Score>', 1)
        f.write(head + b'<Score>')
        for _ in range(300): f.write(b' ' * (1 << 20))
        f.write(tail)
def repeat_bars(m):
    bars = re.findall(r'<Measure.*?</Measure>', m.group(2), re.S)
    plain = [b for b in bars if '<TimeSig' not in b and '<Tempo' not in b] or bars
    return m.group(1) + m.group(2) + ''.join(plain) * 60000 + m.group(3)
long = re.sub(r'(<Staff id="\d+">)(\s*<Measure.*?</Measure>\s*)(</Staff>)', repeat_bars, score.decode(), flags=re.S)
with zipfile.ZipFile(f'{out}/long60000.mscz', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr('META-INF/container.xml', entries['META-INF/container.xml'])
    z.writestr('score.mscx', long.encode())
for f in ('traversal.mscz', 'bomb.mscz', 'long60000.mscz'):
    print(f'{f}: {os.path.getsize(f"{out}/{f}")} bytes')
EOF

cid="$(docker run -d --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e PORT=3001 -e LUMAKEYS_DATA_DIR=/data \
  -v "$work/data:/data" -p "127.0.0.1:$port:3001" "$img" node dist/server/index.cjs)"
trap 'docker stop "$cid" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do curl -fsS -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null && break; sleep 1; done
base="http://127.0.0.1:$port"
short() { sed -E 's/"fileData":\{[^}]*\}/"fileData":{...}/' | cut -c1-240; }
upload() { curl -sS -w ' [http %{http_code}, %{time_total}s]' -F "files=@$1;filename=$2" "$base/api/midi/upload" | short; echo; }
inspect() {
  docker exec "$cid" sh -c 'ps -o pid,etime,rss,args | grep -E "mscore|prlimit" | grep -v grep | cut -c1-120;
    ls -d /tmp/lumakeys-mscz-* 2>/dev/null; echo "escape files: $(find / -xdev \( -path /proc -o -path /sys \) -prune -o -name "lk-escape*" -print 2>/dev/null | tr "\n" " ")";
    echo "/tmp: $(ls -A /tmp | tr "\n" " ")"'
}

echo; echo "== traversal"; upload "$work/traversal.mscz" traversal.mscz; inspect
echo; echo "== bomb"; upload "$work/bomb.mscz" bomb.mscz; inspect
echo; echo "== long60000 (second upload and bridge call at +3 s)"
upload "$work/long60000.mscz" long60000.mscz > "$work/long.resp" &
sleep 3
echo "while converting:"; inspect
echo -n "second upload: "; upload "$fixtures/pickup.mscz" during.mscz
curl -sS -o /dev/null -w 'getAllSongs while converting: http %{http_code}, %{time_total}s\n' \
  -X POST -H 'content-type: application/json' -d '{"args":[]}' "$base/api/bridge/getAllSongs"
wait
echo -n "long60000: "; cat "$work/long.resp"
echo "after:"; inspect
echo -n "normal upload after: "; upload "$fixtures/pickup.mscz" after.mscz
echo; echo "work dir kept for inspection: $work"
