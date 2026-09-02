import { useState } from 'react'
import './App.css'

type Concept = {
  id: number
  short: string
  name: string
  thesis: string
  job: string
  keeps: string
  avoids: string
  cost: string
  bullets: string[]
  question: string
}

const concepts: Concept[] = [
  {
    id: 1,
    short: 'Yield',
    name: 'The Folded Gutter',
    thesis: 'Do not invent work for the rail. At ≥1440px, fold 200px of permanent chrome to a 56px score; under the current paper cap, that releases the shell but adds only 0–32px to the paper.',
    job: 'Persistent orientation, nothing more',
    keeps: 'Put down · seven stages · time bead · presence notch',
    avoids: 'Permanent labels, timer card, manufactured filler',
    cost: 'New overlay behavior and a small learnability trade-off',
    bullets: [
      'At ≥1440px, the resting state becomes a 56px document edge; 1180–1439 already uses 56px.',
      'An explicit “Sections” act opens the 200px leaf; Escape, a jump, or the tab closes it, with an optional session pin.',
      'Below 1180px, keep the current bottom-sheet model—this direction does not invent a mobile side rail.',
    ],
    question: 'Is the strongest use of this space simply giving it back?',
  },
  {
    id: 2,
    short: 'Map',
    name: 'The Running Index',
    thesis: 'Use the lower rail as a local table of contents for the long chapter currently being read.',
    job: 'Answer “where am I in Project?”',
    keeps: 'The seven-stage spine as the lifecycle authority',
    avoids: 'Dates, alerts, counts, or copied body summaries',
    cost: 'Stable heading anchors and scrollspy rules',
    bullets: [
      'Project maps to Approvals, Boards, Schedule, Furnishings, and Commercial.',
      'A clay reading line tracks the viewport; the current region reveals one child level.',
      'Selecting a folded region unfolds it, scrolls to it, and focuses its heading; the shown order must follow the rendered DOM.',
    ],
    question: 'Should the rail map the paper rather than summarize it?',
  },
  {
    id: 3,
    short: 'Hold',
    name: 'The Dog-Eared Set',
    thesis: 'Let each designer pin the few lines they are actively carrying across a long document.',
    job: 'Hold temporary personal focus',
    keeps: 'Inline content as the source of truth',
    avoids: 'A second task manager or studio-wide assignment system',
    cost: 'A new pin gesture, personal state, and clear empty behavior',
    bullets: [
      'Pin up to three rooms, decisions, pieces, or schedule lines from their inline overflow.',
      'Each dog-ear jumps back to the exact object; reordering has no effect on shared truth.',
      'The set is private by default and collapses completely when empty.',
    ],
    question: 'Would designers use a personal working set while moving through Project?',
  },
  {
    id: 4,
    short: 'Remember',
    name: 'The Hand Ledger',
    thesis: 'Make the lower spine a quiet record of who shaped the work, what they changed, and where the document began.',
    job: 'Preserve studio provenance',
    keeps: 'D6 shared visibility without exclusive holds',
    avoids: 'Unread badges, due dates, cursor theater, or notifications',
    cost: 'Reliable authorship data and careful anti-surveillance boundaries',
    bullets: [
      'Keep live presence compact above; the lower rail begins with the stable “Hands on the work” record.',
      'Show at most three contributors, their shaped sections, and their latest meaningful mark.',
      'Open a read-only making record; all action still returns to the document or right margin.',
    ],
    question: 'Is authorship and handoff memory worth more than another navigator?',
  },
]

const flowNotes = [
  {
    n: '01',
    title: 'The body already owns the work',
    body: 'The Project chapter now composes five governed regions inline—Approvals, Boards, Schedule, Furnishings, and Commercial—plus fold seams and a colophon.',
  },
  {
    n: '02',
    title: 'The right margin owns interruption',
    body: 'Patina’s D2 ruling makes the margin the notification model. Decisions, messages, money, and needs should not migrate left just to fill space.',
  },
  {
    n: '03',
    title: 'The spine stops at lifecycle',
    body: 'Brief through Care answers “what chapter are we in?” It does not answer where the reader is inside the long, active Project chapter.',
  },
  {
    n: '04',
    title: 'The column mixes four weights',
    body: 'Exit, status navigation, time capture, and presence share the top third. Below them, a 200px permanent column continues without a second job.',
  },
]

function StageScore({ compact = false }: { compact?: boolean }) {
  const stages = [
    ['Brief', 'Settled'],
    ['Discovery', 'Settled · Aug 14'],
    ['Direction', 'Settled · Aug 14'],
    ['Proposal', 'Signed · Aug 14'],
    ['Project', 'Active · Frame'],
    ['Install', '—'],
    ['Care', '—'],
  ]
  return (
    <div className={compact ? 'stage-score compact' : 'stage-score'}>
      {stages.map(([label, state], index) => (
        <div className={'stage-row ' + (index === 4 ? 'active' : index > 4 ? 'future' : '')} key={label}>
          <span className="strata" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {!compact && (
            <span className="stage-copy">
              <b>{label}</b>
              <em>{state}</em>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function CurrentRail() {
  return (
    <div className="current-rail">
      <div className="current-head">← <span>Put down</span></div>
      <StageScore />
      <div className="current-timer">
        <span>● In hand</span>
        <strong>5 min</strong>
        <small>Pause · + Log</small>
      </div>
      <div className="current-presence">
        <span>In this document</span>
        <b>Just you · visible to the studio</b>
      </div>
      <div className="blank-field">
        <span>Unassigned area</span>
        <i />
      </div>
    </div>
  )
}

function ConceptRail({ id }: { id: number }) {
  if (id === 1) {
    return (
      <aside className="mock-rail folded" aria-label="Folded Gutter concept">
        <button className="rail-back" aria-label="Illustrative Put down control" tabIndex={-1}>←</button>
        <StageScore compact />
        <div className="gutter-tab">Sections</div>
        <div className="gutter-foot">
          <span className="time-bead">●</span>
          <b>5m</b>
          <span className="presence-notch">·</span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="mock-rail" aria-label={concepts[id - 1].name + ' concept'}>
      <div className="rail-back">← <span>Put down</span></div>
      <StageScore />
      <div className="utility-line">● In hand · 5 min · Pause</div>

      {id === 2 && (
        <div className="running-index">
          <div className="rail-section-head">
            <span>In Project</span>
            <b>03 / 05</b>
          </div>
          <div className="index-map">
            <span className="map-line"><i /></span>
            {['Approvals', 'Boards', 'Schedule', 'Furnishings', 'Commercial'].map((item, index) => (
              <button className={index === 2 ? 'current' : ''} key={item} tabIndex={-1}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item}
                {index === 2 && <em>Reading</em>}
              </button>
            ))}
          </div>
          <div className="index-child">↳ Construction · Frame</div>
        </div>
      )}

      {id === 3 && (
        <div className="dogears">
          <div className="rail-section-head">
            <span>At hand</span>
            <b>3 / 3</b>
          </div>
          <button tabIndex={-1}>
            <i>01</i>
            <span><b>Living room board</b><em>Boards · Project</em></span>
            <strong>↗</strong>
          </button>
          <button tabIndex={-1}>
            <i>02</i>
            <span><b>Walnut console</b><em>Furnishings · Project</em></span>
            <strong>↗</strong>
          </button>
          <button tabIndex={-1}>
            <i>03</i>
            <span><b>Install window</b><em>Schedule · Project</em></span>
            <strong>↗</strong>
          </button>
          <div className="dogear-note">Private to you · drag to order</div>
        </div>
      )}

      {id === 4 && (
        <div className="hand-ledger">
          <div className="rail-section-head">
            <span>Hands on the work</span>
          </div>
          <div className="maker">
            <i>MA</i>
            <span><b>Marta Chen</b><em>Direction, selections · Aug 12</em></span>
          </div>
          <div className="maker">
            <i>LA</i>
            <span><b>Leah Adams</b><em>Brief, schedule · Aug 14</em></span>
          </div>
          <div className="origin">
            <span>Origin</span>
            <b>Begun by Leah · Aug 2</b>
          </div>
          <button className="text-door" tabIndex={-1}>Open the making record →</button>
        </div>
      )}
    </aside>
  )
}

function DocumentMock({ concept }: { concept: Concept }) {
  return (
    <div className={'document-mock concept-' + concept.id} aria-hidden="true">
      <ConceptRail id={concept.id} />
      <div className="mock-paper">
        <div className="mock-letterhead">
          <span>The document · Project</span>
          <h3>Vasquez Residence</h3>
          <p>Marta & Luis Vasquez · Minneapolis, Minnesota</p>
          <div className="letter-meta">
            <b>Project · Active</b>
            <span>Frame · position 3 of 6</span>
          </div>
        </div>
        <div className="red-letter">One decision needs your hand · Dining table finish</div>
        <section className="paper-region quiet-region">
          <header><span>01</span><h4>Approvals</h4><b>2 settled</b></header>
          <p>Client decisions and the paper that granted them.</p>
        </section>
        <section className="paper-region quiet-region">
          <header><span>02</span><h4>Boards</h4><b>Living room active</b></header>
          <p>Four rooms · two boards ready to share.</p>
        </section>
        <section className="paper-region active-region">
          <header><span>03</span><h4>Schedule</h4><b>Construction · Frame</b></header>
          <div className="schedule-lines">
            <i style={{ width: '78%' }} />
            <i style={{ width: '58%' }} />
            <i style={{ width: '88%' }} />
          </div>
          <div className="schedule-row"><span>Site measure</span><b>Settled · Aug 12</b></div>
          <div className="schedule-row"><span>Client review</span><b>Aug 19 · proposed</b></div>
        </section>
        <section className="paper-region future-region">
          <header><span>04</span><h4>Furnishings</h4><b>14 pieces</b></header>
        </section>
      </div>
      <aside className="mock-margin">
        <span>In the margin</span>
        <div><b>Decision · due</b><p>Dining table finish</p></div>
        <div><b>Money · sent</b><p>INV-0018</p></div>
      </aside>
    </div>
  )
}

function App() {
  const [activeConcept, setActiveConcept] = useState(2)
  const [shortlist, setShortlist] = useState<Set<number>>(new Set([2]))
  const [feedback, setFeedback] = useState('Help me move')
  const [copyState, setCopyState] = useState('Copy review note')
  const [reviewNote, setReviewNote] = useState('')
  const [copyFallback, setCopyFallback] = useState('')
  const concept = concepts[activeConcept - 1]

  const toggleShortlist = (id: number) => {
    setShortlist((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyReview = async () => {
    const selected = concepts.filter((item) => shortlist.has(item.id)).map((item) => item.name)
    const note = [
      'PATINA · DOCUMENT SPINE REVIEW',
      'Priority: ' + feedback,
      'Shortlist: ' + (selected.length ? selected.join(', ') : 'None yet'),
      'Why / concern: ' + (reviewNote.trim() || 'Not provided'),
      'Question: What should the left rail do that the inline document and right margin do not?',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(note)
      setCopyFallback('')
      setCopyState('Copied')
    } catch {
      const field = document.createElement('textarea')
      field.value = note
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.focus()
      field.select()
      const copied = document.execCommand('copy')
      field.remove()
      setCopyFallback(copied ? '' : note)
      setCopyState(copied ? 'Copied' : 'Select note below')
    }
    window.setTimeout(() => setCopyState('Copy review note'), 1800)
  }

  return (
    <div className="presentation">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Patina document spine study home">PATINA</a>
        <nav aria-label="Presentation sections">
          <a href="#read">Read</a>
          <a href="#directions">Directions</a>
          <a href="#decision">Decision</a>
          <a href="#feedback">Feedback</a>
        </nav>
        <span>Design review · Aug 14, 2026</span>
      </header>

      <main>
        <section className="hero-section" id="top">
          <div className="hero-copy">
            <span className="eyebrow">The Document · Spine study</span>
            <h1>The quiet edge</h1>
            <p className="hero-deck">
              Four better jobs for the empty lower-left rail—without copying the document into its own margin.
            </p>
            <div className="hero-actions">
              <a href="#directions">Review the four directions ↓</a>
              <span>Source-backed · concept-level · no schema proposal</span>
            </div>
          </div>
          <div className="hero-rail-wrap">
            <CurrentRail />
            <div className="hero-callout">
              <span>Observed</span>
              <b>200px stays reserved after the useful content ends.</b>
              <p>The blank reads accidental because the rail above it already mixes several unrelated jobs.</p>
            </div>
          </div>
          <div className="folio-number">01</div>
        </section>

        <section className="read-section" id="read">
          <div className="section-heading">
            <span className="eyebrow">A read of the current flow</span>
            <h2>The rail has content.<br />It does not have a single job.</h2>
            <p>
              At wide desktop, the shell reserves a 200px left column, up to 1040px for the paper, and 232px for the right margin. The left edge carries exit, lifecycle, time, and presence—then stops.
            </p>
          </div>
          <div className="regime-strip" aria-label="Current document spine regimes">
            <div><span>≥ 1440px</span><b>200px full spine</b></div>
            <div><span>1180–1439px</span><b>56px compact spine</b></div>
            <div><span>&lt; 1180px</span><b>No side rail · bottom sheet</b></div>
          </div>
          <div className="flow-grid">
            {flowNotes.map((item) => (
              <article key={item.n}>
                <span>{item.n}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <div className="boundary-strip">
            <div>
              <span>Left edge</span>
              <b>Orientation, memory, or nothing</b>
            </div>
            <i>≠</i>
            <div>
              <span>Paper</span>
              <b>The complete work, inline</b>
            </div>
            <i>≠</i>
            <div>
              <span>Right margin</span>
              <b>What may need attention</b>
            </div>
          </div>
        </section>

        <section className="directions-section" id="directions">
          <div className="section-heading compact-heading">
            <span className="eyebrow">Four deliberately different directions</span>
            <h2>One rail. One honest job.</h2>
            <p>These are alternatives, not a feature list. Combining all four would recreate the same ambiguity with more content.</p>
          </div>

          <div className="concept-tabs" role="group" aria-label="Spine directions">
            {concepts.map((item) => (
              <button
                aria-pressed={activeConcept === item.id}
                className={activeConcept === item.id ? 'active' : ''}
                onClick={() => setActiveConcept(item.id)}
                key={item.id}
              >
                <span>0{item.id} · {item.short}</span>
                <b>{item.name}</b>
              </button>
            ))}
          </div>

          <div className="concept-intro">
            <div>
              <span className="eyebrow">Direction 0{concept.id}</span>
              <h3>{concept.name}</h3>
            </div>
            <p>{concept.thesis}</p>
            <button
              className={shortlist.has(concept.id) ? 'shortlist selected' : 'shortlist'}
              onClick={() => toggleShortlist(concept.id)}
              aria-pressed={shortlist.has(concept.id)}
            >
              {shortlist.has(concept.id) ? '✓ Shortlisted' : '+ Shortlist'}
            </button>
          </div>

          <div className="mock-regime">
            <span>Illustrative desktop concept · ≥1440px</span>
            <b>Controls inside the canvas do not act · on narrow screens, swipe the canvas to inspect it</b>
          </div>
          <DocumentMock concept={concept} />

          <div className="concept-notes">
            <div className="concept-anatomy">
              <span className="eyebrow">Anatomy</span>
              {concept.bullets.map((bullet, index) => (
                <div key={bullet}><i>0{index + 1}</i><p>{bullet}</p></div>
              ))}
            </div>
            <dl>
              <div><dt>Its job</dt><dd>{concept.job}</dd></div>
              <div><dt>It keeps</dt><dd>{concept.keeps}</dd></div>
              <div><dt>It refuses</dt><dd>{concept.avoids}</dd></div>
              <div><dt>Design cost</dt><dd>{concept.cost}</dd></div>
            </dl>
            <blockquote>{concept.question}</blockquote>
          </div>
        </section>

        <section className="decision-section" id="decision">
          <div className="section-heading">
            <span className="eyebrow">Synthesis</span>
            <h2>Start with less.<br />Expand only when the chapter earns it.</h2>
            <p>
              Our recommendation is an adaptive base: the Folded Gutter at rest, opening into the Running Index inside long chapters. Dog-Ears and the Hand Ledger are stronger as separate product hypotheses—not default furniture.
            </p>
          </div>

          <div className="decision-map" aria-label="Concept map from lower to higher product behavior and individual focus to studio memory">
            <span className="axis-y top">Studio memory</span>
            <span className="axis-y bottom">Individual focus</span>
            <span className="axis-x left">Less product behavior</span>
            <span className="axis-x right">More product behavior</span>
            <i className="map-rule horizontal" />
            <i className="map-rule vertical" />
            <button style={{ left: '12%', top: '69%' }} onClick={() => { setActiveConcept(1); document.getElementById('directions')?.scrollIntoView() }}>
              <span>01</span>The Folded Gutter
            </button>
            <button style={{ left: '39%', top: '55%' }} onClick={() => { setActiveConcept(2); document.getElementById('directions')?.scrollIntoView() }}>
              <span>02</span>The Running Index
            </button>
            <button style={{ left: '68%', top: '73%' }} onClick={() => { setActiveConcept(3); document.getElementById('directions')?.scrollIntoView() }}>
              <span>03</span>The Dog-Eared Set
            </button>
            <button style={{ left: '73%', top: '19%' }} onClick={() => { setActiveConcept(4); document.getElementById('directions')?.scrollIntoView() }}>
              <span>04</span>The Hand Ledger
            </button>
          </div>

          <div className="recommendation">
            <div className="recommendation-mark">A</div>
            <div>
              <span>Recommended next prototype</span>
              <h3>Folded Gutter × Running Index</h3>
              <p>
                At ≥1440px, rest at 56px. Open the local outline only through an explicit Sections act or keyboard request; close after a jump, Escape, or the tab, with an optional session pin. Keep today’s compact rail at 1180–1439 and the bottom sheet below 1180.
              </p>
            </div>
            <div className="test-lines">
              <span>Test with</span>
              <b>New Project · dense Project · settled-history review</b>
              <span>Watch for</span>
              <b>Unprompted orientation · section jumps · rail reopen rate</b>
            </div>
          </div>
        </section>

        <section className="feedback-section" id="feedback">
          <div className="section-heading compact-heading">
            <span className="eyebrow">Designer team feedback</span>
            <h2>What should this edge earn?</h2>
            <p>Choose the primary outcome, shortlist directions above, then copy a compact review note into the design thread.</p>
          </div>

          <div className="feedback-panel">
            <div className="feedback-options" role="group" aria-label="Primary outcome">
              {['Give width back', 'Help me move', 'Hold my place', 'Show studio hands'].map((item, index) => (
                <button
                  aria-pressed={feedback === item}
                  className={feedback === item ? 'selected' : ''}
                  onClick={() => setFeedback(item)}
                  key={item}
                >
                  <span>0{index + 1}</span>
                  <b>{item}</b>
                </button>
              ))}
            </div>
            <div className="feedback-summary">
              <span>Your review note</span>
              <h3>{feedback}</h3>
              <p>
                Shortlist: {concepts.filter((item) => shortlist.has(item.id)).map((item) => item.name).join(' · ') || 'None yet'}
              </p>
              <label htmlFor="review-note">Why, concern, or change</label>
              <textarea
                id="review-note"
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="What makes this right—or what would make it fail?"
                rows={4}
              />
              <button onClick={copyReview} aria-live="polite">{copyState}</button>
              {copyFallback && (
                <textarea
                  className="copy-fallback"
                  aria-label="Review note to copy manually"
                  readOnly
                  value={copyFallback}
                  onFocus={(event) => event.currentTarget.select()}
                  rows={7}
                />
              )}
            </div>
          </div>

          <div className="open-questions">
            <article><span>01</span><p>Does the empty space feel wasteful because it is blank—or because the paper needs the width?</p></article>
            <article><span>02</span><p>Should Project have a persistent local index, or are fold seams and browser find enough?</p></article>
            <article><span>03</span><p>Would a personal working set support real studio practice, or become a second task list?</p></article>
            <article><span>04</span><p>Does visible authorship feel like provenance, accountability, or surveillance?</p></article>
          </div>
        </section>

        <section className="method-section">
          <div>
            <span>Grounding</span>
            <p>Current DocSpine and /doc shell source · D2, D6, D9, D12 · R107–R114 · I132 · I135 · supplied screenshot.</p>
          </div>
          <div>
            <span>Team</span>
            <p>Three independent UX passes: reduction, wayfinding, and collaboration. Fourth direction synthesized around personal working memory.</p>
          </div>
          <div>
            <span>Boundary</span>
            <p>No proposal moves existing document content left. No concept competes with the right margin’s notification role.</p>
          </div>
        </section>
      </main>

      <footer>
        <span className="brand">PATINA</span>
        <p>Where time adds value.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  )
}

export default App
