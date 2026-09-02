/** Google rejects sign-in from a UA containing "Electron"; present as plain Chrome. */
export function chromeUserAgent(chromeVersion: string): string {
  const major = chromeVersion.split('.')[0];
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}
