import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { readSitesFile, resolveSiteConfig, siteConfigs } from './site';

const root = path.resolve(__dirname, '../../..');
const sitesPath = path.join(root, 'sites.json');
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'webapps-'));

describe('siteConfigs', () => {
  test('adds bundleId and fallbackBrowser to each site', () => {
    const configs = siteConfigs(readSitesFile(sitesPath));
    const gmail = configs.find((c) => c.id === 'gmail')!;
    expect(gmail.bundleId).toBe('dev.nick.webapps.gmail');
    expect(gmail.fallbackBrowser).toBe('com.brave.browser');
    expect(gmail.home).toBe('https://mail.google.com/');
    expect(configs.map((c) => c.id)).toEqual(['gmail', 'calendar', 'github']);
  });
});

describe('resolveSiteConfig', () => {
  test('prefers Resources/site.json when present', () => {
    const dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, 'site.json'),
      JSON.stringify({
        id: 'x',
        name: 'X',
        home: 'https://x.test/',
        match: ['x.test'],
        allow: [],
        bundleId: 'dev.nick.webapps.x',
        fallbackBrowser: 'com.brave.browser',
      }),
    );
    const cfg = resolveSiteConfig({ resourcesPath: dir, siteId: 'gmail', sitesFile: sitesPath });
    expect(cfg.id).toBe('x');
  });
  test('falls back to WEBAPPS_SITE id from sites.json in dev', () => {
    const cfg = resolveSiteConfig({ resourcesPath: tmpDir(), siteId: 'github', sitesFile: sitesPath });
    expect(cfg.bundleId).toBe('dev.nick.webapps.github');
  });
  test('throws for unknown or missing site id', () => {
    expect(() => resolveSiteConfig({ resourcesPath: tmpDir(), siteId: 'nope', sitesFile: sitesPath })).toThrow(
      /unknown site "nope"/,
    );
    expect(() => resolveSiteConfig({ resourcesPath: tmpDir(), siteId: undefined, sitesFile: sitesPath })).toThrow(
      /WEBAPPS_SITE/,
    );
  });
});
