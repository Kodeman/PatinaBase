/**
 * US-14 arrival — the gate table. PURE: its only input is GateInput, so the decline order and a StrictMode
 * double invocation are testable as plain data.
 */
import { gate } from '../gate'
import { engine } from '../engine'
import { BUDGET } from '../types'
import type { ArriveToken, GateInput } from '../types'

const NOW = Date.UTC(2026, 8, 28, 14, 0)

function input(over: Partial<GateInput> = {}): GateInput {
  return {
    surface: 'desk', pathname: '/desk', search: '', hash: '', entry: 'hard', entryAt: NOW - 400, now: NOW,
    webdriver: false, e2eOptIn: false, visitAt: null, deskShown: false, token: null,
    suppressedPath: null, reducedMotion: false,
    ...over,
  }
}

const token = (over: Partial<ArriveToken> = {}): ArriveToken => ({ via: 'kbd', to: '/doc/w1', at: NOW - 1000, ...over })

// desk-doorway.tsx DOORWAY_KEYS: every one of them makes the URL a doorway
const DOORWAY_KEYS = [
  'book', 'sheet', 'page', 'vendorId', 'projectId', 'invoiceId', 'authorization', 'account', 'checkout',
  'session_id', 'po',
]

describe('gate — any query or hash at entry declines', () => {
  it.each(DOORWAY_KEYS)('?%s=… → query', (key) => {
    expect(gate(input({ search: `?${key}=x` }))).toEqual({ play: false, cause: 'query' })
  })
  it.each([
    ['the walkthrough replay', '?tour=1', ''],
    ['the call sheet', '?sheet=call', ''],
    ['an FF&E deep link', '?ffeItemId=abc', ''],
    ['the ?arrive=0 seam', '?arrive=0', ''],
    ['a hash', '', '#section-ffe'],
    ['the Stripe Checkout return', '?book=orders&checkout=success', ''],
  ])('%s → query', (_label, search, hash) => {
    expect(gate(input({ search, hash }))).toEqual({ play: false, cause: 'query' })
  })
  it('a bare ? or # is no query', () => {
    expect(gate(input({ search: '?', hash: '#' }))).toMatchObject({ play: true })
  })
})

describe('gate — the decline order', () => {
  it('a fresh token for this path with a landing → token', () => {
    const t = token({ via: 'act', to: '/doc/w1', landing: { kind: 'region', region: 'ledger' } })
    expect(gate(input({ surface: 'document', pathname: '/doc/w1', token: t }))).toEqual({ play: false, cause: 'token' })
  })
  it('R-DM21 A: the Desk act → token, with or without a landing', () => {
    const t = token({ via: 'act', to: '/doc/w1' })
    expect(gate(input({ surface: 'document', pathname: '/doc/w1', token: t }))).toEqual({ play: false, cause: 'token' })
  })
  it('a name-link token without a landing plays, carrying its via', () => {
    expect(gate(input({ surface: 'document', pathname: '/doc/w1', token: token() }))).toEqual({
      play: true, via: 'kbd', reduced: false,
    })
    expect(gate(input({ surface: 'document', pathname: '/doc/w1', token: token({ via: 'ptr' }) }))).toEqual({
      play: true, via: 'ptr', reduced: false,
    })
  })
  it('an act token for another path, a stale one or a refresh is not honoured', () => {
    const t = token({ via: 'act', to: '/doc/w1' })
    expect(gate(input({ surface: 'document', pathname: '/doc/w2', token: t }))).toMatchObject({ play: true })
    expect(
      gate(input({ surface: 'document', pathname: '/doc/w1', token: { ...t, at: NOW - BUDGET.TOKEN_TTL_MS } })),
    ).toMatchObject({ play: true })
    expect(gate(input({ surface: 'document', pathname: '/doc/w1', entry: 'reload', token: t }))).toMatchObject({ play: true })
  })
  it('a token for another path, a stale token or a refresh is not honoured', () => {
    const landing = { kind: 'region', region: 'ledger' } as const
    expect(gate(input({ surface: 'document', pathname: '/doc/w2', token: token({ landing }) }))).toEqual({
      play: true, via: null, reduced: false,
    })
    expect(
      gate(input({ surface: 'document', pathname: '/doc/w1', token: token({ at: NOW - BUDGET.TOKEN_TTL_MS, landing }) })),
    ).toEqual({ play: true, via: null, reduced: false })
    expect(
      gate(input({ surface: 'document', pathname: '/doc/w1', entry: 'reload', token: token({ landing }) })),
    ).toEqual({ play: true, via: null, reduced: false })
    expect(gate(input({ surface: 'document', pathname: '/doc/w1', entry: 'reload', token: token() }))).toEqual({
      play: true, via: null, reduced: false,
    })
  })
  it('navigator.webdriver declines unless the e2e seam opts in', () => {
    expect(gate(input({ webdriver: true }))).toEqual({ play: false, cause: 'webdriver' })
    expect(gate(input({ webdriver: true, e2eOptIn: true }))).toMatchObject({ play: true })
  })
  it('a replace entry, or a suppressed same-path replace → replace', () => {
    expect(gate(input({ entry: 'replace' }))).toEqual({ play: false, cause: 'replace' })
    expect(gate(input({ suppressedPath: '/desk' }))).toEqual({ play: false, cause: 'replace' })
    expect(gate(input({ suppressedPath: '/doc/w1' }))).toMatchObject({ play: true })
  })
  it('back/forward → back_forward', () => {
    expect(gate(input({ entry: 'back_forward' }))).toEqual({ play: false, cause: 'back_forward' })
  })
  it('a reload plays (the overnight tab refreshed in the morning); only the Desk visit rule suppresses it', () => {
    expect(gate(input({ entry: 'reload' }))).toEqual({ play: true, via: null, reduced: false })
    expect(gate(input({ surface: 'document', pathname: '/doc/w1', entry: 'reload', deskShown: true, visitAt: NOW - 1000 }))).toEqual({
      play: true, via: null, reduced: false,
    })
    expect(gate(input({ entry: 'reload', deskShown: true, visitAt: NOW - 60_000 }))).toEqual({
      play: false, cause: 'desk-shown',
    })
    expect(gate(input({ entry: 'reload', deskShown: true, visitAt: NOW - BUDGET.VISIT_MS }))).toMatchObject({ play: true })
  })
  it('the Desk already shown in a live visit → desk-shown', () => {
    expect(gate(input({ deskShown: true, visitAt: NOW - 60_000 }))).toEqual({ play: false, cause: 'desk-shown' })
  })
  it('a lapsed visit forgets the Desk was shown: it briefs again', () => {
    expect(gate(input({ deskShown: true, visitAt: NOW - BUDGET.VISIT_MS }))).toMatchObject({ play: true })
    expect(gate(input({ deskShown: true, visitAt: null }))).toMatchObject({ play: true })
  })
  it('a Document arrives on every open, shown or not', () => {
    expect(gate(input({ surface: 'document', pathname: '/doc/w1', deskShown: true, visitAt: NOW - 1000 }))).toEqual({
      play: true, via: null, reduced: false,
    })
  })
  it('the query outranks every later cause', () => {
    expect(gate(input({ search: '?book=x', webdriver: true, entry: 'reload', deskShown: true, visitAt: NOW }))).toEqual({
      play: false, cause: 'query',
    })
  })
  it('reduced motion rides the play result', () => {
    expect(gate(input({ reducedMotion: true }))).toEqual({ play: true, via: null, reduced: true })
  })
})

describe('gate — pure', () => {
  it('a StrictMode double invocation gives identical output and leaves its input untouched', () => {
    const cases = [
      input(),
      input({ deskShown: true, visitAt: NOW - 1000 }),
      input({ surface: 'document', pathname: '/doc/w1', token: token({ landing: { kind: 'section', sectionKey: 'ffe' } }) }),
    ]
    for (const c of cases) {
      const frozen = JSON.stringify(c)
      const first = gate(c)
      const second = gate(c)
      expect(second).toEqual(first)
      expect(JSON.stringify(c)).toBe(frozen)
    }
  })
  it('touches no storage', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem')
    const set = jest.spyOn(Storage.prototype, 'setItem')
    gate(input({ token: token() }))
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    get.mockRestore()
    set.mockRestore()
  })
  it('is the engine gate', () => {
    expect(engine.gate).toBe(gate)
  })
})
