# webapps

Turn the websites you live in into standalone, tabbed macOS apps, and make
links clicked anywhere on your Mac open in the right app instead of a browser
tab. Ships with Gmail, Google Calendar, and GitHub; adding a site is one JSON
entry.

Two pieces:

- **The shell.** One Electron app, built once per site from `sites.json`.
  Real tabs (one `WebContentsView` per tab), restored on relaunch. Links to
  other sites leave the app; links to a site that has its own app land there.
- **LinkRouter.** A ~200-line Swift app that becomes your default browser. It
  matches each URL against `~/.config/webapps/routes.json` and hands it to
  the matching app, or to the browser that was your default before.

## Requirements

- macOS 13 or newer, Apple Silicon or Intel.
- Xcode Command Line Tools (`xcode-select --install`) for `swiftc`.
- Node 24 and pnpm 10. `mise.toml` pins both if you use [mise](https://mise.jdx.dev).

## Install

    git clone https://github.com/npendery/webapps && cd webapps
    scripts/install.sh

This builds the apps and the router, copies them into `/Applications`, writes
`~/.config/webapps/routes.json` with your current default browser as the
fallback, and asks macOS to make LinkRouter the default browser (confirm the
dialog). Sign in to each app once; each has its own cookie store.

The apps are ad-hoc signed. They run fine locally; they are not meant to be
distributed as built binaries.

## Daily use

| Keys | Action |
|---|---|
| Cmd+T / Cmd+W | New tab (home page) / close tab |
| Cmd+1..9, Cmd+Shift+[ / ] | Select tab, previous / next tab |
| Cmd+[ / ] | Back / forward |
| Cmd+R, Cmd+Shift+H | Reload, home |
| Cmd+Shift+O | Open current page in your regular browser |
| Cmd+Shift+C | Copy current URL |
| Cmd+Plus / Cmd+- / Cmd+0 | Zoom |

Quitting and relaunching restores your tabs. Web notifications work as native
notifications; clicking one opens the item in a tab.

## Adding a site

1. Add an entry to `sites.json`:

   ```json
   {
     "id": "linear",
     "name": "Linear",
     "home": "https://linear.app/",
     "match": ["linear.app", "*.linear.app"],
     "allow": ["accounts.google.com"],
     "icon": "https://linear.app/static/apple-touch-icon.png"
   }
   ```

   - `match`: hosts the router sends to this app, and that stay inside it.
   - `allow`: hosts that stay inside the app but are **not** routed to it.
     Put your identity provider and sign-in hosts here. A pattern may carry a
     path prefix (`www.google.com/a/`). `*.example.com` matches subdomains
     only; list the apex separately.
   - Exactly one site may `match` a given host; the tests enforce it.
2. `scripts/fetch-icons.sh` then `scripts/install.sh linear` (no argument
   rebuilds every site).

Bundle ids are `<bundleIdPrefix>.<id>`; change `bundleIdPrefix` in
`sites.json` if you fork.

### Sign-in hops

Single sign-on bounces through several hosts. Anything not in `match` or
`allow` is handed to your regular browser mid-flow and the sign-in breaks.
When that happens, the last line of `~/Library/Logs/LinkRouter.log` names the
host to add to `allow`. The shipped Google entries already cover Google
accounts, Okta (`*.okta.com`), and the Google Workspace SAML endpoint
(`www.google.com/a/`).

## How it works

- **Routing.** macOS has one default browser slot. LinkRouter occupies it,
  reads `routes.json`, unwraps Gmail's `google.com/url?q=` redirector, and
  opens the URL with the matching app's bundle id via Launch Services. Every
  decision is logged (scheme, host and path only) to
  `~/Library/Logs/LinkRouter.log`.
- **Inside an app.** Top-level navigations to out-of-scope hosts are cancelled
  and sent to the system default browser, which is the router, so the link
  still ends up in the right place. `window.open` to an in-scope URL becomes
  a tab (the page gets a real window proxy back, so pop-up detection stays
  quiet); non-http popups such as Gmail's compose pop-out stay real windows.
- **Google sign-in.** Electron's `window.chrome` is empty because it ships
  Chromium without the `chrome/` layer, and Google's sign-in rejects that as
  an embedded browser. A sandboxed preload restores the members plain
  Chromium exposes before any page script runs. The user agent is plain
  Chrome for the bundled Chromium version.

## Development

    pnpm install
    pnpm test                                   # matcher, policy, state, preload tests
    router/build.sh && router/test.sh           # same URL fixtures through the Swift router
    SITE=github pnpm dev                        # run one site unpackaged
    WEBAPPS_SITE=gmail WEBAPPS_PROFILE=dev pnpm exec electron . --remote-debugging-port=9333
                                                # run beside the installed app, with CDP
    pnpm build [siteId]                         # dist/<Name>.app

Design notes and the implementation plan live under `docs/superpowers/`.

## Uninstall

System Settings → Desktop & Dock → Default web browser → pick your browser.
Then delete the apps from `/Applications`, `~/.config/webapps`, and
`~/Library/Application Support/webapps/`.

## License

MIT
