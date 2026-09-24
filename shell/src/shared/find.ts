export interface FindResult {
  activeMatchOrdinal: number;
  matches: number;
}

/** Match counter shown in the find bar: blank until there is a query, then "2 of 5" or "No results". */
export function matchLabel(query: string, result: FindResult | null): string {
  if (!query || !result) return '';
  if (result.matches === 0) return 'No results';
  return `${result.activeMatchOrdinal} of ${result.matches}`;
}
