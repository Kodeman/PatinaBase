/**
 * The lens's printed contrast, its shadow census, and its network cost
 * (R127 Wave 4, W4-L4).
 *
 * Three unrelated claims share one file because all three are properties of
 * the SAME rendered frame at rest, not of the density mechanism — none of
 * this depends on `data-density`/`data-passed` existing, so this file is a
 * real proof today:
 *
 *   1. Composited text contrast >= 4.5:1 for the band's two lines, the
 *      rail's stop names/values, and every region head's name + count line
 *      — computed against the ACTUAL painted ground (compositing every
 *      ancestor's background up to opaque), never against a token's raw hex
 *      pair the way `contrast.test.ts` does at the source level.
 *   2. Box-shadow census: every element with a non-`none` computed
 *      `box-shadow` on the document route carries `.doc-elevated`
 *      (`shadow-gate.test.ts`'s sanctioned mechanism — the margin chips, the
 *      open ledger sheet, the studio drawer, and nothing else).
 *   3. Zero SUPABASE-ORIGIN requests during a 30-step settled scroll, once
 *      the paper's own initial-load tail has gone quiet (D-B28) — the
 *      readiness fan-out (`get_project_ffe_readiness`, one RPC per FF&E
 *      line) is a dependent query that finishes 5-6s after navigation, not a
 *      lens fetch, so the precondition is `quiet()` before the listener
 *      attaches, and the allowlist is exactly token-refresh + realtime.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { scrollTo, settle, quiet } from '../helpers/lens';
import { LONG_PAPER_ID, assertLongPaper } from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal',
);

const CONTRAST_FLOOR = 4.5;

async function openPaper(page: AuthenticatedPage): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
}

/** Composited text contrast for every element matched by `selector`,
 *  computed inside the page against each element's actual painted ground —
 *  ancestor backgrounds alpha-composited up to the first opaque one, falling
 *  back to white for a fully transparent stack. */
async function composedContrasts(
  page: AuthenticatedPage,
  selector: string,
): Promise<{ text: string; ratio: number }[]> {
  return page.evaluate((sel) => {
    function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1]!.split(',').map((part) => parseFloat(part.trim()));
      return {
        r: parts[0] ?? 0,
        g: parts[1] ?? 0,
        b: parts[2] ?? 0,
        a: parts.length > 3 ? parts[3]! : 1,
      };
    }
    function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
      const [R, G, B] = [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    }
    function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
      const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (lighter + 0.05) / (darker + 0.05);
    }
    function effectiveBackground(el: Element): { r: number; g: number; b: number } {
      const chain: { r: number; g: number; b: number; a: number }[] = [];
      let node: Element | null = el;
      while (node) {
        const bg = parseColor(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) chain.unshift(bg);
        node = node.parentElement;
      }
      let result = { r: 255, g: 255, b: 255 };
      for (const c of chain) {
        result = {
          r: c.r * c.a + result.r * (1 - c.a),
          g: c.g * c.a + result.g * (1 - c.a),
          b: c.b * c.a + result.b * (1 - c.a),
        };
      }
      return result;
    }

    const out: { text: string; ratio: number }[] = [];
    document.querySelectorAll(sel).forEach((el) => {
      const text = el.textContent?.replace(/\s+/g, ' ').trim();
      if (!text) return;
      const style = getComputedStyle(el);
      const fg = parseColor(style.color);
      if (!fg) return;
      const bg = effectiveBackground(el);
      out.push({ text, ratio: contrastRatio(fg, bg) });
    });
    return out;
  }, selector);
}

test.describe('the lens: printed contrast, shadow census, network cost', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  const SELECTORS: { label: string; selector: string }[] = [
    { label: 'the band lines', selector: '[data-lens-band] [data-lens-line]' },
    {
      label: 'the rail stop names',
      selector: '[data-lens-ladder] [data-index-region] > span:first-child',
    },
    { label: 'the rail doors', selector: '[data-ladder-door]' },
    { label: 'region head names', selector: '[data-region-head] h2' },
    { label: 'region head count lines', selector: '[data-region-head] p' },
  ];

  for (const { label, selector } of SELECTORS) {
    test(`composited contrast >= ${CONTRAST_FLOOR}:1 — ${label}`, async ({
      authenticatedPage: page,
    }) => {
      await openPaper(page);
      await scrollTo(page, 0);
      const results = await composedContrasts(page, selector);
      expect(results.length, `no elements matched "${selector}"`).toBeGreaterThan(0);
      const failing = results.filter((r) => r.ratio < CONTRAST_FLOOR);
      expect(
        failing,
        `below ${CONTRAST_FLOOR}:1 — ${JSON.stringify(failing)}`,
      ).toEqual([]);
    });
  }

  test('box-shadow census: only .doc-elevated sites cast one', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    await scrollTo(page, 0);
    // Scoped to [data-document-shell], never `body *`: the studio mounts
    // global chrome outside the document tree (a toast root among it, a
    // goober-generated `.go<hash>` class carrying Tailwind's default
    // `shadow-lg` pair) that shadow-gate.test.ts's own source-level scan
    // never claims to cover either — its scan is
    // `src/components/document/**`, not the whole app shell.
    const offenders = await page.evaluate(() => {
      const found: string[] = [];
      const shell = document.querySelector('[data-document-shell]');
      if (!shell) return ['no [data-document-shell] found'];
      shell.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const shadow = getComputedStyle(el).boxShadow;
        if (shadow && shadow !== 'none') {
          if (!el.classList.contains('doc-elevated')) {
            found.push(
              `${el.tagName.toLowerCase()}.${Array.from(el.classList).slice(0, 2).join('.')} — ${shadow}`,
            );
          }
        }
      });
      return found;
    });
    expect(
      offenders,
      `box-shadow outside .doc-elevated (shadow-gate.test.ts's sanctioned mechanism): ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  // D-B28 — the initial load's dependent readiness fan-out
  // (`get_project_ffe_readiness`, one RPC per FF&E line at concurrency 8) is
  // a TAIL of `openPaper`, not a lens fetch: it fires 5-6s after navigation,
  // well after `settle()` returns (W3 code publishes no `data-lens-settled`),
  // so the assertion needs the paper to have gone genuinely quiet first —
  // `quiet()` waits for `networkidle` plus a full window of zero Supabase-
  // origin requests before the listener for the scroll itself attaches.
  test('zero Supabase-origin requests during a 30-step settled scroll (D-B28 allowlist)', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    await scrollTo(page, 0);
    await settle(page);

    const preScroll = await quiet(page);
    console.log(
      `readiness fan-out observed before quiet: ${preScroll.readinessRequestsSeen} requests ` +
        `(${preScroll.supabaseRequestsSeen} Supabase-origin requests total)`,
    );

    const origin = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    ).origin;
    const offenders: string[] = [];
    const other: string[] = [];
    const onRequest = (req: { url(): string }) => {
      const url = req.url();
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (parsed.origin !== origin) {
        // Lazy `<img>`, `/_next/` chunks, fonts — the browser's own lazy
        // loading and Next's code-splitting, pre-existing and not a lens
        // fetch. Logged for I152, never asserted.
        other.push(url);
        return;
      }
      // Exactly two allowlisted Supabase paths: GoTrue's timer-driven token
      // refresh (fires on session age, not scroll) and the realtime
      // channel's own HTTP handshake/heartbeat. Everything else — `rpc/*`,
      // `rest/v1/*`, a mid-scroll `/auth/v1/user` — is what this assertion
      // is about.
      const isTokenRefresh =
        parsed.pathname === '/auth/v1/token' &&
        parsed.searchParams.get('grant_type') === 'refresh_token';
      const isRealtime = parsed.pathname.startsWith('/realtime/v1/');
      if (!isTokenRefresh && !isRealtime) offenders.push(url);
    };
    page.on('request', onRequest);

    const step = 2400 / 30;
    for (let i = 1; i <= 30; i += 1) {
      await scrollTo(page, Math.round(step * i));
    }

    page.off('request', onRequest);
    console.log(
      `non-Supabase requests during the scroll (not asserted): ${other.length}` +
        (other.length ? ` — ${JSON.stringify(other)}` : ''),
    );
    expect(
      offenders,
      `Supabase-origin request(s) outside the allowlist during a pure scroll: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });
});
