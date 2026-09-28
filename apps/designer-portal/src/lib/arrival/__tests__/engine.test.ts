/**
 * US-14 arrival — the run: start, the three acts, input, the guards and the one restoring finish(). WAAPI,
 * layout and fonts are faked (dom-harness); time is jest's fake clock, so every act boundary is exact. The
 * mockup's browser checks B1-B13 (verify/cinematic-browser.mjs:132-358) are ported where jsdom can hold them.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, engine, message } from '../engine'
import { S } from '../plan'
import { BUDGET, EVENT_ENDED } from '../types'
import type { ArrivalEnded, Brief, Surface } from '../types'
import type { Run } from '../run-contract'
import { deskDom, documentDom, flush, installDom, makeHost, place } from './dom-harness.test'
import type { Dom, FakeAnimation, TestHost } from './dom-harness.test'

const CSS = readFileSync(join(__dirname, '../arrival.css'), 'utf8')
const html = document.documentElement

let dom: Dom
let runs: Run[] = []
let events: ArrivalEnded[] = []
let offs: Array<() => void> = []
const onEnded = (e: Event) => events.push((e as CustomEvent<ArrivalEnded>).detail)

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-09-28T09:00:00'), doNotFake: ['queueMicrotask', 'nextTick'] })
  dom = installDom()
  html.className = 'arr-pre'
  events = []
  window.addEventListener(EVENT_ENDED, onEnded)
})

afterEach(() => {
  for (const r of runs) r.finish('skip')
  runs = []
  for (const off of offs.splice(0)) off()
  window.removeEventListener(EVENT_ENDED, onEnded)
  dom.restore()
  jest.useRealTimers()
  document.body.innerHTML = ''
  html.className = ''
  delete (document as unknown as { visibilityState?: string }).visibilityState
})

/** The host's window-capture forwarding (CONTRACT §3: registered before every chrome listener). */
function wire(run: Run) {
  const add = (t: EventTarget, type: string, fn: (e: Event) => void) => {
    t.addEventListener(type, fn, true)
    offs.push(() => t.removeEventListener(type, fn, true))
  }
  add(window, 'keydown', (e) => run.onKeyDown(e as KeyboardEvent))
  add(window, 'pointerdown', (e) => run.onPointerDown(e as PointerEvent))
  add(window, 'pointerup', (e) => run.onPointerUp(e as PointerEvent))
  add(window, 'wheel', (e) => run.onWheel(e as WheelEvent))
  add(window, 'touchmove', (e) => run.onTouchMove(e as TouchEvent))
  add(window, 'scroll', () => run.onScroll())
  add(document, 'visibilitychange', () => run.onVisibilityChange())
  add(window, 'focusin', (e) => run.onFocusIn(e as FocusEvent))
}

interface Started {
  run: Run
  b: Brief
  root: HTMLElement
  host: TestHost
  H: HTMLElement
  A: HTMLElement
  ended: () => ArrivalEnded[]
}

function go(root: HTMLElement, opts: { reduced?: boolean; via?: 'ptr' | 'kbd' | 'act' | null; host?: TestHost } = {}): Started {
  const surface = root.getAttribute('data-arrival') as Surface
  const act = root.querySelector<HTMLElement>('[data-part~="act"]')
  if (act) place(act, ACT)
  const b = engine.brief(root, surface) as Brief
  const host = opts.host ?? makeHost(root)
  const run = createRun(b, host, {
    via: opts.via ?? null, reduced: opts.reduced ?? false, entryAt: Date.now(), now: () => Date.now(),
  })
  runs.push(run)
  wire(run)
  run.start()
  return { run, b, root, host, H: b.headline.node, A: b.act?.node as HTMLElement, ended: () => events }
}

const toHold = () => jest.advanceTimersByTime(S.CE)
const toRest = () => jest.advanceTimersByTime(BUDGET.HOLD_MS + 6000)

function key(k: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  const stop = jest.spyOn(e, 'stopImmediatePropagation')
  target.dispatchEvent(e)
  return { e, stop }
}

function pointer(type: 'pointerdown' | 'pointerup', target: EventTarget, x: number, y: number, id = 1) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperty(e, 'pointerId', { value: id })
  const stop = jest.spyOn(e, 'stopImmediatePropagation')
  target.dispatchEvent(e)
  return { e, stop }
}

function counter(target: EventTarget, type: string) {
  const fn = jest.fn()
  target.addEventListener(type, fn)
  offs.push(() => target.removeEventListener(type, fn))
  return fn
}

/** The page's markup with each inline style re-serialized, so a restored declaration compares equal. */
function clean(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement
  const probe = document.createElement('i')
  for (const el of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('[style]'))]) {
    const v = el.getAttribute('style')
    if (v === null) continue
    probe.setAttribute('style', v)
    if (probe.style.cssText) el.setAttribute('style', probe.style.cssText)
    else el.removeAttribute('style')
  }
  return copy.outerHTML
}
/** Where the act is laid out: its centre is where she presses it. */
const ACT = { left: 400, top: 300, width: 160, height: 44 }
const AX = 480
const AY = 322
const ours = () => Array.from(document.querySelectorAll('[data-arr]'))

describe('start', () => {
  it('swaps arr-pre → arr-on, marks the root played, and composes', () => {
    const { run, root } = go(deskDom())
    expect(html.classList.contains('arr-on')).toBe(true)
    expect(html.classList.contains('arr-pre')).toBe(false)
    expect(root.hasAttribute('data-arr-played')).toBe(true)
    expect(run.phase).toBe('compose')
    expect(document.querySelector('.arr-skip')?.textContent).toBe('Skip arrival')
    expect(document.getElementById('arr-hint')?.getAttribute('aria-hidden')).toBe('true')
    expect(ours().every((n) => n.hasAttribute('data-arr'))).toBe(true)
  })
  it('the headline flies as an aria-hidden display clone; the real node holds opacity 0', () => {
    const { H } = go(deskDom())
    const clone = document.querySelector('.arr-h') as HTMLElement
    expect(clone.textContent).toBe('Invoice 1042 overdue — oldest due Aug 2 — send a reminder.')
    expect(clone.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(clone.style.fontFamily).toBe("'Playfair Display'")
    expect(H.style.opacity).toBe('0')
  })
  it('a pinned (sticky) headline flies on the fixed layer', () => {
    go(documentDom())
    expect((document.querySelector('.arr-h') as HTMLElement).parentElement?.classList.contains('arr-card-fix')).toBe(true)
  })
  it('the act is the real node, live and unclipped for the run', () => {
    const root = deskDom()
    const card = root.querySelector('.desk-claim-card') as HTMLElement
    card.style.overflow = 'hidden'
    const { A } = go(root)
    expect(A.style.pointerEvents).toBe('auto')
    expect(A.style.getPropertyPriority('pointer-events')).toBe('important')
    expect(A.getAttribute('draggable')).toBe('false')
    expect(card.hasAttribute('data-arr-unclip')).toBe(true)
  })
  it('frame-0 hides are instant: every hidden page node has its own transition off, restored at finish', () => {
    const root = documentDom()
    const H = root.querySelector('[data-lens-sentence]') as HTMLElement
    const name = root.querySelector('[data-part~="name"]') as HTMLElement
    H.style.transition = 'opacity 150ms'
    name.style.transition = 'opacity 150ms'
    const { run } = go(root)
    expect(H.style.opacity).toBe('0')
    expect(H.style.transition).toBe('none')
    expect(name.style.opacity).toBe('0')
    expect(name.style.transition).toBe('none')
    const hidden = Array.from(root.querySelectorAll<HTMLElement>('[style]')).filter((el) => el.style.opacity === '0')
    expect(hidden.length).toBeGreaterThan(2)
    for (const el of hidden) expect(el.style.transition).toBe('none')
    run.finish('skip')
    expect(H.style.transition).toBe('opacity 150ms')
    expect(H.style.opacity).toBe('')
    expect(name.style.transition).toBe('opacity 150ms')
    for (const el of hidden) expect(el.style.getPropertyValue('transition')).not.toBe('none')
  })
  it('declines drift before touching the page: no played mark, the entry move plays', () => {
    const root = deskDom()
    const b = engine.brief(root, 'desk') as Brief
    b.headline.node.textContent = 'Overdue 24 days — Invoice 1042 overdue'
    const run = createRun(b, makeHost(root), { via: null, reduced: false, entryAt: 0, now: () => Date.now() })
    run.start()
    expect(events).toEqual([{ surface: 'desk', how: 'declined', cause: 'drift' }])
    expect(root.hasAttribute('data-arr-played')).toBe(false)
    expect(html.classList.contains('arr-pre')).toBe(false)
    expect(ours()).toHaveLength(0)
  })
  it('declines no-root when the route root is gone', () => {
    const root = deskDom()
    const b = engine.brief(root, 'desk') as Brief
    const run = createRun(b, makeHost(null), { via: null, reduced: false, entryAt: 0, now: () => Date.now() })
    run.start()
    expect(events).toEqual([{ surface: 'desk', how: 'declined', cause: 'no-root' }])
  })
  it('a page-driven scroll right after start is not her hand (inputAt resets at entry)', () => {
    const { run } = go(deskDom())
    ;(window as unknown as { scrollY: number }).scrollY = 120
    window.dispatchEvent(new Event('scroll'))
    expect(run.phase).toBe('compose')
    const w = new Event('wheel', { bubbles: true })
    window.dispatchEvent(w)
    expect(run.phase).toBe('assemble')
  })
})

describe('B1 — a cold start reaches the hold with no advance before it', () => {
  it('compose → hold at CE, still holding a beat later through a late layout shift', () => {
    const { run } = go(deskDom())
    jest.advanceTimersByTime(S.CE - 1)
    expect(run.phase).toBe('compose')
    jest.advanceTimersByTime(1)
    expect(run.phase).toBe('hold')
    ;(window as unknown as { scrollY: number }).scrollY = 40
    window.dispatchEvent(new Event('scroll'))
    jest.advanceTimersByTime(400)
    expect(run.phase).toBe('hold')
  })
  it('the hold times out into the assembly and settles', async () => {
    const { run } = go(deskDom())
    toHold()
    jest.advanceTimersByTime(BUDGET.HOLD_MS)
    expect(run.phase).toBe('assemble')
    expect(html.classList.contains('arr-asm')).toBe(true)
    jest.advanceTimersByTime(6000)
    await expect(run.ended).resolves.toEqual({ surface: 'desk', how: 'settled' })
  })
})

describe('the one announcement', () => {
  it('one polite status, empty until the hold, then the card in slot order', () => {
    const { b } = go(deskDom())
    const status = document.querySelectorAll('[role="status"]')
    expect(status).toHaveLength(1)
    expect(status[0].getAttribute('aria-live')).toBe('polite')
    expect(status[0].textContent).toBe('')
    toHold()
    expect(status[0].textContent).toBe(message(b))
    expect(message(b)).toBe(
      'MONDAY, 28 SEPTEMBER. Invoice 1042 overdue — oldest due Aug 2 — send a reminder. Reyes: overdue 4 days. ' +
        'Okafor: sign the quote. Overdue 23 days. Tab to Send the reminder, or press any key to open the page.',
    )
  })
  it("silences the band's own live region for the run and restores it", () => {
    const root = documentDom()
    const region = root.querySelector('[aria-live]') as HTMLElement
    const { run } = go(root)
    expect(region.getAttribute('aria-live')).toBe('off')
    run.finish('skip')
    expect(region.getAttribute('aria-live')).toBe('polite')
  })
})

describe('guards', () => {
  it('a childList mutation in the route root → mutation, everything restored', async () => {
    const root = deskDom()
    const before = clean(root)
    const { run } = go(root)
    await flush()
    expect(run.phase).toBe('compose') // the engine's own nodes and measures are not mutations
    root.querySelector('#roster')?.appendChild(document.createElement('li'))
    await flush()
    expect(events).toEqual([{ surface: 'desk', how: 'mutation' }])
    root.querySelector('#roster')?.lastElementChild?.remove()
    root.removeAttribute('data-arr-played')
    expect(clean(root)).toBe(before)
    expect(ours()).toHaveLength(0)
    expect(html.className).toBe('')
  })
  it('characterData in the root, or a foreign body child → mutation; attributes are not', async () => {
    const a = go(deskDom())
    a.root.setAttribute('data-x', '1')
    await flush()
    expect(a.run.phase).toBe('compose')
    ;(a.H.firstChild as Text).data = 'Reprinted'
    await flush()
    expect(events.map((e) => e.how)).toEqual(['mutation'])

    const b = go(deskDom())
    document.body.appendChild(document.createElement('div'))
    await flush()
    expect(b.run.phase).toBe('done')
    expect(events.map((e) => e.how)).toEqual(['mutation', 'mutation'])
  })
  it('the watchdog ends a stalled run at compose + hold + 5s', () => {
    const { run } = go(deskDom())
    toHold()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    jest.advanceTimersByTime(BUDGET.HOLD_MS + BUDGET.WATCHDOG_MARGIN_MS - 1)
    expect(run.phase).toBe('hold')
    jest.advanceTimersByTime(1)
    expect(events).toEqual([{ surface: 'desk', how: 'watchdog' }])
  })
  it('a throw in a scheduled callback → error, pointer-events and classes restored', () => {
    const { A } = go(deskDom())
    dom.failAnimate = true
    toHold()
    expect(events).toEqual([{ surface: 'desk', how: 'error' }])
    expect(A.style.pointerEvents).toBe('')
    expect(A.style.getPropertyPriority('pointer-events')).toBe('')
    expect(html.classList.contains('arr-on')).toBe(false)
    expect(ours()).toHaveLength(0)
  })
  it('window error / unhandledrejection → error', () => {
    go(deskDom())
    window.dispatchEvent(new ErrorEvent('error'))
    go(deskDom())
    window.dispatchEvent(new Event('unhandledrejection'))
    expect(events.map((e) => e.how)).toEqual(['error', 'error'])
  })
  it('a hidden tab outside the hold rests; inside it pauses', () => {
    const { run } = go(deskDom())
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(events).toEqual([{ surface: 'desk', how: 'hidden-tab' }])
    expect(run.phase).toBe('done')
  })
})

describe('finish', () => {
  it('is idempotent: ended resolves once, the event fires once', async () => {
    const { run } = go(deskDom())
    run.finish('skip')
    run.finish('mutation')
    run.finish('error')
    await expect(run.ended).resolves.toEqual({ surface: 'desk', how: 'skip' })
    expect(events).toEqual([{ surface: 'desk', how: 'skip' }])
    expect(run.phase).toBe('done')
  })
  it('restores every page node, class and attribute from any act; data-arr-played outlives it', () => {
    for (const at of [0, S.CE, S.CE + BUDGET.HOLD_MS + 400]) {
      const root = documentDom()
      const before = clean(root)
      const { run } = go(root)
      jest.advanceTimersByTime(at)
      run.finish('skip')
      expect(ours()).toHaveLength(0)
      expect(html.className).toBe('')
      expect(root.hasAttribute('data-arr-played')).toBe(true)
      root.removeAttribute('data-arr-played')
      expect(clean(root)).toBe(before)
      expect(dom.animations.every((a) => a.playState === 'idle')).toBe(true)
      dom.animations.length = 0
    }
  })
  it('StrictMode: a second start() is a no-op, and the run touches no storage', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem')
    const set = jest.spyOn(Storage.prototype, 'setItem')
    const { run } = go(deskDom())
    run.start()
    expect(document.querySelectorAll('.arr-skip')).toHaveLength(1)
    toHold()
    toRest()
    expect(run.phase).toBe('done')
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    get.mockRestore()
    set.mockRestore()
  })
  it('adds no window listener but error/unhandledrejection, and removes those', () => {
    const add = jest.spyOn(window, 'addEventListener')
    const remove = jest.spyOn(window, 'removeEventListener')
    const root = deskDom()
    const b = engine.brief(root, 'desk') as Brief
    const run = createRun(b, makeHost(root), { via: null, reduced: false, entryAt: 0, now: () => Date.now() })
    run.start()
    toHold()
    toRest()
    const types = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => c[0]).filter((t) => t !== EVENT_ENDED)
    expect(types(add).sort()).toEqual(['error', 'unhandledrejection'])
    expect(types(remove).sort()).toEqual(['error', 'unhandledrejection'])
    add.mockRestore()
    remove.mockRestore()
  })
  it('a start after finish does nothing', () => {
    const root = deskDom()
    const b = engine.brief(root, 'desk') as Brief
    const run = createRun(b, makeHost(root), { via: null, reduced: false, entryAt: 0, now: () => Date.now() })
    run.finish('skip')
    run.start()
    expect(html.classList.contains('arr-on')).toBe(false)
    expect(root.hasAttribute('data-arr-played')).toBe(false)
  })
})

describe('keys (CONTRACT §3)', () => {
  it.each([
    ['Act 1', 0],
    ['Act 2', S.CE],
  ])('Escape in %s is swallowed and advances', (_label, at) => {
    const page = counter(document, 'keydown') // LogStrip's discardOffer stand-in
    const { run } = go(deskDom())
    jest.advanceTimersByTime(at)
    const { e, stop } = key('Escape')
    expect(stop).toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
    expect(page).not.toHaveBeenCalled()
    expect(run.phase).toBe('assemble')
  })
  it('Escape in Act 3 is swallowed and changes nothing; the run settles as escape', async () => {
    const page = counter(document, 'keydown')
    const { run } = go(deskDom())
    toHold()
    key('Escape')
    const { e, stop } = key('Escape')
    expect(stop).toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
    expect(page).not.toHaveBeenCalled()
    expect(run.phase).toBe('assemble')
    toRest()
    await expect(run.ended).resolves.toEqual({ surface: 'desk', how: 'escape' })
  })
  it('a bare "t" in Act 1 only advances: stopped before the chrome shortcut', () => {
    const page = counter(document, 'keydown')
    const { run } = go(deskDom())
    const { e, stop } = key('t')
    expect(stop).toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
    expect(page).not.toHaveBeenCalled()
    expect(run.phase).toBe('assemble')
  })
  it('⌘K in Act 2 advances, stopped, without taking the browser default', () => {
    const page = counter(document, 'keydown')
    const { run } = go(deskDom())
    toHold()
    const { e, stop } = key('k', { metaKey: true })
    expect(stop).toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
    expect(page).not.toHaveBeenCalled()
    expect(run.phase).toBe('assemble')
  })
  it('a lone modifier does nothing', () => {
    const { run } = go(deskDom())
    toHold()
    key('Shift')
    expect(run.phase).toBe('hold')
  })
  it('Tab in the hold moves focus into the card and pauses the hold; Enter on the act acts once', () => {
    const { run, A } = go(deskDom())
    const clicks = counter(A, 'click')
    toHold()
    const { e } = key('Tab')
    expect(e.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(A)
    jest.advanceTimersByTime(BUDGET.HOLD_MS + 1000)
    expect(run.phase).toBe('hold')
    key('Tab')
    expect(document.activeElement).toBe(document.querySelector('.arr-skip'))
    key('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(A)
    key('Enter', {}, A)
    expect(events).toEqual([{ surface: 'desk', how: 'input' }])
    expect(clicks).toHaveBeenCalledTimes(1)
  })
  it('Enter on a focused Skip → skip', () => {
    go(deskDom())
    toHold()
    key('Tab')
    key('Tab')
    key('Enter', {}, document.activeElement as HTMLElement)
    expect(events).toEqual([{ surface: 'desk', how: 'skip' }])
  })
})

describe('Skip and landing focus', () => {
  it('Skip goes straight to rest', () => {
    const { run } = go(deskDom())
    ;(document.querySelector('.arr-skip') as HTMLButtonElement).click()
    expect(events).toEqual([{ surface: 'desk', how: 'skip' }])
    expect(run.phase).toBe('done')
    expect(ours()).toHaveLength(0)
  })
  it('the displaced act snaps home at Skip: offset off and flushed before its own transition comes back', () => {
    const root = deskDom()
    const act = root.querySelector('[data-part~="act"]') as HTMLElement
    act.style.transition = 'transform 240ms'
    const { A } = go(root)
    toHold()
    expect(A.style.transition).toBe('none')
    expect(A.style.transform).not.toBe('')
    const atFlush: string[] = []
    Object.defineProperty(html, 'offsetWidth', {
      configurable: true,
      get: () => {
        atFlush.push(A.getAttribute('style') ?? '')
        return 0
      },
    })
    offs.push(() => delete (html as unknown as { offsetWidth?: number }).offsetWidth)
    ;(document.querySelector('.arr-skip') as HTMLButtonElement).click()
    expect(events).toEqual([{ surface: 'desk', how: 'skip' }])
    expect(atFlush).toHaveLength(1)
    const probe = document.createElement('i')
    probe.setAttribute('style', atFlush[0])
    expect(probe.style.transform).toBe('')
    expect(probe.style.getPropertyValue('translate')).toBe('')
    expect(probe.style.transition).toBe('none')
    expect(A.style.transition).toBe('transform 240ms')
    expect(A.style.transform).toBe('')
  })
  it('a kbd token lands focus at hold timeout: a doorway act takes it', async () => {
    const { run, A } = go(documentDom(), { via: 'kbd' })
    toHold()
    toRest()
    await expect(run.ended).resolves.toEqual({ surface: 'document', how: 'settled' })
    expect(document.activeElement).toBe(A)
  })
  it('a kbd token with a terminal act lands on head', () => {
    const { root } = go(deskDom(), { via: 'kbd' })
    toHold()
    toRest()
    expect(document.activeElement).toBe(root.querySelector('[data-part="head"]'))
  })
  it('a pointer entry takes no landing focus', () => {
    go(documentDom(), { via: 'ptr' })
    toHold()
    toRest()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('pointer (O1)', () => {
  it('B2 — a click where she sees the act early in Act 3 activates it once, nothing else', () => {
    const { run, A, root } = go(deskDom())
    const acts = counter(A, 'click')
    const others = counter(document.getElementById('chrome') as HTMLElement, 'click')
    const rest = counter(root, 'click')
    const downs = counter(A, 'pointerdown')
    toHold()
    key('a')
    expect(run.phase).toBe('assemble')
    pointer('pointerdown', A, AX, AY)
    expect(downs).not.toHaveBeenCalled()
    pointer('pointerup', html, AX, AY) // released over where the act is seen, off its moving node
    expect(events).toEqual([{ surface: 'desk', how: 'input' }])
    expect(acts).toHaveBeenCalledTimes(1)
    expect(rest).toHaveBeenCalledTimes(1) // that one click, bubbling from the act
    expect(others).not.toHaveBeenCalled()
  })
  it('B2 — released on the act itself, the browser’s own click is the one activation (none forwarded)', () => {
    const { A } = go(deskDom())
    const acts = counter(A, 'click')
    toHold()
    key('a')
    pointer('pointerdown', A, AX, AY)
    pointer('pointerup', A, AX, AY)
    expect(events).toEqual([{ surface: 'desk', how: 'input' }])
    expect(acts).not.toHaveBeenCalled()
  })
  it('B3 — a double-click in the hold advances once and rests, not cut', async () => {
    const { run, root } = go(deskDom())
    const p = root.querySelector('#line-3 p') as HTMLElement
    const page = counter(p, 'pointerdown')
    toHold()
    pointer('pointerdown', p, 50, 50)
    pointer('pointerup', p, 50, 50)
    expect(run.phase).toBe('assemble')
    jest.advanceTimersByTime(100)
    const second = pointer('pointerdown', p, 52, 51)
    expect(second.stop).toHaveBeenCalled()
    expect(second.e.defaultPrevented).toBe(true)
    pointer('pointerup', p, 52, 51)
    expect(page).not.toHaveBeenCalled()
    expect(run.phase).toBe('assemble')
    toRest()
    await expect(run.ended).resolves.toEqual({ surface: 'desk', how: 'input' })
  })
  it('B4 — a tap on the act in the hold activates it with no advance', () => {
    const { run, A } = go(deskDom())
    toHold()
    const down = pointer('pointerdown', A, AX, AY, 7)
    expect(down.e.defaultPrevented).toBe(true)
    expect(run.phase).toBe('hold')
    pointer('pointerup', A, AX, AY, 7)
    expect(run.phase).toBe('done')
    expect(events).toEqual([{ surface: 'desk', how: 'input' }])
    expect(html.classList.contains('arr-asm')).toBe(false)
  })
  it('B5 — a drag that starts on the act and releases off it advances, and does not activate', () => {
    const { run, A } = go(deskDom())
    const acts = counter(A, 'click')
    toHold()
    pointer('pointerdown', A, AX, AY)
    pointer('pointerup', document.body, AX - 60, AY - 160)
    expect(run.phase).toBe('assemble')
    expect(acts).not.toHaveBeenCalled()
  })
  it('in Act 3 a control snaps to rest, then acts natively (not swallowed)', () => {
    const { run } = go(deskDom())
    const bar = document.getElementById('bar') as HTMLElement
    const downs = counter(bar, 'pointerdown')
    toHold()
    key('a')
    const { stop } = pointer('pointerdown', bar, 5, 5)
    expect(stop).not.toHaveBeenCalled()
    expect(downs).toHaveBeenCalledTimes(1)
    expect(run.phase).toBe('done')
    expect(events).toEqual([{ surface: 'desk', how: 'input' }])
  })
  it('a chrome press in Acts 1-2 advances and is swallowed', () => {
    const { run } = go(deskDom())
    const bar = document.getElementById('bar') as HTMLElement
    const downs = counter(bar, 'pointerdown')
    const { stop } = pointer('pointerdown', bar, 5, 5)
    expect(stop).toHaveBeenCalled()
    expect(downs).not.toHaveBeenCalled()
    expect(run.phase).toBe('assemble')
  })
})

describe('B6 — Tab in Act 3 rests with focus on the act or the landing target', () => {
  it.each([
    ['desk', deskDom],
    ['document', documentDom],
  ])('%s', (_s, make) => {
    const { run, A, root } = go(make())
    toHold()
    key('a')
    jest.advanceTimersByTime(300)
    const { e } = key('Tab')
    expect(e.defaultPrevented).toBe(true)
    expect(run.phase).toBe('done')
    expect([A, root.querySelector('[data-part~="head"]')]).toContain(document.activeElement)
  })
})

describe('B7 / B8 / B10 — the stylesheet the run relies on', () => {
  it('B7: carries the sentinel', () => {
    expect(CSS).toMatch(/:root\{--arr-ok:1\}/)
  })
  it('B8: hides only the route root under arr-pre, with a 1.5s reveal failsafe', () => {
    expect(CSS).toContain('html.arr-pre [data-arrival]{opacity:0;animation-play-state:paused}')
    expect(CSS).toMatch(/html\.arr-pre:has\(\[data-arrival\]\)\{animation:arr-reveal 1ms linear 1500ms both\}/)
    expect(CSS).not.toMatch(/arr-pre body\{opacity/)
  })
  it('Skip clears the persistent bottom edge: the MobileBar below 1180, the Studio Drawer above', () => {
    expect(CSS).toMatch(
      /\.arr-skip\{[^}]*bottom:calc\(16px \+ max\(var\(--doc-mobile-bar-height,72px\),env\(safe-area-inset-bottom\)\)\);z-index:41;/,
    )
    expect(CSS).toContain('@media (min-width:1180px){.arr-skip{bottom:calc(76px + env(safe-area-inset-bottom))}}')
  })
  it('B10: Acts 1-2 take no page hits; engine nodes stay live; the entry moves never replay after a played run', () => {
    expect(CSS).toContain('html.arr-on:not(.arr-asm) body')
    expect(CSS).toContain('html.arr-on [data-arr]{pointer-events:auto}')
    // a page node's own pointer-events:auto (MarginRail, toasts) cannot take the click after the advancing press
    expect(CSS).toMatch(
      /html\.arr-on:not\(\.arr-asm\) body \*:not\(\[data-arr\]\):not\(\[data-arr\] \*\),\s*html\.arr-press body \*:not\(\[data-arr\]\):not\(\[data-arr\] \*\)\{pointer-events:none!important\}/,
    )
    expect(CSS).toContain('[data-arr-played][data-arrival="document"]{animation:none}')
    expect(CSS).toContain('[data-arr-played] .desk-settle{animation:none}')
    expect(CSS).toContain('[data-arr-unclip]{overflow:visible!important}')
    const { A } = go(deskDom())
    toHold()
    expect(html.classList.contains('arr-on') && !html.classList.contains('arr-asm')).toBe(true)
    expect(A.style.pointerEvents).toBe('auto')
    expect(document.querySelector('.arr-card')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('B10 — the forced-inert rule', () => {
  it('reaches a page node that sets pointer-events:auto itself, never an engine node or its contents', () => {
    const root = documentDom()
    const rail = document.createElement('aside')
    rail.className = 'min-[1440px]:pointer-events-auto'
    root.appendChild(rail)
    const toast = document.createElement('div')
    toast.className = 'pointer-events-auto'
    document.body.appendChild(toast)
    go(root)
    const inert = new Set(document.querySelectorAll('html.arr-on:not(.arr-asm) body *:not([data-arr]):not([data-arr] *)'))
    expect(inert.has(rail)).toBe(true)
    expect(inert.has(toast)).toBe(true)
    expect(document.querySelectorAll('.arr-crown *').length).toBeGreaterThan(0)
    for (const n of [...ours(), ...Array.from(document.querySelectorAll('[data-arr] *'))]) expect(inert.has(n)).toBe(false)
  })
})

describe('B11 — reduced motion: the opacity-only card layer', () => {
  it('Skip present, every card line on the layer, nothing but opacity animates', () => {
    const { b, run } = go(deskDom(), { reduced: true })
    toHold()
    expect(document.querySelector('.arr-skip')).not.toBeNull()
    const layer = Array.from(document.querySelectorAll('.arr-card')).map((n) => n.textContent ?? '').join(' ')
    for (const p of b.parts) {
      if (['act', 'settle'].includes(p.part) || !p.text) continue
      expect(layer).toContain(p.text)
    }
    key('a')
    toRest()
    expect(run.phase).toBe('done')
    const moved = dom.animations.filter((a: FakeAnimation) =>
      a.keyframes.some((k) =>
        Object.entries(k).some(
          ([prop, v]) => !['opacity', 'visibility'].includes(prop) && !(prop === 'transform' && v === 'none'),
        ),
      ),
    )
    expect(moved.map((a) => a.props())).toEqual([])
  })
})

describe('D1 landing and the closing settle', () => {
  it('the clone crossfades into the real node in LANDING_FADE_MS; the settle tween starts after it', () => {
    const root = deskDom()
    const settleNode = root.querySelector('[data-part="settle"]') as HTMLElement
    html.style.setProperty('--text-faint', '#65594E')
    offs.push(() => html.style.removeProperty('--text-faint'))
    const { H } = go(root)
    toHold()
    key('a')
    toRest()
    const clone = dom.animations.filter((a) => a.effect.target.classList.contains('arr-h'))
    const fadeOut = clone.find((a) => a.duration === BUDGET.LANDING_FADE_MS) as FakeAnimation
    const fadeIn = dom.animations.find((a) => a.effect.target === H && a.duration === BUDGET.LANDING_FADE_MS) as FakeAnimation
    expect(fadeOut).toBeDefined()
    expect(fadeIn).toBeDefined()
    expect(fadeIn.born + fadeIn.delay).toBe(fadeOut.born + fadeOut.delay)
    const settle = dom.animations.find((a) => a.effect.target === settleNode && a.props().includes('color')) as FakeAnimation
    expect(settle).toBeDefined()
    expect(settle.born + settle.delay).toBeGreaterThanOrEqual(fadeIn.born + fadeIn.delay + fadeIn.duration)
  })
})

describe('B12 — at rest the live status is empty and no hint remains', () => {
  it('no status, no hint, no engine node, no "any key" text', () => {
    go(documentDom())
    toHold()
    key('a')
    toRest()
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(0)
    expect(document.getElementById('arr-hint')).toBeNull()
    expect(ours()).toHaveLength(0)
    expect(document.body.textContent).not.toMatch(/any key|Skip arrival/i)
  })
})

describe('B13 — the hold is still: after the cue fades in, only the hairline moves', () => {
  it.each([
    ['desk', deskDom],
    ['document', documentDom],
  ])('%s', (_s, make) => {
    const { run } = go(make())
    toHold()
    jest.advanceTimersByTime(S.cue + S.cueIn + 250)
    expect(run.phase).toBe('hold')
    const t = Date.now()
    const moving = dom.animations.filter((a) => a.movingAt(t))
    expect(moving.filter((a) => !a.effect.target.classList.contains('arr-line'))).toEqual([])
    expect(moving).toHaveLength(1)
  })
})
