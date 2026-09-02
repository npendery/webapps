import { describe, expect, test } from 'vitest';
import { decideNavigation, decideWindowOpen } from './policy';

const gmail = { id: 'gmail', match: ['mail.google.com'], allow: ['accounts.google.com'] };

describe('decideNavigation', () => {
  test('allows in-scope and non-http', () => {
    expect(decideNavigation(gmail, 'https://mail.google.com/mail/')).toEqual({ action: 'allow' });
    expect(decideNavigation(gmail, 'https://accounts.google.com/signin')).toEqual({ action: 'allow' });
    expect(decideNavigation(gmail, 'about:blank')).toEqual({ action: 'allow' });
  });
  test('sends out-of-scope to external, unwrapped', () => {
    expect(decideNavigation(gmail, 'https://docs.google.com/d/1')).toEqual({
      action: 'external',
      url: 'https://docs.google.com/d/1',
    });
    expect(decideNavigation(gmail, 'https://www.google.com/url?q=https://github.com/a/b')).toEqual({
      action: 'external',
      url: 'https://github.com/a/b',
    });
  });
});

describe('decideWindowOpen', () => {
  test('match host becomes a tab', () => {
    expect(decideWindowOpen(gmail, 'https://mail.google.com/mail/u/0/#inbox')).toEqual({
      action: 'tab',
      url: 'https://mail.google.com/mail/u/0/#inbox',
    });
  });
  test('allow-only host and non-http become popups', () => {
    expect(decideWindowOpen(gmail, 'https://accounts.google.com/o/oauth2')).toEqual({ action: 'popup' });
    expect(decideWindowOpen(gmail, 'about:blank')).toEqual({ action: 'popup' });
    expect(decideWindowOpen(gmail, '')).toEqual({ action: 'popup' });
  });
  test('everything else goes external, unwrapped', () => {
    expect(decideWindowOpen(gmail, 'https://www.google.com/url?q=https://example.com/x')).toEqual({
      action: 'external',
      url: 'https://example.com/x',
    });
  });
});
