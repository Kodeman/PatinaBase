import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  KeyRound,
  Mail,
  Monitor,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Undo2,
} from 'lucide-react'
import './App.css'

type PortalId = 'designer' | 'client' | 'admin'
type DirectionId = 'provenance' | 'threshold' | 'quiet'
type AuthState = 'email' | 'code' | 'error' | 'qr' | 'qr-expired' | 'apple' | 'password' | 'success'
type Viewport = 'desktop' | 'mobile'

type PortalConfig = {
  id: PortalId
  shortName: string
  portalName: string
  eyebrow: string
  title: string
  description: string
  defaultPath: string
  email: string
  accent: string
}

type Direction = {
  id: DirectionId
  order: string
  title: string
  thesis: string
  signature: string
  strengths: string[]
  tradeoffs: string[]
  palette: { name: string; value: string }[]
}

type DirectionReviewState = {
  brand: number
  clarity: number
  trust: number
  confidence: number
  notes: string
}

type ReviewState = {
  preferred: DirectionId | ''
  directions: Record<DirectionId, DirectionReviewState>
  finalNotes: string
}

const portals: Record<PortalId, PortalConfig> = {
  designer: {
    id: 'designer',
    shortName: 'Designer',
    portalName: 'Designer Studio',
    eyebrow: 'THE STUDIO',
    title: 'Welcome back to the studio.',
    description: 'Your projects, proposals, and workshop records are waiting.',
    defaultPath: '/desk',
    email: 'studio@northline.com',
    accent: '#C4A57B',
  },
  client: {
    id: 'client',
    shortName: 'Client',
    portalName: 'Client Portal',
    eyebrow: 'YOUR HOME',
    title: 'Good to see you.',
    description: 'Your project, decisions, and orders are ready when you are.',
    defaultPath: '/projects',
    email: 'home@oakstreet.com',
    accent: '#8FA18B',
  },
  admin: {
    id: 'admin',
    shortName: 'Admin',
    portalName: 'Admin Operations',
    eyebrow: 'PATINA OPERATIONS',
    title: 'Keep the work moving.',
    description: 'Sign in to review the people, orders, and systems behind Patina.',
    defaultPath: '/dashboard',
    email: 'operations@patina.cloud',
    accent: '#8397A8',
  },
}

const directions: Direction[] = [
  {
    id: 'provenance',
    order: 'A',
    title: 'Provenance Card',
    thesis: 'A sign-in surface built like the material tags and maker records that follow a well-made piece through its life.',
    signature: 'Layered material samples frame a functional Strata progress mark.',
    strengths: ['Most recognizably Patina', 'Warm across all three audiences', 'Clear hierarchy without a generic card'],
    tradeoffs: ['Requires careful material texture restraint', 'A little more front-end craft than the quiet option'],
    palette: [
      { name: 'Paper', value: '#FAF7F2' },
      { name: 'White oak', value: '#C4A57B' },
      { name: 'Aged oak', value: '#8B7355' },
      { name: 'Mocha', value: '#5C4A3C' },
      { name: 'Charcoal', value: '#2C2926' },
    ],
  },
  {
    id: 'threshold',
    order: 'B',
    title: 'Joined Threshold',
    thesis: 'The first screen behaves like a joint: a dark workshop plane and a warm paper plane meet precisely, without ornament.',
    signature: 'An interlocking seam makes the transition into the portal tangible.',
    strengths: ['Strongest visual point of view', 'Feels secure and deliberate', 'Memorable without relying on photography'],
    tradeoffs: ['Highest responsive-layout risk', 'Dark ground may feel formal for homeowners'],
    palette: [
      { name: 'Charcoal', value: '#26231F' },
      { name: 'Walnut', value: '#4F3D31' },
      { name: 'Clay', value: '#C4A57B' },
      { name: 'Linen', value: '#EFE9DD' },
      { name: 'Paper', value: '#FCFAF6' },
    ],
  },
  {
    id: 'quiet',
    order: 'C',
    title: 'Quiet Room',
    thesis: 'A calm architectural field gives the sign-in flow the measured clarity of a room plan laid out on a worktable.',
    signature: 'Room-plan lines align the content and become a subtle success path.',
    strengths: ['Calmest and most accessible', 'Lowest implementation risk', 'Adapts cleanly to small screens'],
    tradeoffs: ['Least tactile of the three', 'Could feel like architecture software without the copy and material details'],
    palette: [
      { name: 'Plan paper', value: '#F7F5F0' },
      { name: 'Graphite', value: '#34312D' },
      { name: 'Quiet ink', value: '#65594E' },
      { name: 'Dusty blue', value: '#8B9CAD' },
      { name: 'Pearl', value: '#E5E2DD' },
    ],
  },
]

const initialReview: ReviewState = {
  preferred: '',
  directions: {
    provenance: { brand: 0, clarity: 0, trust: 0, confidence: 0, notes: '' },
    threshold: { brand: 0, clarity: 0, trust: 0, confidence: 0, notes: '' },
    quiet: { brand: 0, clarity: 0, trust: 0, confidence: 0, notes: '' },
  },
  finalNotes: '',
}

const stateOptions: { id: AuthState; label: string }[] = [
  { id: 'email', label: 'Email code' },
  { id: 'code', label: 'Code entry' },
  { id: 'error', label: 'Friendly error' },
  { id: 'qr', label: 'QR active' },
  { id: 'qr-expired', label: 'QR expired' },
  { id: 'apple', label: 'Apple pending' },
  { id: 'password', label: 'Password open' },
  { id: 'success', label: 'Success' },
]

function StrataMark({ size = 34, light = false }: { size?: number; light?: boolean }) {
  const color = light ? '#FAF7F2' : '#8B7355'
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path d="M4 10H32" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M4 18H25" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M4 26H18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg className="apple-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="section-label">
      <StrataMark size={24} />
      <span>{children}</span>
    </div>
  )
}

function QrPattern() {
  const cells = useMemo(() => {
    const result: { x: number; y: number }[] = []
    for (let y = 0; y < 21; y += 1) {
      for (let x = 0; x < 21; x += 1) {
        const finder =
          (x < 7 && y < 7) ||
          (x > 13 && y < 7) ||
          (x < 7 && y > 13)
        const finderOn = finder && (x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5))
        const dataOn = !finder && ((x * 3 + y * 5 + x * y) % 7 < 3)
        if (finderOn || dataOn) result.push({ x, y })
      }
    }
    return result
  }, [])
  return (
    <svg className="qr-pattern" viewBox="0 0 21 21" aria-label="Example Patina sign-in QR code">
      <rect width="21" height="21" fill="#fff" />
      {cells.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width="1" height="1" fill="#2C2926" />
      ))}
    </svg>
  )
}

function App() {
  const [review, setReview] = useState<ReviewState>(() => {
    try {
      const saved = localStorage.getItem('patina-login-direction-review-v1')
      return saved ? { ...initialReview, ...JSON.parse(saved) } : initialReview
    } catch {
      return initialReview
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('patina-login-direction-review-v1', JSON.stringify(review))
    } catch {
      // The review still works when local storage is unavailable.
    }
  }, [review])

  return (
    <div className="presentation-shell">
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="Patina login review home">
          PATINA
        </a>
        <nav aria-label="Presentation sections">
          <a href="#audit">Audit</a>
          <a href="#directions">Directions</a>
          <a href="#behavior">Behavior</a>
          <a href="#feedback">Feedback</a>
        </nav>
        <span className="masthead-date">AUG 05 · 2026</span>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="kicker">PORTAL ENTRY · DIRECTION REVIEW</p>
            <h1>A better<br />way in.</h1>
            <p className="hero-deck">
              The first screen should feel like Patina: warm, exact, and built to last. This review fixes the way in before we choose the way it looks.
            </p>
            <a className="text-link" href="#audit">
              Start with what users see today <ArrowDown size={16} />
            </a>
          </div>
          <div className="hero-object" aria-hidden="true">
            <div className="sample-stack sample-stack-back" />
            <div className="sample-stack sample-stack-middle" />
            <div className="hero-ticket">
              <div className="ticket-topline">
                <StrataMark size={42} />
                <span>ENTRY STUDY</span>
              </div>
              <div className="ticket-title">Where the work<br />begins.</div>
              <div className="ticket-meta">
                <span>DESIGNER</span><span>CLIENT</span><span>ADMIN</span>
              </div>
            </div>
          </div>
        </section>

        <section className="brief-strip" aria-label="Review brief">
          <div><span>THE ASK</span><strong>More Patina, less template.</strong></div>
          <div><span>THE BEHAVIOR</span><strong>Code first. No dead ends.</strong></div>
          <div><span>THE DECISION</span><strong>One system, three expressions.</strong></div>
        </section>

        <section className="content-section audit-section" id="audit">
          <SectionLabel>What users meet today</SectionLabel>
          <div className="section-intro split-intro">
            <h2>The pieces exist.<br />The hierarchy does not.</h2>
            <p>
              The current screens already support QR, Apple, password, and email code. But the most accessible method is buried, the portals do not share one visual language, and successful sessions do not all leave the page the same way.
            </p>
          </div>

          <div className="audit-grid">
            <CurrentScreen portal="designer" />
            <CurrentScreen portal="client" />
            <CurrentScreen portal="admin" />
          </div>

          <div className="finding-list">
            <Finding number="01" title="The requested order is inverted" detail="QR is the hero. Email is collapsed and opens on password, with one-time code behind another toggle." />
            <Finding number="02" title="The copy speaks system, not person" detail="“OAuth callback,” “authentication failed,” and raw provider messages describe implementation rather than a next step." />
            <Finding number="03" title="Success takes different roads" detail="Password and QR force a fresh page load. OTP and OAuth use soft navigation, and designer/admin drop the original return path in parts of the flow." />
            <Finding number="04" title="Three portals, two visual languages" detail="Designer is editorial. Client and admin are generic card layouts. None makes Patina’s materials or provenance part of the welcome." />
          </div>
        </section>

        <section className="content-section order-section">
          <SectionLabel>One clear order</SectionLabel>
          <div className="order-layout">
            <div>
              <p className="kicker">NON-NEGOTIABLE BEHAVIOR</p>
              <h2>Start with the method that asks the least.</h2>
            </div>
            <ol className="method-order">
              <li><span>Primary</span><strong>Email one-time code</strong><p>No password to remember. The field is open on arrival.</p></li>
              <li><span>Second</span><strong>QR code</strong><p>Fast handoff for people already signed into the Patina app.</p></li>
              <li><span>Third</span><strong>Apple</strong><p>One provider now; Google and Microsoft fit here later.</p></li>
              <li><span>Optional</span><strong>Email and password</strong><p>Available, familiar, and collapsed until someone asks for it.</p></li>
            </ol>
          </div>
        </section>

        <section className="directions-section" id="directions">
          <div className="content-section directions-heading">
            <SectionLabel>Three ways to express it</SectionLabel>
            <div className="section-intro split-intro">
              <h2>Same honest behavior.<br />Three distinct rooms.</h2>
              <p>Use the controls inside each direction to compare portals, screen sizes, and the states that usually get left out of a mockup.</p>
            </div>
          </div>
          {directions.map((direction) => (
            <DirectionReview key={direction.id} direction={direction} />
          ))}
        </section>

        <section className="content-section recommendation-section">
          <div className="recommendation-card">
            <div className="recommendation-mark"><StrataMark size={62} light /></div>
            <div>
              <p className="kicker light">FEEDBACK SYNTHESIS</p>
              <h2>Provenance structure.<br />Quiet Room restraint.</h2>
            </div>
            <div className="recommendation-copy">
              <p>Provenance Card led on clarity and trust. Quiet Room led on brand fit. The final direction should keep A’s layered, confident structure and bring in C’s calmer architectural restraint.</p>
              <p>The shared welcome line is now: “A workshop for interior designers, their clients, and the makers they trust.”</p>
            </div>
          </div>

          <div className="comparison-table" role="table" aria-label="Direction comparison">
            <div className="comparison-row comparison-head" role="row">
              <span role="columnheader">Direction</span><span role="columnheader">Brand</span><span role="columnheader">Clarity</span><span role="columnheader">Trust</span><span role="columnheader">Build risk</span>
            </div>
            <ComparisonRow name="A · Provenance Card" values={['Strongest', 'High', 'High', 'Moderate']} recommended />
            <ComparisonRow name="B · Joined Threshold" values={['Boldest', 'Medium', 'High', 'Highest']} />
            <ComparisonRow name="C · Quiet Room" values={['Quiet', 'Highest', 'High', 'Lowest']} />
          </div>
        </section>

        <section className="content-section behavior-section" id="behavior">
          <SectionLabel>Behavior before decoration</SectionLabel>
          <div className="section-intro split-intro">
            <h2>A signed-in person<br />should never be stranded.</h2>
            <p>The production change should use one safe return path from the first email field through the final page load. The design makes that handoff visible and recoverable.</p>
          </div>

          <div className="flow-diagram" aria-label="Recommended authentication flow">
            <FlowStep label="Choose a method" detail="Code · QR · Apple · Password" />
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <FlowStep label="Create session" detail="Confirm the browser has it" />
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <FlowStep label="Open the right place" detail="Full-page, safe return path" />
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <FlowStep label="Offer a way through" detail="Continue link if delayed" />
          </div>

          <div className="behavior-grid">
            <article className="behavior-card">
              <p className="kicker">REDIRECT CONTRACT</p>
              <h3>One destination, carried all the way.</h3>
              <ul>
                <li><span>Designer</span><code>/desk</code></li>
                <li><span>Client</span><code>/projects</code></li>
                <li><span>Admin</span><code>/dashboard</code></li>
              </ul>
              <p>Preserve a sanitized <code>callbackUrl</code> through code entry, resend, QR, and Apple. After the session is confirmed, use a full-page replacement rather than a soft router transition.</p>
            </article>
            <article className="behavior-card copy-card">
              <p className="kicker">COPY CONTRACT</p>
              <h3>Say what happened. Give the next move.</h3>
              <CopyExample bad="OAuth Callback Error" good="Apple sign-in didn’t finish. Try again, or use a code by email." />
              <CopyExample bad="Invalid token" good="That code has expired or isn’t correct. Request a new code and try again." />
              <CopyExample bad="Failed to generate QR session" good="We couldn’t make a QR code. Refresh it, or use a code by email." />
            </article>
          </div>
        </section>

        <ReviewWorksheet review={review} setReview={setReview} />
      </main>

      <footer>
        <span>PATINA · WHERE TIME ADDS VALUE</span>
        <span>LOGIN DIRECTION REVIEW · 2026</span>
      </footer>
    </div>
  )
}

function CurrentScreen({ portal: portalId }: { portal: PortalId }) {
  const portal = portals[portalId]
  const isDesigner = portalId === 'designer'
  return (
    <article className={`current-screen current-${portalId}`}>
      <div className="current-browserbar"><i /><i /><i /><span>{portal.portalName}</span></div>
      <div className={`current-body ${isDesigner ? 'editorial-current' : ''}`}>
        <h3>{isDesigner ? 'Sign In' : `Patina ${portal.shortName} Portal`}</h3>
        <p>{isDesigner ? 'PATINA DESIGNER PORTAL' : 'Sign in to continue'}</p>
        <div className="fake-qr"><QrCode size={45} /><small>Scan with the Patina iOS app</small></div>
        <div className="fake-divider">OR CONTINUE WITH</div>
        <button tabIndex={-1}><AppleMark /> Apple</button>
        <div className="fake-email"><Mail size={14} /> Sign in with email <ChevronDown size={13} /></div>
      </div>
      <div className="current-callout">QR leads · code is two choices away</div>
    </article>
  )
}

function Finding({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <article className="finding-row">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </article>
  )
}

function DirectionReview({ direction }: { direction: Direction }) {
  const [portalId, setPortalId] = useState<PortalId>('designer')
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [authState, setAuthState] = useState<AuthState>('email')
  const portal = portals[portalId]

  return (
    <section className={`direction-block direction-${direction.id}`} id={`direction-${direction.id}`}>
      <div className="content-section direction-meta">
        <div className="direction-number">{direction.order}</div>
        <div className="direction-title">
          <div className="title-line">
            <h2>{direction.title}</h2>
            {direction.id === 'provenance' && <span className="recommended-pill">RECOMMENDED</span>}
          </div>
          <p>{direction.thesis}</p>
        </div>
        <div className="direction-signature"><span>SIGNATURE</span><strong>{direction.signature}</strong></div>
      </div>

      <div className="content-section mock-controls" aria-label={`${direction.title} mockup controls`}>
        <div className="control-group">
          <span>PORTAL</span>
          <div className="segmented-control">
            {(Object.keys(portals) as PortalId[]).map((id) => (
              <button key={id} type="button" aria-pressed={portalId === id} onClick={() => setPortalId(id)}>{portals[id].shortName}</button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <span>VIEW</span>
          <div className="segmented-control icon-control">
            <button type="button" aria-label="Desktop mockup" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}><Monitor size={15} /></button>
            <button type="button" aria-label="Mobile mockup" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}><Smartphone size={15} /></button>
          </div>
        </div>
        <div className="control-group state-control">
          <span>STATE</span>
          <div className="state-pills">
            {stateOptions.map((option) => (
              <button key={option.id} type="button" aria-pressed={authState === option.id} onClick={() => setAuthState(option.id)}>{option.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="content-section">
        <Mockup direction={direction.id} portal={portal} viewport={viewport} authState={authState} setAuthState={setAuthState} />
      </div>

      <div className="content-section direction-notes">
        <div>
          <p className="kicker">PALETTE</p>
          <div className="palette-row">
            {direction.palette.map((color) => (
              <div className="swatch-item" key={color.name}><i style={{ background: color.value }} /><span>{color.name}<small>{color.value}</small></span></div>
            ))}
          </div>
        </div>
        <div className="pros-cons">
          <div><p className="kicker">STRENGTHS</p><ul>{direction.strengths.map((item) => <li key={item}><Check size={14} />{item}</li>)}</ul></div>
          <div><p className="kicker">TRADEOFFS</p><ul>{direction.tradeoffs.map((item) => <li key={item}><ArrowRight size={14} />{item}</li>)}</ul></div>
        </div>
      </div>
    </section>
  )
}

function Mockup({ direction, portal, viewport, authState, setAuthState }: { direction: DirectionId; portal: PortalConfig; viewport: Viewport; authState: AuthState; setAuthState: (state: AuthState) => void }) {
  return (
    <div className={`mockup-frame viewport-${viewport}`}>
      <div className="mock-browserbar">
        <div><i /><i /><i /></div>
        <span>{portal.id === 'designer' ? 'app' : portal.id}.patina.cloud/auth/signin</span>
        <ShieldCheck size={14} />
      </div>
      <div className={`mockup-canvas canvas-${direction}`} style={{ '--portal-accent': portal.accent } as React.CSSProperties}>
        {direction === 'provenance' && <ProvenanceScene portal={portal} />}
        {direction === 'threshold' && <ThresholdScene portal={portal} />}
        {direction === 'quiet' && <QuietScene portal={portal} />}
        <AuthPanel direction={direction} portal={portal} state={authState} setState={setAuthState} />
      </div>
    </div>
  )
}

function ProvenanceScene({ portal }: { portal: PortalConfig }) {
  return (
    <div className="scene scene-provenance" aria-hidden="true">
      <div className="material-card linen-card" />
      <div className="material-card oak-card" />
      <div className="provenance-label">
        <div><StrataMark size={38} /><span>{portal.eyebrow}</span></div>
        <h3 className="workshop-line">A workshop for<br />interior designers,<br />their clients, and<br />the makers they trust.</h3>
        <p>One honest threshold for everyone who imagines, commissions, and makes the work.</p>
        <small>WHERE TIME ADDS VALUE</small>
      </div>
    </div>
  )
}

function ThresholdScene({ portal }: { portal: PortalConfig }) {
  return (
    <div className="scene scene-threshold" aria-hidden="true">
      <div className="joinery-lines"><i /><i /><i /></div>
      <div className="threshold-copy">
        <StrataMark size={42} light />
        <span>{portal.eyebrow}</span>
        <h3>Every good piece<br />starts with a sound joint.</h3>
        <p>One secure threshold for the people who make, manage, and live with the work.</p>
      </div>
      <div className="dovetail-notch notch-one" /><div className="dovetail-notch notch-two" /><div className="dovetail-notch notch-three" />
    </div>
  )
}

function QuietScene({ portal }: { portal: PortalConfig }) {
  return (
    <div className="scene scene-quiet" aria-hidden="true">
      <svg className="floor-plan" viewBox="0 0 700 640" preserveAspectRatio="none">
        <path d="M60 80H640V560H60V80ZM60 330H340V560M340 80V240H640M460 240V560M340 420H460" />
        <path d="M60 150h24M60 430h24M316 560v-24M460 264h24M340 216h-24" />
        <path className="plan-arc" d="M340 330a70 70 0 0 1-70 70M460 420a65 65 0 0 0 65 65" />
      </svg>
      <div className="plan-label">
        <StrataMark size={32} />
        <span>{portal.eyebrow}</span>
        <h3>A clear plan<br />starts here.</h3>
        <p>Quiet enough to understand at a glance. Strong enough to guide the next step.</p>
      </div>
    </div>
  )
}

function AuthPanel({ direction, portal, state, setState }: { direction: DirectionId; portal: PortalConfig; state: AuthState; setState: (state: AuthState) => void }) {
  if (state === 'success') {
    return (
      <div className={`auth-panel auth-${direction} success-panel`} role="status">
        <div className="success-mark"><Check size={30} /></div>
        <p className="auth-eyebrow">SESSION CONFIRMED</p>
        <h3>You’re in.</h3>
        <p>Opening {portal.portalName}…</p>
        <div className="progress-track"><i /></div>
        <button className="continue-link" type="button">Continue to {portal.defaultPath} <ArrowRight size={15} /></button>
        <small>If the page does not open, use the link above.</small>
      </div>
    )
  }

  const emailOpen = ['email', 'code', 'error'].includes(state)
  return (
    <div className={`auth-panel auth-${direction}`}>
      <div className="auth-brandline">
        <span className="auth-wordmark">PATINA</span>
        <span>{portal.portalName}</span>
      </div>
      <div className="auth-heading">
        <p className="auth-eyebrow">{portal.eyebrow}</p>
        <h3>{portal.title}</h3>
        <p>{portal.description}</p>
      </div>

      <div className={`method-block primary-method ${emailOpen ? 'method-open' : ''}`}>
        <button className="method-heading" type="button" onClick={() => setState('email')} aria-expanded={emailOpen}>
          <span className="method-icon"><Mail size={16} /></span>
          <span><strong>Email one-time code</strong><small>Recommended · no password needed</small></span>
          {!emailOpen && <ChevronDown size={15} />}
        </button>
        {emailOpen && (
          <div className="method-content">
            {state === 'code' || state === 'error' ? (
              <CodeEntry portal={portal} hasError={state === 'error'} setState={setState} />
            ) : (
              <>
                <label>Email address</label>
                <div className="input-shell"><input aria-label="Email address" defaultValue={portal.email} /><Check size={14} /></div>
                <button className="primary-action" type="button" onClick={() => setState('code')}>Send me a code <ArrowRight size={15} /></button>
                <p className="privacy-note">We’ll send a six-digit code. It expires in ten minutes.</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className={`method-block ${state === 'qr' || state === 'qr-expired' ? 'method-open' : ''}`}>
        <button className="method-heading" type="button" onClick={() => setState('qr')} aria-expanded={state === 'qr' || state === 'qr-expired'}>
          <span className="method-icon"><QrCode size={16} /></span>
          <span><strong>Scan a QR code</strong><small>Use the Patina app</small></span>
          <ChevronDown size={15} />
        </button>
        {(state === 'qr' || state === 'qr-expired') && (
          <div className="method-content qr-content">
            {state === 'qr' ? (
              <>
                <div className="qr-shell"><QrPattern /></div>
                <p><Smartphone size={14} /> Scan with the Patina app</p>
                <small>Code expires in 04:38</small>
                <button className="demo-success" type="button" onClick={() => setState('success')}>Preview approved state</button>
              </>
            ) : (
              <div className="expired-state">
                <QrCode size={32} />
                <strong>This QR code has expired.</strong>
                <p>Make a fresh code, or use email above.</p>
                <button type="button" onClick={() => setState('qr')}><RefreshCw size={14} /> Make a new code</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`method-block ${state === 'apple' ? 'method-open' : ''}`}>
        <button className="method-heading apple-button" type="button" onClick={() => setState('apple')}>
          <span className="method-icon"><AppleMark /></span>
          <span><strong>{state === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}</strong><small>{state === 'apple' ? 'Keep this window open' : 'Private and familiar'}</small></span>
          {state === 'apple' ? <i className="spinner" /> : <ArrowRight size={15} />}
        </button>
      </div>

      <div className={`method-block password-method ${state === 'password' ? 'method-open' : ''}`}>
        <button className="method-heading" type="button" onClick={() => setState(state === 'password' ? 'email' : 'password')} aria-expanded={state === 'password'}>
          <span className="method-icon"><KeyRound size={16} /></span>
          <span><strong>Use email and password</strong><small>For existing password users</small></span>
          <ChevronDown size={15} />
        </button>
        {state === 'password' && (
          <div className="method-content password-content">
            <label>Email address</label>
            <input aria-label="Password email address" defaultValue={portal.email} />
            <label>Password</label>
            <input aria-label="Password" type="password" defaultValue="heirloom" />
            <div className="password-actions"><a href="#feedback">Forgot password?</a><button className="primary-action" type="button" onClick={() => setState('success')}>Sign in</button></div>
          </div>
        )}
      </div>

      <div className="auth-footer"><ShieldCheck size={13} /> Secure sign-in · Need help? <a href="#feedback">Contact Patina</a></div>
    </div>
  )
}

function CodeEntry({ portal, hasError, setState }: { portal: PortalConfig; hasError: boolean; setState: (state: AuthState) => void }) {
  return (
    <div className="code-entry">
      <div className="sent-line"><span>Code sent to {portal.email}</span><button type="button" onClick={() => setState('email')}>Edit</button></div>
      <label>Six-digit code</label>
      <div className={`code-boxes ${hasError ? 'code-error' : ''}`} aria-label="Six-digit one-time code">
        {(hasError ? ['8', '4', '', '', '', ''] : ['8', '4', '2', '7', '1', '6']).map((value, index) => <span key={index}>{value}</span>)}
      </div>
      {hasError && <div className="inline-error" role="alert"><strong>That code has expired or isn’t correct.</strong><span>Request a new code and try again.</span></div>}
      <button className="primary-action" type="button" onClick={() => setState(hasError ? 'code' : 'success')}>{hasError ? 'Request a new code' : 'Open my portal'} <ArrowRight size={15} /></button>
      <button className="resend-link" type="button" onClick={() => setState('error')}>{hasError ? 'Use a different email' : 'Resend available in 0:42'}</button>
    </div>
  )
}

function ComparisonRow({ name, values, recommended = false }: { name: string; values: string[]; recommended?: boolean }) {
  return (
    <div className={`comparison-row ${recommended ? 'comparison-recommended' : ''}`} role="row">
      <span role="cell">{name}{recommended && <small>OUR PICK</small>}</span>
      {values.map((value) => <span role="cell" key={value}>{value}</span>)}
    </div>
  )
}

function FlowStep({ label, detail }: { label: string; detail: string }) {
  return <div className="flow-step"><span>{label}</span><small>{detail}</small></div>
}

function CopyExample({ bad, good }: { bad: string; good: string }) {
  return (
    <div className="copy-example">
      <div><span>BEFORE</span><del>{bad}</del></div>
      <ArrowRight size={15} />
      <div><span>PATINA</span><strong>{good}</strong></div>
    </div>
  )
}

function ReviewWorksheet({ review, setReview }: { review: ReviewState; setReview: React.Dispatch<React.SetStateAction<ReviewState>> }) {
  const [notice, setNotice] = useState('')

  const summary = useMemo(() => {
    const lines = ['PATINA PORTAL LOGIN · DIRECTION FEEDBACK', '']
    lines.push(`Preferred direction: ${review.preferred ? directions.find((d) => d.id === review.preferred)?.title : 'Not selected'}`)
    directions.forEach((direction) => {
      const values = review.directions[direction.id]
      lines.push('', `${direction.order} · ${direction.title}`)
      lines.push(`Brand fit: ${values.brand || '—'}/5 · Clarity: ${values.clarity || '—'}/5 · Trust: ${values.trust || '—'}/5 · Confidence: ${values.confidence || '—'}/5`)
      lines.push(`Notes: ${values.notes || '—'}`)
    })
    lines.push('', `Final notes: ${review.finalNotes || '—'}`)
    return lines.join('\n')
  }, [review])

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary)
      setNotice('Feedback copied.')
    } catch {
      const area = document.createElement('textarea')
      area.value = summary
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
      setNotice('Feedback copied.')
    }
  }

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...review }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'patina-login-direction-feedback.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('Feedback downloaded.')
  }

  const updateDirection = (id: DirectionId, patch: Partial<DirectionReviewState>) => {
    setReview((current) => ({
      ...current,
      directions: { ...current.directions, [id]: { ...current.directions[id], ...patch } },
    }))
  }

  return (
    <section className="feedback-section" id="feedback">
      <div className="content-section">
        <SectionLabel>Patina team review</SectionLabel>
        <div className="section-intro split-intro">
          <h2>What feels like<br />the right way in?</h2>
          <p>Your notes stay in this browser. Copy the summary or download the file when you are ready to share it with the team.</p>
        </div>

        <div className="preferred-choice">
          <p className="kicker">PREFERRED DIRECTION</p>
          <div>
            {directions.map((direction) => (
              <label key={direction.id} className={review.preferred === direction.id ? 'selected' : ''}>
                <input type="radio" name="preferred" value={direction.id} checked={review.preferred === direction.id} onChange={() => setReview((current) => ({ ...current, preferred: direction.id }))} />
                <span>{direction.order}</span><strong>{direction.title}</strong>{direction.id === 'provenance' && <small>RECOMMENDED</small>}
              </label>
            ))}
          </div>
        </div>

        <div className="review-grid">
          {directions.map((direction) => {
            const values = review.directions[direction.id]
            return (
              <article className="review-card" key={direction.id}>
                <div className="review-card-heading"><span>{direction.order}</span><h3>{direction.title}</h3></div>
                <RatingRow label="Feels like Patina" value={values.brand} onChange={(brand) => updateDirection(direction.id, { brand })} />
                <RatingRow label="Clear at a glance" value={values.clarity} onChange={(clarity) => updateDirection(direction.id, { clarity })} />
                <RatingRow label="Feels trustworthy" value={values.trust} onChange={(trust) => updateDirection(direction.id, { trust })} />
                <RatingRow label="Ready to pursue" value={values.confidence} onChange={(confidence) => updateDirection(direction.id, { confidence })} />
                <label className="notes-label">Notes<textarea value={values.notes} onChange={(event) => updateDirection(direction.id, { notes: event.target.value })} placeholder="What should stay? What should change?" /></label>
              </article>
            )
          })}
        </div>

        <label className="final-notes">Anything the team should carry into the final direction?<textarea value={review.finalNotes} onChange={(event) => setReview((current) => ({ ...current, finalNotes: event.target.value }))} placeholder="Shared notes, concerns, or a hybrid worth exploring…" /></label>

        <div className="feedback-actions">
          <button className="feedback-primary" type="button" onClick={copySummary}><Clipboard size={16} /> Copy review summary</button>
          <button type="button" onClick={downloadJson}><Download size={16} /> Download JSON</button>
          <button type="button" onClick={() => { if (window.confirm('Clear all ratings and notes in this browser?')) { setReview(initialReview); setNotice('Feedback reset.') } }}><Undo2 size={16} /> Reset</button>
          <span role="status">{notice}</span>
        </div>
      </div>
    </section>
  )
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="rating-row">
      <span>{label}</span>
      <div aria-label={`${label} rating`}>
        {[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating} out of 5`} aria-pressed={value === rating} onClick={() => onChange(rating)}>{rating}</button>)}
      </div>
    </div>
  )
}

export default App
