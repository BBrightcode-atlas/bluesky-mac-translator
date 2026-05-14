export function extractBskyTokens(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const colorScheme = cs.colorScheme || '';
  const prefersDark =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : false;
  const isDark = colorScheme.includes('dark') || prefersDark;

  return {
    '--bsky-link': '#1185fe',
    '--bsky-text': cs.color || (isDark ? '#e7e9ea' : '#0f1419'),
    '--bsky-border': isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
    '--bsky-secondary-bg': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    '--bsky-error-bg': 'rgba(220, 53, 69, 0.08)',
    '--bsky-error-text': isDark ? '#ff6b81' : '#b00020',
  };
}
