// US-14 arrival — the lift. The card is built ONLY from what the page printed inside the route root
// (T3), so every rule here is also the frame-0 re-read (verifyFrame0).
import type { Brief, CardPart, Part, Surface } from './types'

const SEP = ' — '
const OVERDUE = /^Overdue\b/

/** arrival.js:61 */
export function words(s: string): number {
  return s.split(/\s+/).filter((x) => /[\w\d]/.test(x)).length
}

export function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** D2: card-side punctuation — a terminal period when the page printed none. */
export function period(s: string): string {
  return s === '' || /[.!?…]["'”’)\]]*$/.test(s) ? s : `${s}.`
}

// A flex or grid box sets its items apart with a gap, not a space: textContent would print the
// VitalDate "Start" + "3 August" as "Start3 August".
function flow(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''
  const el = node as Element
  const kids = Array.from(el.childNodes, flow)
  const display = el.ownerDocument.defaultView?.getComputedStyle(el).display ?? ''
  return /flex|grid/.test(display) ? kids.map(collapse).filter(Boolean).join(' ') : kids.join('')
}

/** A marked node's printed text: `data-arr-long` (CONTRACT §4a) overrides what it prints. */
export function printed(el: HTMLElement): string {
  return collapse(el.getAttribute('data-arr-long') ?? flow(el))
}

function marked(root: HTMLElement, part: Part): HTMLElement | null {
  const all = root.querySelectorAll<HTMLElement>(`[data-part~="${part}"]`)
  for (const el of Array.from(all)) if (el.getClientRects().length > 0) return el
  return null
}

function held(el: HTMLElement): boolean {
  return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true'
}

/** R-DM24 A: `Overdue {phrase} — {text}` → the page's own two substrings. */
function overdue(raw: string): { phrase: string; text: string } | null {
  const i = raw.indexOf(SEP)
  if (i <= 0) return null
  const phrase = raw.slice(0, i).trim()
  const text = raw.slice(i + SEP.length).trim()
  return OVERDUE.test(phrase) && text ? { phrase, text } : null
}

/** arrival.js:118-123 — past 8 words the need text alone is the headline and the overdue phrase is F3. */
export function sentence(raw: string): { headline: string; f3: string | null } {
  const o = overdue(raw)
  if (!o) return { headline: period(raw), f3: null }
  const composed = `${o.phrase}: ${o.text}`
  return words(composed) > 8
    ? { headline: period(o.text), f3: period(o.phrase) }
    : { headline: period(composed), f3: null }
}

/** A Desk day line `{job} — {rest}` → `{job}: {rest}.` (the arrival.js:173 brief form). */
function dayLine(raw: string): string {
  const i = raw.indexOf(SEP)
  return period(i > 0 ? `${raw.slice(0, i).trim()}: ${raw.slice(i + SEP.length).trim()}` : raw)
}

const has = (node: HTMLElement, part: Part) =>
  (node.getAttribute('data-part') ?? '').split(/\s+/).includes(part)

/** The one text rule per (part, node): the lift and the frame-0 re-read both call it. */
export function textOf(part: Part, node: HTMLElement, surface: Surface): string {
  switch (part) {
    case 'crown':
    case 'settle':
      return ''
    case 'headline':
      return has(node, 'headline') ? sentence(printed(node)).headline : printed(node)
    case 'f3':
      return has(node, 'headline') ? (sentence(printed(node)).f3 ?? '') : printed(node)
    case 'f1':
    case 'f2':
      return surface === 'desk' ? dayLine(printed(node)) : printed(node)
    default:
      return printed(node)
  }
}

/**
 * Lifts the card from the [data-part] nodes inside `root`. Carriers are provisional ('node'):
 * engine.brief classifies them (collect.ts). null only when neither a headline nor a name prints.
 */
export function brief(root: HTMLElement, surface: Surface, today: string): Brief | null {
  let head = marked(root, 'headline')
  if (head && !printed(head)) head = null
  const quiet = !head
  if (quiet) head = marked(root, 'name')
  if (!head || !printed(head)) return null

  const parts: CardPart[] = []
  const add = (part: Part, node: HTMLElement): CardPart | null => {
    const text = textOf(part, node, surface)
    const kept = part === 'crown' || part === 'settle' || text !== ''
    if (!kept) return null
    const p: CardPart = { part, text, node, carrier: 'node' }
    parts.push(p)
    return p
  }
  const lift = (part: Part) => {
    const node = marked(root, part)
    return node ? add(part, node) : null
  }

  lift('crown')
  if (surface === 'desk') {
    lift('head')
    lift('job')
  } else {
    if (!quiet) lift('name')
    lift('stage')
  }
  const headline = add('headline', head)
  if (!headline) return null
  lift('f1')
  lift('f2')
  if (!quiet && sentence(printed(head)).f3 !== null) add('f3', head)
  else lift('f3')

  let act: CardPart | null = null
  if (!quiet) {
    const node = marked(root, 'act')
    if (node && !held(node)) act = add('act', node)
    const two = marked(root, 'act2')
    if (act && two && !held(two)) add('act2', two)
  }
  lift('settle')

  return { surface, parts, headline, act, today }
}

/** Frame 0: every part still prints exactly what the card carries (same rule), or decline 'drift'. */
export function verifyFrame0(b: Brief): boolean {
  return b.parts.every(
    (p) => p.node.isConnected && textOf(p.part, p.node, b.surface) === p.text,
  )
}
