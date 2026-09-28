// US-14 arrival — the run: Act 1 composes the card, Act 2 holds it, Act 3 hands the sentence home and
// assembles the page from its own parts (arrival.js:457-866, option-A build). Every node, class,
// inline style and attribute it touches is restored by finish(), which also runs on every guard.
import { BUDGET, EVENT_ENDED } from './types'
import type { ArrivalEnded, Brief, DeclineCause, EndHow, Part } from './types'
import type { ArrivalEngine, CreateRun, Run, RunPhase } from './run-contract'
import { gate } from './gate'
import { brief as lift, period, verifyFrame0 } from './brief'
import { classify, pinned, today, unclip, walk } from './collect'
import {
  C, GUTTER, LEADING, S, box, cb, field, ladder, offscreen, plan, px, readingY, unit, viewOf,
} from './plan'
import type { Plan, RuleSpec, Unit } from './plan'

/** arrival.js:124 — a doorway verb takes landing focus on the act; anything else on `head`. */
export const DOORWAY = /^(review|open|read|see|plan|draft|continue|follow up|inspect|resolve)\b/i
const LONE = /^(Shift|Control|Alt|Meta|CapsLock|Fn|FnLock|Hyper|Super|OS|AltGraph)$/
const SCROLL = /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown|Home|End| |Spacebar)$/
const CTRL =
  'a[href],button,input,textarea,select,summary,label,[role="button"],[tabindex]:not([tabindex="-1"]),[data-open-record],[data-sheet-open]'
const GONE: Keyframe[] = [{ opacity: 1, visibility: 'visible' }, { opacity: 0, visibility: 'hidden' }]
const SHOW: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }]
const HIDE: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }]
/** A tap's click is its own input task after the pointerup, hit-tested where the finger is then. */
const TAP_CLICK_MS = 400

function safe(fn: () => void): void {
  try {
    fn()
  } catch {
    // one restoration failing never skips the rest
  }
}

const find = (b: Brief, k: Part) => b.parts.find((x) => x.part === k) ?? null

const NONE_STACKING = ['transform', 'translate', 'scale', 'rotate', 'filter', 'backdrop-filter', 'perspective', 'clip-path', 'mask-image']

function laidOut(el: Element, win: Window): boolean {
  const parent = el.parentElement
  return !!parent && /flex|grid/.test(win.getComputedStyle(parent).display)
}

function positioned(cs: CSSStyleDeclaration): boolean {
  return !!cs.position && cs.position !== 'static'
}

/** Whether el forms a stacking context (CSS 2.1 §9.9 + the properties that create one since). */
function stacks(el: HTMLElement, cs: CSSStyleDeclaration, win: Window): boolean {
  if (cs.position === 'fixed' || cs.position === 'sticky') return true
  if (cs.zIndex && cs.zIndex !== 'auto' && (positioned(cs) || laidOut(el, win))) return true
  if (parseFloat(cs.opacity) < 1 || cs.isolation === 'isolate') return true
  if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return true
  if (NONE_STACKING.some((p) => { const v = cs.getPropertyValue(p); return !!v && v !== 'none' })) return true
  if (/paint|layout|strict|content/.test(cs.getPropertyValue('contain'))) return true
  return /transform|translate|scale|rotate|opacity|filter|perspective|isolation|z-index/.test(cs.getPropertyValue('will-change'))
}

/** arrival.js:190-194 — the one polite message: the card in slot order, then the instruction. */
export function message(b: Brief): string {
  const place =
    b.surface === 'desk'
      ? (find(b, 'head')?.text ?? '')
      : [find(b, 'name')?.text, find(b, 'stage')?.text].filter(Boolean).join(' · ')
  const facts = (['f1', 'f2', 'f3'] as const).map((k) => find(b, k)?.text ?? '').filter(Boolean)
  const s = [place ? period(place.replace(/ · /g, ', ')) : '', period(b.headline.text), ...facts.map(period)]
  s.push(b.act ? `Tab to ${b.act.text}, or press any key to open the page.` : 'Press any key to open the page.')
  return s.filter(Boolean).join(' ')
}

/** ArrivalEngine.brief: the lift (brief.ts) with its carriers classified and fully clipped parts left off (collect.ts). */
export const brief: ArrivalEngine['brief'] = (root, surface) => {
  const b = lift(root, surface, today())
  return b ? classify(b, root).brief : null
}

type Advance = 'timer' | 'input' | 'escape'

export const createRun: CreateRun = (b, host, opts): Run => {
  const H = b.headline.node
  const A = b.act?.node ?? null
  const doc = H.ownerDocument
  const win = doc.defaultView as Window
  const html = doc.documentElement
  const now = opts.now
  const rm = opts.reduced
  const part = (k: Part) => find(b, k)

  let phase: RunPhase = 'compose'
  let started = false
  let done = false
  let resolve: (e: ArrivalEnded) => void = () => undefined
  const ended = new Promise<ArrivalEnded>((r) => {
    resolve = r
  })

  const saved: Array<[ElementCSSInlineStyle, string, string, string]> = []
  const attrs: Array<[Element, string, string | null]> = []
  const nodes: Element[] = []
  const still = new Set<HTMLElement>()
  const anims: Animation[] = []
  const phaseTimers = new Set<number>()
  const offs: Array<() => void> = []
  let holdT = 0
  let raf = 0

  let how: EndHow | null = null
  let kbd = opts.via === 'kbd'
  let inputAt = -Infinity
  let quiet = false
  let press: { id: number; r: DOMRect; act: HTMLElement; y: number } | null = null
  let dbl: { t: number; x: number; y: number } | null = null
  let tapHold: (() => void) | null = null
  let baseY = 0
  let actAt = Infinity
  let left = 0
  let at = 0
  let paused = false
  const pz = { focus: false, hidden: false }
  let frz: Animation | null = null
  let lineAnim: Animation | null = null
  let cue: Animation[] = []
  const comp: Animation[] = []
  const cc: { head?: Animation; act?: Animation } = {}
  const headCarry: Animation[] = []
  const actCarry: Animation[] = []
  const ua: Array<{ a: Animation; el: HTMLElement; at: number }> = []
  let g0 = 0
  let lastFrame = 0
  let gaps: number[] = []
  let thinned = false

  let skip: HTMLButtonElement | null = null
  let status: HTMLElement | null = null
  let hc: HTMLElement | null = null
  const L: Record<string, HTMLElement> = {}
  let p: Plan | null = null
  let units: Unit[] = []
  const ruleEl = new Map<RuleSpec, HTMLElement>()
  let canon: HTMLElement[] = []
  let settle: Array<{ el: HTMLElement; col: string }> = []
  let faint = ''
  let lineCol = ''

  // ---------- bookkeeping ----------
  function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    const e = doc.createElement(tag)
    e.className = cls
    e.setAttribute('data-arr', '')
    if (text !== undefined) e.textContent = text
    return e
  }
  function mount<E extends Element>(e: E): E {
    doc.body.appendChild(e)
    nodes.push(e)
    return e
  }
  function put(el: ElementCSSInlineStyle, prop: string, val: string, prio = '') {
    saved.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)])
    el.style.setProperty(prop, val, prio)
  }
  /** A frame-0 hide is instant: the node's own transition (the band sentence's 150ms opacity) must not play it out. */
  function hide(el: HTMLElement, prop = 'opacity', val = '0') {
    if (!still.has(el)) {
      still.add(el)
      put(el, 'transition', 'none')
    }
    put(el, prop, val)
  }
  /** Back to the page's own value now; finish() restores it again (idempotent). */
  function reset(el: ElementCSSInlineStyle, prop: string) {
    const first = saved.find((s) => s[0] === el && s[1] === prop)
    if (!first) return
    if (first[2] === '') el.style.removeProperty(prop)
    else el.style.setProperty(prop, first[2], first[3])
  }
  /** z-index orders the act only inside its nearest stacking context (a claim card's .has-wash isolates), so every
   *  stacking context between it and the route root rises with it, or a later sibling card paints over the act. */
  function raise(el: HTMLElement, root: HTMLElement) {
    for (let a = el.parentElement; a && a !== root && root.contains(a); a = a.parentElement) {
      const cs = win.getComputedStyle(a)
      if (!stacks(a, cs, win)) continue
      if (!positioned(cs) && !laidOut(a, win)) put(a, 'position', 'relative')
      put(a, 'z-index', '39')
    }
  }
  function setAttr(el: Element, name: string, val: string) {
    attrs.push([el, name, el.getAttribute(name)])
    el.setAttribute(name, val)
  }
  function listen(el: EventTarget, type: string, fn: (e: Event) => void) {
    const h = (e: Event) => guarded(() => fn(e))
    el.addEventListener(type, h)
    offs.push(() => el.removeEventListener(type, h))
  }
  function guarded(fn: () => void) {
    if (done) return
    try {
      fn()
    } catch {
      end('error', undefined, false)
    }
  }
  function run(el: Element, kf: Keyframe[], t: number, dur: number, easing: string): Animation {
    const a = el.animate(kf, { delay: t, duration: dur, easing, fill: 'both' })
    anims.push(a)
    return a
  }
  function later(fn: () => void, t: number) {
    const id = win.setTimeout(() => {
      phaseTimers.delete(id)
      guarded(fn)
    }, t)
    phaseTimers.add(id)
  }
  function clearPhase() {
    phaseTimers.forEach((id) => win.clearTimeout(id))
    phaseTimers.clear()
  }
  const tfx = (x: number, s: number) => `translate(${px(x)},0px) scale(${s})`
  const early = () => started && !done && (phase === 'compose' || phase === 'hold')
  const running = () => started && !done
  const inCard = (el: Element | null) => !!el && (el === skip || (!!A && (el === A || A.contains(el))))

  // ---------- the end: one idempotent restore ----------
  function liveHead(): HTMLElement | null {
    const root = host.root()
    if (!root) return null
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-part~="head"]'))) {
      if (el.getClientRects().length > 0) return el
    }
    return null
  }
  function landing(): HTMLElement | null {
    const act = A && A.isConnected ? A : null
    if (act && DOORWAY.test(b.act?.text ?? '')) return act
    return liveHead() ?? act
  }
  function calm(el: HTMLElement) {
    quiet = true
    try {
      el.focus({ preventScroll: true })
    } finally {
      quiet = false
    }
  }
  function end(h: EndHow, cause: DeclineCause | undefined, normal: boolean) {
    if (done) return
    done = true
    phase = 'done'
    const detail: ArrivalEnded = cause ? { surface: b.surface, how: h, cause } : { surface: b.surface, how: h }
    let to: HTMLElement | null = null
    try {
      const active = doc.activeElement
      const held = !!skip && active === skip
      safe(() => {
        win.clearTimeout(holdT)
        clearPhase()
        if (raf) win.cancelAnimationFrame(raf)
        raf = 0
      })
      for (const off of offs.splice(0)) safe(off)
      for (const a of anims.splice(0)) safe(() => a.cancel())
      const back = ([el, prop, prev, prio]: (typeof saved)[number]) =>
        safe(() => (prev === '' ? el.style.removeProperty(prop) : el.style.setProperty(prop, prev, prio)))
      const transitions: typeof saved = []
      for (let i = saved.length - 1; i >= 0; i--) {
        if (saved[i][1] === 'transition') transitions.push(saved[i])
        else back(saved[i])
      }
      saved.length = 0
      // a transition restored in the same style change would animate the restore: snap home first, flush, then
      // hand the page its own transitions back
      if (transitions.length) {
        safe(() => void html.offsetWidth)
        transitions.forEach(back)
      }
      for (let i = attrs.length - 1; i >= 0; i--) {
        const [el, name, prev] = attrs[i]
        safe(() => (prev === null ? el.removeAttribute(name) : el.setAttribute(name, prev)))
      }
      attrs.length = 0
      for (const n of nodes.splice(0)) safe(() => n.remove())
      const free = !active || active === doc.body || held
      if (held || (normal && kbd && free)) to = landing()
    } finally {
      releaseTap()
      html.classList.remove('arr-on', 'arr-asm', 'arr-pre', 'arr-press')
      const target = to
      if (target) safe(() => calm(target))
      resolve(detail)
      safe(() => win.dispatchEvent(new CustomEvent(EVENT_ENDED, { detail })))
    }
  }

  // ---------- guards ----------
  function watch(root: HTMLElement) {
    const mo = new MutationObserver(() => guarded(() => end('mutation', undefined, false)))
    mo.observe(root, { childList: true, characterData: true, subtree: true })
    const ours = (n: Node) => n.nodeType === 1 && (n as Element).hasAttribute('data-arr')
    const mb = new MutationObserver((recs) =>
      guarded(() => {
        const foreign = recs.some((r) =>
          [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].some((n) => !ours(n)),
        )
        if (foreign) end('mutation', undefined, false)
      }),
    )
    mb.observe(doc.body, { childList: true })
    offs.push(() => {
      mo.disconnect()
      mb.disconnect()
    })
    // a width change re-lays the page: rest. A height-only change (the phone's toolbar) is nothing.
    const RO = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    if (typeof RO === 'function') {
      const w0 = html.clientWidth
      const ro = new RO(() =>
        guarded(() => {
          if (Math.abs(html.clientWidth - w0) > 1) end('mutation', undefined, false)
        }),
      )
      ro.observe(html)
      offs.push(() => ro.disconnect())
    }
  }

  // ---------- start: measure, build, place, compose (all before frame 0) ----------
  function crest(node: HTMLElement): HTMLElement | null {
    const src = node.querySelector('.strata-mark') ?? node.firstElementChild
    if (!src) return null
    const c = src.cloneNode(true) as HTMLElement
    for (const el of [c, ...Array.from(c.querySelectorAll('*'))]) {
      for (const a of ['data-part', 'role', 'aria-label', 'id']) el.removeAttribute(a)
      el.classList.remove('doc-breath')
    }
    const wrap = make('span', 'arr-crown')
    wrap.appendChild(c)
    return wrap
  }

  function begin() {
    inputAt = -Infinity
    const root = host.root()
    if (!root || !root.contains(H)) return end('declined', 'no-root', false)
    if (!verifyFrame0(b)) return end('declined', 'drift', false)

    const onError = () => end('error', undefined, false)
    win.addEventListener('error', onError)
    win.addEventListener('unhandledrejection', onError)
    offs.push(() => {
      win.removeEventListener('error', onError)
      win.removeEventListener('unhandledrejection', onError)
    })
    const dog = win.setTimeout(
      () => end('watchdog', undefined, false),
      S.CE + BUDGET.HOLD_MS + BUDGET.WATCHDOG_MARGIN_MS,
    )
    offs.push(() => win.clearTimeout(dog))

    // the paused entry move would skew every rect: kill it, then measure
    root.setAttribute('data-arr-played', '')
    html.classList.add('arr-on')
    html.classList.remove('arr-pre')
    watch(root)
    for (const live of Array.from(root.querySelectorAll('[data-lens-announce]'))) {
      const region = live.closest('[aria-live]')
      if (region) setAttr(region, 'aria-live', 'off')
    }

    const v = viewOf(host.view(), win.innerHeight)
    const job = part('job')?.node ?? null
    const y0 = win.scrollY
    const max = Math.max(0, html.scrollHeight - win.innerHeight)
    const y = readingY(b.surface, v, box(H), A ? box(A) : null, job ? box(job) : null, y0, max)
    if (Math.abs(y0 - y) > 0.5) win.scrollTo(0, y)
    baseY = win.scrollY

    const hint = mount(make('p', 'arr-vh', 'Skip goes straight to the page; any key opens it.'))
    hint.id = 'arr-hint'
    hint.setAttribute('aria-hidden', 'true')
    const sk = mount(make('button', 'arr-skip', 'Skip arrival'))
    sk.type = 'button'
    sk.setAttribute('aria-describedby', 'arr-hint')
    skip = sk
    listen(sk, 'click', () => end('skip', undefined, true))
    listen(sk, 'focusout', refocus)
    status = mount(make('div', 'arr-vh'))
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')

    const layer = mount(make('div', 'arr-card'))
    layer.setAttribute('aria-hidden', 'true')
    const line = (k: string, cls: string, text: string) => {
      const e = make('p', cls, text)
      layer.appendChild(e)
      L[k] = e
    }
    if (b.surface === 'desk') {
      const head = part('head')
      if (head) line('slug', 'arr-slug', head.text)
      const jobPart = part('job')
      if (jobPart) line('job', 'arr-job', jobPart.text)
    } else {
      const crown = part('crown')
      const c = crown ? crest(crown.node) : null
      if (c) {
        layer.appendChild(c)
        L.crown = c
      }
      const place = [part('name')?.text, part('stage')?.text].filter(Boolean).join(' · ')
      if (place) line('place', 'arr-place', place)
    }
    for (const k of ['f1', 'f2', 'f3'] as const) {
      const f = part(k)
      if (f) line(k, b.surface === 'document' && k === 'f1' ? 'arr-f1' : 'arr-f', f.text)
    }
    const coarse = typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches
    line('cue', 'arr-cue', coarse ? 'Tap or scroll to open the page' : 'Click, scroll or press any key to open the page')
    const hair = make('span', 'arr-line')
    layer.appendChild(hair)
    L.line = hair

    // D1: the headline as the display clone, on the ladder, in the heading face
    const family = host.faces()[0] || "'Playfair Display'"
    const maxW = Math.min(640, v.W - 2 * GUTTER)
    const rung = ladder(b.headline.text, family, maxW, offscreen(doc))
    const pin = pinned(H)
    const holder = pin ? mount(make('div', 'arr-card arr-card-fix')) : layer
    if (pin) holder.setAttribute('aria-hidden', 'true')
    const clone = make('p', 'arr-h', b.headline.text)
    clone.style.cssText = `font-family:${family};font-size:${rung.size}px;line-height:${LEADING};max-width:${px(maxW)}`
    holder.appendChild(clone)
    hc = clone

    const pl = plan({
      surface: b.surface, v, H, text: b.headline.text, clone, size: rung.size, A, L, skip: sk,
      f1: b.surface === 'document' ? (part('f1')?.node ?? null) : null,
    })
    p = pl
    for (const [k, m] of Object.entries(pl.m)) {
      L[k].style.left = px(m.left)
      L[k].style.top = px(m.top + baseY)
      L[k].style.opacity = '0'
    }
    clone.style.left = px(pl.head.left)
    clone.style.top = px(pl.head.top + (pin ? 0 : baseY))
    clone.style.transformOrigin = `${px(pl.head.ox)} ${px(pl.head.oy)}`
    lineCol = win.getComputedStyle(hair).backgroundColor

    // the page's parts in the first view: covered now, assembled in Act 3
    const keeps = (b.surface === 'desk' ? ['job'] : ['name', 'stage', 'f1']) as Part[]
    canon = keeps
      .map((k) => part(k)?.node)
      .filter((el): el is HTMLElement => !!el && el !== H && el !== A)
    const keep: HTMLElement[] = [H, ...(A ? [A] : []), ...canon]
    const seenBy = { vw: v.vw, vh: v.vh }
    const w = walk(root, keep, seenBy)
    const us = w.units.map((el) => unit(el, pl.G, rm, pinned, win.scrollX, baseY))
    for (const el of w.through) {
      const u = unit(el, pl.G, rm, pinned, win.scrollX, baseY)
      if (!u.rules.length) continue
      u.kind = 'rules'
      u.kids = []
      u.off = 0
      u.dur = rm ? S.rmPart : S.stem
      us.push(u)
    }
    units = field(us, rm ? [] : pl.carriers, v.phone, rm)
    const rl = mount(make('div', 'arr-rules'))
    const rf = mount(make('div', 'arr-rules-fix'))
    for (const u of units) {
      for (const r of u.rules) {
        hide(u.el, r.prop, 'transparent')
        const e = make('span', 'arr-rule')
        e.style.cssText = r.css
        if (rm) {
          e.style.transform = 'none'
          e.style.opacity = '0'
        }
        ;(r.fix ? rf : rl).appendChild(e)
        ruleEl.set(r, e)
      }
      if (u.kind === 'rules') continue
      if (u.kids.length) u.kids.forEach((k) => hide(k.el))
      else hide(u.el)
    }
    settle = b.parts
      .filter((x) => x.part === 'settle')
      .map((x) => ({ el: x.node, col: win.getComputedStyle(x.node).color }))
    faint = win.getComputedStyle(html).getPropertyValue('--text-faint').trim()
    canon.forEach((el) => hide(el))
    hide(H) // the real carrier holds still while its clone flies

    if (A) {
      // the one live target while the rest takes no hits: important, to beat arrival.css's forced-inert rule
      put(A, 'pointer-events', 'auto', 'important')
      put(A, 'position', 'relative')
      put(A, 'z-index', '39')
      raise(A, root)
      if (A.tagName === 'A') setAttr(A, 'draggable', 'false')
      for (const a of unclip(A, root)) setAttr(a, 'data-arr-unclip', '')
      listen(A, 'focusout', refocus)
      if (pl.act) {
        // .da-act transitions transform (globals.css): the staged offset must never glide, in or home
        put(A, 'transition', 'none')
        put(A, 'translate', `0px ${px(pl.act.y)}`)
        put(A, 'transform', tfx(pl.act.x, 1))
      }
    }

    compose(now())
    guardStart()
  }

  // ---------- Act 1: the card composes line by line ----------
  function grow(el: HTMLElement, t: number, dur: number, phone: boolean) {
    el.style.transformOrigin = phone ? '0 50%' : '50% 50%'
    return run(el, [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'scale(1)' }], t, dur, cb(C.X))
  }
  function compose(t0: number) {
    const pl = p as Plan
    const clone = hc as HTMLElement
    let endAt: number
    if (rm) {
      const seq = [L.crown, L.place, L.slug, L.job, clone, L.f1, L.f2, L.f3, A].filter(
        (el): el is HTMLElement => !!el,
      )
      seq.forEach((el, i) => {
        if (el === A) actAt = t0 + i * S.rmStag
        comp.push(run(el, SHOW, i * S.rmStag, S.rmLine, cb(C.Q)))
      })
      endAt = (seq.length - 1) * S.rmStag + S.rmLine
    } else {
      const ph = pl.v.phone
      for (const k of ['crown', 'place', 'slug', 'job'] as const) {
        if (L[k]) comp.push(grow(L[k], S[k][0], S[k][1], ph))
      }
      const blur = ph ? 'none' : 'blur(6px)'
      cc.head = run(
        clone,
        [
          { opacity: 0, transform: 'scale(0.94)', filter: blur },
          { opacity: 1, transform: 'scale(1)', filter: ph ? 'none' : 'blur(0px)' },
        ],
        S.H[0], S.H[1], cb(C.X),
      )
      comp.push(cc.head)
      ;(['f1', 'f2', 'f3'] as const).forEach((k, i) => {
        if (L[k]) comp.push(grow(L[k], S.F[i], S.fD, ph))
      })
      if (A && pl.act) {
        actAt = t0 + S.act[0] // hit-testable once it shows
        cc.act = run(
          A,
          [{ opacity: 0, transform: tfx(pl.act.x, 0.94) }, { opacity: 1, transform: tfx(pl.act.x, 1) }],
          S.act[0], S.act[1], cb(C.X),
        )
        comp.push(cc.act)
      }
      endAt = S.CE
    }
    later(hold, endAt)
  }

  // ---------- Act 2: still, waiting for her ----------
  function hold() {
    if (phase !== 'compose') return
    phase = 'hold'
    stopGuard()
    if (status) status.textContent = message(b)
    cue = [run(L.cue, SHOW, S.cue, rm ? S.rmCueIn : S.cueIn, cb(rm ? C.Q : C.X))]
    if (!rm) {
      lineAnim = run(L.line, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], S.cue, BUDGET.HOLD_MS - S.cue, 'linear')
      cue.push(lineAnim)
    }
    left = BUDGET.HOLD_MS
    at = now()
    paused = false
    pz.hidden = doc.visibilityState !== 'visible'
    pz.focus = inCard(doc.activeElement)
    if (pz.hidden || pz.focus) {
      paused = true
      cue.forEach((a) => a.pause())
      freeze(true)
    } else holdT = win.setTimeout(() => guarded(() => advance('timer')), left)
  }
  /** Focus in the card or a hidden page pauses the hold; both clear resumes it (R9c, R9d). */
  function sync() {
    if (phase !== 'hold') return
    const want = pz.focus || pz.hidden
    if (want && !paused) {
      win.clearTimeout(holdT)
      left = Math.max(0, left - (now() - at))
      paused = true
      cue.forEach((a) => a.playState === 'running' && a.pause())
      freeze(true)
    } else if (!want && paused) {
      paused = false
      at = now()
      holdT = win.setTimeout(() => guarded(() => advance('timer')), left)
      cue.forEach((a) => a.playState === 'paused' && a.play())
      freeze(false)
    }
  }
  /** The hairline cools to text-faint while she is on the card. */
  function freeze(on: boolean) {
    if (rm || !L.line) return
    if (frz) {
      frz.cancel()
      frz = null
    }
    if (on && faint) frz = run(L.line, [{ backgroundColor: lineCol }, { backgroundColor: faint }], 0, S.freeze, cb(C.Q))
  }
  function refocus() {
    const id = win.setTimeout(() => {
      phaseTimers.delete(id)
      guarded(() => {
        pz.focus = inCard(doc.activeElement)
        sync()
      })
    }, 0)
    phaseTimers.add(id)
  }

  // ---------- Act 3: the hand-off and the assembly. Input never cancels it. ----------
  /** One advance, exactly once (R9a): from Act 1 it completes the card, from Act 2 it opens the page. */
  function advance(src: Advance) {
    if (phase !== 'compose' && phase !== 'hold') return
    if (!how) how = src === 'timer' ? 'settled' : src
    if (phase === 'compose') for (const a of comp) safe(() => a.finish())
    assemble()
  }
  function assemble() {
    const pl = p as Plan
    const clone = hc as HTMLElement
    win.clearTimeout(holdT)
    clearPhase()
    stopGuard()
    phase = 'assemble'
    html.classList.add('arr-asm')
    if (skip && doc.activeElement === skip) calm(A ?? liveHead() ?? doc.body)
    if (skip) run(skip, GONE, 0, S.skipOut, cb(C.Q))
    if (frz) {
      frz.cancel()
      frz = null
    }
    const Q = cb(C.Q)
    const landAt = rm ? S.rmLine : S.hand + pl.d
    let endAt = 0
    if (!rm) {
      // the carriers leave from where the card holds them: x (and scale) on IO, y on YL
      cc.head?.cancel()
      cc.act?.cancel()
      headCarry.push(
        run(clone, [{ transform: 'translate(0px,0px) scale(1)' }, { transform: `translate(${px(pl.head.dx)},0px) scale(${pl.head.q})` }], S.hand, pl.d, cb(C.IO)),
        run(clone, [{ translate: '0px 0px' }, { translate: `0px ${px(pl.head.dy)}` }], S.hand, pl.d, cb(C.YL)),
      )
      later(landHead, landAt)
      endAt = landAt + BUDGET.LANDING_FADE_MS
      if (A && pl.act) {
        const t = S.hand + S.lag
        actCarry.push(
          run(A, [{ transform: tfx(pl.act.x, 1) }, { transform: tfx(0, 1) }], t, pl.d, cb(C.IO)),
          run(A, [{ translate: `0px ${px(pl.act.y)}` }, { translate: '0px 0px' }], t, pl.d, cb(C.YL)),
        )
        later(landAct, t + pl.d)
        endAt = Math.max(endAt, t + pl.d)
      }
      // the double rides home translate-only; the canonical line prints 120ms before landing
      for (const q of pl.rides) {
        const el = L[q.k]
        const T = S.hand + q.d
        run(el, [{ transform: 'translate(0px,0px)' }, { transform: `translate(${px(q.dx)},0px)` }], S.hand, q.d, cb(C.IO))
        run(el, [{ translate: '0px 0px' }, { translate: `0px ${px(q.dy)}` }], S.hand, q.d, cb(C.YL))
        run(q.canon, SHOW, T - S.lead, 1, 'linear')
        run(el, HIDE, T - S.lead, S.dissolve, Q)
        endAt = Math.max(endAt, T)
      }
      // the context exits backward, last line first, 40ms apart
      const rides = pl.rides.map((q) => q.k)
      ;['f3', 'f2', 'f1', 'job', 'slug', 'place', 'crown']
        .filter((k) => L[k] && !rides.includes(k))
        .forEach((k, i) => {
          run(L[k], [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }], i * S.exitStep, S.exit, cb(C.EXIT))
          endAt = Math.max(endAt, i * S.exitStep + S.exit)
        })
      let pr = 0
      if (lineAnim) {
        const ct = typeof lineAnim.currentTime === 'number' ? lineAnim.currentTime : 0
        pr = Math.max(0, Math.min(1, (ct - S.cue) / (BUDGET.HOLD_MS - S.cue)))
        lineAnim.cancel()
      }
      run(L.line, [{ transform: `scaleX(${Math.round(pr * 100) / 100})`, opacity: 1 }, { transform: 'scaleX(1)', opacity: 1 }], 0, S.lineDone, Q)
      run(L.line, HIDE, S.lineDone, S.lineFade, Q)
      for (const el of canon) {
        if (el === part('job')?.node) run(el, SHOW, S.hand + pl.d - S.lead, S.dissolve, Q)
        else if (!pl.rides.some((q) => q.canon === el)) run(el, SHOW, 0, 1, 'linear')
      }
    } else {
      // reduced motion: the same card hands off by opacity alone
      for (const k of ['crown', 'place', 'slug', 'job', 'f1', 'f2', 'f3']) if (L[k]) run(L[k], HIDE, 0, S.rmLine, Q)
      run(clone, HIDE, 0, S.rmLine, Q)
      if (A) run(A, HIDE, 0, S.rmLine, Q)
      canon.forEach((el) => run(el, SHOW, S.rmLine, S.rmLine, Q))
      later(landHead, landAt)
      if (A) later(landAct, landAt)
      endAt = 2 * S.rmLine
    }
    run(L.cue, HIDE, 0, S.cueOut, Q)

    // the page assembles from its own parts: nearest the landed sentence first
    const t3 = now()
    let fe = 0
    const part3 = (el: HTMLElement, kf: Keyframe[], t: number, dur: number, e: string) => {
      const a = run(el, kf, t, dur, e)
      ua.push({ a, el, at: t3 + t })
      fe = Math.max(fe, t + dur)
    }
    const FADE: Keyframe[] = [{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }]
    const RISE: Keyframe[] = [
      { opacity: 0, transform: 'translate(0px,6px) scale(0.96)' },
      { opacity: 1, transform: 'translate(0px,0px) scale(1)' },
    ]
    const X = cb(C.X)
    for (const u of units) {
      for (const r of u.rules) {
        const e = ruleEl.get(r) as HTMLElement
        if (rm) part3(e, FADE, u.t, S.rmPart, Q)
        else if (r.side === 'Left') part3(e, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], u.t, S.stem, cb(C.DRAW))
        else part3(e, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], u.t, S.draw, cb(C.DRAW))
      }
      if (u.kind === 'rules') continue
      if (rm) {
        if (u.kids.length) u.kids.forEach((k) => part3(k.el, SHOW, k.t, S.rmPart, Q))
        else part3(u.el, SHOW, u.t, S.rmPart, Q)
      } else if (u.kind === 'stem') {
        u.kids.forEach((k) =>
          part3(k.el, [{ opacity: 0, transform: 'translate(-6px,0px)' }, { opacity: 1, transform: 'translate(0px,0px)' }], k.t, S.rise, X),
        )
      } else if (u.kind === 'list') {
        u.kids.forEach((k) => {
          if (k.origin) put(k.el, 'transform-origin', k.origin)
          part3(k.el, RISE, k.t, S.rise, X)
        })
      } else if (u.inline) part3(u.el, SHOW, u.t + u.off, S.rise, X)
      else {
        put(u.el, 'transform-origin', u.origin)
        part3(u.el, RISE, u.t + u.off, S.rise, X)
      }
    }
    // the closing settle: the state word warms from faint to its own colour, after the landing crossfade
    const sStart = Math.max(fe, landAt + (rm ? S.rmLine : BUDGET.LANDING_FADE_MS))
    let sEnd = fe
    if (faint) {
      for (const x of settle) {
        run(x.el, [{ color: faint }, { color: x.col }], sStart, S.settle, Q)
        sEnd = sStart + S.settle
      }
    }
    endAt = Math.max(endAt, sEnd, S.cueOut, S.skipOut)
    later(() => end(how ?? 'settled', undefined, true), endAt)
    guardStart()
  }
  /** The clone lands on the page's own sentence and crossfades into it (D1, ≤ LANDING_FADE_MS). */
  function landHead() {
    const clone = hc as HTMLElement
    if (rm) {
      run(H, SHOW, 0, S.rmLine, cb(C.Q))
      return
    }
    run(clone, HIDE, 0, BUDGET.LANDING_FADE_MS, 'linear')
    run(H, SHOW, 0, BUDGET.LANDING_FADE_MS, 'linear')
  }
  function landAct() {
    if (!A) return
    reset(A, 'transform')
    reset(A, 'translate')
    actCarry.forEach((a) => a.cancel())
    if (rm) run(A, SHOW, 0, S.rmLine, cb(C.Q))
  }

  // ---------- the frame watch (R-DM26 A): Act 1 trips to the hold; Act 3 thins, then rests ----------
  function guardStart() {
    g0 = now()
    lastFrame = 0
    gaps = []
    if (raf) win.cancelAnimationFrame(raf)
    raf = win.requestAnimationFrame(tick)
  }
  function stopGuard() {
    if (raf) win.cancelAnimationFrame(raf)
    raf = 0
  }
  function tick() {
    raf = 0
    guarded(() => {
      if (phase === 'hold') return
      const t = now()
      const g = t - (lastFrame || g0)
      const n = gaps.push(g)
      if ((n <= 3 && g > 50) || g > 100 || (n > 1 && g > 34 && gaps[n - 2] > 34)) {
        trip()
        return
      }
      lastFrame = t
      raf = win.requestAnimationFrame(tick)
    })
  }
  function trip() {
    if (phase === 'compose') {
      for (const a of comp) safe(() => a.finish())
      hold()
      return
    }
    if (!thinned) {
      thinned = true
      const t = now()
      for (const x of ua) {
        if (x.at <= t) continue
        x.a.cancel()
        anims.push(
          x.el.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], {
            delay: x.at - t, duration: S.thin, easing: 'linear', fill: 'both',
          }),
        )
      }
      guardStart()
      return
    }
    end(how ?? 'settled', undefined, true)
  }

  // ---------- input (O1): Acts 1-2 advance and swallow; Skip alone rests; Act 3 never cancels ----------
  function swallow(e: Event) {
    e.stopImmediatePropagation()
    if (e.cancelable) e.preventDefault()
    html.classList.add('arr-press') // the release and its click land on <html>, never on a page control
  }
  function releaseTap() {
    const off = tapHold
    tapHold = null
    off?.()
  }
  /** A swallowed tap stays inert until its click has landed, the next press, or TAP_CLICK_MS. */
  function holdTap() {
    releaseTap()
    if (!html.classList.contains('arr-press')) return
    const onClick = () => releaseTap()
    const t = win.setTimeout(releaseTap, TAP_CLICK_MS)
    win.addEventListener('click', onClick, true)
    tapHold = () => {
      win.clearTimeout(t)
      win.removeEventListener('click', onClick, true)
      html.classList.remove('arr-press')
    }
  }
  function focusables(): HTMLElement[] {
    const act = A && now() >= actAt ? A : null
    return [act, skip].filter((el): el is HTMLElement => !!el)
  }
  function activate(el: HTMLElement) {
    end('input', undefined, false)
    el.click() // the act she chose, exactly once, at rest
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!running()) return
    inputAt = now()
    guarded(() => {
      const a = doc.activeElement
      if (early()) {
        if (e.key === 'Tab') {
          e.preventDefault()
          e.stopImmediatePropagation()
          const f = focusables()
          const i = f.indexOf(a as HTMLElement)
          const next = f[(i < 0 ? (e.shiftKey ? f.length - 1 : 0) : i + (e.shiftKey ? f.length - 1 : 1)) % f.length]
          if (next) calm(next)
          pz.focus = true
          sync()
          return
        }
        if (LONE.test(e.key)) return
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          if (A && a === A) {
            e.preventDefault()
            e.stopImmediatePropagation()
            activate(A)
            return
          }
          if (skip && a === skip) {
            e.preventDefault()
            e.stopImmediatePropagation()
            end('skip', undefined, true)
            return
          }
        }
        // a bare-key shortcut (t, ?, g…) only advances; a browser chord keeps its own default
        e.stopImmediatePropagation()
        const bare = !e.metaKey && !e.ctrlKey && !e.altKey
        if (SCROLL.test(e.key) || e.key === 'Enter' || e.key === 'Escape' || bare) e.preventDefault()
        kbd = true
        advance(e.key === 'Escape' ? 'escape' : 'input')
        return
      }
      if (e.key === 'Tab') {
        // Act 3: Tab rests at once, focus on the act (or the landing), never on the first control
        e.preventDefault()
        e.stopImmediatePropagation()
        const to = A ?? landing()
        kbd = false
        end(how ?? 'input', undefined, true)
        if (to) calm(to)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    })
  }

  function onPointerDown(e: PointerEvent) {
    releaseTap()
    if (!running()) return
    inputAt = now()
    guarded(() => {
      const t = e.target as Element | null
      if (t && skip && (t === skip || skip.contains(t))) return
      const x = e.clientX
      const y = e.clientY
      const n = now()
      if (!early() && dbl && n - dbl.t < 500 && Math.abs(x - dbl.x) <= 8 && Math.abs(y - dbl.y) <= 8) {
        swallow(e) // the second click of a double: nothing extra
        return
      }
      let act: HTMLElement | null = A && t && A.contains(t) ? A : null
      if (!act && !early() && A) {
        const r = A.getBoundingClientRect() // in flight: where she sees it
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) act = A
      }
      if (act && !(e.button > 0) && (!early() || n >= actAt)) {
        press = { id: e.pointerId, r: act.getBoundingClientRect(), act, y: win.scrollY }
        swallow(e)
        return
      }
      if (early()) {
        kbd = false
        swallow(e)
        dbl = { t: n, x, y }
        advance('input')
        return
      }
      // Act 3: a control snaps to rest, then acts natively, once
      if (t && t.closest && t.closest(CTRL)) end(how ?? 'input', undefined, false)
    })
  }

  function onPointerUp(e: PointerEvent) {
    const pr = press
    press = null
    const mouse = e.pointerType === 'mouse'
    // a mouse click lands on <html> in this same task (arrival.js:806); a tap's comes later
    if (mouse) win.setTimeout(() => html.classList.remove('arr-press'), 0)
    else holdTap()
    if (!running()) return
    guarded(() => {
      if (!pr || e.pointerId !== pr.id) return
      const r = pr.r
      const x = e.clientX
      const y = e.clientY
      if (!(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) {
        if (early()) {
          kbd = false
          advance('input')
        }
        return
      }
      end(how ?? 'input', undefined, false)
      // a mouse released on the act itself: the native click reaches it. Released where she SAW it, or a
      // tap (its click is hit-tested after the act went home): forward one
      const t = e.target as Node | null
      if (!mouse || !(t && pr.act.contains(t))) {
        pr.act.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true, cancelable: true, view: win, detail: 1, button: 0, clientX: x, clientY: y,
            ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
          }),
        )
      }
    })
  }

  function onWheel() {
    if (!running()) return
    inputAt = now()
    press = null
    guarded(() => {
      if (early()) {
        kbd = false
        advance('input')
      }
    })
  }

  function onTouchMove() {
    if (!running()) return
    inputAt = now()
    if (press) return
    guarded(() => {
      if (early()) {
        kbd = false
        advance('input')
      }
    })
  }

  /** A scroll counts only inside the gesture window after her hand; otherwise layout moved the page. */
  function onScroll() {
    if (!running()) return
    guarded(() => {
      const y = win.scrollY
      if (now() - inputAt > BUDGET.INPUT_SCROLL_WINDOW_MS) {
        if (press) press.y = y
        baseY = y
        return
      }
      if (press && Math.abs(y - press.y) > 0.5) press = null
      if (Math.abs(y - baseY) <= 0.5) return
      if (early()) advance('input')
    })
  }

  function onVisibilityChange() {
    if (!running()) return
    guarded(() => {
      const hidden = doc.visibilityState !== 'visible'
      if (phase === 'hold') {
        pz.hidden = hidden
        sync()
      } else if (hidden) end('hidden-tab', undefined, false)
    })
  }

  function onFocusIn(e: FocusEvent) {
    if (quiet) {
      e.stopImmediatePropagation() // landing focus is not an address
      return
    }
    if (!running()) return
    guarded(() => {
      const t = e.target as Element | null
      if (inCard(t)) {
        pz.focus = true
        sync()
        return
      }
      if (!t || (t as unknown) === win || (t as unknown) === doc) return
      if (early()) advance('input')
      else end(how ?? 'input', undefined, false)
    })
  }

  return {
    get phase() {
      return phase
    },
    ended,
    start() {
      if (started || done) return
      started = true
      try {
        begin()
      } catch {
        end('error', undefined, false)
      }
    },
    finish(h, cause) {
      end(h, cause, false)
    },
    onKeyDown,
    onPointerDown,
    onPointerUp,
    onWheel,
    onTouchMove,
    onScroll,
    onVisibilityChange,
    onFocusIn,
  }
}

export { gate, verifyFrame0 }

export const engine: ArrivalEngine = { gate, brief, verifyFrame0, createRun }
