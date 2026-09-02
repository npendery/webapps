import { isAllowed, isMatch, normalizeUrl, type SiteRules } from './matcher';

/** Top-level navigation inside an existing tab. */
export type NavDecision = { action: 'allow' } | { action: 'external'; url: string };

/** `window.open` / `target=_blank`. */
export type OpenDecision = { action: 'tab'; url: string } | { action: 'popup' } | { action: 'external'; url: string };

/**
 * Non-http URLs (about:blank, blob:, javascript:) are left to Chromium.
 * In-scope (match ∪ allow) stays in the tab. Everything else goes to the
 * system default browser, which is the router.
 */
export function decideNavigation(site: SiteRules, rawUrl: string): NavDecision {
  const url = normalizeUrl(rawUrl);
  if (!url) return { action: 'allow' };
  if (isMatch(site, rawUrl) || isAllowed(site, rawUrl)) return { action: 'allow' };
  return { action: 'external', url: url.href };
}

/**
 * Tabs to open on launch. A saved URL that drifted out of scope (e.g. a
 * signed-out redirect to a marketing page) is replaced by the home URL.
 */
export function restoreTabs(site: SiteRules, home: string, saved: string[]): string[] {
  if (saved.length === 0) return [home];
  return saved.map((url) => (isMatch(site, url) || isAllowed(site, url) ? url : home));
}

/**
 * Non-http popups (Gmail opens about:blank then navigates, and relies on
 * window.opener) become real popup windows. In-scope http URLs, including
 * allow-only sign-in hosts, become tabs so they get the full tab treatment
 * (navigation policy, chrome shim). Everything else goes external.
 */
export function decideWindowOpen(site: SiteRules, rawUrl: string): OpenDecision {
  const url = normalizeUrl(rawUrl);
  if (!url) return { action: 'popup' };
  if (isMatch(site, rawUrl) || isAllowed(site, rawUrl)) return { action: 'tab', url: url.href };
  return { action: 'external', url: url.href };
}
