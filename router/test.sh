#!/usr/bin/env bash
# Run the shared routing fixtures through LinkRouter --dry-run and diff
# against the expected bundle ids derived from sites.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/dist/LinkRouter.app/Contents/MacOS/LinkRouter"
FIXTURES="$ROOT/shell/fixtures/routing-fixtures.json"
export LINKROUTER_CONFIG="$ROOT/dist/routes.json"

[ -x "$BIN" ] || "$ROOT/router/build.sh" >/dev/null
[ -f "$LINKROUTER_CONFIG" ] || (cd "$ROOT" && pnpm -s gen-routes >/dev/null)

expected="$(/usr/bin/python3 - "$ROOT/sites.json" "$FIXTURES" <<'PY'
import json, sys
sites = json.load(open(sys.argv[1]))
cases = json.load(open(sys.argv[2]))["cases"]
for c in cases:
    target = f'{sites["bundleIdPrefix"]}.{c["route"]}' if c["route"] else sites["fallbackBrowser"]
    print(f'{c["url"]} -> {target}')
PY
)"

args=()
while IFS= read -r url; do args+=("$url"); done < <(
  /usr/bin/python3 -c 'import json,sys
for c in json.load(open(sys.argv[1]))["cases"]: print(c["url"])' "$FIXTURES")

actual="$("$BIN" --dry-run "${args[@]}")"

if diff <(echo "$expected") <(echo "$actual"); then
  echo "router: ${#args[@]} fixtures OK"
else
  echo "router: fixture mismatch" >&2
  exit 1
fi
