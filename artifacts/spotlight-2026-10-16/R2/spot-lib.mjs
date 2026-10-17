// SQ-1047 R2 spotlight probes: geometry, D4 style checks, veil comparison, axe.
import fs from 'node:fs';
import { WT } from './walk-lib.mjs';

const AXE = fs.readFileSync(WT + '/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js', 'utf8');

// Everything the spotlight is drawing right now, plus the D4/K2 style facts.
export const spot = (page) => page.evaluate(() => {
  const layer = document.querySelector('[data-hold-spotlight]');
  const root = document.querySelector('[data-hold-spotlight-root]');
  const statusText = [...document.querySelectorAll('[data-hold-spotlight-root] [role=status]')].map((n) => n.innerText.trim()).filter(Boolean);
  if (!layer) return { open: false, status: statusText };
  const frame = layer.closest('[data-spotlight-frame]') || layer.parentElement;
  const fr = frame.getBoundingClientRect();
  const lr = layer.getBoundingClientRect();
  const bar = layer.querySelector('[data-hold-spotlight-bar]');
  const br = bar?.getBoundingClientRect();
  const rings = [...layer.querySelectorAll('[data-hold-spotlight-window]')].map((r) => {
    const b = r.getBoundingClientRect();
    return { id: r.getAttribute('data-hold-spotlight-window'), active: r.hasAttribute('data-active'), rect: [b.left, b.top, b.width, b.height].map(Math.round), stroke: getComputedStyle(r).stroke, strokeWidth: getComputedStyle(r).strokeWidth };
  });
  const styled = [layer, bar, ...layer.querySelectorAll('*')].filter(Boolean);
  const shadows = styled.map((el) => { const s = getComputedStyle(el); return { tag: el.tagName + '.' + (el.getAttribute('class') || ''), box: s.boxShadow, filter: s.filter, op: s.opacity, tr: s.transitionProperty + ' ' + s.transitionDuration, anim: s.animationName }; })
    .filter((s) => (s.box && s.box !== 'none') || (s.filter && s.filter !== 'none' && /shadow/.test(s.filter)) || s.op !== '1' || /opacity/.test(s.tr) || (s.anim && s.anim !== 'none'));
  const fill = layer.querySelector('.hold-spotlight__fill');
  return {
    open: true,
    frame: { tag: frame.tagName, role: frame.getAttribute('role'), label: frame.getAttribute('aria-label'), rect: [fr.left, fr.top, fr.width, fr.height].map(Math.round), attr: frame.getAttribute('data-spotlight-frame') },
    layerRect: [lr.left, lr.top, lr.width, lr.height].map(Math.round),
    layerInsideFrame: frame.contains(layer),
    scrimFill: fill ? getComputedStyle(fill).fill : null,
    rings,
    label: layer.querySelector('.hold-spotlight__label')?.innerText ?? null,
    bar: bar ? { text: bar.innerText.replace(/\s+/g, ' ').trim().slice(0, 300), rect: [br.left, br.top, br.width, br.height].map(Math.round), inViewport: br.top >= 0 && br.bottom <= innerHeight + 1 } : null,
    shadowsOrFades: shadows.slice(0, 8),
    status: statusText,
    inertCount: frame.querySelectorAll('[inert]').length,
  };
});

// Full-viewport fixed layers (the page veil and sheet backdrops), for a before/after comparison.
export const veils = (page) => page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
  const s = getComputedStyle(el);
  if (s.position !== 'fixed') return false;
  const r = el.getBoundingClientRect();
  return r.width >= innerWidth - 2 && r.height >= innerHeight - 2 && s.backgroundColor !== 'rgba(0, 0, 0, 0)';
}).map((el) => { const s = getComputedStyle(el); return `${el.tagName}.${(el.getAttribute('class') || '').slice(0, 40)} bg=${s.backgroundColor} op=${s.opacity} z=${s.zIndex}`; }));

// axe-core 4.11.1 from node_modules (no @axe-core/playwright in the repo).
export async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), summary: (n.failureSummary || '').slice(0, 200) })) }));
  });
  return { label, count: res.length, violations: res };
}

// Is the element on top at its own centre (usable, not under the scrim)?
export const hit = (loc) => loc.evaluate((el) => {
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { rect: [r.left, r.top, r.width, r.height].map(Math.round), hit: top === el || el.contains(top) || top?.contains(el), topTag: top?.tagName, topText: (top?.innerText || '').trim().slice(0, 60), inert: !!el.closest('[inert]') };
});
