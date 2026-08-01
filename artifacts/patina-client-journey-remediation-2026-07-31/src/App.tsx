import { useState } from "react";
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
} from "lucide-react";

type CategoryId = "integrity" | "continuity" | "feedback";
type Severity = "critical" | "high" | "medium";

type Finding = {
  id: string;
  category: CategoryId;
  severity: Severity;
  title: string;
  observed: string;
  remediation: string;
  verification: string;
};

type HardeningItem = {
  id: string;
  title: string;
  body: string;
  proof: string;
};

type EvidenceRun = {
  surface: string;
  result: string;
  detail: string;
};

type KnownLimit = {
  surface: string;
  status: string;
  detail: string;
};

type JourneyProof = {
  id: string;
  title: string;
  body: string;
  evidence: string;
};

type LateFix = {
  id: string;
  title: string;
  status: string;
  detail: string;
};

const categories: Array<{
  id: CategoryId;
  index: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    id: "integrity",
    index: "01",
    label: "Integrity & safety",
    shortLabel: "Integrity",
    description:
      "The signed, paid, dated and related records now fail closed when their source-of-truth data disagrees.",
    icon: ShieldCheck,
  },
  {
    id: "continuity",
    index: "02",
    label: "Continuity & navigation",
    shortLabel: "Continuity",
    description:
      "Transitions keep the designer oriented, preserve the active context and provide a reliable way back.",
    icon: Route,
  },
  {
    id: "feedback",
    index: "03",
    label: "Feedback & accessibility",
    shortLabel: "Feedback",
    description:
      "Controls expose their meaning, persistence is visible and authored client copy stays intact.",
    icon: MessageSquareMore,
  },
];

const findings: Finding[] = [
  {
    id: "F01",
    category: "integrity",
    severity: "critical",
    title: "A $13,200 payment schedule could reach the client as $0",
    observed:
      "Editor, preview and sent proposal were reading different milestone state.",
    remediation:
      "Bind send to the exact reviewed snapshot. Reconcile canonical amounts on the server, reject changed tokens, and remove the unsafe legacy send overload.",
    verification:
      "The clean SQL replay passed, and Chrome carried a six-phase $1,000 proposal with one 100% Final payment through guest review, client signature, invoice and paid readback.",
  },
  {
    id: "F02",
    category: "integrity",
    severity: "critical",
    title: "Closeout could overrule install, invoice and payment truth",
    observed:
      "The project closed while FF&E remained specified, uninstalled and uninvoiced.",
    remediation:
      "Derive readiness from locked project, invoice, line, milestone and FF&E rows. Reject partial invoice coverage and allow only genuine zero-value exceptions.",
    verification:
      "Chrome could close the book only after six completed phases and a paid $1,000 invoice; billing then auto-verified no balance before archive.",
  },
  {
    id: "F03",
    category: "integrity",
    severity: "high",
    title: "The client relationship could break at Discovery → Direction",
    observed:
      "Direction opened as an orphan and asked the designer to attach the client again.",
    remediation:
      "Move client reassignment into one atomic database operation so client, designer relationship and document household stay aligned without downgrading an existing engagement.",
    verification:
      "Journey Proof 1785606377249 moved from Brief through all five Discovery essentials into Direction, then linked client@patina.dev and signed without losing project identity.",
  },
  {
    id: "F05",
    category: "integrity",
    severity: "high",
    title: "Date-only values shifted across the Chicago timezone boundary",
    observed:
      "Jul 31 became Aug 1 between signature, project start and install records.",
    remediation:
      "Use direct MM/DD/YYYY date-only entry and guarded parsing rather than UTC timestamp defaults or stale invalid values.",
    verification:
      "Timezone-boundary and project-open coverage passed on the integrated head; the accepted signature and paid invoice retained their August 1, 2026 evidence in database and client readback.",
  },
  {
    id: "F07",
    category: "integrity",
    severity: "high",
    title: "“Send as-is” did not validate the payload being signed",
    observed:
      "A stale zero-dollar schedule and unresolved drafting gap did not stop or explain send.",
    remediation:
      "Gate every active refetch, refresh drafting state before send, reset acknowledgement when gaps change, and require a second reviewed click after any snapshot change.",
    verification:
      "Stale-cache, changed-token and concurrent-edit coverage passed; Chrome sent, signed and invoiced the same reviewed $1,000 / 100% schedule.",
  },
  {
    id: "F14",
    category: "integrity",
    severity: "medium",
    title: "The document shell emitted React hydration error #418",
    observed:
      "Server and first client render could disagree when cached resolution data arrived early.",
    remediation:
      "Hold the document shell to the server loading contract until hydration and distinguish an active fetch from a terminal missing record.",
    verification:
      "Hydration and cached-miss coverage passed, the designer production build generated 67 pages, and the full Chrome journey crossed every document identity without a terminal dead end.",
  },
  {
    id: "F04",
    category: "continuity",
    severity: "high",
    title: "Ashford time looked actionable inside the Harper project",
    observed:
      "A carried timer from another project appeared without enough ownership context.",
    remediation:
      "Mark carried work as “Time from another project,” name the owner and expose the same distinction to assistive technology before log or discard.",
    verification:
      "Cross-project timer context remains covered inside the final 1,841 / 1,841 designer regression run.",
  },
  {
    id: "F06",
    category: "continuity",
    severity: "high",
    title: "The household sheet’s visible close control did nothing",
    observed:
      "Pointer users could not dismiss the sheet even though Escape worked.",
    remediation:
      "Move the sheet onto a true modal dialog with a wired close action, focus containment, outside-tree hiding, Escape handling and focus restoration.",
    verification:
      "Mouse, keyboard, backdrop and focus behavior passed focused coverage on the same integrated designer head.",
  },
  {
    id: "F08",
    category: "continuity",
    severity: "medium",
    title: "A valid conversion flashed a terminal not-found page",
    observed:
      "“No document answers to this name” appeared while the new document was still resolving.",
    remediation:
      "Model loading, redirect, cached miss and terminal missing separately; retain a transition state while a valid fetch is in flight.",
    verification:
      "Resolution-state coverage passed, and Chrome traversed lead, relationship, proposal and project document identities without a false terminal page.",
  },
  {
    id: "F09",
    category: "continuity",
    severity: "medium",
    title: "The accepted lead’s next action was buried in Studio pulse",
    observed:
      "The Brief settled, but the actionable Discovery document was hard to find.",
    remediation:
      "Return the new canonical document identity from acceptance and route the designer directly into Discovery with replace/push semantics appropriate to context.",
    verification:
      "The fresh Chrome lead routed directly from accepted Brief into Discovery, captured all five essentials and opened Direction.",
  },
  {
    id: "F10",
    category: "feedback",
    severity: "medium",
    title: "Successful saves looked stale or ambiguous",
    observed:
      "Counts, phases, palette work and send actions lagged without local confirmation.",
    remediation:
      "Expose saving/saved/error at the edited surface, invalidate exact facets, remove noisy polling and make partial-default failures retryable.",
    verification:
      "Save, refresh, invalidation and partial-retry coverage passed. After the late fix, Chrome reopened Journey Proof as Designer User with the correct Client User relationship, zero Sonner toast nodes, no generic error text and no server cardinality error.",
  },
  {
    id: "F11",
    category: "feedback",
    severity: "medium",
    title: "Core Discovery controls lacked usable semantics",
    observed:
      "Selects and numeric fields were unlabeled; date entry was not discoverable from the keyboard.",
    remediation:
      "Carry field labels into controls, add contextual row-action names and provide direct date text entry with invalid-value protection.",
    verification:
      "Field-kit, direct-date and contextual-action coverage passed; the same lead form and client content remained usable at 390 × 844.",
  },
  {
    id: "F12",
    category: "feedback",
    severity: "medium",
    title: "Lead values were clipped before creation",
    observed:
      "Email and project description could not be proofread at a normal desktop width.",
    remediation:
      "Use a single-column contact/project layout with min-width protection so long values remain reviewable down to the narrow viewport.",
    verification:
      "The fresh lead was captured successfully, and responsive checks at 1440 × 1000, 1024 × 900 and 390 × 844 preserved the key content and mobile menu.",
  },
  {
    id: "F13",
    category: "feedback",
    severity: "medium",
    title: "Household copy turned “UX Audit” into “the Audits”",
    observed:
      "Heuristic surname pluralization corrupted deliberately authored display names.",
    remediation:
      "Preserve the complete authored household name and use a neutral fallback only for blank or known placeholder values.",
    verification:
      "Family-label coverage passed on the integrated designer head, including the audited name and nonstandard authored display copy.",
  },
];

const hardeningWork: HardeningItem[] = [
  {
    id: "H01",
    title: "Atomic builder and autosave",
    body: "Builder actions now serialize around the active write. Queued saves, generations, tombstones and canvas locks prevent stale autosave from reviving or overwriting work.",
    proof:
      "Concurrency and stale-write cases were added after adversarial review.",
  },
  {
    id: "H02",
    title: "Durable delivery, including “unconfirmed”",
    body: "Immutable outbox records, idempotency and recovery preserve delivery intent when a provider response is uncertain. “Unconfirmed” stays visible and counts as a terminal attempt.",
    proof:
      "Notification coverage recorded 43 / 43; digest focus recorded 1 / 1.",
  },
  {
    id: "H03",
    title: "Immutable issued copies",
    body: "Once a proposal is issued, its header, children and product snapshots are frozen. Later catalog or draft edits cannot rewrite what the client reviewed.",
    proof:
      "Mutation guards and snapshot contract coverage are present locally.",
  },
  {
    id: "H04",
    title: "Client and share DTO privacy",
    body: "Client and guest proposal/share surfaces read purpose-built projections instead of business rows. Trade costs, margins, internal notes and tier-restricted payment detail stay server-side; raw catalog ACLs remain a separate documented risk.",
    proof: "Guest-share focus recorded 4 / 4.",
  },
  {
    id: "H05",
    title: "Activation and FK concurrency integrity",
    body: "Authorization, scoped activation, parent locks and foreign-key protections keep concurrent proposal and lifecycle updates from relinking or clearing protected records.",
    proof:
      "The clean reset through migration 00400 passed all 18 SQL suites and 998 assertions.",
  },
  {
    id: "H06",
    title: "Web and iOS safe-RPC compatibility",
    body: "Both clients consume safe list and detail contracts while preserving project links and budget context. Curated iOS copies now omit the payment-schedule surface entirely.",
    proof:
      "iOS recorded 571 / 571 across 73 suites and 15 / 15 focused safe-RPC checks; the curated follow-up recorded 13 / 13.",
  },
  {
    id: "H07",
    title: "Atomic server phase handoffs",
    body: "One locked server transaction validates project authority, exact phase identity, compare-and-swap state and open client decisions before completing a phase and activating every direct follower across main and branch lanes.",
    proof:
      "The phase RPC suite covers stale retries, blockers, parallel lanes, terminal lanes, rollback and a true two-session race.",
  },
  {
    id: "H08",
    title: "Exact invoice and checkout authority",
    body: "Invoice issue, record, void and checkout operations now require exact studio ownership, preserve invoice/project client linkage and bind payment evidence to the precise invoice through idempotent server contracts.",
    proof:
      "Negative contractor/manufacturer cases and positive design-studio peer cases are included in the billing regression pack.",
  },
  {
    id: "H09",
    title: "Durable change-request lifecycle",
    body: "A scope request keeps its idempotency intent across refresh, distinguishes a client request from a designer authorization and reports financial impact only when a real revised project value exists.",
    proof:
      "Remount, retry, origin-language and impact-projection cases are covered across client, designer and data-hook suites.",
  },
  {
    id: "H10",
    title: "Whole-journey lifecycle authority",
    body: "Discovery, proposal decisions, option selection, signatures, procurement and closeout now execute through exact relationship checks and atomic server transitions without trusting caller-supplied actor identity.",
    proof:
      "Dedicated SQL suites exercise cross-studio denial, idempotency, blockers, terminal state and rollback behavior.",
  },
  {
    id: "H11",
    title: "Auth and account continuity",
    body: "Password, magic-link, OAuth and OTP callbacks preserve the intended return path. Account and invoice surfaces expose loading, missing-link and error states instead of silently falling back.",
    proof:
      "Callback, return-URL, account-state, receipt and invoice-folio cases have focused component and route coverage.",
  },
  {
    id: "H12",
    title: "Main-lane and thread projection",
    body: "The client timeline identifies the canonical main lane while retaining parallel branch work as labeled threads, matching the server rule that all direct followers become active together.",
    proof:
      "Projection and topology coverage includes valid branching, missing references, cycles and terminal lanes.",
  },
  {
    id: "H13",
    title: "Project identity and lead ownership",
    body: "Project hold/resume, archive and lead transfer now use row-locked, compare-and-swap server authority. Proposal/client provenance and terminal closeout evidence remain immutable, while authorized same-studio transfers retain historical authorship and audit context.",
    proof:
      "Project-journey SQL covers owner/admin success; guest, contractor, inactive and foreign-studio denial; stale retries; rollback; and archive immutability.",
  },
  {
    id: "H14",
    title: "Atomic decision and coordination writes",
    body: "Decision creation, edits, dependencies, expiry/reopen and resolution now commit through checked RPCs. Project identity cannot move after creation; stale or cross-project dependency writes roll back as one transaction.",
    proof:
      "Decision and coordination coverage exercises CAS conflicts, dependency validation, actor boundaries, terminal retries and browser routing through canonical authority.",
  },
  {
    id: "H15",
    title: "Signature evidence and replay authority",
    body: "The browser supplies only the proposal and signer name. A service-only bridge adds edge-derived IP, while exact approval and immutable engagement evidence gate activation. Accepted retries never rewrite consent and only repair a missing reciprocal project link.",
    proof:
      "Signature SQL and route coverage include forged evidence, wrong clients, claim restoration, activation rollback, idempotent retries and newly-signed confirmation gating.",
  },
  {
    id: "H16",
    title: "Atomic proposal schedule topology",
    body: "Phase create, edit, remove, templates, cloning and as-built copy now lock the parent proposal, enforce checked draft authority, preserve main/thread topology and recompute totals in one transaction. Direct browser DML is revoked and durable template receipts make lost-response retries idempotent.",
    proof:
      "Phase-authority coverage exercises stale writes, follower rewiring, cross-tab retries, legacy topology repair, exact ownership, clone integrity and rollback.",
  },
];

const evidenceRuns: EvidenceRun[] = [
  {
    surface: "Integrated SQL",
    result: "18 / 18",
    detail: "998 assertions after a clean reset through migration 00400",
  },
  {
    surface: "Designer portal",
    result: "1,841 / 1,841",
    detail: "175 / 175 suites · 1 snapshot on the final head",
  },
  {
    surface: "Supabase package",
    result: "547 / 547",
    detail: "40 files on the final late-fix head",
  },
  {
    surface: "Signature API route",
    result: "10 / 10",
    detail: "Trusted-IP and replay boundary",
  },
  {
    surface: "Required type-checks",
    result: "5 / 5",
    detail: "Integrated set green; four affected workspaces rechecked after the late fix",
  },
  {
    surface: "Designer build",
    result: "67 pages",
    detail: "Production build completed",
  },
  {
    surface: "Client build",
    result: "39 pages",
    detail: "Production build completed",
  },
  {
    surface: "Designer lint",
    result: "0 errors",
    detail: "186 retained baseline warnings",
  },
  {
    surface: "Designer query cache",
    result: "2 / 2",
    detail: "Focused relationship-cardinality regression",
  },
  {
    surface: "Focused designer ESLint",
    result: "Green",
    detail: "Late relationship-feedback fix",
  },
  {
    surface: "Phase authoring UI",
    result: "11 / 11",
    detail: "Builder and template receipt focus",
  },
  {
    surface: "Phase data hooks",
    result: "27 / 27",
    detail: "CAS, template and invalidation focus",
  },
  {
    surface: "Proposal delivery",
    result: "32 / 32",
    detail: "Focused Deno delivery modules",
  },
  {
    surface: "Client lifecycle",
    result: "37 / 37",
    detail: "Focused client journey coverage",
  },
  {
    surface: "Patina iOS",
    result: "571 / 571",
    detail: "73 suites on simulator",
  },
  {
    surface: "iOS safe RPCs",
    result: "15 / 15",
    detail: "Focused contract checks",
  },
  {
    surface: "Curated iOS follow-up",
    result: "13 / 13",
    detail: "Payment schedule remains omitted",
  },
  {
    surface: "Admin strict build",
    result: "Exit 0",
    detail: "Final strict production build gate",
  },
  {
    surface: "Notifications",
    result: "43 / 43",
    detail: "Delivery-status suite",
  },
  {
    surface: "Nest service builds",
    result: "3 / 3",
    detail: "Orders, media and projects",
  },
];

const knownLimits: KnownLimit[] = [
  {
    surface: "Client portal full suite",
    status: "44 / 46 suites · 337 / 338 runnable tests",
    detail:
      "Two proven pre-existing failures remain: a stale test imports the removed src/lib/data/orders module, and a manufacturer portal-access expectation is out of date. They are retained as visible baseline debt rather than represented as journey regressions.",
  },
  {
    surface: "Design system full suite",
    status: "Baseline remains red",
    detail:
      "The touched payment schedule component passed its focused test (1 / 1) and type-check. The broader suite still has unrelated existing failures and hangs, so it is not represented as green.",
  },
  {
    surface: "Supabase lint",
    status: "Tooling unavailable",
    detail:
      "ESLint 9 cannot run this workspace because no flat configuration is present. Focused Deno formatting and type checks passed where the changed modules permit them.",
  },
  {
    surface: "Designer lint",
    status: "0 errors · 186 warnings",
    detail:
      "The lint run completed without errors. The warning count is an existing baseline and is retained here rather than hidden.",
  },
];

const journeyProof: JourneyProof[] = [
  {
    id: "01",
    title: "Lead became a complete Discovery",
    body: "Chrome created Journey Proof 1785606377249 and captured all five essentials: scope and room, budget, timeline, style and household context.",
    evidence: "Brief → Discovery → Direction",
  },
  {
    id: "02",
    title: "The reviewed commercial terms stayed exact",
    body: "The designer created the Patina Six, set a $1,000 proposal total and allocated one Final payment milestone at 100%.",
    evidence: "Six phases · $1,000 · 100%",
  },
  {
    id: "03",
    title: "Guest access was view-only and revocable",
    body: "The guest link exposed the intended proposal copy without decision controls. Revocation took effect immediately on reload.",
    evidence: "View-only → revoked",
  },
  {
    id: "04",
    title: "Client consent activated the project",
    body: "client@patina.dev was linked, Client User signed, and project 9ec9b68f… activated. A focused late fix was then retested on the same accepted proposal: Living Room, $1,000 Investment, Final payment / At project completion / 100%, all six phases and signed state were visible.",
    evidence: "Proposal accepted · signed detail complete",
  },
  {
    id: "05",
    title: "Billing settled against the same terms",
    body: "The designer issued INV-0001 and recorded a $1,000 Check payment with reference E2E-journey. The invoice and milestone both read paid.",
    evidence: "INV-0001 · $0 balance",
  },
  {
    id: "06",
    title: "Closeout followed operational truth",
    body: "All six phases completed, billing auto-verified no balance, five manual closeout items were completed, and the project closed and archived.",
    evidence: "Six complete · closed · archived",
  },
  {
    id: "07",
    title: "Client and database readback agreed",
    body: "The client read 6 / 6 project milestones and 100% complete with all six phase names; Final payment showed 100% Paid on August 1, 2026, and the paid $1,000 invoice remained readable. The database confirmed the archived project, accepted proposal with signed_by_name / signed_at, six completed phases, paid invoice, succeeded payment and zero scope change requests.",
    evidence: "UI + database matched",
  },
  {
    id: "08",
    title: "Branch topology and responsive layouts held",
    body: "In Marrow & Vale, completing the Procurement & Orders thread activated Millwork & Fabrication while Design Development stayed active on the main lane. Key client content and the mobile Open menu held at desktop, tablet and mobile widths.",
    evidence: "1440 × 1000 · 1024 × 900 · 390 × 844",
  },
];

const lateFixes: LateFix[] = [
  {
    id: "L01",
    title: "Signed proposal detail now retains the reviewed client copy",
    status: "Fixed · Chrome retested",
    detail:
      "On the same accepted proposal, Chrome confirmed Living Room, $1,000 Investment, Final payment / At project completion / 100%, all six phases and the signed state are visible.",
  },
  {
    id: "L02",
    title: "Successful lifecycle revisit no longer emits a false error",
    status: "Fixed · Chrome retested",
    detail:
      "Designer User reopened Journey Proof 1785606377249 and saw the correct Client User relationship with zero Sonner toast nodes, no generic error text and no designer-client-for-user cardinality error from the server. Supabase passed 547 / 547, the designer query-cache focus passed 2 / 2, and both affected type-checks were green.",
  },
];

const priorityPlan = [
  {
    priority: "P0",
    title: "Review the assembled evidence",
    scope: "Database · Chrome · exceptions",
    body: "Confirm the clean reset, 998 SQL assertions, package and build gates, Journey Proof browser witness and both late-fix Chrome retests are represented accurately.",
  },
  {
    priority: "P1",
    title: "Authorize production explicitly",
    scope: "Owner decision · change window · rollback",
    body: "The local gates and late-fix retests are proven. Explicitly authorize the production migration and deployment sequence, change window and rollback boundary.",
  },
  {
    priority: "P2",
    title: "Deploy deliberately and verify live",
    scope: "Migrate · deploy · behavior probes",
    body: "After authorization, use the Patina production runbook, preserve rollback boundaries and verify live behavior rather than inferring success from build output alone.",
  },
];

const verificationLedger = [
  {
    layer: "Local remediation head",
    status: "14 / 14 addressed",
    detail:
      "Every original walkthrough finding and sixteen adversarial hardening clusters are represented locally; both late UI fixes passed focused Chrome retests.",
    state: "done",
  },
  {
    layer: "Combined DB replay",
    status: "Passed",
    detail:
      "A clean local reset through migration 00400 passed 18 / 18 SQL suites and 998 assertions on the assembled integration head.",
    state: "done",
  },
  {
    layer: "Local Chrome journey",
    status: "Passed",
    detail:
      "Journey Proof 1785606377249 traversed designer, guest and client surfaces from lead capture through paid invoice, closeout, archive and client readback.",
    state: "done",
  },
  {
    layer: "Production",
    status: "Not deployed",
    detail:
      "app.patina.cloud is unchanged. Production authorization is pending; no mutation or deployment was performed.",
    state: "locked",
  },
];

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
};

function App() {
  const [activeCategory, setActiveCategory] = useState<"all" | CategoryId>(
    "all",
  );

  const visibleFindingCount =
    activeCategory === "all"
      ? findings.length
      : findings.filter((finding) => finding.category === activeCategory)
          .length;

  return (
    <>
      <a className="skip-link" href="#content">
        Skip to remediation summary
      </a>

      <header className="topbar">
        <a
          className="wordmark"
          href="#top"
          aria-label="Patina remediation report, top"
        >
          <span aria-hidden="true">P</span>
          <span>Patina</span>
        </a>
        <nav aria-label="Presentation sections">
          <a href="#coverage">Coverage</a>
          <a href="#hardening">Hardening</a>
          <a href="#journey-proof">Journey</a>
          <a href="#late-fixes">Late fixes</a>
          <a href="#known-limits">Known limits</a>
          <a href="#release">Release</a>
          <a href="#verification">Verification</a>
        </nav>
        <span className="report-date">01 AUG 2026</span>
      </header>

      <main id="content" tabIndex={-1}>
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              Client journey remediation · decision brief
            </p>
            <h1 id="hero-title">
              Lead to archive, <em>proven locally.</em>
            </h1>
            <p className="hero-deck">
              All 14 findings from the app.patina.cloud walkthrough are
              addressed on the assembled remediation head. A clean database
              replay and a complete designer, guest and client Chrome journey
              now prove the lifecycle. Both late UI findings also passed focused
              Chrome retests; no walkthrough or late UI follow-up remains open.
            </p>
            <a className="text-link" href="#coverage">
              Review the complete ledger <ArrowRight aria-hidden="true" />
            </a>
          </div>

          <aside
            className="outcome-panel"
            aria-label="Current outcome and release status"
          >
            <div className="outcome-rule" aria-hidden="true" />
            <p className="panel-kicker">
              <MonitorCheck aria-hidden="true" /> Current state
            </p>
            <strong>14 / 14</strong>
            <h2>Original findings addressed; local gates passed</h2>
            <p>
              The assembled head passed 18 SQL suites with 998 assertions and
              the full lead-to-archive browser witness. Production authorization
              is still required.
            </p>
            <div className="status-stamp">
              <LockKeyhole aria-hidden="true" />
              <span>
                <b>Production unchanged.</b>
                No deployment was performed
              </span>
            </div>
          </aside>

          <div
            className="hero-facts"
            role="list"
            aria-label="Finding distribution"
          >
            <div role="listitem">
              <span>06</span>
              <p>Integrity & safety</p>
            </div>
            <div role="listitem">
              <span>04</span>
              <p>Continuity & navigation</p>
            </div>
            <div role="listitem">
              <span>04</span>
              <p>Feedback & accessibility</p>
            </div>
            <div className="hero-fact-note" role="listitem">
              <CircleAlert aria-hidden="true" />
              <p>2 critical · 5 high · 7 medium</p>
            </div>
          </div>
        </section>

        <section className="decision-band" aria-labelledby="decision-title">
          <p className="eyebrow">Release decision</p>
          <div>
            <h2 id="decision-title">
              Local gates are green. Production still needs a decision.
            </h2>
            <p>
              Review the integrated evidence and both late-fix retests,
              explicitly authorize the production change, then deploy through a
              deliberate migration and behavior-verification window.
            </p>
          </div>
          <div className="decision-mark" aria-hidden="true">
            <span>REVIEW</span>
          </div>
        </section>

        <section
          className="section"
          id="coverage"
          aria-labelledby="coverage-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">Complete remediation ledger</p>
              <h2 id="coverage-title">
                Every finding, with its fix and proof state.
              </h2>
            </div>
            <p>
              “Addressed locally” means the remediation exists and the assembled
              database, browser and late-fix retest gates passed. It does not
              mean production was deployed.
            </p>
          </div>

          <div
            className="category-filter"
            role="group"
            aria-label="Filter findings by category"
          >
            <button
              type="button"
              className={activeCategory === "all" ? "active" : ""}
              aria-pressed={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            >
              All 14
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={activeCategory === category.id ? "active" : ""}
                aria-pressed={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.shortLabel}{" "}
                {
                  findings.filter((finding) => finding.category === category.id)
                    .length
                }
              </button>
            ))}
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            Showing {visibleFindingCount} of {findings.length} findings.
          </p>

          <div className="category-stack">
            {categories.map((category) => {
              const Icon = category.icon;
              const categoryFindings = findings.filter(
                (finding) => finding.category === category.id,
              );
              const isFilteredOut =
                activeCategory !== "all" && activeCategory !== category.id;

              return (
                <section
                  className={`finding-group ${category.id}${
                    isFilteredOut ? " category-hidden" : ""
                  }`}
                  id={`group-${category.id}`}
                  key={category.id}
                  aria-labelledby={`group-${category.id}-title`}
                >
                  <div className="group-head">
                    <span className="group-index">{category.index}</span>
                    <Icon aria-hidden="true" />
                    <div>
                      <h3 id={`group-${category.id}-title`}>
                        {category.label}
                      </h3>
                      <p>{category.description}</p>
                    </div>
                    <b>{String(categoryFindings.length).padStart(2, "0")}</b>
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
                            <Check aria-hidden="true" /> Addressed locally
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
              );
            })}
          </div>
        </section>

        <section
          className="section hardening-section"
          id="hardening"
          aria-labelledby="hardening-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">Adversarial review</p>
              <h2 id="hardening-title">
                The fixes were hardened beyond the original 14.
              </h2>
            </div>
            <p>
              These are follow-on safeguards found while testing interactions
              between autosave, delivery, issued records, privacy boundaries,
              project identity, decision authority, signature evidence,
              proposal schedules and concurrent updates. They are not counted
              as new walkthrough findings.
            </p>
          </div>

          <div className="hardening-grid">
            {hardeningWork.map((item) => (
              <article className="hardening-card" key={item.id}>
                <span className="hardening-id">{item.id}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <div className="hardening-proof">
                  <Check aria-hidden="true" />
                  <span>{item.proof}</span>
                </div>
              </article>
            ))}
          </div>

          <aside
            className="topology-note"
            aria-labelledby="topology-note-title"
          >
            <CircleAlert aria-hidden="true" />
            <div>
              <p className="eyebrow">
                Legacy topology is an explicit repair state
              </p>
              <h3 id="topology-note-title">
                The server will not invent a phase path.
              </h3>
              <p>
                Older projects with a missing referenced successor or cyclic{" "}
                <code>follows_phase_id</code>
                chain stop before any write and surface the repair need. Valid
                branching is supported: every direct follower activates in the
                same transaction, while the client view distinguishes the main
                lane from labeled parallel threads. Display order is never
                treated as lifecycle authority.
              </p>
            </div>
          </aside>
        </section>

        <section
          className="section journey-proof-section"
          id="journey-proof"
          aria-labelledby="journey-proof-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">
                Chrome witness · Journey Proof 1785606377249
              </p>
              <h2 id="journey-proof-title">
                One record crossed every consequential boundary.
              </h2>
            </div>
            <p>
              The browser run used live local data across designer, guest and
              client surfaces, then reconciled the visible result against the
              database rather than stopping at a success toast.
            </p>
          </div>

          <div
            className="journey-proof-grid"
            role="list"
            aria-label="Lead-to-archive browser evidence"
          >
            {journeyProof.map((item) => (
              <article
                className="journey-proof-card"
                role="listitem"
                key={item.id}
              >
                <span className="journey-proof-id">{item.id}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <strong>{item.evidence}</strong>
              </article>
            ))}
          </div>
        </section>

        <section
          className="section late-fix-section"
          id="late-fixes"
          aria-labelledby="late-fixes-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">
                Late UI findings · focused fixes retested
              </p>
              <h2 id="late-fixes-title">
                The final browser findings are closed.
              </h2>
            </div>
            <p>
              The first retest restored the complete signed client copy. The
              second reopened the same archived journey with the correct client
              relationship and no false failure feedback.
            </p>
          </div>

          <div className="late-fix-grid">
            {lateFixes.map((item) => (
              <article className="late-fix-card" key={item.id}>
                <div className="late-fix-meta">
                  <Check aria-hidden="true" />
                  <span>{item.id}</span>
                  <b>{item.status}</b>
                </div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="section known-limits-section"
          id="known-limits"
          aria-labelledby="known-limits-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">Known baseline & residual debt</p>
              <h2 id="known-limits-title">
                Green evidence, without sanding off the rough edges.
              </h2>
            </div>
            <p>
              Focused remediation checks passed. These broader baseline
              conditions remain visible so they are not mistaken for journey
              regressions—or quietly called green.
            </p>
          </div>

          <div className="known-limit-grid">
            {knownLimits.map((item) => (
              <article className="known-limit-card" key={item.surface}>
                <span>{item.surface}</span>
                <h3>{item.status}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <aside className="catalog-debt" aria-labelledby="catalog-debt-title">
            <div className="catalog-debt-mark" aria-hidden="true">
              <LockKeyhole />
            </div>
            <div>
              <p className="eyebrow">Separate security follow-up</p>
              <h3 id="catalog-debt-title">
                Proposal privacy is closed; raw catalog access still needs its
                own ACL audit.
              </h3>
              <p>
                Client and guest proposal DTOs no longer emit product IDs, so
                the reviewed proposal cannot be used to pivot into raw catalog
                rows. Separately, broad catalog permissions for anonymous and
                authenticated roles can expose fields such as trade price,
                source URL, vendor ID and capture metadata. That deserves a
                dedicated view/RPC and policy review; it is not represented as
                fixed here.
              </p>
            </div>
          </aside>
        </section>

        <section
          className="section release-section"
          id="release"
          aria-labelledby="release-title"
        >
          <div className="section-head release-head">
            <div>
              <p className="eyebrow">Prioritized recommendation</p>
              <h2 id="release-title">
                Review, authorize, then deploy deliberately.
              </h2>
            </div>
            <p>
              Local database and browser evidence is complete. The remaining
              sequence is an owner decision and a controlled production change.
              Both late UI fixes are included in the evidence review.
            </p>
          </div>

          <ol className="priority-list">
            {priorityPlan.map((item, index) => (
              <li key={item.priority}>
                <span
                  className={`priority-badge ${item.priority.toLowerCase()}`}
                >
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
              <h2 id="verification-title">
                The assembled local head is proven.
              </h2>
            </div>
            <p>
              Results below combine the final integrated replay with focused
              owning-stream evidence. Known unrelated baselines remain disclosed
              above; both late UI findings are fixed and retested.
            </p>
          </div>

          <div
            className="evidence-runs"
            role="list"
            aria-label="Recorded test evidence"
          >
            {evidenceRuns.map((run) => (
              <article className="evidence-run" role="listitem" key={run.surface}>
                <span>{run.surface}</span>
                <strong>{run.result}</strong>
                <p>{run.detail}</p>
              </article>
            ))}
          </div>

          <p className="evidence-caveat">
            Final integrated evidence: clean local reset through migration 00400;
            18 / 18 SQL suites and 998 assertions; 547 / 547 Supabase checks;
            175 / 175 designer suites with 1,841 / 1,841 tests and one snapshot;
            10 / 10 signature-route checks; five green integrated type-checks,
            with Supabase, designer, client and manufacturer rechecked after the
            late fix; production builds of 67 designer pages and 39 client pages;
            and admin strict build exit 0. The final relationship regression also
            passed 2 / 2 with focused ESLint green. The client full-suite baseline
            remains 44 / 46 suites and 337 / 338 runnable tests because of two
            unrelated stale failures.
          </p>

          <div className="verification-grid">
            {verificationLedger.map((item) => (
              <article
                className={`verification-card ${item.state}`}
                key={item.layer}
              >
                <div className="verification-icon" aria-hidden="true">
                  {item.state === "done" ? (
                    <FlaskConical />
                  ) : item.state === "active" ? (
                    <CircleDashed />
                  ) : item.state === "locked" ? (
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
                app.patina.cloud is unchanged. The local gates are proven;
                production authorization remains pending. Review the evidence,
                authorize explicitly, then deploy and verify deliberately.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>Patina · Client journey remediation</span>
        <span>Prepared 1 August 2026 · America/Chicago</span>
      </footer>
    </>
  );
}

export default App;
