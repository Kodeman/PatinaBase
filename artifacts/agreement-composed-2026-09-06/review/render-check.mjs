// Render-check for proposal.html — Part A of the adversarial review.
//
// Usage (run from apps/designer-portal so `@playwright/test` resolves):
//   cd /Users/kody/Code/patina-merged/apps/designer-portal
//   node /Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/review/render-check.mjs
//
// NOTE: review/shots/*.png (full-page renders) are large and are NOT to be
// committed. review/crops/*.png are small and fine to keep if useful, but
// treat both directories as scratch output — do not `git add` them.
//
// This script wraps the proposal.html FRAGMENT in the same minimal shell the
// Artifact publisher uses before rendering, checks it at three widths (390 /
// 760 / 1280) under three theme conditions (explicit light, explicit dark,
// and no-attribute + prefers-color-scheme:dark), and writes a pass/fail
// report to review/render-check-results.json. Exits non-zero if any check
// fails anywhere.

// NOTE: ESM bare-specifier resolution walks up from THIS file's own
// directory (artifacts/.../review/), not from the process cwd — so "cd to
// apps/designer-portal first" (per the header comment above) never actually
// made '@playwright/test' resolve here. Import it by absolute path into the
// designer-portal install instead, which does have it as a devDependency.
import { chromium } from '/Users/kody/Code/patina-merged/apps/designer-portal/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06';
const REVIEW_DIR = path.join(ROOT, 'review');
const PROPOSAL_PATH = path.join(ROOT, 'proposal.html');
const SHOTS_DIR = path.join(REVIEW_DIR, 'shots');
const CROPS_DIR = path.join(REVIEW_DIR, 'crops');
const WRAPPED_TMP = path.join(ROOT, '.render-check-wrapped.html');

fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.mkdirSync(CROPS_DIR, { recursive: true });

const VIEWPORTS = [
  { w: 390, h: 844, label: '390' },
  { w: 760, h: 1000, label: '760' },
  { w: 1280, h: 900, label: '1280' },
];

// Three theme conditions per the review brief:
//  - 'light'       : <html data-theme="light">, prefers-color-scheme: light
//  - 'dark'        : <html data-theme="dark">,   prefers-color-scheme: dark
//  - 'system-dark' : <html> (no attribute),      prefers-color-scheme: dark
const MODES = [
  { name: 'light', attr: 'light', colorScheme: 'light' },
  { name: 'dark', attr: 'dark', colorScheme: 'dark' },
  { name: 'system-dark', attr: null, colorScheme: 'dark' },
];

// Crops are only captured for these two (viewport-label, mode-name) renders.
const CROP_TARGETS = [
  { vpLabel: '390', mode: 'light' },
  { vpLabel: '1280', mode: 'dark' },
];

function wrapFragment(fragment, mode) {
  const themeAttr = mode.attr ? ` data-theme="${mode.attr}"` : '';
  return (
    `<!doctype html><html${themeAttr}><head><meta charset=utf-8>` +
    `<meta name=viewport content="width=device-width,initial-scale=1"></head>` +
    `<body>${fragment}</body></html>`
  );
}

// ---------- in-page check functions ----------

async function checkOverflow(page) {
  return await page.evaluate(() => {
    const de = document.documentElement;
    const overflow = de.scrollWidth - window.innerWidth;
    if (overflow <= 1) return { pass: true, overflow: Math.max(overflow, 0), offender: null };
    let worst = null;
    let worstRight = window.innerWidth;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > worstRight) {
        worstRight = r.right;
        worst = el;
      }
    }
    const describe = (el) => {
      if (!el) return null;
      const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().replace(/\s+/g, '.') : '';
      const id = el.id ? '#' + el.id : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 160);
    };
    return {
      pass: false,
      overflow,
      offender: describe(worst),
      offenderText: worst ? (worst.textContent || '').trim().slice(0, 60) : null,
    };
  });
}

async function checkSectionsAndNav(page) {
  return await page.evaluate(() => {
    const sectionFailures = [];
    const sections = Array.from(document.querySelectorAll('section[id]'));
    for (const s of sections) {
      const h = s.getBoundingClientRect().height;
      if (h <= 0) {
        sectionFailures.push({ selector: `section#${s.id}`, message: `zero height (${h}px)` });
      }
    }

    const navFailures = [];
    const navLinks = Array.from(document.querySelectorAll('.index a[href^="#"]'));
    for (const a of navLinks) {
      const id = a.getAttribute('href').slice(1);
      if (!id || !document.getElementById(id)) {
        navFailures.push({
          selector: `.index a[href="#${id}"]`,
          message: `target element #${id} does not exist`,
        });
      }
    }

    return {
      sectionCount: sections.length,
      sectionFailures,
      navLinkCount: navLinks.length,
      navFailures,
    };
  });
}

async function checkFigures(page) {
  return await page.evaluate(() => {
    const failures = [];
    const figures = Array.from(document.querySelectorAll('figure.mock'));
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      const selector = fig.id ? `figure#${fig.id}` : `figure.mock:nth-of-type(${i + 1})`;
      const rect = fig.getBoundingClientRect();
      if (rect.height < 40) {
        failures.push({ selector, message: `height ${Math.round(rect.height)}px < 40px minimum` });
      }
      const overflow = fig.scrollWidth - fig.clientWidth;
      if (overflow > 1) {
        // Allow overflow that is fully explained by a .mockscroll descendant
        // scrolling internally (its own box stays inside the figure, only
        // its content scrolls) — that's legitimate, not clipping.
        const scrollers = Array.from(fig.querySelectorAll('.mockscroll'));
        const figRect = fig.getBoundingClientRect();
        const allContained =
          scrollers.length > 0 &&
          scrollers.every((sc) => {
            const r = sc.getBoundingClientRect();
            return r.left >= figRect.left - 1 && r.right <= figRect.right + 1;
          });
        if (!allContained) {
          failures.push({
            selector,
            message: `content wider than container: scrollWidth ${fig.scrollWidth} > clientWidth ${fig.clientWidth} (+1px tolerance), no containing .mockscroll found`,
          });
        }
      }
    }
    return { figureCount: figures.length, failures };
  });
}

async function checkMinFontSize(page) {
  return await page.evaluate(() => {
    const failures = [];
    let min = Infinity;
    for (const el of document.querySelectorAll('body *')) {
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .trim();
      if (!directText) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const px = parseFloat(cs.fontSize);
      if (px < min) min = px;
      if (px < 11) {
        const cls = el.className && typeof el.className === 'string' ? el.className.slice(0, 50) : '';
        failures.push({
          selector: `${el.tagName.toLowerCase()}${cls ? '.' + cls.replace(/\s+/g, '.') : ''}`,
          message: `font-size ${Math.round(px * 100) / 100}px < 11px minimum ("${directText.slice(0, 40)}")`,
        });
      }
    }
    return { min: min === Infinity ? null : Math.round(min * 100) / 100, failures: failures.slice(0, 20), failureCount: failures.length };
  });
}

async function checkDarkContrast(page) {
  return await page.evaluate(() => {
    function parseColor(str) {
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    function relLum({ r, g, b }) {
      const lin = (c) => {
        const cs = c / 255;
        return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }
    function ratio(c1, c2) {
      const L1 = relLum(c1);
      const L2 = relLum(c2);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    }

    const body = document.body;
    const bodyCs = getComputedStyle(body);
    const bg = parseColor(bodyCs.backgroundColor) || { r: 255, g: 255, b: 255 };
    const bodyColor = parseColor(bodyCs.color);

    let sampleP = null;
    for (const p of document.querySelectorAll('p')) {
      const rect = p.getBoundingClientRect();
      const text = (p.textContent || '').trim();
      if (rect.width > 0 && rect.height > 0 && text) {
        sampleP = p;
        break;
      }
    }
    const pColor = sampleP ? parseColor(getComputedStyle(sampleP).color) : null;

    const bodyRatio = bodyColor ? Math.round(ratio(bodyColor, bg) * 100) / 100 : null;
    const pRatio = pColor ? Math.round(ratio(pColor, bg) * 100) / 100 : null;

    return {
      bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      bodyColor: bodyCs.color,
      bodyRatio,
      pColor: sampleP ? getComputedStyle(sampleP).color : null,
      pRatio,
    };
  });
}

async function checkHiddenInFigures(page) {
  return await page.evaluate(() => {
    const failures = [];
    const figures = Array.from(document.querySelectorAll('figure.mock'));
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      const figSelector = fig.id ? `figure#${fig.id}` : `figure.mock:nth-of-type(${i + 1})`;
      for (const el of fig.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display !== 'none') continue;
        if (el.classList.contains('sr-only')) continue;
        const cls = el.className && typeof el.className === 'string' ? el.className.slice(0, 50) : '';
        failures.push({
          selector: `${figSelector} ${el.tagName.toLowerCase()}${cls ? '.' + cls.replace(/\s+/g, '.') : ''}`,
          message: 'display:none inside figure.mock without sr-only class',
        });
      }
    }
    return failures;
  });
}

// ---------- main ----------

async function main() {
  if (!fs.existsSync(PROPOSAL_PATH)) {
    console.error(`FATAL: ${PROPOSAL_PATH} does not exist yet.`);
    process.exit(1);
  }
  const fragment = fs.readFileSync(PROPOSAL_PATH, 'utf8');

  const browser = await chromium.launch();
  const renders = [];

  try {
    for (const mode of MODES) {
      const wrapped = wrapFragment(fragment, mode);
      fs.writeFileSync(WRAPPED_TMP, wrapped, 'utf8');
      const fileUrl = 'file://' + WRAPPED_TMP;

      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await page.emulateMedia({ colorScheme: mode.colorScheme });
        await page.goto(fileUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(300); // let web fonts settle

        const checks = [];

        const overflow = await checkOverflow(page);
        checks.push({
          name: 'no-horizontal-overflow',
          pass: overflow.pass,
          message: overflow.pass
            ? 'ok'
            : `scrollWidth exceeds innerWidth by ${overflow.overflow}px; offender ${overflow.offender} ("${overflow.offenderText}")`,
          failures: overflow.pass ? [] : [{ selector: overflow.offender, message: `overflow ${overflow.overflow}px` }],
        });

        const sn = await checkSectionsAndNav(page);
        checks.push({
          name: 'sections-nonzero-height',
          pass: sn.sectionFailures.length === 0,
          message: `${sn.sectionCount} section[id] found, ${sn.sectionFailures.length} with zero height`,
          failures: sn.sectionFailures,
        });
        checks.push({
          name: 'nav-index-targets-resolve',
          pass: sn.navFailures.length === 0,
          message: `${sn.navLinkCount} .index links checked, ${sn.navFailures.length} unresolved`,
          failures: sn.navFailures,
        });

        const fig = await checkFigures(page);
        checks.push({
          name: 'figures-sized-and-not-clipped',
          pass: fig.failures.length === 0,
          message: `${fig.figureCount} figure.mock checked, ${fig.failures.length} failing`,
          failures: fig.failures,
        });

        const fs11 = await checkMinFontSize(page);
        checks.push({
          name: 'min-font-size-11px',
          pass: fs11.failureCount === 0,
          message: `min visible font-size ${fs11.min}px; ${fs11.failureCount} elements below 11px`,
          failures: fs11.failures,
        });

        const isDarkish = mode.name === 'dark' || mode.name === 'system-dark';
        if (isDarkish) {
          const c = await checkDarkContrast(page);
          const ratios = [c.bodyRatio, c.pRatio].filter((r) => r !== null);
          const worst = ratios.length ? Math.min(...ratios) : null;
          checks.push({
            name: 'dark-contrast-4.5',
            pass: worst !== null ? worst >= 4.5 : false,
            message:
              worst !== null
                ? `body bg ${c.bg}; body text ${c.bodyColor} (ratio ${c.bodyRatio}); sample p text ${c.pColor} (ratio ${c.pRatio}); worst ${worst}`
                : 'could not compute (no parseable body/paragraph color found)',
            failures:
              worst !== null && worst >= 4.5
                ? []
                : [{ selector: 'body / p', message: `contrast ratio ${worst} < 4.5 against bg ${c.bg}` }],
          });
        } else {
          checks.push({
            name: 'dark-contrast-4.5',
            pass: true,
            skipped: true,
            message: 'skipped — not a dark-ish render',
            failures: [],
          });
        }

        const hidden = await checkHiddenInFigures(page);
        checks.push({
          name: 'no-hidden-content-in-figures',
          pass: hidden.length === 0,
          message: `${hidden.length} display:none elements inside figure.mock without sr-only`,
          failures: hidden,
        });

        // full-page screenshot
        const shotPath = path.join(SHOTS_DIR, `full-${vp.label}-${mode.name}.png`);
        await page.screenshot({ path: shotPath, fullPage: true });

        // crops for the two designated renders
        const isCropTarget = CROP_TARGETS.some((t) => t.vpLabel === vp.label && t.mode === mode.name);
        if (isCropTarget) {
          const topPath = path.join(CROPS_DIR, `top-${vp.label}-${mode.name}.png`);
          try {
            await page.screenshot({
              path: topPath,
              clip: { x: 0, y: 0, width: vp.w, height: Math.min(600, vp.h) },
            });
          } catch (e) {
            console.error(`top crop failed for ${vp.label}-${mode.name}: ${e.message}`);
          }

          for (const [slot, fallbackIndex] of [['m1', 0], ['m6', 5]]) {
            let handle = await page.$(`figure#${slot}`);
            if (!handle) {
              const all = await page.$$('figure.mock');
              handle = all[fallbackIndex] || null;
            }
            if (handle) {
              const cropPath = path.join(CROPS_DIR, `${slot}-${vp.label}-${mode.name}.png`);
              try {
                await handle.screenshot({ path: cropPath });
              } catch (e) {
                console.error(`${slot} crop failed for ${vp.label}-${mode.name}: ${e.message}`);
              }
            }
          }
        }

        const passCount = checks.filter((c) => c.pass).length;
        const failCount = checks.length - passCount;

        renders.push({
          viewport: vp.w,
          theme: mode.name,
          screenshot: path.relative(ROOT, shotPath),
          checks,
          passCount,
          failCount,
        });

        await page.close();
      }
    }
  } finally {
    await browser.close();
    try {
      fs.unlinkSync(WRAPPED_TMP);
    } catch (e) {
      // ignore
    }
  }

  const totalPass = renders.reduce((sum, r) => sum + r.passCount, 0);
  const totalFail = renders.reduce((sum, r) => sum + r.failCount, 0);
  const anyFail = totalFail > 0;

  const report = {
    generatedAt: new Date().toISOString(),
    proposalPath: PROPOSAL_PATH,
    renders,
    totals: { pass: totalPass, fail: totalFail },
  };

  fs.writeFileSync(path.join(REVIEW_DIR, 'render-check-results.json'), JSON.stringify(report, null, 2));

  // ---- compact stdout table ----
  console.log('\n=== RENDER CHECK RESULTS ===\n');
  const checkNames = renders[0] ? renders[0].checks.map((c) => c.name) : [];
  const header = ['viewport', 'theme', ...checkNames.map((n) => n.slice(0, 18))];
  console.log(header.join(' | '));
  for (const r of renders) {
    const row = [
      String(r.viewport),
      r.theme,
      ...r.checks.map((c) => (c.skipped ? 'SKIP' : c.pass ? 'PASS' : 'FAIL')),
    ];
    console.log(row.join(' | '));
  }
  console.log(`\nTotals: ${totalPass} pass / ${totalFail} fail`);
  console.log('Full JSON written to review/render-check-results.json');

  if (anyFail) {
    console.log('\n--- FAILURES ---');
    for (const r of renders) {
      for (const c of r.checks) {
        if (!c.pass && !c.skipped) {
          console.log(`[${r.viewport}/${r.theme}] ${c.name}: ${c.message}`);
          for (const f of c.failures.slice(0, 5)) {
            console.log(`    - ${f.selector}: ${f.message}`);
          }
        }
      }
    }
  }

  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
