export function getIOSWebKitBrowser(userAgent: string): string | undefined {
  if (!/\bAppleWebKit\//.test(userAgent)) return;
  if (/\bEdgiOS\//.test(userAgent)) return 'Edge';
  if (/\bCriOS\//.test(userAgent)) return 'Chrome';
  if (/\bFxiOS\//.test(userAgent)) return 'Firefox';
}

// iOS browser brands can use WebKit, so CriOS and FxiOS do not count as
// Chromium or Gecko. Unknown engines receive the warning as well.
export function isSupportedBrowser(userAgent: string): boolean {
  if (/\b(?:iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS)\b/i.test(userAgent)) return false;
  return (
    /\b(?:Chrome|Chromium)\/\d+/.test(userAgent) ||
    (/\bGecko\/\d+/.test(userAgent) && /\bFirefox\/\d+/.test(userAgent))
  );
}
