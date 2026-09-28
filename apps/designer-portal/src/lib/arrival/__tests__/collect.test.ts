/**
 * US-14 arrival — carriers (CONTRACT §3): a node flies itself only when it wraps normally with nothing clipping
 * it; the act is always the real node with its clipping ancestors opened; browser-local today.
 */
import { brief } from '../brief'
import { carrier, classify, clippedAway, pinned, today, unclip, walk } from '../collect'
import type { Brief } from '../types'
import { deskDom, documentDom, installDom, place } from './dom-harness.test'
import type { Dom } from './dom-harness.test'

let dom: Dom
beforeEach(() => {
  dom = installDom()
})
afterEach(() => {
  dom.restore()
  document.body.innerHTML = ''
})

function tree(html: string): { root: HTMLElement; node: HTMLElement } {
  document.body.innerHTML = `<main data-arrival="desk">${html}</main>`
  const root = document.querySelector('main') as HTMLElement
  return { root, node: root.querySelector('#n') as HTMLElement }
}

describe('carrier', () => {
  it('a plain wrapping node flies itself', () => {
    const { root, node } = tree('<section><p id="n">Two selections wait</p></section>')
    expect(carrier(node, root)).toBe('node')
  })
  it('inside overflow:hidden (the claim card) → clone', () => {
    const { root, node } = tree('<ul><li style="overflow:hidden"><p id="n">Invoice 1042</p></li></ul>')
    expect(carrier(node, root)).toBe('clone')
  })
  it('nowrap + ellipsis (the band sentence) → clone', () => {
    const { root, node } = tree('<p><span id="n" style="white-space:nowrap;text-overflow:ellipsis">Invoice 1042</span></p>')
    expect(carrier(node, root)).toBe('clone')
  })
  it('under a sticky ancestor → clone', () => {
    const { root, node } = tree('<section style="position:sticky;top:0"><p id="n">Invoice 1042</p></section>')
    expect(pinned(node)).toBe(true)
    expect(carrier(node, root)).toBe('clone')
  })
  it("the route root's own clip is the page's, not the node's", () => {
    document.body.innerHTML = '<div data-arrival="document" style="overflow-x:clip;overflow:hidden"><p id="n">x</p></div>'
    const root = document.querySelector('[data-arrival]') as HTMLElement
    expect(carrier(root.querySelector('#n') as HTMLElement, root)).toBe('node')
  })
})

describe('classify — the carrier table', () => {
  it('headline = clone (D1), act = node with its clipping ancestors to unclip', () => {
    const root = deskDom()
    const card = root.querySelector('.desk-claim-card') as HTMLElement
    card.style.overflow = 'hidden'
    const band = root.querySelector('.desk-claim-band') as HTMLElement
    band.style.overflow = 'clip'
    const out = classify(brief(root, 'desk', '2026-09-28') as Brief, root)
    expect(out.brief.headline.carrier).toBe('clone')
    expect(out.brief.act?.carrier).toBe('node')
    expect(out.unclip).toEqual([band, card])
    expect(unclip(out.brief.act?.node as HTMLElement, root)).toEqual([band, card])
    // the job name link sits inside the clipped card: it cannot fly itself
    expect(out.brief.parts.find((p) => p.part === 'job')?.carrier).toBe('clone')
    expect(out.brief.parts.find((p) => p.part === 'head')?.carrier).toBe('node')
  })
  it('a fully clipped part leaves the card; the headline and act never do', () => {
    const root = documentDom()
    const vitals = root.querySelector('.vitals') as HTMLElement
    const f3 = root.querySelector('[data-part="f3"]') as HTMLElement
    place(vitals, { left: 0, top: 100, width: 400, height: 20 })
    for (const k of ['stage', 'f1', 'f2']) {
      place(root.querySelector(`[data-part="${k}"]`) as HTMLElement, { left: 0, top: 100, width: 80, height: 20 })
    }
    place(f3, { left: 420, top: 100, width: 80, height: 20 })
    expect(clippedAway(f3, root)).toBe(true)
    const out = classify(brief(root, 'document', '2026-09-28') as Brief, root)
    expect(out.brief.parts.some((p) => p.part === 'f3')).toBe(false)
    expect(out.brief.parts.some((p) => p.part === 'f1')).toBe(true)
    expect(out.brief.headline.part).toBe('headline')
    expect(out.brief.act?.part).toBe('act')
  })
})

describe('today — browser-local YYYY-MM-DD', () => {
  // 12:30 UTC on 28 September: already the 29th in Auckland, still the 28th in Los Angeles
  const T = Date.UTC(2026, 8, 28, 12, 30)
  it('TZ=Pacific/Auckland', () => {
    expect(today(T, 'Pacific/Auckland')).toBe('2026-09-29')
  })
  it('TZ=America/Los_Angeles', () => {
    expect(today(T, 'America/Los_Angeles')).toBe('2026-09-28')
  })
  it('the local midnight boundary (this realm is pinned to America/Chicago)', () => {
    expect(today(new Date(2026, 8, 28, 23, 59).getTime())).toBe('2026-09-28')
    expect(today(new Date(2026, 8, 29, 0, 1).getTime())).toBe('2026-09-29')
  })
})

describe('walk — the first view (arrival.js:367-380)', () => {
  it('opens containers that hold a kept part; blocks below the fold stay final', () => {
    const { root } = tree('<section id="s"><p id="n">kept</p><p id="sib">sibling</p></section><footer id="low">low</footer><aside id="a">aside</aside>')
    const s = root.querySelector('#s') as HTMLElement
    place(root.querySelector('#low') as HTMLElement, { left: 0, top: 2000, width: 100, height: 20 })
    const out = walk(root, [root.querySelector('#n') as HTMLElement], { vw: 1024, vh: 768 })
    expect(out.through).toEqual([s])
    expect(out.units.map((u) => u.id)).toEqual(['sib', 'a'])
  })
})
