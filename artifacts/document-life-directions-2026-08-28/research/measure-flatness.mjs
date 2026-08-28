/**
 * Flatness measurement — "The Document — Life" review (2026-08-28).
 *
 * For each of /desk, /doc/<project_rich>, /library, /people (1440x900, after
 * networkidle + 1500ms settle): background-color histogram, border-color
 * histogram, WCAG contrast among the top-5 backgrounds, font-size histogram,
 * font-family x font-weight histogram, largest Playfair text, uppercase+mono
 * count, box-shadow/drop-shadow inventory, and named-surface backgrounds
 * (body/main/spine/drawer/margin) + their pairwise contrast.
 *
 * Contrast math ported verbatim from
 * apps/designer-portal/src/lib/document/__tests__/contrast.test.ts
 * (relativeLuminance / contrastRatio, WCAG 2.2 sRGB relative luminance).
 *
 * Run from apps/designer-portal so @playwright/test resolves:
 *   node <this file>
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = '/Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28';
mkdirSync(path.join(PROGRAM, 'research'), { recursive: true });

const BASE = 'http://localhost:3000';
const LADDER = JSON.parse(readFileSync(path.join(__dirname, 'state-ladder.json'), 'utf8'));
const R = LADDER.rungs;

const TEST_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev';
const TEST_PASSWORD = process.env.DESIGNER_E2E_PASSWORD ?? 'password123';

async function signIn(page) {
  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, { timeout: 30_000, waitUntil: 'networkidle' });
  if (!page.url().includes('/auth/signin')) return;
  const disclosure = page.getByRole('button', { name: /sign in with email|use email and password instead/i });
  await disclosure.first().waitFor({ state: 'visible', timeout: 15_000 });
  await disclosure.first().click();
  await page.getByLabel(/email/i).first().fill(TEST_EMAIL);
  await page.getByLabel(/password/i).first().fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/, { timeout: 60_000 });
}

async function dismissWelcomeModal(page) {
  const overlay = page.locator('[data-testid="welcome-modal-overlay"]');
  if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

/** In-page measurement — everything below runs inside the browser via page.evaluate. */
function inPageMeasure() {
  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  function hasDirectText(el) {
    // Editable fields (e.g. the document title letterhead input) hold their
    // text in .value, not a child Text node — textContent-based scans miss
    // them entirely. Discovered live: "Chen Residence" (an <input>, Playfair
    // Display 27.9px) was invisible to the first pass of this scan.
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value && el.value.trim().length > 0) {
      return true;
    }
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) return true;
    }
    return false;
  }

  function textOf(el) {
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value) return el.value;
    return el.textContent;
  }

  const all = Array.from(document.querySelectorAll('*')).filter(isVisible);

  // (a) background-color histogram
  const bgCounts = new Map();
  for (const el of all) {
    const bg = window.getComputedStyle(el).backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
    bgCounts.set(bg, (bgCounts.get(bg) ?? 0) + 1);
  }
  const topBackgrounds = [...bgCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  // (b) border-color histogram (any side, width>0)
  const borderCounts = new Map();
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  for (const el of all) {
    const cs = window.getComputedStyle(el);
    for (const side of sides) {
      const width = parseFloat(cs[`border${side}Width`]);
      const style = cs[`border${side}Style`];
      if (width > 0 && style !== 'none') {
        const color = cs[`border${side}Color`];
        if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
          borderCounts.set(color, (borderCounts.get(color) ?? 0) + 1);
        }
      }
    }
  }
  const topBorders = [...borderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  // (d) font-size histogram of text-bearing elements
  const buckets = { '8-10': 0, '11-12': 0, '13-14': 0, '15-16': 0, '17-24': 0, '25+': 0 };
  let textBearingCount = 0;
  // (e) font-family x font-weight histogram
  const familyWeightCounts = new Map();
  // (f) largest Playfair
  let largestPlayfair = { size: 0, text: '' };
  // (g) uppercase + monospace count
  let uppercaseMonoCount = 0;

  for (const el of all) {
    if (!hasDirectText(el)) continue;
    textBearingCount += 1;
    const cs = window.getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size < 11) buckets['8-10'] += 1;
    else if (size < 13) buckets['11-12'] += 1;
    else if (size < 15) buckets['13-14'] += 1;
    else if (size < 17) buckets['15-16'] += 1;
    else if (size < 25) buckets['17-24'] += 1;
    else buckets['25+'] += 1;

    const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const weight = cs.fontWeight;
    const key = `${family} / ${weight}`;
    familyWeightCounts.set(key, (familyWeightCounts.get(key) ?? 0) + 1);

    if (cs.fontFamily.toLowerCase().includes('playfair') && size > largestPlayfair.size) {
      largestPlayfair = { size, text: textOf(el).trim().slice(0, 80) };
    }

    if (cs.textTransform === 'uppercase' && cs.fontFamily.toLowerCase().includes('mono')) {
      uppercaseMonoCount += 1;
    }
  }
  const fontFamilyWeight = [...familyWeightCounts.entries()].sort((a, b) => b[1] - a[1]);

  // (h) box-shadow / drop-shadow inventory
  const shadowEls = [];
  for (const el of all) {
    const cs = window.getComputedStyle(el);
    const hasBoxShadow = cs.boxShadow && cs.boxShadow !== 'none';
    const hasDropShadow = cs.filter && cs.filter.includes('drop-shadow');
    if (hasBoxShadow || hasDropShadow) {
      const classes = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 3).join('.') : '';
      shadowEls.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: classes || null,
        boxShadow: hasBoxShadow ? cs.boxShadow : null,
        filter: hasDropShadow ? cs.filter : null,
      });
    }
  }

  // (i) named-surface backgrounds
  function bgOf(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    return window.getComputedStyle(el).backgroundColor;
  }
  const namedSurfaces = {
    body: bgOf('body'),
    main: bgOf('main'),
    spineRail: bgOf('[data-document-spine]') ?? bgOf('aside[data-document-spine]'),
    drawer: bgOf('[aria-label="Studio drawer"]'),
    marginRail: bgOf('[data-margin-panel]'),
  };

  // CSS custom properties of interest
  const rootStyle = window.getComputedStyle(document.documentElement);
  const tokens = {
    '--text-muted': rootStyle.getPropertyValue('--text-muted').trim(),
    '--text-subtle': rootStyle.getPropertyValue('--text-subtle').trim(),
    '--text-faint': rootStyle.getPropertyValue('--text-faint').trim(),
    '--color-quiet-ink': rootStyle.getPropertyValue('--color-quiet-ink').trim(),
    '--bg-hover': rootStyle.getPropertyValue('--bg-hover').trim(),
    '--doc-paper': rootStyle.getPropertyValue('--doc-paper').trim(),
    '--color-off-white': rootStyle.getPropertyValue('--color-off-white').trim(),
    '--color-pearl': rootStyle.getPropertyValue('--color-pearl').trim(),
    '--color-clay': rootStyle.getPropertyValue('--color-clay').trim(),
  };

  return {
    elementCount: all.length,
    textBearingCount,
    topBackgrounds,
    topBorders,
    fontSizeBuckets: buckets,
    fontFamilyWeight,
    largestPlayfair,
    uppercaseMonoCount,
    shadowEls,
    namedSurfaces,
    tokens,
  };
}

// ── WCAG contrast (ported from contrast.test.ts) ──
function parseColorToRgb(color) {
  if (!color) return null;
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  return [parts[0], parts[1], parts[2]];
}
function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const channel = v / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(colorA, colorB) {
  const rgbA = parseColorToRgb(colorA);
  const rgbB = parseColorToRgb(colorB);
  if (!rgbA || !rgbB) return null;
  const [lighter, darker] = [relativeLuminance(rgbA), relativeLuminance(rgbB)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const routes = [
  { key: 'desk', path: '/desk', waitSelector: '[aria-label="Desk actions"]' },
  { key: 'doc-project-rich', path: `/doc/${R.project_rich.id}`, waitSelector: '[data-document-shell]' },
  { key: 'library', path: '/library', waitSelector: null },
  { key: 'people', path: '/people', waitSelector: null },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20_000);

await signIn(page);

const results = {};
for (const route of routes) {
  await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  if (route.waitSelector) await page.waitForSelector(route.waitSelector, { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  if (route.key === 'desk') await dismissWelcomeModal(page);
  await page.waitForTimeout(1500);

  const measured = await page.evaluate(inPageMeasure);

  // Pairwise contrast among top-5 backgrounds
  const top5 = measured.topBackgrounds.slice(0, 5).map(([color]) => color);
  const pairwiseContrast = [];
  for (let i = 0; i < top5.length; i++) {
    for (let j = i + 1; j < top5.length; j++) {
      pairwiseContrast.push({
        a: top5[i],
        b: top5[j],
        ratio: contrastRatio(top5[i], top5[j]),
      });
    }
  }

  // Named-surface pairwise contrast
  const surfaces = measured.namedSurfaces;
  const surfaceNames = Object.keys(surfaces).filter((k) => surfaces[k]);
  const surfaceContrast = [];
  for (let i = 0; i < surfaceNames.length; i++) {
    for (let j = i + 1; j < surfaceNames.length; j++) {
      const a = surfaceNames[i];
      const b = surfaceNames[j];
      surfaceContrast.push({
        a, aColor: surfaces[a],
        b, bColor: surfaces[b],
        ratio: contrastRatio(surfaces[a], surfaces[b]),
      });
    }
  }

  results[route.key] = {
    route: route.path,
    ...measured,
    pairwiseContrast,
    surfaceContrast,
  };
  console.log(`✓ measured ${route.key} (${route.path}) — ${measured.elementCount} visible elements, ${measured.textBearingCount} text-bearing`);
}

writeFileSync(path.join(PROGRAM, 'research/12-measurements.json'), JSON.stringify(results, null, 2));
console.log('\nWrote research/12-measurements.json');

await browser.close();
