# webapps: site-specific Electron apps with link routing

Date: 2026-09-02
Status: approved (design approved in chat 2026-09-02)

## Goal

Run Gmail, Google Calendar, and GitHub as standalone macOS apps with tabs,
and make links clicked anywhere on the Mac (Slack, Terminal, Notes, other
apps) open in the matching app instead of a browser tab. Links that match
no app open in the user's real browser (currently Brave).

## Non-goals (v1)

- Dock badge counts, custom notification handling (Web Notifications work
  natively through Electron; nothing extra is built).
- `mailto:` routing to the Gmail app (natural follow-up).
- Shared Google session between Gmail and Calendar. Each app is its own
  Electron process with its own cookie store; the user signs in once per app.
- Windows/Linux. macOS only.
- Signed/notarized distribution. Apps are ad-hoc signed and installed
  locally.

## How link interception works on macOS

macOS has exactly one default handler for `http`/`https`. The only way to
send some links to app A and others to app B is to make a small *router*
the default browser. The router receives every link click, matches the
URL against a table, and hands it to the matching app via Launch Services
(`NSWorkspace.open(_:withApplicationAt:)`). Unmatched URLs go to the
fallback browser. The site apps themselves are never the default browser.

## Repository layout

```
~/code/webapps/
  mise.toml                 node 24, pnpm 10
  package.json              scripts: test, build, install
  sites.json                single source of truth for all sites (below)
  shell/                    one Electron + TypeScript codebase, built once per site
    src/main/               main process: app lifecycle, window, tabs, routing, menu
    src/preload/            contextBridge for the tab strip
    src/ui/                 tab strip HTML/CSS/JS
    src/shared/             pure modules shared by tests and main: url matcher
  router/                   Swift LinkRouter.app (default browser)
    Sources/main.swift
    Info.plist
    build.sh                swiftc -> dist/LinkRouter.app
    test.sh                 dry-run routing assertions
  scripts/
    build-apps.ts           runs electron-builder once per site -> dist/<Name>.app
    fetch-icons.sh          downloads PNG per site -> .icns via sips + iconutil
    install.sh              copies apps + router to /Applications, writes routes.json,
                            registers router as default browser
  dist/                     build output (gitignored)
```

## sites.json

```json
{
  "fallbackBrowser": "com.brave.browser",
  "bundleIdPrefix": "dev.nick.webapps",
  "sites": [
    {
      "id": "gmail",
      "name": "Gmail",
      "home": "https://mail.google.com/",
      "match": ["mail.google.com"],
      "allow": ["accounts.google.com", "accounts.youtube.com", "myaccount.google.com", "ogs.google.com"],
      "icon": "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_512dp.png"
    },
    {
      "id": "calendar",
      "name": "Google Calendar",
      "home": "https://calendar.google.com/",
      "match": ["calendar.google.com"],
      "allow": ["accounts.google.com", "accounts.youtube.com", "myaccount.google.com", "ogs.google.com"],
      "icon": "https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_512dp.png"
    },
    {
      "id": "github",
      "name": "GitHub",
      "home": "https://github.com/",
      "match": ["github.com", "*.github.com"],
      "allow": ["*.githubusercontent.com"],
      "icon": "https://github.com/fluidicon.png"
    }
  ]
}
```

- `match`: hosts the router sends to this app, and which the app keeps
  in-app. Exactly one site may match a given host.
- `allow`: hosts the app also keeps in-app (login and account pages) but
  the router does not route to this app. Login redirects bounce through
  these hosts and must not be thrown out to the fallback browser.
- Bundle id is `<bundleIdPrefix>.<id>`, e.g. `dev.nick.webapps.gmail`.

### Host pattern semantics

A pattern is a host, optionally followed by `/` and a path prefix.

- `mail.google.com` matches that exact host only.
- `*.github.com` matches any subdomain of `github.com`, not the apex.
  List `github.com` separately when the apex should match too.
- `example.com/foo` matches host `example.com` with path starting `/foo`.
- Matching is case-insensitive on host; scheme must be `http` or `https`.

### Redirector unwrapping

Gmail rewrites links to `https://www.google.com/url?q=<target>`. Both the
shell and the router unwrap this before matching so a GitHub link inside
an email lands in the GitHub app, not in Brave via the redirector page.
Unwrapping is one level, `www.google.com/url` with `q` or `url` parameter
only.

## Shell (Electron)

One codebase parameterized by a `site.json` copied into the app's
`Resources/` at build time. Reading that file at startup selects name,
home URL, and patterns.

### Window and tabs

- `BaseWindow` with `titleBarStyle: 'hiddenInset'`. A 38px tab strip
  `WebContentsView` sits at the top, padded on the left for traffic
  lights and marked as a drag region. One `WebContentsView` per tab fills
  the rest; only the active tab's view is attached.
- Tab state (id, title, url, favicon, active) lives in main. The strip is
  a dumb renderer: main pushes `tabs:state`; the strip sends
  `tabs:activate`, `tabs:close`, `tabs:new`.
- Shortcuts via the application menu: Cmd+T new tab (home URL), Cmd+W
  close tab (closing the last tab closes the window), Cmd+1..9 select tab,
  Cmd+Shift+[ / ] previous/next, Cmd+R reload, Cmd+[ / ] back/forward,
  Cmd+Plus/Minus/0 zoom, Cmd+Alt+I devtools for the active tab.
- Window bounds and open tab URLs persist in `userData/state.json`.
  Relaunch restores the same tabs; first launch opens the home URL.
- Dock click with no window open recreates the window with restored tabs.

### Navigation policy

For each tab's `webContents`:

- `will-navigate` (top-level only): unwrap redirector; if host is in
  `match ∪ allow`, allow; otherwise prevent and `shell.openExternal(url)`.
  `openExternal` goes to the default browser, which is the router, which
  sends the link to the right app or to Brave. The app never decides
  between other apps; only the router does.
- `setWindowOpenHandler` (`window.open`, `target=_blank`): same test. In
  scope → open a new tab and activate it, return `{ action: 'deny' }`.
  Out of scope → `openExternal`, deny.
- Google sign-in popups open via `window.open` to `accounts.google.com`,
  which is in `allow`, so they become a tab and close themselves after
  auth. If a site relies on `window.opener`, the tab approach may break
  it; the fallback is to allow a real child `BrowserWindow` for `allow`
  hosts. Verify during implementation with a fresh Gmail sign-in.
- Downloads use Electron's default save dialog.

### Incoming links

- `app.requestSingleInstanceLock()`; a second launch forwards to the
  running instance.
- `app.on('open-url')` is how macOS delivers a URL from the router.
  Handler: ensure a window exists, open a new tab with the URL, activate
  it, focus the window.
- `app.on('second-instance')` also scans argv for a URL, for `open --args`
  style launches.
- The Electron `open-url` docs require the app's `Info.plist` to declare
  the scheme in `CFBundleURLTypes`. Each app therefore declares `http` and
  `https` via electron-builder `protocols`. Side effect: the apps appear
  in System Settings' default-browser list. Harmless. If delivery still
  fails, fallback is a per-app custom scheme (`webapp-gmail://open?url=`)
  the router rewrites to.

### User agent

Google refuses sign-in from a UA containing `Electron`. The default
session UA is set to Chrome's UA for the bundled Chromium version
(`Chrome/<major>.0.0.0`, no `Electron/`, no app name) before any page
loads.

### Menu

Standard macOS menu (app, File, Edit, View, History, Window, Help) with the
shortcuts above. Edit menu is required for copy/paste to work in Electron
on macOS.

## Router (Swift)

`LinkRouter.app`, a minimal `NSApplication` bundle:

- `Info.plist`: `CFBundleIdentifier dev.nick.webapps.linkrouter`,
  `CFBundleURLTypes` for `http` and `https`, `LSUIElement true` (no Dock
  icon, no menu bar), `NSHighResolutionCapable`.
- `main.swift`: an `NSApplicationDelegate` implementing
  `application(_:open:)`. For each URL: unwrap redirector, match against
  routes, resolve the target bundle id to an app URL with
  `NSWorkspace.shared.urlForApplication(withBundleIdentifier:)`, open with
  `NSWorkspace.shared.open(_:withApplicationAt:configuration:)`. If the
  target app is not installed, use the fallback browser. Terminate after
  the open completes.
- Config: `~/.config/webapps/routes.json`, generated by `install.sh` from
  `sites.json`:
  `{ "fallback": "com.brave.browser", "routes": [{ "bundleId": "...", "match": [...] }] }`.
  Missing or malformed config → everything goes to the fallback, and the
  error is logged. Missing fallback → Safari.
- Logs one line per routed URL to `~/Library/Logs/LinkRouter.log`.
- CLI modes when launched from a terminal:
  - `LinkRouter --dry-run <url>...` prints `<url> -> <bundleId>` per line
    and exits. Used by `router/test.sh`.
  - `LinkRouter --set-default` calls
    `NSWorkspace.shared.setDefaultApplication(at:toOpenURLsWithScheme:)`
    for `http` and `https`. macOS shows its confirmation dialog once.
- Build: `swiftc -O -o LinkRouter main.swift`, assemble the `.app`
  directory structure, copy `Info.plist`, ad-hoc `codesign --sign -`.

Matching logic is duplicated in Swift (about 30 lines) because the router
must not depend on Node. `router/test.sh` runs the same fixture URLs as
the TypeScript matcher tests so the two implementations cannot drift
silently.

## Build and install

- `pnpm build`: `tsc` for the shell, then `scripts/build-apps.ts` loops
  over `sites.json`, generating an electron-builder config per site
  (`productName`, `appId`, `icon`, `protocols` http/https,
  `extraResources` with that site's `site.json`) and running
  `electron-builder --mac dir`. Output `dist/<Name>.app`. Signing is
  disabled in electron-builder (`identity: null`,
  `CSC_IDENTITY_AUTO_DISCOVERY=false`); a post-step runs
  `codesign --force --deep --sign -` so the bundle has a stable ad-hoc
  identity (keeps Chromium's Safe Storage keychain entry from prompting
  on every rebuild).
- `scripts/fetch-icons.sh`: downloads each site's PNG, builds an
  `.iconset` with `sips`, converts to `.icns` with `iconutil`. Icons are
  committed so builds are offline after the first run.
- `router/build.sh` builds `dist/LinkRouter.app`.
- `scripts/install.sh`: builds everything, `ditto`s each `.app` into
  `/Applications` (replacing previous), writes
  `~/.config/webapps/routes.json`, runs `lsregister -f` on each bundle so
  Launch Services sees the new plists, then runs
  `LinkRouter --set-default`.

## Testing

- `shell/src/shared/matcher.test.ts` (vitest): pattern semantics, apex vs
  wildcard, path prefix, case-insensitivity, scheme filter, redirector
  unwrapping, `inScope` (match ∪ allow) vs `routeTarget` (match only),
  "no two sites match one host" validation of `sites.json`.
- `router/test.sh`: runs `LinkRouter --dry-run` over the same fixture
  URLs and diffs against expected bundle ids.
- Smoke after install (manual, scripted where possible):
  1. `open -b dev.nick.webapps.github https://github.com/electron/electron`
     opens a tab in the GitHub app.
  2. `open https://github.com/electron/electron` from Terminal (goes via
     the router) lands in the GitHub app.
  3. `open https://example.com` lands in Brave.
  4. Fresh Gmail sign-in completes inside the Gmail app.
  5. A GitHub link inside a Gmail message opens in the GitHub app.

## Risks

- `open-url` delivery to an Electron app for `https` (see Incoming links).
  Verified first, before building the tab UI.
- Google sign-in flow inside `WebContentsView` tabs (window.opener).
  Verified with a real sign-in.
- Ad-hoc signed Electron apps and Keychain prompts. Acceptable for local
  use; documented in README if a prompt appears.

## Follow-ups (not in v1)

- `mailto:` → Gmail compose.
- Dock badge from Gmail unread count in page title.
- Additional sites: adding one is a `sites.json` entry plus an icon.
