// Render-check for proposal.html — Part A of the adversarial review.
// Usage: node render-check.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = '/Users/kody/Code/patina-merged/artifacts/pricing-mechanics-2026-09-05';
const REVIEW_DIR = path.join(ROOT, 'review');
const FILE_URL = 'file://' + path.join(ROOT, 'proposal.html');
const SHOTS = path.join(REVIEW_DIR, 'shots');
const PANELS = path.join(SHOTS, 'panels');
fs.mkdirSync(PANELS, { recursive: true });

const VIEWPORTS = [
  { w: 390, h: 844, label: '390' },
  { w: 1280, h: 900, label: '1280' },
  { w: 1440, h: 900, label: '1440' },
];
const SCHEMES = ['light', 'dark'];

// ---------- in-page helper functions (stringified, injected via addInitScript-less evaluate) ----------

async function checkOverflow(page) {
  return await page.evaluate(() => {
    const de = document.documentElement;
    const overflow = de.scrollWidth - window.innerWidth;
    if (overflow <= 0) return { overflow: 0, offender: null };
    // walk all elements, find the one whose right edge extends furthest past the viewport
    let worst = null;
    let worstRight = window.innerWidth;
    const all = document.querySelectorAll('body *');
    for (const el of all) {
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
      overflow,
      offender: describe(worst),
      offenderText: worst ? (worst.textContent || '').trim().slice(0, 60) : null,
      offenderRight: worst ? Math.round(worstRight) : null,
    };
  });
}

async function checkMonoFontSizes(page) {
  return await page.evaluate(() => {
    const results = [];
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      if (el.children.length > 0 && el.textContent.trim() === '') continue;
      const cls = (el.className && typeof el.className === 'string') ? el.className : '';
      const cs = getComputedStyle(el);
      const isMonoClass = /\bmono\b/.test(cls) || /\bref\b/.test(cls);
      const isMonoFont = /DM Mono/i.test(cs.fontFamily);
      if (!isMonoClass && !isMonoFont) continue;
      // only consider elements with their OWN direct text content (leaf-ish) —
      // do not fall back to full textContent, which would double-count every
      // ancestor of a leaf span with the same words.
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .trim();
      const text = directText;
      if (!text) continue;
      const px = parseFloat(cs.fontSize);
      results.push({
        px: Math.round(px * 100) / 100,
        text: text.slice(0, 40),
        tag: el.tagName.toLowerCase(),
        cls: cls.slice(0, 60),
      });
    }
    return results;
  });
}

async function checkContrast(page) {
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
    function contrastRatio(c1, c2) {
      const L1 = relLum(c1);
      const L2 = relLum(c2);
      const lighter = Math.max(L1, L2);
      const darker = Math.min(L1, L2);
      return (lighter + 0.05) / (darker + 0.05);
    }
    function nearestBg(el) {
      let cur = el;
      while (cur) {
        const cs = getComputedStyle(cur);
        const bg = parseColor(cs.backgroundColor);
        if (bg && bg.a > 0) return bg;
        cur = cur.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 }; // fallback white
    }

    const sel = 'p, li, td, th, span, h1, h2, h3, h4';
    const nodes = document.querySelectorAll(sel);
    const results = [];
    for (const el of nodes) {
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .trim();
      if (!directText) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      const fg = parseColor(cs.color);
      if (!fg) continue;
      const bg = nearestBg(el);
      const ratio = contrastRatio(fg, bg);
      const px = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const isLarge = px >= 24 || (px >= 18.66 && weight >= 700);
      const threshold = isLarge ? 3.0 : 4.5;
      if (ratio < threshold) {
        results.push({
          text: directText.slice(0, 60),
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 50) : '',
          ratio: Math.round(ratio * 100) / 100,
          threshold,
          fg: cs.color,
          bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          px: Math.round(px * 10) / 10,
          isLarge,
        });
      }
    }
    return results;
  });
}

async function checkNav(page) {
  return await page.evaluate(() => {
    const navLinks = Array.from(document.querySelectorAll('nav.index a[href^="#"]')).map((a) => a.getAttribute('href').slice(1));
    const missingTargets = navLinks.filter((id) => !document.getElementById(id));
    const sectionIds = Array.from(document.querySelectorAll('section[id]')).map((s) => s.id);
    const sectionsNotInNav = sectionIds.filter((id) => !navLinks.includes(id));
    return { navLinks, missingTargets, sectionIds, sectionsNotInNav };
  });
}

async function checkShadowAndRadius(page) {
  return await page.evaluate(() => {
    const shadows = [];
    const radii = [];
    const all = document.querySelectorAll('body *');
    const parseMaxRadius = (str) => {
      // border-radius can be "2px" or "2px 2px 0px 0px" or with "/" for elliptical
      const first = str.split('/')[0].trim();
      const vals = first.split(/\s+/).map((v) => parseFloat(v) || 0);
      return Math.max(...vals);
    };
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.boxShadow && cs.boxShadow !== 'none') {
        shadows.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 50) : '',
          value: cs.boxShadow,
        });
      }
      const br = parseMaxRadius(cs.borderRadius || '0px');
      if (br > 3) {
        radii.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 50) : '',
          value: cs.borderRadius,
          max: br,
        });
      }
      // pseudo-elements
      for (const pseudo of ['::before', '::after']) {
        try {
          const pcs = getComputedStyle(el, pseudo);
          if (pcs.content && pcs.content !== 'none' && pcs.content !== '""') {
            if (pcs.boxShadow && pcs.boxShadow !== 'none') {
              shadows.push({ tag: el.tagName.toLowerCase() + pseudo, cls: '', value: pcs.boxShadow });
            }
            const pbr = parseMaxRadius(pcs.borderRadius || '0px');
            if (pbr > 3) {
              radii.push({ tag: el.tagName.toLowerCase() + pseudo, cls: '', value: pcs.borderRadius, max: pbr });
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
    return { shadows, radii };
  });
}

// ---------- main ----------

async function main() {
  const browser = await chromium.launch();
  const summary = [];

  for (const scheme of SCHEMES) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(FILE_URL, { waitUntil: 'networkidle' });
      // give web fonts a moment
      await page.waitForTimeout(300);

      const overflow = await checkOverflow(page);
      const shotPath = path.join(SHOTS, `${vp.label}-${scheme}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });

      let panelCount = null;
      if (vp.label === '1280' && scheme === 'light') {
        const panels = await page.$$('.panel');
        panelCount = panels.length;
        for (let i = 0; i < panels.length; i++) {
          const capText = await panels[i].$eval('.panel-cap', (el) => el.textContent.trim()).catch(() => `panel-${i}`);
          const slug = capText
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
          const fname = path.join(PANELS, `${String(i).padStart(2, '0')}-${slug}.png`);
          try {
            await panels[i].screenshot({ path: fname });
          } catch (e) {
            console.error(`panel screenshot failed for index ${i}: ${e.message}`);
          }
        }
      }

      const monoSizes = await checkMonoFontSizes(page);
      const monoBelow12 = monoSizes.filter((m) => m.px < 12);

      const contrastFails = await checkContrast(page);

      const nav = await checkNav(page);

      const shadowRadius = await checkShadowAndRadius(page);

      summary.push({
        scheme,
        viewport: `${vp.w}x${vp.h}`,
        overflowPx: overflow.overflow,
        overflowOffender: overflow.offender,
        overflowOffenderText: overflow.offenderText,
        screenshot: path.relative(ROOT, shotPath),
        panelCount,
        monoTotal: monoSizes.length,
        monoBelow12Count: monoBelow12.length,
        monoBelow12Sample: monoBelow12.slice(0, 8),
        contrastFailCount: contrastFails.length,
        contrastFailSample: contrastFails.slice(0, 10),
        navMissingTargets: nav.missingTargets,
        navSectionsNotInNav: nav.sectionsNotInNav,
        shadowCount: shadowRadius.shadows.length,
        shadowSample: shadowRadius.shadows.slice(0, 5),
        radiusOver3Count: shadowRadius.radii.length,
        radiusOver3Sample: shadowRadius.radii.slice(0, 8),
      });

      await page.close();
    }
  }

  await browser.close();

  // ---- print compact table ----
  console.log('\n=== PART A RESULTS ===\n');
  const header = ['scheme', 'viewport', 'overflowPx', 'monoTotal', 'mono<12px', 'contrastFails', 'navMissing', 'sectionsNotInNav', 'boxShadow!=none', 'radius>3px'];
  console.log(header.join(' | '));
  for (const s of summary) {
    console.log(
      [
        s.scheme,
        s.viewport,
        s.overflowPx,
        s.monoTotal,
        s.monoBelow12Count,
        s.contrastFailCount,
        s.navMissingTargets.length,
        s.navSectionsNotInNav.length,
        s.shadowCount,
        s.radiusOver3Count,
      ].join(' | ')
    );
  }

  fs.writeFileSync(path.join(REVIEW_DIR, 'render-check-results.json'), JSON.stringify(summary, null, 2));
  console.log('\nFull JSON written to review/render-check-results.json');
  console.log(`Panel screenshots: ${summary.find((s) => s.panelCount !== null)?.panelCount ?? 'n/a'} panels captured at 1280-light`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
