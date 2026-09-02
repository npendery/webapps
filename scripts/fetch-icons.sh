#!/usr/bin/env bash
# Download each site's icon PNG and convert it to icons/<id>.icns.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/icons"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

/usr/bin/python3 -c 'import json,sys
for s in json.load(open(sys.argv[1]))["sites"]:
    print(s["id"], s["icon"])' "$ROOT/sites.json" | while read -r id url; do
  png="$TMP/$id.png"
  curl -fsSL "$url" -o "$png"
  set="$TMP/$id.iconset"
  mkdir -p "$set"
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" "$png" --out "$set/icon_${s}x${s}.png" >/dev/null
    d=$((s * 2))
    sips -z "$d" "$d" "$png" --out "$set/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$set" -o "$ROOT/icons/$id.icns"
  echo "icons/$id.icns"
done
