import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleDashed,
  FlaskConical,
  LockKeyhole,
  MessageSquareMore,
  MonitorCheck,
  Route,
  ShieldCheck,
} from 'lucide-react'

type CategoryId = 'integrity' | 'continuity' | 'feedback'
type Severity = 'critical' | 'high' | 'medium'

type Finding = {
  id: string
  category: CategoryId
  severity: Severity
  title: string
  observed: string
  remediation: string
  verification: string
}

const categories: Array<{
  id: CategoryId
  index: string
  label: string
  shortLabel: string
  description: string
  icon: typeof ShieldCheck
}> = [
  {
    id: 'integrity',
    index: '01',
    label: 'Integrity & safety',
    shortLabel: 'Integrity',
    description:
      'The signed, paid, dated and related records now fail closed when their source-of-truth data disagrees.',
    icon: ShieldCheck,
  },
  {
    id: 'continuity',
    index: '02',
    label: 'Continuity & navigation',
    shortLabel: 'Continuity',
    description:
      'Transitions keep the designer oriented, preserve the active context and provide a reliable way back.',
    icon: Route,
  },
  {
    id: 'feedback',
    index: '03',
    label: 'Feedback & accessibility',
    shortLabel: 'Feedback',
    description:
      'Controls expose their meaning, persistence is visible and authored client copy stays intact.',
    icon: MessageSquareMore,
  },
]

const findings: Finding[] = [
  {
    id: 'F01',
    category: 'integrity',
    severity: 'critical',
    title: 'A $13,200 payment schedule could reach the client as $0',
    observed: 'Editor, preview and sent proposal were reading different milestone state.',
    remediation:
      'Bind send to the exact reviewed snapshot. Reconcile canonical amounts on the server, reject changed tokens, and remove the unsafe legacy send overload.',
    verification:
      'Builder, mirror, send-sheet, hook, schedule-library and SQL contract coverage added; final integrated replay pending.',
  },
  {
    id: 'F02',
    category: 'integrity',
    severity: 'critical',
    title: 'Closeout could overrule install, invoice and payment truth',
    observed: 'The project closed while FF&E remained specified, uninstalled and uninvoiced.',
    remediation:
      'Derive readiness from locked project, invoice, line, milestone and FF&E rows. Reject partial invoice coverage and allow only genuine zero-value exceptions.',
    verification:
      'Closeout derivation and SQL regression coverage added, including partial and zero-value cases; final integrated replay pending.',
  },
  {
    id: 'F03',
    category: 'integrity',
    severity: 'high',
    title: 'The client relationship could break at Discovery → Direction',
    observed: 'Direction opened as an orphan and asked the designer to attach the client again.',
    remediation:
      'Move client reassignment into one atomic database operation so client, designer relationship and document household stay aligned without downgrading an existing engagement.',
    verification:
      'Lead-hook and relationship-consistency SQL tests added for captured and registered households; final integrated replay pending.',
  },
  {
    id: 'F05',
    category: 'integrity',
    severity: 'high',
    title: 'Date-only values shifted across the Chicago timezone boundary',
    observed: 'Jul 31 became Aug 1 between signature, project start and install records.',
    remediation:
      'Use direct MM/DD/YYYY date-only entry and guarded parsing rather than UTC timestamp defaults or stale invalid values.',
    verification:
      'Timezone-boundary, signature and project-open interaction tests added; final integrated browser replay pending.',
  },
  {
    id: 'F07',
    category: 'integrity',
    severity: 'high',
    title: '“Send as-is” did not validate the payload being signed',
    observed: 'A stale zero-dollar schedule and unresolved drafting gap did not stop or explain send.',
    remediation:
      'Gate every active refetch, refresh drafting state before send, reset acknowledgement when gaps change, and require a second reviewed click after any snapshot change.',
    verification:
      'Tests cover stale cache, changed tokens, acknowledgement reset and concurrent edits; final integrated replay pending.',
  },
  {
    id: 'F14',
    category: 'integrity',
    severity: 'medium',
    title: 'The document shell emitted React hydration error #418',
    observed: 'Server and first client render could disagree when cached resolution data arrived early.',
    remediation:
      'Hold the document shell to the server loading contract until hydration and distinguish an active fetch from a terminal missing record.',
    verification:
      'Hydration-contract and cached-miss resolution tests added; production-build console replay remains pending.',
  },
  {
    id: 'F04',
    category: 'continuity',
    severity: 'high',
    title: 'Ashford time looked actionable inside the Harper project',
    observed: 'A carried timer from another project appeared without enough ownership context.',
    remediation:
      'Mark carried work as “Time from another project,” name the owner and expose the same distinction to assistive technology before log or discard.',
    verification:
      'Cross-project timer context has focused component coverage; final integrated browser replay pending.',
  },
  {
    id: 'F06',
    category: 'continuity',
    severity: 'high',
    title: 'The household sheet’s visible close control did nothing',
    observed: 'Pointer users could not dismiss the sheet even though Escape worked.',
    remediation:
      'Move the sheet onto a true modal dialog with a wired close action, focus containment, outside-tree hiding, Escape handling and focus restoration.',
    verification:
      'Mouse, keyboard, backdrop and focus behavior are covered in interaction tests; final integrated replay pending.',
  },
  {
    id: 'F08',
    category: 'continuity',
    severity: 'medium',
    title: 'A valid conversion flashed a terminal not-found page',
    observed: '“No document answers to this name” appeared while the new document was still resolving.',
    remediation:
      'Model loading, redirect, cached miss and terminal missing separately; retain a transition state while a valid fetch is in flight.',
    verification:
      'Resolution-state and document-page tests cover the cached-miss recovery path; final integrated replay pending.',
  },
  {
    id: 'F09',
    category: 'continuity',
    severity: 'medium',
    title: 'The accepted lead’s next action was buried in Studio pulse',
    observed: 'The Brief settled, but the actionable Discovery document was hard to find.',
    remediation:
      'Return the new canonical document identity from acceptance and route the designer directly into Discovery with replace/push semantics appropriate to context.',
    verification:
      'Triage navigation and lead-hook return contracts have focused tests; final integrated replay pending.',
  },
  {
    id: 'F10',
    category: 'feedback',
    severity: 'medium',
    title: 'Successful saves looked stale or ambiguous',
    observed: 'Counts, phases, palette work and send actions lagged without local confirmation.',
    remediation:
      'Expose saving/saved/error at the edited surface, invalidate exact facets, remove noisy polling and make partial-default failures retryable.',
    verification:
      'Drafting-state and scope-builder interaction suites cover refresh, invalidation and partial retry; integrated replay pending.',
  },
  {
    id: 'F11',
    category: 'feedback',
    severity: 'medium',
    title: 'Core Discovery controls lacked usable semantics',
    observed: 'Selects and numeric fields were unlabeled; date entry was not discoverable from the keyboard.',
    remediation:
      'Carry field labels into controls, add contextual row-action names and provide direct date text entry with invalid-value protection.',
    verification:
      'Field-kit, direct-date and contextual-action tests added; final keyboard/browser replay pending.',
  },
  {
    id: 'F12',
    category: 'feedback',
    severity: 'medium',
    title: 'Lead values were clipped before creation',
    observed: 'Email and project description could not be proofread at a normal desktop width.',
    remediation:
      'Use a single-column contact/project layout with min-width protection so long values remain reviewable down to the narrow viewport.',
    verification:
      'Lead-sheet component coverage and a 390px journey layout check added; final integrated browser replay pending.',
  },
  {
    id: 'F13',
    category: 'feedback',
    severity: 'medium',
    title: 'Household copy turned “UX Audit” into “the Audits”',
    observed: 'Heuristic surname pluralization corrupted deliberately authored display names.',
    remediation:
      'Preserve the complete authored household name and use a neutral fallback only for blank or known placeholder values.',
    verification:
      'Family-label unit coverage includes the audited name and nonstandard display copy; final integrated replay pending.',
  },
]

const priorityPlan = [
  {
    priority: 'P0',
    title: 'Prove the integrity boundaries together',
    scope: 'F01 · F02 · F03 · F07',
    body: 'Merge the financial snapshot, closeout guard and relationship transaction as one release gate. Run their UI, hook and SQL contracts against the integrated head. Any failure holds the release.',
  },
  {
    priority: 'P1',
    title: 'Replay the complete local journey',
    scope: 'F04 · F05 · F06 · F08 · F09 · F10 · F14',
    body: 'Run lead → Care in Chrome on the local stack. Capture the console, transition states, date boundaries, time ownership, modal behavior and persistence feedback.',
  },
  {
    priority: 'P2',
    title: 'Finish the human-quality pass before approval',
    scope: 'F11 · F12 · F13',
    body: 'Confirm keyboard names, direct date entry, 390px layout and household language in the same browser pass; keep them in the release unless a regression forces a deliberate split.',
  },
]

const verificationLedger = [
  {
    layer: 'Feature branches',
    status: 'Recorded green',
    detail: 'Focused UI, hook, library and SQL regression checks ran with each remediation stream.',
    state: 'done',
  },
  {
    layer: 'Integrated head',
    status: 'In progress',
    detail: 'Branches are being merged and independently reviewed before the final full gate.',
    state: 'active',
  },
  {
    layer: 'Local Chrome journey',
    status: 'Pending',
    detail: 'Lead → Care replay begins only after the integrated build is settled.',
    state: 'pending',
  },
  {
    layer: 'Production',
    status: 'Not deployed',
    detail: 'app.patina.cloud is unchanged; production mutation or deployment was not authorized.',
    state: 'locked',
  },
]

const severityLabels: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
}

function App() {
  const [activeCategory, setActiveCategory] = useState<'all' | CategoryId>('all')

  const visibleCategories = useMemo(
    () =>
      activeCategory === 'all'
        ? categories
        : categories.filter((category) => category.id === activeCategory),
    [activeCategory],
  )

  return (
    <>
      <a className="skip-link" href="#content">
        Skip to remediation summary
      </a>

      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Patina remediation report, top">
          <span aria-hidden="true">P</span>
          <span>Patina</span>
        </a>
        <nav aria-label="Presentation sections">
          <a href="#coverage">Coverage</a>
          <a href="#release">Release</a>
          <a href="#verification">Verification</a>
        </nav>
        <span className="report-date">31 JUL 2026</span>
      </header>

      <main id="content">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Client journey remediation · decision brief</p>
            <h1 id="hero-title">
              The workflow is now designed to <em>fail closed.</em>
            </h1>
            <p className="hero-deck">
              All 14 findings from the app.patina.cloud walkthrough have code-level
              remediations across financial truth, lifecycle continuity and the designer’s
              working experience.
            </p>
            <a className="text-link" href="#coverage">
              Review the complete ledger <ArrowRight aria-hidden="true" />
            </a>
          </div>

          <aside className="outcome-panel" aria-label="Current outcome and release status">
            <div className="outcome-rule" aria-hidden="true" />
            <p className="panel-kicker">
              <CircleDashed aria-hidden="true" /> Current state
            </p>
            <strong>14 / 14</strong>
            <h2>Findings addressed in feature branches</h2>
            <p>
              The release is not yet cleared. Final integrated local tests and the full
              browser replay wait for the merge to settle.
            </p>
            <div className="status-stamp">
              <LockKeyhole aria-hidden="true" />
              <span>
                <b>Production unchanged</b>
                No deployment was performed
              </span>
            </div>
          </aside>

          <div className="hero-facts" aria-label="Finding distribution">
            <div>
              <span>06</span>
              <p>Integrity & safety</p>
            </div>
            <div>
              <span>04</span>
              <p>Continuity & navigation</p>
            </div>
            <div>
              <span>04</span>
              <p>Feedback & accessibility</p>
            </div>
            <div className="hero-fact-note">
              <CircleAlert aria-hidden="true" />
              <p>2 critical · 5 high · 7 medium</p>
            </div>
          </div>
        </section>

        <section className="decision-band" aria-labelledby="decision-title">
          <p className="eyebrow">Release decision</p>
          <div>
            <h2 id="decision-title">Hold production until the integrated journey is proven.</h2>
            <p>
              The fixes belong together: proposal send, closeout and client identity form
              one integrity boundary. Merge them, run the complete automated gate, then
              repeat the audited path in local Chrome before requesting deployment approval.
            </p>
          </div>
          <div className="decision-mark" aria-hidden="true">
            <span>HOLD</span>
          </div>
        </section>

        <section className="section" id="coverage" aria-labelledby="coverage-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Complete remediation ledger</p>
              <h2 id="coverage-title">Every finding, with its fix and proof state.</h2>
            </div>
            <p>
              “Implemented” means code and focused coverage exist on the remediation branches.
              It does not mean deployed to production.
            </p>
          </div>

          <div className="category-filter" role="group" aria-label="Filter findings by category">
            <button
              type="button"
              className={activeCategory === 'all' ? 'active' : ''}
              aria-pressed={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
            >
              All 14
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={activeCategory === category.id ? 'active' : ''}
                aria-pressed={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.shortLabel}{' '}
                {findings.filter((finding) => finding.category === category.id).length}
              </button>
            ))}
          </div>

          <div className="category-stack" aria-live="polite">
            {visibleCategories.map((category) => {
              const Icon = category.icon
              const categoryFindings = findings.filter(
                (finding) => finding.category === category.id,
              )

              return (
                <section
                  className={`finding-group ${category.id}`}
                  id={`group-${category.id}`}
                  key={category.id}
                  aria-labelledby={`group-${category.id}-title`}
                >
                  <div className="group-head">
                    <span className="group-index">{category.index}</span>
                    <Icon aria-hidden="true" />
                    <div>
                      <h3 id={`group-${category.id}-title`}>{category.label}</h3>
                      <p>{category.description}</p>
                    </div>
                    <b>{String(categoryFindings.length).padStart(2, '0')}</b>
                  </div>

                  <div className="finding-list">
                    {categoryFindings.map((finding) => (
                      <article className="finding" key={finding.id}>
                        <div className="finding-meta">
                          <span className="finding-id">{finding.id}</span>
                          <span className={`severity ${finding.severity}`}>
                            {severityLabels[finding.severity]}
                          </span>
                          <span className="implementation-state">
                            <Check aria-hidden="true" /> Implemented
                          </span>
                        </div>
                        <div className="finding-title">
                          <h4>{finding.title}</h4>
                          <p>{finding.observed}</p>
                        </div>
                        <div className="finding-response">
                          <div>
                            <span>Remediation</span>
                            <p>{finding.remediation}</p>
                          </div>
                          <div className="verification-copy">
                            <span>Verification status</span>
                            <p>{finding.verification}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </section>

        <section className="section release-section" id="release" aria-labelledby="release-title">
          <div className="section-head release-head">
            <div>
              <p className="eyebrow">Prioritized recommendation</p>
              <h2 id="release-title">Release through three evidence gates.</h2>
            </div>
            <p>
              Priority reflects what must be proven first—not work to leave behind. All 14
              remediations remain in scope for the release candidate.
            </p>
          </div>

          <ol className="priority-list">
            {priorityPlan.map((item, index) => (
              <li key={item.priority}>
                <span className={`priority-badge ${item.priority.toLowerCase()}`}>
                  {item.priority}
                </span>
                <div className="priority-copy">
                  <span className="priority-scope">{item.scope}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
                <span className="priority-number" aria-hidden="true">
                  0{index + 1}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="section verification-section"
          id="verification"
          aria-labelledby="verification-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">Evidence ledger</p>
              <h2 id="verification-title">What is known—and what is deliberately pending.</h2>
            </div>
            <p>
              This distinction prevents feature-branch evidence from being mistaken for a
              production result.
            </p>
          </div>

          <div className="verification-grid">
            {verificationLedger.map((item) => (
              <article className={`verification-card ${item.state}`} key={item.layer}>
                <div className="verification-icon" aria-hidden="true">
                  {item.state === 'done' ? (
                    <FlaskConical />
                  ) : item.state === 'active' ? (
                    <CircleDashed />
                  ) : item.state === 'locked' ? (
                    <LockKeyhole />
                  ) : (
                    <MonitorCheck />
                  )}
                </div>
                <span>{item.layer}</span>
                <h3>{item.status}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="release-note">
            <LockKeyhole aria-hidden="true" />
            <div>
              <p className="eyebrow">Explicit boundary</p>
              <h3>No production deployment has occurred.</h3>
              <p>
                The next irreversible action is outside this remediation pass. Deploy only
                after integrated local/browser verification is complete and explicit
                production authorization is given.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>Patina · Client journey remediation</span>
        <span>Prepared 31 July 2026 · America/Chicago</span>
      </footer>
    </>
  )
}

export default App
