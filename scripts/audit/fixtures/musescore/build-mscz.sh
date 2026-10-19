#!/usr/bin/env bash
# Phase 11 lane C: package each hand-written .mscx in this directory as a minimal .mscz
# (a zip holding META-INF/container.xml and score.mscx). Needs `zip`. Output sits next to
# the source. The MuseScore converter in the Docker image is the only judge of validity;
# if it rejects these archives, convert the .mscx files directly instead (commands in
# docs/audit/reports/phase-11-lane-c-music-correctness-2026-10-19.md, "MuseScore fixtures").
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
for src in "$here"/*.mscx; do
  name="$(basename "$src" .mscx)"
  rm -rf "$stage/$name" && mkdir -p "$stage/$name/META-INF"
  cp "$here/container.xml" "$stage/$name/META-INF/container.xml"
  cp "$src" "$stage/$name/score.mscx"
  rm -f "$here/$name.mscz"
  (cd "$stage/$name" && zip -X -q -r "$here/$name.mscz" META-INF/container.xml score.mscx)
  echo "built $here/$name.mscz"
done
