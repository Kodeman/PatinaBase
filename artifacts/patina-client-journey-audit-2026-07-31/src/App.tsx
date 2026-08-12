import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  FileWarning,
  Flag,
  ShieldAlert,
  Sparkles,
  TestTube2,
} from 'lucide-react'

type Severity = 'critical' | 'high' | 'medium'

type Finding = {
  id: string
  severity: Severity
  title: string
  moment: string
  evidence: string
  impact: string
  fix: string
}

const findings: Finding[] = [
  {
    id: 'F01',
    severity: 'critical',
    title: 'The sent proposal contains a zero-dollar payment schedule',
    moment: 'Proposal · payment milestones',
    evidence:
      'The editor showed “Project deposit · 100% · $13,200.” The live client preview and the final sent proposal showed “New Milestone · 0% · $0.” Blurring and waiting did not reconcile it.',
    impact:
      'The client can sign an agreement whose payment schedule contradicts the proposal total. This creates collection, contract, and trust risk.',
    fix:
      'Use one canonical milestone payload for editor, preview, and send. Block send when allocated percentage or amount does not equal 100% / proposal total.',
  },
  {
    id: 'F02',
    severity: 'critical',
    title: 'Closeout ignores install, invoice, and payment truth',
    moment: 'Project · close the book',
    evidence:
      'The project and Install both settled while the only FF&E line remained “Specified,” 0 of 1 installed, and “Bill 1 uninvoiced.” A checklist toggle was enough to claim final payment collected.',
    impact:
      'Projects can be marked complete with unfinished work and unbilled revenue, corrupting operations and financial reporting.',
    fix:
      'Derive closeout gates from source-of-truth states: all install lines complete or waived, zero uninvoiced lines, zero outstanding balance, and explicit exception reasons.',
  },
  {
    id: 'F03',
    severity: 'high',
    title: 'Client association is dropped when Direction begins',
    moment: 'Discovery → Direction',
    evidence:
      'The accepted lead became a Direction document labeled “No client linked — attach one.” The client had to be selected again and invited before the proposal could be sent.',
    impact:
      'A designer can draft against an orphaned document or link the wrong household, breaking the lead-to-client chain.',
    fix:
      'Carry the canonical client/person ID atomically through every document transition; treat a missing relationship as a transition failure, not a repair task.',
  },
  {
    id: 'F04',
    severity: 'high',
    title: 'An unrelated project timer follows the user into this project',
    moment: 'Active project and Care',
    evidence:
      'A persistent bottom tray offered to log 32 minutes to “Ashford Heights — main floor refresh” throughout the Harper Vale project and closeout.',
    impact:
      'Time can be billed to the wrong client, and the overlay competes with the active project’s controls.',
    fix:
      'Scope the timer to its owning document, require an explicit project switch, and collapse stale timers into a neutral global notification.',
  },
  {
    id: 'F05',
    severity: 'high',
    title: 'Dates shift across local and generated records',
    moment: 'Signature → Project',
    evidence:
      'On Jul 31 in America/Chicago, “Mark signed” defaulted to Aug 1. After correcting the signature to Jul 31, the project still opened with Start = Aug 1. Install was Nov 14 against a Nov 15 hard date.',
    impact:
      'Off-by-one dates weaken legal records, schedules, reporting, and client expectations.',
    fix:
      'Store date-only values as DATE, not UTC timestamps. Generate defaults from the studio timezone and add timezone-boundary tests.',
  },
  {
    id: 'F06',
    severity: 'high',
    title: 'The household sheet cannot be closed with its close control',
    moment: 'Direction · link client',
    evidence:
      'The “Close sheet” control was clicked twice and remained open. Escape dismissed it immediately.',
    impact:
      'Pointer-only users can become trapped in a modal sheet; repeated clicks erode confidence.',
    fix:
      'Wire the visible close affordance to the same dismiss action as Escape and add an interaction test for mouse, keyboard, focus return, and overlay click.',
  },
  {
    id: 'F07',
    severity: 'high',
    title: 'Send validation does not catch stale financial data',
    moment: 'Drafting Room · Send as-is',
    evidence:
      'The 83%-complete proposal could be sent without a warning about the zero-dollar client payment schedule or the remaining open mood-board facet.',
    impact:
      'The product knowingly exposes a client-facing preview yet does not validate the exact payload that will be signed.',
    fix:
      'Validate the immutable send snapshot, show blocking errors for financial contradictions, and show explicit non-blocking omissions separately.',
  },
  {
    id: 'F08',
    severity: 'medium',
    title: 'A transient not-found page appears during a valid transition',
    moment: 'Begin the Direction',
    evidence:
      'Immediately after clicking “Begin the Direction,” the document showed “No document answers to this name.” A later read recovered into the correct Direction state.',
    impact:
      'Users can interpret a successful conversion as data loss and abandon or retry the operation.',
    fix:
      'Keep the old document mounted behind a transition state until the new document is readable; never render terminal not-found during an in-flight mutation.',
  },
  {
    id: 'F09',
    severity: 'medium',
    title: 'The accepted lead’s next step is buried in Studio pulse',
    moment: 'Brief · Accept',
    evidence:
      'The original brief only said “Accepted — now in Discovery.” The new actionable document was absent from “Needs your hand” and appeared only after opening Studio pulse, under a new document ID.',
    impact:
      'The designer loses continuity at the first conversion and must rediscover where the client went.',
    fix:
      'Navigate directly to Discovery or render a prominent “Schedule discovery call” continuation on the settled brief.',
  },
  {
    id: 'F10',
    severity: 'medium',
    title: 'Autosaves and conversions provide delayed, ambiguous feedback',
    moment: 'Lead, product, phases, palette, send',
    evidence:
      'Several successful mutations looked stale for roughly 1–4 seconds: product count stayed at zero, phases read “no phases yet,” and buttons stayed in intermediate states without confirmation.',
    impact:
      'Users are invited to click again, navigate away, or assume failure—especially on financial and send actions.',
    fix:
      'Expose Saving/Saved states at the edited surface, disable duplicate submission, optimistically update safe summaries, and reconcile with an error state when persistence fails.',
  },
  {
    id: 'F11',
    severity: 'medium',
    title: 'Core discovery controls have weak accessible semantics',
    moment: 'Discovery essentials',
    evidence:
      'Room type, square footage, and household selects were unlabeled in the accessibility tree. Date entry required non-obvious segmented keyboard navigation before values would persist.',
    impact:
      'Screen-reader, keyboard, and automation users face avoidable friction in the only path that unlocks Direction.',
    fix:
      'Add explicit labels/ids and descriptions, provide a text-entry date fallback, and verify every required field with keyboard and screen-reader tests.',
  },
  {
    id: 'F12',
    severity: 'medium',
    title: 'Lead-capture values are visually clipped',
    moment: 'Capture a lead',
    evidence:
      'The contact email and one-line project description were cut off in the two-column modal at a normal desktop viewport.',
    impact:
      'The designer cannot confidently proof the exact values before creating the lead.',
    fix:
      'Use a responsive single-column breakpoint, allow horizontal value review, or show the full value on focus/hover.',
  },
  {
    id: 'F13',
    severity: 'medium',
    title: 'Household copy misreads a test-marked client name',
    moment: 'Direction and Project letterhead',
    evidence:
      '“UX Audit — Harper Vale” was transformed into “for the Audits” and actions such as “Message the Audits.”',
    impact:
      'Generated salutations can feel impersonal or nonsensical for businesses, couples, and nonstandard names.',
    fix:
      'Store a deliberate household/display name and fall back to the client name verbatim instead of inferring a plural surname.',
  },
  {
    id: 'F14',
    severity: 'medium',
    title: 'Production emits a React hydration error',
    moment: 'Browser console',
    evidence:
      'The session recorded minified React error #418 on app.patina.cloud, indicating server/client HTML did not hydrate consistently.',
    impact:
      'Hydration mismatches can cause flashes, lost event handlers, and nondeterministic UI—the same class of symptoms seen in transition states.',
    fix:
      'Reproduce with the production build and unminified diagnostics; audit date/time, random, and client-only conditional rendering at the document shell.',
  },
]

const journey = [
  { label: 'Lead', detail: '4 fields', state: 'pass' },
  { label: 'Brief', detail: 'Accepted', state: 'pass' },
  { label: 'Discovery', detail: '5 / 5', state: 'pass' },
  { label: 'Direction', detail: 'Client relink', state: 'warn' },
  { label: 'Proposal', detail: '$13.2k sent', state: 'warn' },
  { label: 'Signature', detail: 'Offline', state: 'pass' },
  { label: 'Project', detail: 'Task done', state: 'pass' },
  { label: 'Closeout', detail: 'Truth gap', state: 'fail' },
  { label: 'Care', detail: 'Ongoing', state: 'pass' },
]

const testSteps = [
  ['Capture lead', 'Pass', 'Created “UX Audit — Harper Vale”'],
  ['Accept brief', 'Pass with friction', 'Continuation moved to Studio pulse'],
  ['Complete discovery', 'Pass', '5 essentials persisted and seeded Direction'],
  ['Begin Direction', 'Pass with defect', 'Transient not-found; client link lost'],
  ['Build FF&E', 'Pass', '1 draft product · $3,200'],
  ['Build offer', 'Pass', '5 phases · $10,000 fees · 4 exclusions'],
  ['Set payments', 'Fail client view', 'Editor $13,200 / preview $0'],
  ['Write terms', 'Pass', 'Agreement and change-order terms saved'],
  ['Send proposal', 'Pass with defect', 'No validator caught stale payment data'],
  ['Record signature', 'Pass with defect', 'Default date shifted to Aug 1'],
  ['Open project', 'Pass', 'FF&E and schedule transferred'],
  ['Create + finish task', 'Pass', 'Task surfaced in both work views'],
  ['Close project', 'Fail integrity', 'Closed with item uninstalled and uninvoiced'],
]

const positives = [
  'Lead capture is intentionally lightweight and source-aware.',
  'Discovery’s five structured essentials make progress visible and seed later work.',
  'The Drafting Room supports nonlinear authoring and useful proposal defaults.',
  'The client preview is unusually valuable—when it reflects canonical data.',
  'The document spine preserves a legible lifecycle from Brief through Care.',
  'Closeout captures portfolio-ready narrative as part of the workflow.',
]

const recommendations = [
  {
    priority: 'P0',
    title: 'Make the send snapshot financially self-consistent',
    body: 'One canonical milestone model; preview the exact immutable payload; block contradictory totals before email or signature.',
  },
  {
    priority: 'P0',
    title: 'Gate closeout on operational source of truth',
    body: 'Installed/waived FF&E, zero uninvoiced lines, zero open balance, completed tasks, and auditable exceptions—not checklist claims.',
  },
  {
    priority: 'P0',
    title: 'Preserve identity across every conversion',
    body: 'Lead → person/client → document transitions must retain client_id in one transaction and fail closed if they cannot.',
  },
  {
    priority: 'P1',
    title: 'Normalize dates to the studio timezone',
    body: 'Use date-only storage and boundary tests so Jul 31 never becomes Aug 1 between signature and project creation.',
  },
  {
    priority: 'P1',
    title: 'Make persistence and transitions explicit',
    body: 'Saving/Saved/Error feedback, optimistic summaries, and a non-terminal transition shell instead of flashes of stale or missing content.',
  },
  {
    priority: 'P1',
    title: 'Contain timers and overlays to their owner',
    body: 'Never offer Ashford time inside Harper Vale; make project switching explicit and repair sheet close behavior.',
  },
  {
    priority: 'P2',
    title: 'Finish the accessibility and copy pass',
    body: 'Label native controls, support direct date entry, prevent clipped values, and store a deliberate household display name.',
  },
]

const severityMeta = {
  critical: { label: 'Critical', tone: 'var(--critical)' },
  high: { label: 'High', tone: 'var(--high)' },
  medium: { label: 'Medium', tone: 'var(--medium)' },
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">{children}</div>
}

function SectionTitle({ number, title, note }: { number: string; title: string; note?: string }) {
  return (
    <div className="section-title">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
    </div>
  )
}

function App() {
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const visibleFindings = useMemo(
    () => (filter === 'all' ? findings : findings.filter((finding) => finding.severity === filter)),
    [filter],
  )

  const counts = useMemo(
    () => ({
      critical: findings.filter((finding) => finding.severity === 'critical').length,
      high: findings.filter((finding) => finding.severity === 'high').length,
      medium: findings.filter((finding) => finding.severity === 'medium').length,
    }),
    [],
  )

  return (
    <main>
      <aside className="rail" aria-label="Presentation sections">
        <a className="wordmark" href="#top">P</a>
        <nav>
          {['summary', 'journey', 'findings', 'strengths', 'actions', 'evidence'].map((item, index) => (
            <a key={item} href={`#${item}`} aria-label={item}>
              {String(index + 1).padStart(2, '0')}
            </a>
          ))}
        </nav>
        <span className="rail-date">31·07·26</span>
      </aside>

      <section className="hero-section" id="top">
        <div className="hero-topline">
          <Eyebrow>Production experience audit</Eyebrow>
          <span>app.patina.cloud · Chrome</span>
        </div>
        <div className="hero-grid">
          <div>
            <div className="folio-mark" aria-hidden="true">
              <i /><i /><i />
            </div>
            <h1>From first lead<br />to closed book.</h1>
            <p className="hero-deck">
              A live, end-to-end review of Patina’s designer journey—captured, qualified, proposed,
              signed, worked, and closed in one production session.
            </p>
          </div>
          <div className="outcome-card">
            <div className="outcome-kicker"><CircleDot size={15} /> Outcome</div>
            <strong>Journey completed.</strong>
            <p>The workflow is compelling, but two financial/state-integrity failures make “done” unreliable.</p>
            <div className="severity-totals">
              <div><b>{counts.critical}</b><span>critical</span></div>
              <div><b>{counts.high}</b><span>high</span></div>
              <div><b>{counts.medium}</b><span>medium</span></div>
            </div>
          </div>
        </div>
        <a className="scroll-cue" href="#summary">Read the findings <ArrowDown size={16} /></a>
      </section>

      <section className="presentation-section" id="summary">
        <SectionTitle
          number="01"
          title="Executive readout"
          note="The experience is coherent. Its canonical state is not yet trustworthy."
        />
        <div className="summary-grid">
          <article className="editorial-quote critical-quote">
            <ShieldAlert size={25} />
            <h3>The client signed a $13,200 proposal with a $0 payment schedule.</h3>
            <p>Editor state and sent client state diverged at the most consequential moment.</p>
          </article>
          <article className="editorial-quote">
            <FileWarning size={25} />
            <h3>The book closed with work uninstalled and uninvoiced.</h3>
            <p>Checklist completion overruled the operational and payable state already visible on screen.</p>
          </article>
          <div className="summary-copy">
            <Eyebrow>Bottom line</Eyebrow>
            <p>
              Patina already has the bones of a differentiated operating system for design studios: a
              continuous document, structured discovery, live proposal preview, and a thoughtful Care
              handoff. The next milestone is not more surface area. It is making identity, money, dates,
              and lifecycle state agree everywhere.
            </p>
            <div className="tested-record">
              <TestTube2 size={18} />
              <div><b>UX Audit — Harper Vale</b><span>Created and closed Jul 31, 2026 · $13,200 proposal</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="presentation-section" id="journey">
        <SectionTitle number="02" title="The tested journey" note="Nine lifecycle states, one clearly labeled audit record." />
        <div className="journey-line" role="list">
          {journey.map((step, index) => (
            <div className={`journey-step ${step.state}`} key={step.label} role="listitem">
              <div className="journey-node">{index + 1}</div>
              {index < journey.length - 1 && <div className="journey-connector" />}
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          ))}
        </div>
        <div className="journey-details">
          <div>
            <Eyebrow>Record</Eyebrow>
            <dl>
              <div><dt>Client</dt><dd>UX Audit — Harper Vale</dd></div>
              <div><dt>Contact</dt><dd>kody+patina-ux-audit-20260731@kochaver.com</dd></div>
              <div><dt>Room</dt><dd>Library &amp; lounge · 450 sq ft</dd></div>
              <div><dt>Style</dt><dd>Warm Modern · Soft Contemporary</dd></div>
            </dl>
          </div>
          <div>
            <Eyebrow>Offer</Eyebrow>
            <dl>
              <div><dt>FF&amp;E</dt><dd>1 item · $3,200</dd></div>
              <div><dt>Design fees</dt><dd>5 phases · $10,000</dd></div>
              <div><dt>Proposal</dt><dd>$13,200 · sent and marked signed</dd></div>
              <div><dt>Closeout</dt><dd>Project settled · Care ongoing</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="presentation-section findings-section" id="findings">
        <SectionTitle number="03" title="Prioritized findings" note={`${findings.length} verified issues; filter by severity.`} />
        <div className="filter-row" role="group" aria-label="Filter findings">
          {(['all', 'critical', 'high', 'medium'] as const).map((value) => (
            <button
              type="button"
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
              key={value}
            >
              {value === 'all' ? `All ${findings.length}` : `${severityMeta[value].label} ${counts[value]}`}
            </button>
          ))}
        </div>
        <div className="finding-list">
          {visibleFindings.map((finding) => (
            <article className={`finding-card ${finding.severity}`} key={finding.id}>
              <div className="finding-index">
                <span>{finding.id}</span>
                <b style={{ color: severityMeta[finding.severity].tone }}>{severityMeta[finding.severity].label}</b>
              </div>
              <div className="finding-main">
                <small>{finding.moment}</small>
                <h3>{finding.title}</h3>
                <p>{finding.evidence}</p>
              </div>
              <div className="finding-impact">
                <div><b>Why it matters</b><p>{finding.impact}</p></div>
                <div><b>Recommended move</b><p>{finding.fix}</p></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="presentation-section" id="strengths">
        <SectionTitle number="04" title="What is already working" note="Protect these qualities while repairing the data contract." />
        <div className="strength-grid">
          {positives.map((positive, index) => (
            <article key={positive}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <CheckCircle2 size={21} />
              <p>{positive}</p>
            </article>
          ))}
        </div>
        <div className="design-principle">
          <Sparkles size={22} />
          <p><b>Product principle:</b> keep the ritual and the editorial calm; make the underlying state brutally explicit.</p>
        </div>
      </section>

      <section className="presentation-section" id="actions">
        <SectionTitle number="05" title="Recommended sequence" note="Stabilize money and lifecycle truth before adding more workflow breadth." />
        <div className="recommendation-list">
          {recommendations.map((recommendation, index) => (
            <article key={recommendation.title}>
              <div className="rec-number">{String(index + 1).padStart(2, '0')}</div>
              <div className={`priority ${recommendation.priority.toLowerCase()}`}>{recommendation.priority}</div>
              <div><h3>{recommendation.title}</h3><p>{recommendation.body}</p></div>
              <ArrowRight size={19} />
            </article>
          ))}
        </div>
      </section>

      <section className="presentation-section evidence-section" id="evidence">
        <SectionTitle number="06" title="Verification matrix" note="Observed in production on the logged-in designer account." />
        <div className="matrix-wrap">
          <table>
            <thead><tr><th>Moment</th><th>Result</th><th>Observed state</th></tr></thead>
            <tbody>
              {testSteps.map(([moment, result, detail]) => (
                <tr key={moment}>
                  <td>{moment}</td>
                  <td><span className={`result ${result.toLowerCase().replaceAll(' ', '-')}`}>{result}</span></td>
                  <td>{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="method-grid">
          <div>
            <Eyebrow>Method</Eyebrow>
            <p>Live production walkthrough in Chrome, visible-state checks after each transition, targeted retests, full-page captures at key milestones, and console review.</p>
          </div>
          <div>
            <Eyebrow>Boundaries</Eyebrow>
            <p>No real purchase or payment was made. The unrelated Ashford timer was neither logged nor discarded. Proposal and client invite were sent only to the controlled Kochaver plus-address.</p>
          </div>
          <div>
            <Eyebrow>Console</Eyebrow>
            <p>One production React hydration error (#418) was captured during the session.</p>
          </div>
        </div>
        <footer>
          <div><Flag size={17} /> Patina client journey audit</div>
          <span>Prepared Jul 31, 2026 · America/Chicago</span>
        </footer>
      </section>
    </main>
  )
}

export default App
