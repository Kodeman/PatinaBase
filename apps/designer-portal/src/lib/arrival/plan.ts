// US-14 arrival — the composition, measured once before frame 0 (arrival.js:198-345, 382-455).
// Pure measurement: it reads layout and returns numbers; the run does every write.
import type { Surface } from './types'

/** arrival.js:197 — the curves. */
export const C = {
  X: [0.16, 1, 0.3, 1],
  O: [0, 0, 0.58, 1],
  Q: [0.42, 0, 0.58, 1],
  EXIT: [0.4, 0, 1, 1],
  IO: [0.65, 0, 0.35, 1],
  YL: [0.45, 0, 0.25, 1],
  DRAW: [0.55, 0, 0.1, 1],
} as const

/** arrival.js:198-204, 457 — the score, ms. The hold itself is BUDGET.HOLD_MS. */
export const S = {
  crown: [0, 560], place: [80, 640], slug: [0, 560], day: [120, 560], job: [240, 560], H: [360, 960],
  F: [900, 1020, 1140], fD: 600, act: [1260, 480], rule: [1380, 420], act2: [1440, 360], CE: 1800,
  cue: 1500, cueIn: 600, freeze: 200, exit: 240, exitStep: 40, cueOut: 160, skipOut: 120,
  lineDone: 180, lineFade: 160, hand: 60, lag: 60, dMin: 880, dMax: 1100, warnD: 1100, lead: 120,
  dissolve: 120, T0: 520, span: 1480, rise: 720, stem: 640, typeLag: 80, row: 50, actRule: 120,
  cap: 12, pCap: 8, settle: 400, last: 2000, thin: 160, draw: 560,
  rmLine: 150, rmStag: 100, rmCueIn: 200, rmPart: 200, rmSpan: 400,
} as const

export function cb(c: readonly number[]): string {
  return `cubic-bezier(${c.join(',')})`
}

/** The curve's progress at time fraction x (arrival.js:206-212). */
export function curve(c: readonly number[], x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const b = (p1: number, p2: number, t: number) => {
    const u = 1 - t
    return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t
  }
  let lo = 0
  let hi = 1
  let t = x
  for (let i = 0; i < 40; i++) {
    t = (lo + hi) / 2
    if (b(c[0], c[2], t) < x) lo = t
    else hi = t
  }
  return b(c[1], c[3], t)
}

export interface Box { left: number; top: number; right: number; bottom: number; w: number; h: number }
export interface Ink extends Box { lines: Box[]; cx: number; cy: number }

export function box(el: Element): Box {
  const r = el.getBoundingClientRect()
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.right - r.left, h: r.bottom - r.top }
}

function boxOf(left: number, top: number, right: number, bottom: number): Box {
  return { left, top, right, bottom, w: right - left, h: bottom - top }
}

function locate(el: Element, index: number): { node: Text; offset: number } | null {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */)
  let seen = 0
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = (n.textContent ?? '').length
    if (index < seen + len) return { node: n as Text, offset: index - seen }
    seen += len
  }
  return null
}

/** arrival.js:228-236 — the written text, one rect per line; `from` starts it at a character. */
export function ink(el: Element, from = 0): Ink | null {
  const rg = el.ownerDocument.createRange()
  rg.selectNodeContents(el)
  const at = from > 0 ? locate(el, from) : null
  if (at) rg.setStart(at.node, at.offset)
  if (typeof rg.getClientRects !== 'function') return null
  const lines: Box[] = []
  for (const r of Array.from(rg.getClientRects())) {
    if (!(r.right > r.left)) continue
    const l = lines.find((x) => Math.abs(x.top - r.top) < 2)
    if (l) {
      l.left = Math.min(l.left, r.left)
      l.right = Math.max(l.right, r.right)
      l.bottom = Math.max(l.bottom, r.bottom)
      l.w = l.right - l.left
      l.h = l.bottom - l.top
    } else lines.push(boxOf(r.left, r.top, r.right, r.bottom))
  }
  if (!lines.length) return null
  const g = boxOf(
    Math.min(...lines.map((l) => l.left)),
    Math.min(...lines.map((l) => l.top)),
    Math.max(...lines.map((l) => l.right)),
    Math.max(...lines.map((l) => l.bottom)),
  )
  return { ...g, lines, cx: g.left + g.w / 2, cy: g.top + g.h / 2 }
}

function inkOrBox(el: Element, from = 0): Ink {
  const i = ink(el, from)
  if (i) return i
  const b = box(el)
  return { ...b, lines: [b], cx: b.left + b.w / 2, cy: b.top + b.h / 2 }
}

// ---------- the view ----------

export interface V {
  vw: number; vh: number; top: number; bottom: number; left: number; right: number
  H: number; W: number; phone: boolean; portrait: boolean
}

/** arrival.js:239-246 over host.view() (safe areas and the MobileBar already excluded). */
export function viewOf(view: { top: number; height: number; width: number; bottom: number }, innerHeight: number): V {
  return {
    vw: view.width, vh: innerHeight, top: view.top, bottom: view.bottom, left: 0, right: view.width,
    H: view.bottom - view.top, W: view.width, phone: view.width <= 760, portrait: innerHeight > view.width,
  }
}

/** arrival.js:256-264 — the one reading position, before frame 0 (bar = 0: production has no .spine strip). */
export function readingY(
  surface: Surface, v: V, H: Box, A: Box | null, job: Box | null, y0: number, max: number,
): number {
  const a = A ?? H
  let y: number
  if (surface === 'desk') {
    const t = job ?? H
    y = t.top >= v.top && a.bottom <= v.bottom ? y0 : y0 + a.bottom - v.bottom
  } else {
    y = y0 + H.top - (v.top + (v.phone ? 160 : Math.min(240, Math.max(160, 0.28 * v.H))))
  }
  return Math.min(max, Math.max(0, Math.round(y)))
}

// ---------- D1: the display ladder ----------

export const RUNGS = [56, 44, 34, 28] as const
export const LEADING = 1.15
export const GUTTER = 16

export type Measure = (text: string, family: string, size: number, maxWidth: number) => { width: number; height: number }

/** An offscreen clone in the card's own type: the only way to know how the display face wraps. */
export function offscreen(doc: Document): Measure {
  return (text, family, size, maxWidth) => {
    const p = doc.createElement('p')
    p.setAttribute('data-arr', '')
    p.setAttribute('aria-hidden', 'true')
    p.textContent = text
    p.style.cssText =
      `position:absolute;left:-10000px;top:0;visibility:hidden;margin:0;width:max-content;` +
      `max-width:${maxWidth}px;font-family:${family};font-size:${size}px;line-height:${LEADING};font-weight:500`
    doc.body.appendChild(p)
    try {
      const r = p.getBoundingClientRect()
      return { width: r.right - r.left, height: r.bottom - r.top }
    } finally {
      p.remove()
    }
  }
}

/** D1: the largest rung that sets the headline in ≤ 2 lines (≤ 3 at 28) — never "no arrival". */
export function ladder(
  text: string, family: string, maxWidth: number, measure: Measure,
): { size: number; width: number; height: number; lines: number } {
  let last = { size: 28, width: 0, height: 0, lines: 1 }
  for (const size of RUNGS) {
    const m = measure(text, family, size, maxWidth)
    const lines = Math.max(1, Math.round(m.height / (size * LEADING)))
    last = { size, width: m.width, height: m.height, lines }
    if (lines <= (size === 28 ? 3 : 2)) return last
  }
  return last
}

// ---------- the composition (arrival.js:285-345) ----------

export interface Flight { r0: Box; r1: Box; t: number; d: number }
export interface Placed { left: number; top: number; w: number; h: number }
export interface Ride { k: string; canon: HTMLElement; dx: number; dy: number; d: number }

export interface Plan {
  v: V
  /** the card's own lines, viewport coordinates */
  m: Record<string, Placed>
  /** the headline clone: where it sits on the card, its ink origin, and the flight to the page node */
  head: { left: number; top: number; w: number; h: number; ox: number; oy: number; dx: number; dy: number; q: number }
  act: { x: number; y: number } | null
  /** the landed sentence (field distances) */
  G: Ink
  d: number
  carriers: Flight[]
  rides: Ride[]
}

export interface PlanInput {
  surface: Surface
  v: V
  /** the page's headline node and the card text it lands under */
  H: HTMLElement
  text: string
  /** the display clone, already set at the ladder size */
  clone: HTMLElement
  size: number
  A: HTMLElement | null
  L: Record<string, HTMLElement>
  skip: HTMLElement
  /** the Document's canonical F1, which rides home with the sentence */
  f1: HTMLElement | null
}

export function plan(input: PlanInput): Plan {
  const { surface, v, H, text, clone, size, A, L, skip } = input
  const gp = v.phone
    ? { crown: 8, place: 24, job: 8, H: 12, f1: 6, f2: 4, act: 24, cue: 24 }
    : { crown: 12, place: 32, job: 8, H: 16, f1: 8, f2: 4, act: 32, cue: 40 }
  const cbx = box(clone)
  const hW = cbx.w
  const hH = cbx.h
  const mid = v.top + (v.portrait ? 0.4 : 0.44) * v.H
  let hTop = mid - hH / 2
  const m: Record<string, Placed> = {}
  const at = (k: string, top: number): Placed | null => {
    const el = L[k]
    if (!el) return null
    const b = box(el)
    m[k] = { left: 0, top, w: b.w, h: b.h }
    return m[k]
  }
  let up = hTop
  if (surface === 'desk') {
    const job = at('job', 0)
    if (job) up = job.top = up - gp.job - job.h
    const slug = at('slug', 0)
    if (slug) slug.top = up - gp.place - slug.h
  } else {
    const place = at('place', 0)
    if (place) up = place.top = up - gp.place - place.h
    const crown = at('crown', 0)
    if (crown) crown.top = up - (place ? gp.crown : gp.place) - crown.h
  }
  let y = hTop + hH + gp.H
  ;(['f1', 'f2', 'f3'] as const).forEach((k, i) => {
    const x = at(k, y)
    if (x) y = x.top + x.h + (i === 0 ? gp.f1 : gp.f2)
  })
  y += m.f3 || m.f2 || m.f1 ? gp.act - gp.f2 : 0
  const B = A ? box(A) : null
  let aTop = y
  if (B) y = aTop + B.h
  y += B ? gp.cue : 0
  const cue = at('cue', y) as Placed
  const line = at('line', y + (cue ? cue.h : 0) + 8) as Placed

  // fit: clear of Skip and the bottom; the headline keeps the top (R-DM25 A)
  const sk = box(skip)
  const cx = v.left + v.W / 2
  const gx = v.left + GUTTER
  const cueL = v.phone ? gx : cx - (cue?.w ?? 0) / 2
  const cueR = cueL + (cue?.w ?? 0)
  const lineTop = line ? line.top : y
  const limit =
    (cueR > sk.left - 8 && lineTop + 1 > sk.top - 8) || v.phone
      ? Math.min(v.bottom - 16, sk.top - 8)
      : v.bottom - 16
  const top = Math.min(hTop, ...Object.values(m).map((p) => p.top))
  let lift = Math.max(0, lineTop + 1 - limit)
  lift = Math.min(lift, Math.max(0, top - (v.top + 16)))
  for (const p of Object.values(m)) p.top -= lift
  hTop -= lift
  aTop -= lift
  for (const [k, p] of Object.entries(m)) p.left = v.phone ? gx : k === 'line' ? cx - 80 : cx - p.w / 2
  const dot = /\.$/.test(text) && !v.phone ? 0.064 * size : 0
  const Lc = v.phone ? gx : cx - hW / 2 - dot

  // the clone's ink origin: its first line's left, on that line's baseline (arrival.js:319)
  const ci = inkOrBox(clone)
  const c0 = ci.lines[0]
  const ox = c0.left - cbx.left
  const oy = c0.top + 0.78 * c0.h - cbx.top
  // ...and where it lands: the same point on the page's own sentence, at the card text's first word
  const nodeText = H.textContent ?? ''
  const from = Math.max(0, nodeText.indexOf(text.slice(0, 16)))
  const G = inkOrBox(H, from)
  const n0 = G.lines[0]
  const fs = parseFloat((H.ownerDocument.defaultView as Window).getComputedStyle(H).fontSize) || size
  const head = {
    left: Lc, top: hTop, w: hW, h: hH, ox, oy,
    dx: n0.left - (Lc + ox), dy: n0.top + 0.78 * n0.h - (hTop + oy), q: fs / size,
  }

  const aLeft = v.phone ? gx - 2 : cx - (B ? B.w : 0) / 2
  const act = B ? { x: aLeft - B.left, y: aTop - B.top } : null
  const dist = Math.hypot(Lc + hW / 2 - G.cx, hTop + hH / 2 - G.cy)
  const d = Math.round(Math.min(S.dMax, Math.max(S.dMin, 700 + 1.25 * dist)))
  const carriers: Flight[] = [{ r0: boxOf(Lc, hTop, Lc + hW, hTop + hH), r1: G, t: S.hand, d }]
  if (B) carriers.push({ r0: boxOf(aLeft, aTop, aLeft + B.w, aTop + B.h), r1: B, t: S.hand + S.lag, d })

  // the double that rides home with the sentence: F1 on the Document (warn is unmarked in v1)
  const rides: Ride[] = []
  if (surface === 'document' && input.f1 && m.f1) {
    const c = inkOrBox(input.f1)
    const r0 = boxOf(m.f1.left, m.f1.top, m.f1.left + m.f1.w, m.f1.top + m.f1.h)
    rides.push({ k: 'f1', canon: input.f1, dx: c.left - r0.left, dy: c.top - r0.top, d })
    carriers.push({ r0, r1: boxOf(c.left, c.top, c.left + r0.w, c.top + r0.h), t: S.hand, d })
  }
  return { v, m, head, act, G, d, carriers, rides }
}

// ---------- the field (arrival.js:382-455) ----------

export interface RuleSpec {
  side: 'Top' | 'Bottom' | 'Left'
  prop: string
  fix: boolean
  css: string
  r: Box
}
export interface Kid { el: HTMLElement; off: number; origin?: string; t: number }
export interface Unit {
  el: HTMLElement; r: Box; d: number; rules: RuleSpec[]; kids: Kid[]; inline: boolean
  kind: 'rise' | 'list' | 'stem' | 'rules'; off: number; origin: string; dur: number; base: number; t: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
export const px = (n: number) => `${r2(n)}px`
const num = (s: string) => {
  const n = parseFloat(s)
  return Number.isNaN(n) ? 0 : n
}

function bw(cs: CSSStyleDeclaration, side: string): number {
  const s = side.toLowerCase()
  const w = num(cs.getPropertyValue(`border-${s}-width`))
  const st = cs.getPropertyValue(`border-${s}-style`)
  return st !== '' && st !== 'none' && w > 0 ? w : 0
}

function listy(el: Element): boolean {
  return /^(OL|UL|DL)$/.test(el.tagName) || el.getAttribute('role') === 'list'
}

/** arrival.js:365-367 — nearest-point distance to the landed sentence (dx weighted .75). */
export function near(r: Box, G: Box): number {
  const dx = Math.max(0, G.left - r.right, r.left - G.right)
  const dy = Math.max(0, G.top - r.bottom, r.top - G.bottom)
  return Math.sqrt(0.5625 * dx * dx + dy * dy)
}

/** arrival.js:384-400 — one hairline per drawn border, drawn from the focus, in document coordinates (fixed when pinned). */
function rules(el: Element, cs: CSSStyleDeclaration, sides: RuleSpec['side'][], fx: number, fix: boolean, sx: number, sy: number): RuleSpec[] {
  const r = box(el)
  const x0 = fix ? 0 : sx
  const y0 = fix ? 0 : sy
  return sides.map((side) => {
    const wd = bw(cs, side)
    const col = cs.getPropertyValue(`border-${side.toLowerCase()}-color`)
    if (side === 'Left') {
      return {
        side, prop: 'border-left-color', fix, r: boxOf(r.left, r.top, r.left + wd, r.bottom),
        css: `left:${px(r.left + x0)};top:${px(r.top + y0)};width:${px(wd)};height:${px(r.h)};background:${col};transform-origin:50% 0;transform:scaleY(0)`,
      }
    }
    const t = side === 'Top' ? r.top : r.bottom - wd
    const ox = Math.min(r.w, Math.max(0, fx - r.left))
    return {
      side, prop: `border-${side.toLowerCase()}-color`, fix, r: boxOf(r.left, t, r.right, t + wd),
      css: `left:${px(r.left + x0)};top:${px(t + y0)};width:${px(r.w)};height:${px(wd)};background:${col};transform-origin:${px(ox)} 50%`,
    }
  })
}

/** arrival.js:402-420 — a unit: its type (rise, list, stem), its drawn rules, its children's offsets. */
export function unit(el: HTMLElement, G: Ink, rm: boolean, pinned: (el: Element) => boolean, sx: number, sy: number): Unit {
  const cs = (el.ownerDocument.defaultView as Window).getComputedStyle(el)
  const r = box(el)
  const par = el.parentElement ? box(el.parentElement) : r
  const u: Unit = {
    el, r, d: near(r, G), rules: [], kids: [], inline: cs.display === 'inline', kind: 'rise', off: 0,
    origin: `${px(Math.min(0, par.left - r.left))} 100%`, dur: 0, base: 0, t: 0,
  }
  const h = (['Top', 'Bottom'] as const).filter((s) => bw(cs, s) > 0)
  const stem = bw(cs, 'Left') > 0 && el.children.length > 0
  if (!u.inline && (h.length || stem)) {
    const sides: RuleSpec['side'][] = [...h, ...(stem ? (['Left'] as const) : [])]
    u.rules = rules(el, cs, sides, Math.min(r.right, Math.max(r.left, G.cx)), pinned(el), sx, sy)
  }
  const kids = Array.from(el.children).filter((k) => k.getClientRects().length > 0) as HTMLElement[]
  if (stem) {
    u.kind = 'stem'
    u.kids = kids.map((k) => ({ el: k, off: Math.round((S.stem * Math.abs(box(k).top - r.top)) / Math.max(1, r.h)), t: 0 }))
  } else if (listy(el) || (h.length && el.children.length > 1)) {
    u.kind = 'list'
    u.kids = kids.map((k, i) => ({
      el: k, off: S.typeLag + S.row * i, origin: `${px(Math.min(0, par.left - box(k).left))} 100%`, t: 0,
    }))
  }
  if (u.kind === 'rise' && u.rules.length) u.off = S.typeLag
  u.dur = rm
    ? S.rmPart
    : Math.max(S.rise + u.off, ...u.kids.map((k) => k.off + S.rise), u.rules.length ? S.stem : 0)
  return u
}

export function hit(a: Box, b: Box, e = 0): boolean {
  return a.left < b.right + e && a.right > b.left - e && a.top < b.bottom + e && a.bottom > b.top - e
}

/** arrival.js:422-427 — where a carrier is at ms t of Act 3 (x on IO, y on YL). */
export function at3(c: Flight, t: number): Box {
  const k = (t - c.t) / c.d
  const x = curve(C.IO, k)
  const y = curve(C.YL, k)
  return boxOf(
    c.r0.left + (c.r1.left - c.r0.left) * x,
    c.r0.top + (c.r1.top - c.r0.top) * y,
    c.r0.right + (c.r1.right - c.r0.right) * x,
    c.r0.bottom + (c.r1.bottom - c.r0.bottom) * y,
  )
}

/** arrival.js:429-436 — no part begins while a carrier's remaining path still crosses it (24 samples, 4px). */
export function clear(r: Box, carriers: readonly Flight[]): number {
  let t = 0
  for (const c of carriers) {
    for (let i = 0; i <= 24; i++) {
      const ts = c.t + (c.d * i) / 24
      if (hit(at3(c, ts), r, 4)) t = Math.max(t, i < 24 ? c.t + (c.d * (i + 1)) / 24 : c.t + c.d)
    }
  }
  return Math.ceil(t)
}

/** arrival.js:437-455 — t = 520 + 1480·u^1.25, then the corridor, then the cap; every onset ≤ 2000 (rm: 0-400, fades). */
export function field(units: Unit[], carriers: readonly Flight[], phone: boolean, rm: boolean): Unit[] {
  const dmax = units.reduce((mx, u) => Math.max(mx, u.d), 1)
  const cap = phone ? S.pCap : S.cap
  for (const u of units) {
    const k = Math.pow(u.d / dmax, 1.25)
    u.base = Math.round(rm ? S.rmSpan * k : S.T0 + S.span * k)
    u.t = rm ? u.base : Math.max(u.base, clear(u.r, carriers))
  }
  units.sort((a, b) => a.t - b.t || a.d - b.d)
  const done: Unit[] = []
  const last = rm ? S.rmSpan : S.last
  for (const u of units) {
    for (;;) {
      const live = done.filter((x) => x.t <= u.t && x.t + x.dur > u.t)
      if (live.length < cap) break
      u.t = Math.min(...live.map((x) => x.t + x.dur))
    }
    u.t = Math.min(u.t, last)
    for (const k of u.kids) k.t = Math.min(u.t + k.off, last)
    done.push(u)
  }
  return units
}
