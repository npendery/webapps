# webapps

Gmail, Google Calendar, and GitHub as standalone tabbed macOS apps, plus
`LinkRouter.app`, a tiny default browser that sends links clicked anywhere
on the Mac to the matching app. Anything that matches no app goes to Brave.

## Install

    scripts/install.sh

Builds all apps and the router, copies them into `/Applications`, writes
`~/.config/webapps/routes.json`, and asks macOS to make LinkRouter the
default browser (confirm the dialog). Sign in to Google once in Gmail and
once in Google Calendar; each app has its own cookie store.

## Daily use

- Cmd+T new tab, Cmd+W close tab, Cmd+1..9 select tab, Cmd+Shift+[ / ]
  previous/next tab.
- Cmd+[ / ] back/forward, Cmd+R reload, Cmd+Shift+H home.
- Cmd+Shift+O opens the current page in Brave. Cmd+Shift+C copies its URL.
- Links to other sites open in Brave (via LinkRouter). Links to a site that
  has its own app open there.
- Quitting and relaunching restores your tabs.

## Adding a site

1. Add an entry to `sites.json` (`id`, `name`, `home`, `match`, `allow`,
   `icon`). `match` hosts are routed to the app and stay in it; `allow`
   hosts stay in the app (login pages) but are not routed to it.
   `*.example.com` matches subdomains only; list the apex separately.
2. `scripts/fetch-icons.sh` then `scripts/install.sh`.

## How routing works

macOS has one default browser slot. `LinkRouter.app` occupies it, reads
`~/.config/webapps/routes.json`, and opens each URL with the matching app's
bundle id via Launch Services, or with the fallback browser. It logs every
decision to `~/Library/Logs/LinkRouter.log`. Gmail's `google.com/url?q=`
redirector is unwrapped before matching.

    dist/LinkRouter.app/Contents/MacOS/LinkRouter --dry-run https://github.com/x

## Development

    pnpm install
    pnpm test            # matcher, policy, state tests
    router/test.sh       # same fixtures through the Swift router
    SITE=github pnpm dev # run one site unpackaged
    pnpm build [siteId]  # dist/<Name>.app

## Undo

System Settings → Desktop & Dock → Default web browser → Brave. Delete the
apps from `/Applications` and `~/Library/Application Support/webapps/`.
