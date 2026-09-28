/**
 * US-14 arrival — the jsdom harness the engine suites share. jsdom has no Element.animate (WAAPI), no layout and
 * no document.fonts, so this supplies a recording WAAPI fake, per-element rects, scrollTo and a font set.
 * Every file under __tests__ is a suite (jest testMatch), so its own self-test registers only when jest runs
 * this file directly.
 */
import type { Host, Surface } from '../types'

type Opts = { delay?: number; duration?: number; easing?: string; fill?: string }

/** A recording Animation: the wall-clock window it runs in (fake timers), its keyframes and its state. */
export class FakeAnimation {
  readonly effect: { target: Element }
  readonly keyframes: Keyframe[]
  readonly delay: number
  readonly duration: number
  readonly easing: string
  readonly born: number
  playState: 'running' | 'paused' | 'finished' | 'idle' = 'running'
  private pausedAt: number | null = null
  private held = 0

  constructor(target: Element, keyframes: Keyframe[], opts: Opts) {
    this.effect = { target }
    this.keyframes = keyframes
    this.delay = opts.delay ?? 0
    this.duration = opts.duration ?? 0
    this.easing = opts.easing ?? 'linear'
    this.born = Date.now()
  }
  get currentTime(): number | null {
    if (this.playState === 'idle') return null
    if (this.playState === 'finished') return this.delay + this.duration
    const t = this.pausedAt ?? Date.now()
    return t - this.born - this.held
  }
  cancel() {
    this.playState = 'idle'
  }
  finish() {
    this.playState = 'finished'
  }
  pause() {
    if (this.playState !== 'running') return
    this.pausedAt = Date.now()
    this.playState = 'paused'
  }
  play() {
    if (this.playState !== 'paused' || this.pausedAt === null) return
    this.held += Date.now() - this.pausedAt
    this.pausedAt = null
    this.playState = 'running'
  }
  /** Moving at wall time t: running, and t inside its delay..delay+duration window. */
  movingAt(t: number): boolean {
    if (this.playState !== 'running') return false
    const local = t - this.born - this.held
    return local >= this.delay && local < this.delay + this.duration
  }
  /** Every property its keyframes touch. */
  props(): string[] {
    return Array.from(
      new Set(this.keyframes.flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite'].includes(p)))),
    )
  }
}

export interface Box { left: number; top: number; width: number; height: number }

const DEFAULT: Box = { left: 0, top: 0, width: 100, height: 20 }
const rects = new WeakMap<Element, Box>()

/** Lays an element out at a viewport rect. */
export function place(el: Element, r: Box) {
  rects.set(el, r)
}

function shown(el: Element): boolean {
  if (!el.isConnected) return false
  const win = el.ownerDocument.defaultView as Window
  for (let a: Element | null = el; a; a = a.parentElement) {
    if (win.getComputedStyle(a).display === 'none') return false
  }
  return true
}

function rectOf(el: Element): DOMRect {
  const r = shown(el) ? (rects.get(el) ?? DEFAULT) : { left: 0, top: 0, width: 0, height: 0 }
  return {
    x: r.left, y: r.top, left: r.left, top: r.top, width: r.width, height: r.height,
    right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r,
  } as DOMRect
}

export interface Dom {
  animations: FakeAnimation[]
  /** set to make the next Element.animate throw (a failure inside a scheduled callback) */
  failAnimate: boolean
  restore(): void
}

/** Installs the fakes on this jsdom realm; restore() puts the originals back. */
export function installDom(): Dom {
  const proto = Element.prototype as unknown as Record<string, unknown>
  const saved = {
    animate: proto.animate,
    rect: proto.getBoundingClientRect,
    rects: proto.getClientRects,
    scrollTo: window.scrollTo,
  }
  const dom: Dom = {
    animations: [],
    failAnimate: false,
    restore() {
      proto.animate = saved.animate
      proto.getBoundingClientRect = saved.rect
      proto.getClientRects = saved.rects
      window.scrollTo = saved.scrollTo
      ;(window as unknown as { scrollY: number }).scrollY = 0
    },
  }
  proto.animate = function animate(this: Element, kf: Keyframe[], opts: Opts) {
    if (dom.failAnimate) throw new Error('animate failed')
    const a = new FakeAnimation(this, kf, opts)
    dom.animations.push(a)
    return a
  }
  proto.getBoundingClientRect = function getBoundingClientRect(this: Element) {
    return rectOf(this)
  }
  proto.getClientRects = function getClientRects(this: Element) {
    const r = rectOf(this)
    return (r.width > 0 || r.height > 0 ? [r] : []) as unknown as DOMRectList
  }
  window.scrollTo = ((x: number, y: number) => {
    ;(window as unknown as { scrollY: number }).scrollY = y
  }) as typeof window.scrollTo
  return dom
}

export const FACES = ["'Playfair Display'", "'Inter'", "'DM Mono'"]

export type TestHost = Host & { telemetry: jest.Mock; markArrival: jest.Mock }

export function makeHost(root: HTMLElement | null, over: Partial<Host> = {}): TestHost {
  return {
    root: () => root,
    ready: () => true,
    busy: () => false,
    faces: () => FACES,
    view: () => ({ top: 0, height: 768, width: 1024, bottom: 768 }),
    telemetry: jest.fn(),
    markArrival: jest.fn(),
    ...over,
  } as TestHost
}

/** The top Claim card's printed overdue claim (desk-roster-derivation.test.ts:272-273). */
export const OVERDUE_CLAIM = 'Overdue 23 days — Invoice 1042 overdue — oldest due Aug 2 — send a reminder'

/** The Desk as W1 marks it: date line = head, top card = job/headline/act, day lines = f1/f2, the settle line. */
export function deskDom(opts: { headline?: string | null; act?: string; rows?: string[] } = {}): HTMLElement {
  const headline = opts.headline === undefined ? OVERDUE_CLAIM : opts.headline
  const rows = (opts.rows ?? []).map((r) => `<li class="row"><p>${r}</p></li>`).join('')
  const card =
    headline === null
      ? ''
      : `<li class="desk-claim-card" data-claim-card>
          <a data-roster-name data-part="job" href="/doc/w1">Whitfield</a>
          <p data-register="sentence" data-part="headline">${headline}</p>
          <div data-register="act" class="desk-claim-band">
            <a class="da-act" data-part="act" href="/doc/w1">${opts.act ?? 'Send the reminder'}</a>
          </div>
        </li>`
  document.body.innerHTML = `
    <nav id="chrome"><button id="bar">Find</button></nav>
    <main data-arrival="desk">
      <header><p data-part="head" tabindex="-1">MONDAY · 28 SEPTEMBER</p></header>
      <ul id="roster">${rows}${card}
        <li id="line-2"><p data-part="f1"><a href="/doc/r2">Reyes</a><span data-day-line-overdue> — overdue 4 days</span></p></li>
        <li id="line-3"><p data-part="f2"><a href="/doc/o3">Okafor</a><span> — sign the quote</span></p></li>
      </ul>
      <p data-part="${headline === null ? 'headline settle' : 'settle'}">Nothing is overdue.</p>
    </main>`
  return document.querySelector('main') as HTMLElement
}

/** A Document as W1 marks it: crown, name, stage and vitals, the band sentence (long form) and its act. */
export function documentDom(opts: { sentence?: string | null; long?: string; act?: string | null; disabled?: boolean } = {}): HTMLElement {
  const sentence = opts.sentence === undefined ? 'Two selections are waiting on Leah' : opts.sentence
  const act = opts.act === undefined ? 'Review the selections' : opts.act
  const long = opts.long ? ` data-arr-long="${opts.long}"` : ''
  const band =
    sentence === null
      ? '<section class="band"><p>—</p></section>'
      : `<section class="band" style="position:sticky;top:0">
          <p><span data-part="headline" data-lens-sentence${long} style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sentence}</span>
          ${act === null ? '' : `<button class="da-act" data-part="act"${opts.disabled ? ' disabled' : ''}>${act}</button>`}</p>
          <p aria-live="polite" aria-atomic="true"><span data-lens-announce class="sr-only"></span></p>
        </section>`
  document.body.innerHTML = `
    <nav id="chrome"><button id="bar">Find</button></nav>
    <div data-document-shell data-arrival="document">
      <header id="document-project-status" data-part="head" tabindex="-1">
        <div data-part="crown"><span class="strata-mark doc-breath" role="img" aria-label="Shaping"><span></span><span></span><span></span></span></div>
        <h1 data-part="name">Whitfield Residence</h1>
        <div class="vitals" style="overflow:clip;white-space:nowrap;display:flex">
          <span data-part="stage">Shaping</span>
          <span data-part="f1" style="display:inline-flex"><span>Start</span><span>3 August</span></span>
          <span data-part="f2" style="display:inline-flex"><span>Install</span><span>14 November</span></span>
          <span data-part="f3">$48,200</span>
        </div>
      </header>
      ${band}
      <article><p>The first room.</p></article>
    </div>`
  return document.querySelector('[data-arrival]') as HTMLElement
}

export function surfaceOf(root: HTMLElement): Surface {
  return root.getAttribute('data-arrival') === 'desk' ? 'desk' : 'document'
}

/** Mutation records and promise callbacks settle. */
export async function flush() {
  for (let i = 0; i < 3; i++) await Promise.resolve()
}

if (expect.getState().testPath === __filename) {
  describe('arrival dom harness', () => {
    let dom: Dom
    beforeEach(() => {
      dom = installDom()
    })
    afterEach(() => dom.restore())

    it('records animations with their window, and lays elements out', () => {
      const el = deskDom()
      place(el, { left: 10, top: 20, width: 30, height: 40 })
      expect(el.getBoundingClientRect().right).toBe(40)
      expect(el.getClientRects()).toHaveLength(1)
      const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { delay: 5, duration: 10 }) as unknown as FakeAnimation
      expect(dom.animations).toEqual([a])
      expect(a.props()).toEqual(['opacity'])
      const hidden = document.createElement('p')
      hidden.hidden = true
      document.body.appendChild(hidden)
      expect(hidden.getClientRects()).toHaveLength(0)
    })
  })
}
