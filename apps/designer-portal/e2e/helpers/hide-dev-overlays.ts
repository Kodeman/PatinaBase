import type { Page } from '@playwright/test';

/**
 * Hides dev-server-only floating overlays that intercept pointer events in
 * e2e runs. The TanStack Query Devtools toggle (providers.tsx renders
 * <ReactQueryDevtools/> in dev) floats at the fixed bottom-right corner —
 * exactly where right-anchored panel footers (e.g. the Order Assistant's
 * "Done" button) put their primary action — and swallows clicks aimed at
 * narrow buttons whose center lands on it. Production builds render none of
 * this, so suppressing it tests nothing real away.
 *
 * Registered as an init script so the style re-applies on every full
 * document load (page.addStyleTag would be lost on the next goto).
 */
export async function hideDevOverlays(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style');
      style.setAttribute('data-e2e-hide-dev-overlays', '');
      style.textContent =
        '.tsqd-open-btn-container, .tsqd-main-panel { display: none !important; pointer-events: none !important; }';
      document.head?.appendChild(style);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject);
    } else {
      inject();
    }
  });
}
