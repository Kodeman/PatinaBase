/**
 * US-14 arrival — the lift: the card is built only from what the page printed under [data-part] marks (T3), with
 * D2 card-side punctuation and the 8-word rule; the frame-0 re-read uses the same rule.
 */
import { brief, period, printed, sentence, verifyFrame0, words } from '../brief'
import { engine } from '../engine'
import type { Brief, Part } from '../types'
import { OVERDUE_CLAIM, deskDom, documentDom, installDom } from './dom-harness.test'
import type { Dom } from './dom-harness.test'

const TODAY = '2026-09-28'
const texts = (b: Brief) => b.parts.map((p) => [p.part, p.text] as [Part, string])

let dom: Dom
beforeEach(() => {
  dom = installDom()
})
afterEach(() => {
  dom.restore()
  document.body.innerHTML = ''
})

describe('D2 — the page words, card-side punctuation', () => {
  it('counts words as the mockup does', () => {
    expect(words('Overdue 23 days: Invoice 1042 overdue — oldest due Aug 2 — send a reminder')).toBe(13)
  })
  it('adds a terminal period only when the page printed none', () => {
    expect(period('Nothing is overdue.')).toBe('Nothing is overdue.')
    expect(period('Is it signed?')).toBe('Is it signed?')
    expect(period('Send it')).toBe('Send it.')
    expect(period('')).toBe('')
  })
  it('composes a short overdue claim with a colon (R-DM24 A)', () => {
    expect(sentence('Overdue 3 days — Invoice 1042 overdue')).toEqual({
      headline: 'Overdue 3 days: Invoice 1042 overdue.', f3: null,
    })
  })
  it('past 8 words the need text alone is the headline and the overdue phrase moves to F3', () => {
    expect(sentence(OVERDUE_CLAIM)).toEqual({
      headline: 'Invoice 1042 overdue — oldest due Aug 2 — send a reminder.',
      f3: 'Overdue 23 days.',
    })
  })
})

describe('brief — the Desk', () => {
  it('lifts the overdue claim by the 8-word rule, in card order', () => {
    const b = brief(deskDom(), 'desk', TODAY) as Brief
    expect(texts(b)).toEqual([
      ['head', 'MONDAY · 28 SEPTEMBER'],
      ['job', 'Whitfield'],
      ['headline', 'Invoice 1042 overdue — oldest due Aug 2 — send a reminder.'],
      ['f1', 'Reyes: overdue 4 days.'],
      ['f2', 'Okafor: sign the quote.'],
      ['f3', 'Overdue 23 days.'],
      ['act', 'Send the reminder'],
      ['settle', ''],
    ])
    expect(b.headline.node.getAttribute('data-register')).toBe('sentence')
    expect((b.act?.node.getAttribute('data-part') ?? '').split(/\s+/)).toContain('act')
    expect(b.today).toBe(TODAY)
    // F3 is a substring of the headline's own node: no node of its own
    expect(b.parts.find((p) => p.part === 'f3')?.node).toBe(b.headline.node)
  })
  it('composes a short claim with a colon and no F3', () => {
    const b = brief(deskDom({ headline: 'Overdue 3 days — Invoice 1042 overdue' }), 'desk', TODAY) as Brief
    expect(b.headline.text).toBe('Overdue 3 days: Invoice 1042 overdue.')
    expect(b.parts.some((p) => p.part === 'f3')).toBe(false)
  })
  it('never declines on length', () => {
    const long = `Overdue 40 days — ${'the long need text runs on and on '.repeat(6).trim()}`
    const b = brief(deskDom({ headline: long }), 'desk', TODAY) as Brief
    expect(b).not.toBeNull()
    expect(words(b.headline.text)).toBeGreaterThan(30)
  })
  it('the quiet Desk: the always-printed overdue line is the headline and the settle', () => {
    const b = brief(deskDom({ headline: null }), 'desk', TODAY) as Brief
    expect(b.headline.text).toBe('Nothing is overdue.')
    expect(b.act).toBeNull()
    const settle = b.parts.find((p) => p.part === 'settle')
    expect(settle?.node).toBe(b.headline.node)
  })
  it('T4 — the lift reads marks, not order: shuffled rows give the same card', () => {
    const a = texts(brief(deskDom({ rows: ['Pierce — due today', 'Moss — draft sent', 'Lund — call back'] }), 'desk', TODAY) as Brief)
    const b = texts(brief(deskDom({ rows: ['Lund — call back', 'Pierce — due today', 'Moss — draft sent'] }), 'desk', TODAY) as Brief)
    expect(b).toEqual(a)
  })
})

describe('brief — the Document', () => {
  it('lifts crown, name, stage, the sentence, the vitals and the act', () => {
    const b = brief(documentDom(), 'document', TODAY) as Brief
    expect(texts(b)).toEqual([
      ['crown', ''],
      ['name', 'Whitfield Residence'],
      ['stage', 'Shaping'],
      ['headline', 'Two selections are waiting on Leah.'],
      ['f1', 'Start 3 August'],
      ['f2', 'Install 14 November'],
      ['f3', '$48,200'],
      ['act', 'Review the selections'],
    ])
  })
  it('reads data-arr-long over the printed short form (the phone long form)', () => {
    const root = documentDom({ sentence: 'OVERDUE 3D · Invoice 1042', long: 'Invoice 1042 is three days overdue' })
    expect(printed(root.querySelector('[data-lens-sentence]') as HTMLElement)).toBe('Invoice 1042 is three days overdue')
    expect((brief(root, 'document', TODAY) as Brief).headline.text).toBe('Invoice 1042 is three days overdue.')
  })
  it('the quiet Document arrives on its name: no act, the place is the stage', () => {
    const b = brief(documentDom({ sentence: null }), 'document', TODAY) as Brief
    expect(b.headline.text).toBe('Whitfield Residence')
    expect(b.headline.node.tagName).toBe('H1')
    expect(b.act).toBeNull()
    expect(b.parts.filter((p) => p.part === 'name')).toHaveLength(0)
    expect(b.parts.find((p) => p.part === 'stage')?.text).toBe('Shaping')
  })
  it('a held (disabled) band act counts as no act', () => {
    const b = brief(documentDom({ disabled: true }), 'document', TODAY) as Brief
    expect(b.act).toBeNull()
    expect(b.parts.some((p) => p.part === 'act')).toBe(false)
  })
  it('lifts nothing outside the route root and returns null when nothing prints', () => {
    const root = documentDom()
    root.innerHTML = ''
    expect(brief(root, 'document', TODAY)).toBeNull()
  })
})

describe('verifyFrame0 — the same rule, re-read', () => {
  it('holds while the page prints the same words', () => {
    expect(verifyFrame0(brief(deskDom(), 'desk', TODAY) as Brief)).toBe(true)
    expect(verifyFrame0(brief(documentDom({ long: 'The long form' }), 'document', TODAY) as Brief)).toBe(true)
  })
  it('drift: a re-printed sentence → false', () => {
    const b = brief(deskDom(), 'desk', TODAY) as Brief
    b.headline.node.textContent = 'Overdue 24 days — Invoice 1042 overdue — oldest due Aug 2 — send a reminder'
    expect(verifyFrame0(b)).toBe(false)
  })
  it('drift: a changed long form, or a part that left the page → false', () => {
    const root = documentDom({ long: 'The long form' })
    const b = brief(root, 'document', TODAY) as Brief
    b.headline.node.setAttribute('data-arr-long', 'Another long form')
    expect(verifyFrame0(b)).toBe(false)
    const c = brief(documentDom(), 'document', TODAY) as Brief
    c.act?.node.remove()
    expect(verifyFrame0(c)).toBe(false)
  })
})

describe('engine.brief — the lift, classified', () => {
  it('today is browser-local and the headline always flies as the clone', () => {
    const b = engine.brief(deskDom(), 'desk') as Brief
    expect(b.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(b.headline.carrier).toBe('clone')
    expect(b.act?.carrier).toBe('node')
  })
  it('is engine.verifyFrame0-consistent', () => {
    const b = engine.brief(documentDom(), 'document') as Brief
    expect(engine.verifyFrame0(b)).toBe(true)
  })
})
