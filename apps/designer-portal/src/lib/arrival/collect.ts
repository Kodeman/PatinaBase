// US-14 arrival — what the page's own parts are: which carriers can fly themselves, which must be
// cloned, which acts need their clipping ancestors opened, and (arrival.js:367-380) which first-view
// blocks are covered for Acts 1-2 and assemble in Act 3.
import type { Brief, CardPart, Carrier } from './types'

type Style = CSSStyleDeclaration

function style(el: Element): Style {
  return (el.ownerDocument.defaultView as Window).getComputedStyle(el)
}

const open = (v: string) => v === '' || v === 'visible'

function clips(cs: Style): boolean {
  return !open(cs.overflow) || !open(cs.overflowX) || !open(cs.overflowY)
}

const pinnedPosition = (cs: Style) => cs.position === 'sticky' || cs.position === 'fixed'

/** arrival.js:350 — the node or an ancestor is sticky or fixed, so its box moves with the viewport. */
export function pinned(el: Element): boolean {
  const body = el.ownerDocument.body
  for (let a: Element | null = el; a && a !== body; a = a.parentElement) {
    if (pinnedPosition(style(a))) return true
  }
  return false
}

/** Ancestors strictly between the node and the route root that clip (the root's own overflow-x-clip is the page's). */
function clippers(node: Element, root: Element): Element[] {
  const out: Element[] = []
  for (let a = node.parentElement; a && a !== root; a = a.parentElement) {
    if (clips(style(a))) out.push(a)
  }
  return out
}

/**
 * CONTRACT §3 carriers: a node flies itself when it wraps normally and nothing between it and the
 * root clips it; nowrap/ellipsis, sticky/fixed or a clipping ancestor → clone.
 */
export function carrier(node: HTMLElement, root: HTMLElement): Carrier {
  const cs = style(node)
  if (/^(nowrap|pre)$/.test(cs.whiteSpace) || cs.textOverflow === 'ellipsis' || clips(cs)) {
    return 'clone'
  }
  if (pinned(node)) return 'clone'
  return clippers(node, root).length > 0 ? 'clone' : 'node'
}

/** The act is always the real node: these ancestors get `data-arr-unclip` for the run. */
export function unclip(act: HTMLElement, root: HTMLElement): HTMLElement[] {
  return clippers(act, root) as HTMLElement[]
}

interface Rect { left: number; top: number; right: number; bottom: number }

function meets(a: Rect, b: Rect, e = 0): boolean {
  return a.left < b.right + e && a.right > b.left - e && a.top < b.bottom + e && a.bottom > b.top - e
}

/** Nothing of the part shows: no box, or a clipping ancestor below the root cuts all of it. */
export function clippedAway(node: HTMLElement, root: HTMLElement): boolean {
  const r = node.getBoundingClientRect()
  if (!(r.right > r.left && r.bottom > r.top)) return true
  return clippers(node, root).some((a) => !meets(r, a.getBoundingClientRect()))
}

/**
 * The run's carrier table. D1: the headline always flies as the display clone; the act is always
 * the real node. A fully clipped part (not the headline, not the act) leaves the card.
 */
export function classify(b: Brief, root: HTMLElement): { brief: Brief; unclip: HTMLElement[] } {
  const kept: CardPart[] = []
  let headline = b.headline
  let act = b.act
  for (const p of b.parts) {
    const flies = p === b.headline || p === b.act || p.part === 'act2'
    if (!flies && p.part !== 'crown' && p.part !== 'settle' && clippedAway(p.node, root)) continue
    const c: Carrier =
      p === b.headline ? 'clone' : p === b.act || p.part === 'act2' ? 'node' : carrier(p.node, root)
    const next: CardPart = { ...p, carrier: c }
    if (p === b.headline) headline = next
    if (p === b.act) act = next
    kept.push(next)
  }
  return {
    brief: { ...b, parts: kept, headline, act },
    unclip: act ? unclip(act.node, root) : [],
  }
}

/** Browser-local YYYY-MM-DD (deriveOverdue's local midnight). `timeZone` is the test seam. */
export function today(now: number = Date.now(), timeZone?: string): string {
  if (!timeZone) {
    const d = new Date(now)
    const two = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// ---------- the first view (arrival.js:348-380) ----------

export interface Seen { vw: number; vh: number }

export function rendered(el: Element): boolean {
  return el.getClientRects().length > 0
}

function list(el: Element): boolean {
  return /^(OL|UL|DL)$/.test(el.tagName) || el.getAttribute('role') === 'list'
}

/** R5: in the first view only when it meets the viewport AND every clipping container above it. */
export function seen(el: Element, v: Seen, root: Element): boolean {
  const r = el.getBoundingClientRect()
  const w = r.right - r.left
  const h = r.bottom - r.top
  if (!(w > 0 && h > 0 && r.right > 0 && r.left < v.vw && r.bottom > 0 && r.top < v.vh)) return false
  const top = root.parentElement
  for (let a = el.parentElement; a && a !== top; a = a.parentElement) {
    if (clips(style(a)) && !meets(r, a.getBoundingClientRect())) return false
  }
  return true
}

/**
 * Walk the route root (never body or chrome): containers holding a kept element, or tall multi-part
 * containers, are opened; every other block in the first view is one unit. Below the fold is final.
 */
export function walk(
  root: HTMLElement,
  keep: readonly Element[],
  v: Seen,
): { units: HTMLElement[]; through: HTMLElement[] } {
  const units: HTMLElement[] = []
  const through: HTMLElement[] = []
  const visit = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if ((c as HTMLElement).hidden || keep.includes(c)) continue
      if (c.matches('script,style,template,[data-arr]') || !rendered(c)) continue
      if (keep.some((k) => c.contains(k))) {
        through.push(c as HTMLElement)
        visit(c)
        continue
      }
      if (!seen(c, v, root)) continue
      const r = c.getBoundingClientRect()
      if (c.children.length > 1 && !list(c) && r.bottom - r.top > 0.3 * v.vh) {
        through.push(c as HTMLElement)
        visit(c)
        continue
      }
      units.push(c as HTMLElement)
    }
  }
  visit(root)
  return { units, through: through.filter((t) => seen(t, v, root)) }
}
