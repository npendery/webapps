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
pnpm -s gen-routes
router/build.sh

for app in dist/*.app; do
  name="$(basename "$app")"
  if [ -d "/Applications/$name" ]; then
    existing="$(defaults read "/Applications/$name/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || true)"
    case "$existing" in
      dev.nick.webapps.*) ;;
      *) echo "refusing to overwrite /Applications/$name (bundle id '$existing' is not ours)" >&2; exit 1 ;;
    esac
  fi
  pkill -f "/Applications/$name/Contents/MacOS/" 2>/dev/null || true
  rm -rf "/Applications/$name"
  ditto "$app" "/Applications/$name"
  # Make sure the bundle id resolves to the installed copy, not the one in dist/.
  "$LSREGISTER" -u "$app" >/dev/null 2>&1 || true
  "$LSREGISTER" -f "/Applications/$name"
  echo "installed /Applications/$name"
done

mkdir -p "$HOME/.config/webapps"
cp dist/routes.json "$HOME/.config/webapps/routes.json"
echo "wrote ~/.config/webapps/routes.json"

echo
echo "Setting LinkRouter as the default browser. macOS will show a confirmation dialog."
/Applications/LinkRouter.app/Contents/MacOS/LinkRouter --set-default
