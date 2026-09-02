import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Regime = 'wide' | 'compact' | 'mobile'
type SectionKey = 'approvals' | 'boards' | 'schedule' | 'furnishings' | 'commercial'

const stages = [
  { label: 'Brief', state: 'settled', meta: 'Settled' },
  { label: 'Discovery', state: 'settled', meta: 'Settled · Aug 14' },
  { label: 'Direction', state: 'settled', meta: 'Settled · Aug 14' },
  { label: 'Proposal', state: 'signed', meta: 'Signed · Aug 14' },
  { label: 'Project', state: 'active', meta: 'Active · Week 1' },
  { label: 'Install', state: 'future', meta: 'Aug 10' },
  { label: 'Care', state: 'future', meta: '—' },
] as const

const sections: Array<{ key: SectionKey; label: string; child: string; number: string }> = [
  { key: 'approvals', label: 'Approvals', child: 'Kitchen stone alternate', number: '01' },
  { key: 'boards', label: 'Boards', child: 'Library', number: '02' },
  { key: 'schedule', label: 'Schedule', child: 'Construction frame', number: '03' },
  { key: 'furnishings', label: 'Furnishings', child: 'Library table', number: '04' },
  { key: 'commercial', label: 'Commercial', child: 'Orders', number: '05' },
]

function useRegime(): Regime {
  const get = () => window.innerWidth >= 1440 ? 'wide' : window.innerWidth >= 1180 ? 'compact' : 'mobile'
  const [regime, setRegime] = useState<Regime>(get)
  useEffect(() => {
    const onResize = () => {
      const next = get()
      if (next === regime) return
      const active = document.activeElement as HTMLElement | null
      const leavesWide = Boolean(active?.closest('.outline-leaf')) && next !== 'wide'
      const leavesMobile = Boolean(active?.closest('.mobile-sheet')) && next !== 'mobile'
      setRegime(next)
      const afterRegimePaint = (focus: () => void) => requestAnimationFrame(() => requestAnimationFrame(focus))
      if (leavesWide || (leavesMobile && next === 'compact')) afterRegimePaint(() => document.getElementById('active-stage-button')?.focus())
      else if (leavesMobile && next === 'wide') afterRegimePaint(() => document.getElementById('sections-tab')?.focus())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [regime])
  return regime
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function ArrowLeftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M10 7l-5 5 5 5" /></svg>
}

function PinIcon({ pinned }: { pinned: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={pinned ? 'is-pinned' : ''}><path d="M8.5 4.5h7l-1 5 2.5 2.5v1H7v-1l2.5-2.5-1-5ZM12 13v7" /></svg>
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
}

function StageMark({ state }: { state: string }) {
  return (
    <span className={`stage-mark stage-mark--${state}`} aria-hidden="true">
      <i /><i /><i />
    </span>
  )
}

interface RailProps {
  regime: Regime
  open: boolean
  pinned: boolean
  active: SectionKey
  progress: number
  onOpen: (source: 'tab' | 'key') => void
  onClose: (clearPin?: boolean) => void
  onPin: () => void
  onJump: (key: SectionKey) => void
  onStageJump: (label: string) => void
  onTimer: () => void
  timerOpen: boolean
}

function DocumentRail({ regime, open, pinned, active, progress, onOpen, onClose, onPin, onJump, onStageJump, onTimer, timerOpen }: RailProps) {
  const activeIndex = sections.findIndex((section) => section.key === active)
  if (regime === 'mobile') return null

  return (
    <aside className={`document-rail document-rail--${regime} ${open ? 'is-open' : ''}`} aria-label="Document wayfinding">
      <div className="rail-spine">
        <button className="put-down-icon focus-ring" type="button" aria-label="Put down document">
          <ArrowLeftIcon />
        </button>

        <div className="stage-score" aria-label="Project lifecycle">
          {stages.map((stage) => (
            <button
              className={`stage-pip focus-ring stage-pip--${stage.state}`}
              type="button"
              key={stage.label}
              aria-label={`${stage.label}: ${stage.meta}`}
              id={stage.label === 'Project' ? 'active-stage-button' : undefined}
              disabled={stage.state === 'future'}
              onClick={() => onStageJump(stage.label)}
            >
              <StageMark state={stage.state} />
            </button>
          ))}
        </div>

        {regime === 'wide' && (
          <button
            id="sections-tab"
            className="sections-tab focus-ring"
            type="button"
            aria-expanded={open}
            aria-controls="desktop-outline"
            onClick={() => open ? onClose(true) : onOpen('tab')}
          >
            <span className="sections-glyph" aria-hidden="true"><i /><i /><i /></span>
            <span className="vertical-label">Sections</span>
            {!open && <span className="shortcut-sequence" aria-hidden="true"><kbd>G</kbd><small>then</small><kbd>S</kbd></span>}
          </button>
        )}

        <button id="compact-timer-button" className="rail-foot focus-ring" type="button" aria-label="Open time in hand: 5 minutes" aria-expanded={regime === 'compact' ? timerOpen : undefined} onClick={onTimer}>
          <span className="presence-dot" aria-label="In hand" />
          <span className="rail-minutes">5</span>
          <span className="rail-minutes-unit">min</span>
        </button>
      </div>

      {regime === 'wide' && (
        <div id="desktop-outline" className="outline-leaf" aria-hidden={!open} inert={!open}>
          <div className="leaf-head">
            <button className="put-down-word focus-ring" type="button"><ArrowLeftIcon /> Put down</button>
            <button
              className="pin-button focus-ring"
              type="button"
              aria-pressed={pinned}
              aria-label={pinned ? 'Unpin sections for this session' : 'Pin sections for this session'}
              title={pinned ? 'Unpin for this session' : 'Pin for this session'}
              onClick={onPin}
            >
              <PinIcon pinned={pinned} />
            </button>
          </div>

          <div className="leaf-stage-context">
            <span className="eyebrow">In project</span>
            <span className="folio-count">{String(activeIndex + 1).padStart(2, '0')} / 05</span>
          </div>

          <nav className="running-index" aria-label="Project contents">
            <span className="index-track" aria-hidden="true">
              <span className="index-progress" style={{ height: `${progress * 100}%` }} />
              <span className="reading-bracket" style={{ transform: `translateY(${activeIndex * 58}px)` }} />
            </span>
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                className={`index-item focus-ring ${active === section.key ? 'is-current' : ''}`}
                aria-current={active === section.key ? 'location' : undefined}
                onClick={() => onJump(section.key)}
                tabIndex={open ? 0 : -1}
              >
                <span className="index-number">{section.number}</span>
                <span className="index-copy">
                  <strong>{section.label}</strong>
                  {active === section.key && <small>{section.child}</small>}
                </span>
              </button>
            ))}
          </nav>

          <div className="leaf-session-note" aria-hidden="true">
            <span className="shortcut-sequence"><kbd>G</kbd><small>then</small><kbd>S</kbd></span> opens · <kbd>esc</kbd> closes
          </div>
        </div>
      )}
    </aside>
  )
}

function PreviousWork() {
  return (
    <section className="previous-work" aria-labelledby="previous-title">
      <div className="region-heading previous-heading">
        <span className="eyebrow" id="previous-title">Previous work</span>
        <span className="hairline" />
      </div>
      <div className="settled-register">
        {stages.slice(0, 4).map((stage, index) => (
          <div className="settled-row" id={`stage-${stage.label.toLowerCase()}`} tabIndex={-1} key={stage.label}>
            <StageMark state={stage.state} />
            <span>{stage.label}</span>
            <span className="settled-meta">{index === 3 ? 'Signed · Aug 14' : 'Settled · Aug 14'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ApprovalRegion() {
  return (
    <DocumentRegion id="approvals" number="01" title="Approvals" kicker="Project record">
      <p className="region-intro">Decisions that need a name, a date, and a durable place in the work.</p>
      <div className="ledger-list">
        <div className="ledger-row ledger-row--attention">
          <span className="status-seal">Awaiting</span>
          <div><strong>Kitchen stone alternate</strong><small>Client approval · requested today</small></div>
          <span className="row-meta">Due Aug 16</span>
        </div>
        <div className="ledger-row ledger-row--attention">
          <span className="status-seal">Awaiting</span>
          <div><strong>Library millwork elevation</strong><small>Designer approval · revised once</small></div>
          <span className="row-meta">Due Aug 18</span>
        </div>
        <div className="ledger-row">
          <span className="status-seal status-seal--quiet">Settled</span>
          <div><strong>Primary bath hardware</strong><small>Approved by Marisol Vasquez</small></div>
          <span className="row-meta">Aug 12</span>
        </div>
      </div>
      <button className="text-door focus-ring" type="button">Open the approval record <span>→</span></button>
    </DocumentRegion>
  )
}

function BoardsRegion() {
  return (
    <DocumentRegion id="boards" number="02" title="Boards" kicker="Direction in view">
      <p className="region-intro">The project’s current visual argument, organized by room rather than by upload.</p>
      <div className="boards-grid">
        <article className="board-card board-card--library">
          <div className="material material--wood" /><div className="material material--linen" /><div className="material material--ink" />
          <span>Library</span><small>14 pieces · revised today</small>
        </article>
        <article className="board-card board-card--kitchen">
          <div className="material material--stone" /><div className="material material--oak" /><div className="material material--brass" />
          <span>Kitchen</span><small>22 pieces · client viewed</small>
        </article>
        <article className="board-card board-card--bedroom">
          <div className="material material--plaster" /><div className="material material--sage" /><div className="material material--walnut" />
          <span>Primary suite</span><small>11 pieces · 1 question</small>
        </article>
      </div>
    </DocumentRegion>
  )
}

function ScheduleRegion() {
  return (
    <DocumentRegion id="schedule" number="03" title="Schedule" kicker="Now · Construction frame">
      <div className="schedule-recap">
        <span className="recap-date">Aug 14</span>
        <p><strong>The house is in framing.</strong> Stone templates follow cabinet setting; the library field measure is the only sequence risk.</p>
      </div>
      <div className="timeline" aria-label="Project schedule preview">
        <div className="timeline-months"><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span></div>
        {[
          ['Construction frame', '2 / 28', 'active'],
          ['Cabinet set', '28 / 52', ''],
          ['Stone + tile', '46 / 73', ''],
          ['Install', '76 / 94', ''],
        ].map(([label, range, state]) => {
          const [start, end] = range.split(' / ').map(Number)
          return <div className="timeline-row" key={label}><span>{label}</span><i className={state} style={{ left: `${start}%`, width: `${end - start}%` }} /></div>
        })}
        <span className="today-rule" aria-hidden="true"><b>Today</b></span>
      </div>
      <div className="red-letter">
        <span className="red-letter-mark">!</span>
        <div><span className="eyebrow">Needs a hand</span><strong>Confirm library site measure</strong><small>Holding millwork release · due tomorrow</small></div>
        <button className="text-door focus-ring" type="button">Open item <span>→</span></button>
      </div>
    </DocumentRegion>
  )
}

function FurnishingsRegion() {
  return (
    <DocumentRegion id="furnishings" number="04" title="Furnishings" kicker="18 pieces · 3 rooms">
      <div className="piece-list">
        {[
          ['Bespoke library table', 'Hennepin Made', 'In fabrication', '$8,400'],
          ['Pair of shearling lounge chairs', 'Lawson-Fenning', 'Order ready', '$12,900'],
          ['Hand-knotted runner', 'Tantuvi', 'Sample in hand', '$3,250'],
          ['Kitchen counter stools × 4', 'De La Espada', 'Quote received', '$7,680'],
        ].map(([name, maker, status, price]) => (
          <div className="piece-row" key={name}>
            <span className="piece-swatch" aria-hidden="true" />
            <div><strong>{name}</strong><small>{maker}</small></div>
            <span className="piece-status">{status}</span><span className="piece-price">{price}</span>
          </div>
        ))}
      </div>
      <button className="text-door focus-ring" type="button">Open the furnishings ledger <span>→</span></button>
    </DocumentRegion>
  )
}

function CommercialRegion() {
  return (
    <DocumentRegion id="commercial" number="05" title="Commercial" kicker="Orders and accounts">
      <div className="commercial-grid">
        <article><span className="eyebrow">Committed</span><strong>$78,430</strong><small>12 approved pieces</small></article>
        <article><span className="eyebrow">In review</span><strong>$24,180</strong><small>4 open decisions</small></article>
        <article><span className="eyebrow">Received</span><strong>$31,225</strong><small>6 deposits reconciled</small></article>
      </div>
      <div className="commercial-note"><span>Next</span><p>Release the library table when site measure is confirmed.</p><button className="focus-ring" type="button">Draw purchase order</button></div>
    </DocumentRegion>
  )
}

function DocumentRegion({ id, number, title, kicker, children }: { id: SectionKey; number: string; title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section id={id} className="document-region" data-section={id} aria-labelledby={`${id}-title`}>
      <header className="region-heading">
        <span className="region-number">{number}</span>
        <h2 id={`${id}-title`} tabIndex={-1}>{title}</h2>
        <span className="hairline" />
        <span className="region-kicker">{kicker}</span>
      </header>
      {children}
    </section>
  )
}

function MarginNotes({ active }: { active: SectionKey }) {
  const notes = useMemo(() => ({
    approvals: ['M. Vasquez viewed the stone alternate', 'Ari revised the library elevation'],
    boards: ['Kitchen board viewed 18 minutes ago', 'One new note in Primary suite'],
    schedule: ['Field measure is due tomorrow', 'Cabinet set begins Aug 26'],
    furnishings: ['One quote expires Aug 19', 'Table deposit is ready'],
    commercial: ['Four decisions affect $24,180', 'Six deposits reconciled'],
  }[active]), [active])
  return (
    <aside className="margin-notes" aria-label="Document activity">
      <span className="eyebrow">At the margin</span>
      <div className="margin-rule" />
      {notes.map((note, index) => <p key={note}><i className={index === 0 ? 'fresh' : ''} />{note}</p>)}
      <button className="text-door focus-ring" type="button">See all activity</button>
    </aside>
  )
}

function CompactTimerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <aside className="compact-timer-sheet" role="region" aria-labelledby="compact-timer-title">
      <header><div><span className="presence-dot" /><span className="eyebrow">In hand</span></div><button className="focus-ring" type="button" onClick={onClose}>Close</button></header>
      <strong id="compact-timer-title">5 min</strong>
      <p>Time with the Vasquez Residence document.</p>
      <div><button className="focus-ring" type="button">Pause</button><button className="focus-ring" type="button">+ Log</button></div>
    </aside>
  )
}

interface MobileProps {
  open: boolean
  active: SectionKey
  onOpen: () => void
  onClose: () => void
  onJump: (key: SectionKey) => void
}

function MobileNavigation({ open, active, onOpen, onClose, onJump }: MobileProps) {
  const activeSection = sections.find((section) => section.key === active) ?? sections[0]
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    sheetRef.current?.querySelector<HTMLElement>('[aria-current="location"]')?.focus()
  }, [open])
  return (
    <>
      <footer className="mobile-bar" aria-hidden={open} inert={open}>
        <div><span className="eyebrow">Project</span><strong>{activeSection.label}</strong></div>
        <span className="mobile-timer"><i /> 5 min</span>
        <button id="mobile-sections-button" className="mobile-sections focus-ring" type="button" aria-expanded={open} aria-controls="mobile-sections-sheet" onClick={onOpen}>Sections <ChevronIcon /></button>
      </footer>
      {open && <button className="sheet-scrim" type="button" tabIndex={-1} aria-label="Close sections" onClick={onClose} />}
      <div
        id="mobile-sections-sheet"
        ref={sheetRef}
        className={`mobile-sheet ${open ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-sheet-title"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <header><div><span className="eyebrow">Vasquez Residence</span><h2 id="mobile-sheet-title">Sections</h2></div><button className="sheet-close focus-ring" type="button" onClick={onClose}>Close</button></header>
        <div className="mobile-stage-row" aria-label="Project lifecycle">
          {stages.map((stage) => <span key={stage.label} className={stage.state === 'active' ? 'is-active' : ''}><StageMark state={stage.state} /><small>{stage.label}</small></span>)}
        </div>
        <nav className="mobile-index" aria-label="Project contents">
          {sections.map((section) => (
            <button className={`focus-ring ${section.key === active ? 'is-current' : ''}`} type="button" key={section.key} aria-current={section.key === active ? 'location' : undefined} onClick={() => onJump(section.key)} tabIndex={open ? 0 : -1}>
              <span>{section.number}</span><strong>{section.label}</strong><small>{section.key === active ? section.child : ''}</small><i>→</i>
            </button>
          ))}
        </nav>
        <section className="mobile-sheet-register" aria-labelledby="rooms-title">
          <div className="sheet-section-head"><span className="eyebrow" id="rooms-title">Rooms</span><span>03</span></div>
          {['Library', 'Kitchen', 'Primary suite'].map((room) => <button className="focus-ring" type="button" key={room}><strong>{room}</strong><span>Open room</span><i>→</i></button>)}
        </section>
        <section className="mobile-sheet-register" aria-labelledby="margin-title">
          <div className="sheet-section-head"><span className="eyebrow" id="margin-title">In the margin</span><span>02</span></div>
          <button className="focus-ring" type="button"><strong>Field measure due tomorrow</strong><span>Schedule</span><i>→</i></button>
          <button className="focus-ring" type="button"><strong>Stone alternate viewed</strong><span>Approval</span><i>→</i></button>
        </section>
        <button className="mobile-put-down focus-ring" type="button"><ArrowLeftIcon /> Put down document</button>
      </div>
    </>
  )
}

function App() {
  const regime = useRegime()
  const [active, setActive] = useState<SectionKey>('approvals')
  const [progress, setProgress] = useState(0)
  const [outlineOpen, setOutlineOpen] = useState(() => sessionStorage.getItem('patina-index-pinned') === 'true')
  const [pinned, setPinned] = useState(() => sessionStorage.getItem('patina-index-pinned') === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [timerOpen, setTimerOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const mobileOpener = useRef<HTMLElement | null>(null)
  const shortcutArmedAt = useRef<number | null>(null)
  const previousRegime = useRef(regime)

  useLayoutEffect(() => {
    const previous = previousRegime.current
    previousRegime.current = regime
    if (previous === regime) return
    if ((previous === 'wide' && outlineOpen) || (previous === 'mobile' && mobileOpen && regime === 'compact')) {
      document.getElementById('active-stage-button')?.focus()
    } else if (previous === 'mobile' && mobileOpen && regime === 'wide') {
      document.getElementById('sections-tab')?.focus()
    }
  }, [mobileOpen, outlineOpen, regime])

  useEffect(() => {
    if (regime !== 'wide') setOutlineOpen(false)
    else if (pinned) setOutlineOpen(true)
    if (regime !== 'mobile') setMobileOpen(false)
    if (regime !== 'compact') setTimerOpen(false)
  }, [regime, pinned])

  useEffect(() => {
    let frame = 0
    const update = () => {
      const readingLine = window.innerHeight * .34
      let next: SectionKey = 'approvals'
      sections.forEach((section) => {
        const node = document.getElementById(section.key)
        if (node && node.getBoundingClientRect().top <= readingLine) next = section.key
      })
      setActive(next)
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [])

  const closeOutline = useCallback((clearPin = false) => {
    setOutlineOpen(false)
    if (clearPin) {
      setPinned(false)
      sessionStorage.removeItem('patina-index-pinned')
    }
    requestAnimationFrame(() => document.getElementById('sections-tab')?.focus())
  }, [])

  const closeMobile = useCallback((restoreFocus = true) => {
    setMobileOpen(false)
    if (restoreFocus) requestAnimationFrame(() => mobileOpener.current?.focus())
  }, [])

  const jumpTo = useCallback((key: SectionKey) => {
    const node = document.getElementById(key)
    if (!node) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    window.setTimeout(() => {
      document.getElementById(`${key}-title`)?.focus({ preventScroll: true })
      setAnnouncement(`Jumped to ${sections.find((section) => section.key === key)?.label}.`)
    }, reduce ? 0 : 420)
    if (regime === 'wide' && !pinned) setOutlineOpen(false)
    if (regime === 'mobile') closeMobile(false)
  }, [closeMobile, pinned, regime])

  const togglePin = useCallback(() => {
    const next = !pinned
    setPinned(next)
    if (next) sessionStorage.setItem('patina-index-pinned', 'true')
    else sessionStorage.removeItem('patina-index-pinned')
    setAnnouncement(next ? 'Sections pinned for this session.' : 'Sections unpinned.')
  }, [pinned])

  const jumpStage = useCallback((label: string) => {
    if (label === 'Project') { jumpTo('approvals'); return }
    const target = document.getElementById(`stage-${label.toLowerCase()}`)
    if (!target) return
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    window.setTimeout(() => target.focus({ preventScroll: true }), 360)
  }, [jumpTo])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (timerOpen) { event.preventDefault(); event.stopPropagation(); setTimerOpen(false); requestAnimationFrame(() => document.getElementById('compact-timer-button')?.focus()); return }
        if (mobileOpen) { event.preventDefault(); closeMobile(); return }
        if (outlineOpen) { event.preventDefault(); closeOutline(true); return }
        return
      }
      if (regime !== 'wide' || isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey || event.repeat || event.isComposing || document.querySelector('[role="dialog"]')) return
      const now = Date.now()
      const key = event.key.toLowerCase()
      const armed = shortcutArmedAt.current !== null && now - shortcutArmedAt.current < 1200
      if (armed) {
        shortcutArmedAt.current = null
        if (key !== 's') return
        event.preventDefault()
        setOutlineOpen(true)
        setAnnouncement('Sections opened.')
        requestAnimationFrame(() => document.querySelector<HTMLElement>('.index-item[aria-current="location"]')?.focus())
        return
      }
      if (key === 'g') shortcutArmedAt.current = now
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [closeMobile, closeOutline, mobileOpen, outlineOpen, regime, timerOpen])

  useEffect(() => {
    if (!mobileOpen) return
    const main = document.getElementById('document-main')
    const skip = document.querySelector<HTMLElement>('.skip-link')
    const previousOverflow = document.body.style.overflow
    main?.setAttribute('inert', '')
    skip?.setAttribute('inert', '')
    skip?.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = 'hidden'
    return () => {
      main?.removeAttribute('inert')
      skip?.removeAttribute('inert')
      skip?.removeAttribute('aria-hidden')
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen) return
    const onFocus = (event: FocusEvent) => {
      const sheet = document.getElementById('mobile-sections-sheet')
      if (sheet && !sheet.contains(event.target as Node)) sheet.querySelector<HTMLElement>('button')?.focus()
    }
    document.addEventListener('focusin', onFocus)
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const sheet = document.getElementById('mobile-sections-sheet')
      const focusable = Array.from(sheet?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onTab, true)
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('keydown', onTab, true) }
  }, [mobileOpen])

  return (
    <div className={`prototype-shell regime-${regime}`}>
      <a className="skip-link" href="#document-main">Skip to document</a>
      <DocumentRail
        regime={regime}
        open={outlineOpen}
        pinned={pinned}
        active={active}
        progress={progress}
        onOpen={(source) => { setOutlineOpen(true); setAnnouncement(`Sections opened by ${source === 'key' ? 'keyboard' : 'tab'}.`) }}
        onClose={closeOutline}
        onPin={togglePin}
        onJump={jumpTo}
        onStageJump={jumpStage}
        onTimer={() => regime === 'compact' && setTimerOpen(true)}
        timerOpen={timerOpen}
      />

      <main id="document-main" className="document-page">
        <article className="document-paper">
          <header className="letterhead">
            <div className="letterhead-top"><span>Patina / Document</span><span>Private residence · Minneapolis</span></div>
            <p className="document-type">Interior furnishings &amp; renovation</p>
            <h1>Vasquez Residence</h1>
            <div className="project-vitals">
              <div><span className="eyebrow">Client</span><strong>Marisol &amp; Tomas Vasquez</strong></div>
              <div><span className="eyebrow">Designer</span><strong>North &amp; Fallow Studio</strong></div>
              <div><span className="eyebrow">Project</span><strong className="active-value">Active · Week 1</strong></div>
            </div>
            <div className="document-recap"><span className="eyebrow">At a glance</span><p>Direction is settled. Construction is in frame; two approvals and one field measure hold the next releases.</p></div>
          </header>

          <PreviousWork />
          <ApprovalRegion />
          <BoardsRegion />
          <ScheduleRegion />
          <FurnishingsRegion />
          <CommercialRegion />

          <footer className="document-end"><span>Patina / Vasquez Residence</span><span>Last worked today at 8:14 PM</span></footer>
        </article>
      </main>

      {regime === 'wide' && <MarginNotes active={active} />}
      {regime === 'compact' && <CompactTimerSheet open={timerOpen} onClose={() => { setTimerOpen(false); requestAnimationFrame(() => document.getElementById('compact-timer-button')?.focus()) }} />}
      {regime === 'mobile' && <MobileNavigation open={mobileOpen} active={active} onOpen={() => { mobileOpener.current = document.activeElement as HTMLElement; setMobileOpen(true) }} onClose={closeMobile} onJump={jumpTo} />}
      <div className="sr-only" aria-live="polite">{announcement}</div>
    </div>
  )
}

export default App
