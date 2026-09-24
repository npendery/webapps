import { describe, expect, test } from 'vitest';
import { matchLabel } from './find';

describe('matchLabel', () => {
  test('is blank without a query', () => {
    expect(matchLabel('', { activeMatchOrdinal: 1, matches: 3 })).toBe('');
  });

  test('is blank before the first result arrives', () => {
    expect(matchLabel('foo', null)).toBe('');
  });

  test('reports no results', () => {
    expect(matchLabel('foo', { activeMatchOrdinal: 0, matches: 0 })).toBe('No results');
  });

  test('reports the active match out of the total', () => {
    expect(matchLabel('foo', { activeMatchOrdinal: 2, matches: 5 })).toBe('2 of 5');
  });
});
