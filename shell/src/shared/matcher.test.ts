import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  isAllowed,
  isInScope,
  isMatch,
  matchesAnyPattern,
  normalizeUrl,
  parseHttpUrl,
  routeTarget,
  unwrapRedirect,
  validateSites,
  type SiteRules,
} from './matcher';

const root = path.resolve(__dirname, '../../..');
const sitesFile = JSON.parse(fs.readFileSync(path.join(root, 'sites.json'), 'utf8')) as { sites: SiteRules[] };
const fixtures = JSON.parse(
  fs.readFileSync(path.join(root, 'shell/fixtures/routing-fixtures.json'), 'utf8'),
) as { cases: Array<{ url: string; route: string | null }> };

const gmail = sitesFile.sites.find((s) => s.id === 'gmail')!;
const github = sitesFile.sites.find((s) => s.id === 'github')!;

describe('parseHttpUrl', () => {
  test('accepts http and https', () => {
    expect(parseHttpUrl('https://a.com/x')?.href).toBe('https://a.com/x');
    expect(parseHttpUrl('http://a.com')?.protocol).toBe('http:');
  });
  test('rejects other schemes and garbage', () => {
    expect(parseHttpUrl('ftp://a.com')).toBeNull();
    expect(parseHttpUrl('javascript:alert(1)')).toBeNull();
    expect(parseHttpUrl('about:blank')).toBeNull();
    expect(parseHttpUrl('nope')).toBeNull();
  });
});

describe('matchesAnyPattern', () => {
  const u = (s: string) => new URL(s);
  test('exact host matches only that host', () => {
    expect(matchesAnyPattern(u('https://github.com/x'), ['github.com'])).toBe(true);
    expect(matchesAnyPattern(u('https://gist.github.com/x'), ['github.com'])).toBe(false);
  });
  test('wildcard matches subdomains but not apex', () => {
    expect(matchesAnyPattern(u('https://gist.github.com/x'), ['*.github.com'])).toBe(true);
    expect(matchesAnyPattern(u('https://a.b.github.com/x'), ['*.github.com'])).toBe(true);
    expect(matchesAnyPattern(u('https://github.com/x'), ['*.github.com'])).toBe(false);
    expect(matchesAnyPattern(u('https://github.com.evil.example/x'), ['*.github.com'])).toBe(false);
  });
  test('host is case-insensitive', () => {
    expect(matchesAnyPattern(u('https://GITHUB.com/x'), ['github.com'])).toBe(true);
    expect(matchesAnyPattern(u('https://github.com/x'), ['GitHub.com'])).toBe(true);
  });
  test('path prefix restricts the match', () => {
    expect(matchesAnyPattern(u('https://a.com/foo/bar'), ['a.com/foo'])).toBe(true);
    expect(matchesAnyPattern(u('https://a.com/other'), ['a.com/foo'])).toBe(false);
  });
});

describe('unwrapRedirect', () => {
  test('unwraps google.com/url?q=', () => {
    const out = unwrapRedirect(new URL('https://www.google.com/url?q=https://github.com/a/b&sa=D'));
    expect(out.href).toBe('https://github.com/a/b');
  });
  test('unwraps url= parameter too', () => {
    expect(unwrapRedirect(new URL('https://www.google.com/url?url=https://example.com/')).href).toBe(
      'https://example.com/',
    );
  });
  test('leaves other URLs and non-http targets alone', () => {
    expect(unwrapRedirect(new URL('https://www.google.com/search?q=x')).pathname).toBe('/search');
    expect(unwrapRedirect(new URL('https://www.google.com/url?q=javascript:1')).hostname).toBe('www.google.com');
    expect(unwrapRedirect(new URL('https://www.google.com/url')).hostname).toBe('www.google.com');
  });
  test('normalizeUrl parses then unwraps', () => {
    expect(normalizeUrl('https://www.google.com/url?q=https://github.com/z')?.hostname).toBe('github.com');
    expect(normalizeUrl('ftp://x')).toBeNull();
  });
});

describe('scope', () => {
  test('isMatch uses match only', () => {
    expect(isMatch(gmail, 'https://mail.google.com/')).toBe(true);
    expect(isMatch(gmail, 'https://accounts.google.com/')).toBe(false);
  });
  test('isAllowed uses allow only', () => {
    expect(isAllowed(gmail, 'https://accounts.google.com/')).toBe(true);
    expect(isAllowed(gmail, 'https://mail.google.com/')).toBe(false);
  });
  test('Okta SSO hops stay in-app for the Google sites', () => {
    const calendar = sitesFile.sites.find((s) => s.id === 'calendar')!;
    const oktaStep = 'https://example.okta.com/login/sessionCookieRedirect?checkAccountSetupComplete=true&token=x';
    expect(isInScope(gmail, oktaStep)).toBe(true);
    expect(isInScope(calendar, oktaStep)).toBe(true);
    expect(isInScope(gmail, 'https://example.okta.com/app/google/abc/sso/saml?SAMLRequest=y')).toBe(true);
    // allow-only: the router must never send Okta links to Gmail
    expect(isMatch(gmail, oktaStep)).toBe(false);
  });
  test('Okta SSO hops stay in-app for GitHub too', () => {
    const oktaGithub = 'https://example.okta.com/app/github/exk123/sso/saml?SAMLRequest=x';
    expect(isInScope(github, oktaGithub)).toBe(true);
    expect(isMatch(github, oktaGithub)).toBe(false);
    expect(isInScope(github, 'https://github.com/orgs/example/saml/consume')).toBe(true);
  });
  test('Workspace SAML assertion consumer (www.google.com/a/<domain>/acs) stays in-app, rest of www.google.com does not', () => {
    const calendar = sitesFile.sites.find((s) => s.id === 'calendar')!;
    const acs = 'https://www.google.com/a/example.com/acs';
    expect(isInScope(gmail, acs)).toBe(true);
    expect(isInScope(calendar, acs)).toBe(true);
    expect(isMatch(gmail, acs)).toBe(false);
    expect(isInScope(gmail, 'https://www.google.com/search?q=x')).toBe(false);
    expect(isInScope(gmail, 'https://www.google.com/')).toBe(false);
  });
  test('isInScope is match or allow', () => {
    expect(isInScope(gmail, 'https://mail.google.com/')).toBe(true);
    expect(isInScope(gmail, 'https://accounts.google.com/')).toBe(true);
    expect(isInScope(gmail, 'https://docs.google.com/')).toBe(false);
    expect(isInScope(github, 'https://raw.githubusercontent.com/x')).toBe(true);
    expect(isInScope(github, 'not a url')).toBe(false);
  });
});

describe('routeTarget against fixtures', () => {
  for (const c of fixtures.cases) {
    test(`${c.url} -> ${c.route}`, () => {
      expect(routeTarget(sitesFile.sites, c.url)).toBe(c.route);
    });
  }
});

describe('validateSites', () => {
  test('sites.json has no overlapping match patterns', () => {
    expect(validateSites(sitesFile.sites)).toEqual([]);
  });
  test('reports a pattern claimed twice', () => {
    const errors = validateSites([
      { id: 'a', match: ['x.com'], allow: [] },
      { id: 'b', match: ['X.com'], allow: [] },
    ]);
    expect(errors).toEqual(['pattern "x.com" claimed by both a and b']);
  });
});
