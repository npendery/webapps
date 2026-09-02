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
 * Non-http popups (Gmail opens about:blank then navigates) and allow-only
 * hosts (login flows that need window.opener) become real popup windows.
 * Match hosts become tabs. Everything else goes external.
 */
export function decideWindowOpen(site: SiteRules, rawUrl: string): OpenDecision {
  const url = normalizeUrl(rawUrl);
  if (!url) return { action: 'popup' };
  if (isMatch(site, rawUrl)) return { action: 'tab', url: url.href };
  if (isAllowed(site, rawUrl)) return { action: 'popup' };
  return { action: 'external', url: url.href };
}
