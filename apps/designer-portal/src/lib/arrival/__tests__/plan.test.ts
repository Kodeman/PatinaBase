/**
 * US-14 arrival — the composition, measured once: the D1 display ladder, the reading position, the card layout
 * and the Act 3 field schedule.
 */
import { LEADING, RUNGS, S, field, ladder, plan, readingY, viewOf } from '../plan'
import type { Box, Measure, Unit } from '../plan'
import { installDom, place } from './dom-harness.test'
import type { Dom } from './dom-harness.test'

/** Playfair at ~0.5em per character, wrapping at maxWidth. */
const measure: Measure = (text, _family, size, maxWidth) => {
  const width = text.length * size * 0.5
  const lines = Math.ceil(width / maxWidth)
  return { width: Math.min(width, maxWidth), height: lines * size * LEADING }
}

const bx = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h, w, h })

describe('D1 — the display ladder', () => {
  it('a short sentence sets at 56', () => {
    expect(ladder('Two selections wait.', 'Playfair', 640, measure).size).toBe(56)
  })
  it('each rung down holds ≤ 2 lines', () => {
    const text = 'Invoice 1042 overdue — oldest due Aug 2 — send it.' // 50 chars: 3 lines at 56, 2 at 44
    const r = ladder(text, 'Playfair', 640, measure)
    expect(r.size).toBe(44)
    expect(r.lines).toBeLessThanOrEqual(2)
  })
  it('a long sentence lands on 28 at ≤ 3 lines, and never declines', () => {
    const text = 'Invoice 1042 overdue — oldest due Aug 2 — send a reminder before the install week begins.'
    const r = ladder(text, 'Playfair', 640, measure)
    expect(r.size).toBe(28)
    expect(r.lines).toBeLessThanOrEqual(3)
  })
  it('past 3 lines at 28 it still returns the last rung', () => {
    const r = ladder('word '.repeat(200), 'Playfair', 320, measure)
    expect(r.size).toBe(RUNGS[RUNGS.length - 1])
    expect(r.lines).toBeGreaterThan(3)
  })
})

describe('readingY — the mockup rule over view()', () => {
  const desk = viewOf({ top: 0, height: 768, width: 1024, bottom: 768 }, 768)
  it('the Desk stays put when the job and the act are both in view', () => {
    expect(readingY('desk', desk, bx(0, 300, 400, 24), bx(0, 360, 120, 44), bx(0, 260, 200, 26), 0, 4000)).toBe(0)
  })
  it('the Desk scrolls just enough to bring the act above the view bottom', () => {
    expect(readingY('desk', desk, bx(0, 700, 400, 24), bx(0, 800, 120, 44), bx(0, 660, 200, 26), 0, 4000)).toBe(76)
  })
  it('a Document puts its sentence at the reading line (0.28·H, clamped 160..240)', () => {
    expect(readingY('document', desk, bx(0, 900, 400, 24), null, null, 100, 4000)).toBe(100 + 900 - 215)
    const tall = viewOf({ top: 0, height: 1200, width: 1600, bottom: 1200 }, 1200)
    expect(readingY('document', tall, bx(0, 900, 400, 24), null, null, 0, 4000)).toBe(900 - 240)
  })
  it('on the phone the reading line is 160 below the view top (MobileBar excluded by view())', () => {
    const phone = viewOf({ top: 0, height: 700, width: 390, bottom: 700 }, 760)
    expect(phone.phone).toBe(true)
    expect(phone.portrait).toBe(true)
    expect(readingY('document', phone, bx(0, 500, 300, 24), null, null, 0, 4000)).toBe(340)
  })
  it('clamps to the scroll range', () => {
    expect(readingY('document', desk, bx(0, 100, 400, 24), null, null, 0, 4000)).toBe(0)
    expect(readingY('document', desk, bx(0, 5000, 400, 24), null, null, 0, 4000)).toBe(4000)
  })
})

describe('plan — the card, measured', () => {
  let dom: Dom
  beforeEach(() => {
    dom = installDom()
  })
  afterEach(() => {
    dom.restore()
    document.body.innerHTML = ''
  })

  function lines(keys: string[]): Record<string, HTMLElement> {
    const L: Record<string, HTMLElement> = {}
    for (const k of keys) {
      L[k] = document.body.appendChild(document.createElement('p'))
      place(L[k], { left: 0, top: 0, width: 200, height: 20 })
    }
    return L
  }

  it('stacks the place above and the facts below the headline, the act and cue after, carrying home by distance', () => {
    const v = viewOf({ top: 0, height: 768, width: 1024, bottom: 768 }, 768)
    const H = document.body.appendChild(document.createElement('span'))
    H.textContent = 'Two selections are waiting on Leah.'
    H.style.fontSize = '15px'
    place(H, { left: 120, top: 180, width: 300, height: 20 })
    const A = document.body.appendChild(document.createElement('button'))
    place(A, { left: 440, top: 176, width: 160, height: 44 })
    const clone = document.body.appendChild(document.createElement('p'))
    place(clone, { left: 0, top: 0, width: 600, height: 64 })
    const skip = document.body.appendChild(document.createElement('button'))
    place(skip, { left: 900, top: 708, width: 100, height: 44 })
    const L = lines(['place', 'crown', 'f1', 'f2', 'cue', 'line'])
    const p = plan({ surface: 'document', v, H, text: H.textContent, clone, size: 56, A, L, skip, f1: null })

    const mid = 0.44 * 768
    expect(p.head.top).toBeCloseTo(mid - 32)
    expect(p.m.place.top).toBeLessThan(p.head.top)
    expect(p.m.crown.top).toBeLessThan(p.m.place.top)
    expect(p.m.f1.top).toBeGreaterThan(p.head.top + p.head.h)
    expect(p.m.f2.top).toBeGreaterThan(p.m.f1.top)
    expect(p.m.cue.top).toBeGreaterThan(p.m.f2.top)
    // centred on desktop, the period hanging past the measure
    expect(p.head.left).toBeCloseTo(512 - 300 - 0.064 * 56)
    expect(p.head.q).toBeCloseTo(15 / 56)
    expect(p.act).not.toBeNull()
    expect(p.d).toBeGreaterThanOrEqual(S.dMin)
    expect(p.d).toBeLessThanOrEqual(S.dMax)
    expect(p.carriers).toHaveLength(2)
    expect(p.rides).toHaveLength(0)
  })
})

describe('field — the Act 3 schedule', () => {
  const unit = (d: number): Unit => ({
    el: document.createElement('p'), r: bx(0, d, 100, 20), d, rules: [], kids: [], inline: false, kind: 'rise',
    off: 0, origin: '0px 100%', dur: S.rise, base: 0, t: 0,
  })
  it('nearest first, every onset ≤ 2000ms, never more than the cap in flight', () => {
    const us = field(Array.from({ length: 40 }, (_, i) => unit(40 - i)), [], false, false)
    expect(us[0].d).toBe(1)
    expect(Math.max(...us.map((u) => u.t))).toBeLessThanOrEqual(S.last)
    for (const u of us) {
      if (u.t >= S.last) continue
      const live = us.filter((x) => x.t <= u.t && x.t + x.dur > u.t)
      expect(live.length).toBeLessThanOrEqual(S.cap)
    }
  })
  it('reduced motion: fades inside 0..400ms', () => {
    const us = field([unit(10), unit(300)], [], false, true)
    expect(Math.max(...us.map((u) => u.t))).toBeLessThanOrEqual(S.rmSpan)
  })
})
