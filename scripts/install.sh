#!/usr/bin/env bash
# Build everything, install into /Applications, write router config, set LinkRouter as default browser.
# Usage: scripts/install.sh [siteId...]   (no args = all sites)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/share/mise/shims:$PATH"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

pnpm install
# pnpm 10 sometimes skips electron's postinstall even when allowlisted; make sure the binary exists.
[ -d node_modules/electron/dist ] || node node_modules/electron/install.js
ls icons/*.icns >/dev/null 2>&1 || scripts/fetch-icons.sh
pnpm build "$@"
router/build.sh
ROUTER_ID="$(defaults read "$PWD/dist/LinkRouter.app/Contents/Info.plist" CFBundleIdentifier)"

# Fallback browser = whatever handled https before LinkRouter took over. On a
# reinstall LinkRouter is already the handler, so keep the previously recorded
# fallback; with nothing recorded, gen-routes uses sites.json's fallbackBrowser.
current_handler="$(/usr/bin/python3 - <<'PY'
import os, plistlib
path = os.path.expanduser("~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist")
try:
    handlers = plistlib.load(open(path, "rb")).get("LSHandlers", [])
except Exception:
    handlers = []
print(next((h.get("LSHandlerRoleAll", "") for h in handlers if h.get("LSHandlerURLScheme") == "https"), ""))
PY
)"
previous_fallback=""
if [ -f "$HOME/.config/webapps/routes.json" ]; then
  previous_fallback="$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("fallback",""))' "$HOME/.config/webapps/routes.json")"
fi
if [ -n "$current_handler" ] && [ "$current_handler" != "$ROUTER_ID" ]; then
  fallback="$current_handler"
else
  fallback="$previous_fallback"
fi
if [ -n "$fallback" ]; then
  pnpm -s gen-routes --fallback "$fallback"
else
  pnpm -s gen-routes
fi
echo "fallback browser: $(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["fallback"])' dist/routes.json)"

# Keep Spotlight from indexing build output, otherwise Launch Services learns
# about dist/*.app and may launch a stale copy instead of /Applications.
touch dist/.metadata_never_index

for app in dist/*.app; do
  name="$(basename "$app")"
  bundle_id="$(defaults read "$PWD/$app/Contents/Info.plist" CFBundleIdentifier)"
  if [ -d "/Applications/$name" ]; then
    existing="$(defaults read "/Applications/$name/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || true)"
    case "$existing" in
      dev.nick.webapps.*) ;;
      *) echo "refusing to overwrite /Applications/$name (bundle id '$existing' is not ours)" >&2; exit 1 ;;
    esac
  fi
  # Quit every running instance of this bundle id, wherever it was launched from;
  # a stale instance would otherwise keep the single-instance lock and serve old code.
  osascript -e "tell application id \"$bundle_id\" to quit" >/dev/null 2>&1 || true
  sleep 1
  pkill -f "/$name/Contents/MacOS/" 2>/dev/null || true
  rm -rf "/Applications/$name"
  ditto "$app" "/Applications/$name"
  # Make sure the bundle id resolves to the installed copy, not the one in dist/.
  "$LSREGISTER" -u "$app" >/dev/null 2>&1 || true
  "$LSREGISTER" -f "/Applications/$name"
  echo "installed /Applications/$name"
  # The site apps in dist/ are only build output; remove them so nothing can
  # launch a stale copy. LinkRouter stays because router/test.sh runs it.
  case "$name" in
    LinkRouter.app) ;;
    *) rm -rf "$app" ;;
  esac
done

mkdir -p "$HOME/.config/webapps"
cp dist/routes.json "$HOME/.config/webapps/routes.json"
echo "wrote ~/.config/webapps/routes.json"

echo
echo "Setting LinkRouter as the default browser. macOS will show a confirmation dialog."
/Applications/LinkRouter.app/Contents/MacOS/LinkRouter --set-default
