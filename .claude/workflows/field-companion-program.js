export const meta = {
  name: 'field-companion-program',
  description: 'Discovery, design directions, judge panel, plan writing and adversarial review for making Patina Field a true field companion to the designer portal project flow',
  phases: [
    { title: 'Discovery', detail: '7 parallel read-only research agents (Field app, backend, portal flow, docs/rulings, Patina substrate, external research, delivery infra)' },
    { title: 'Synthesis', detail: 'gap analysis + voice/notes tech architecture' },
    { title: 'Directions', detail: '3 independent design directions, then a 2-lens judge panel' },
    { title: 'Plan', detail: 'development-ready package written' },
    { title: 'Review', detail: '2-lens adversarial review, then revision' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const SCRATCH = '/private/tmp/claude-501/-Users-kody-Code-patina-merged/90248dfd-877a-4604-a2f0-33098277d3eb/scratchpad/field-companion'
const OUT = `${REPO}/docs/design/field-companion`

const PROGRAM = `PROGRAM CONTEXT
Patina connects interior designers with manufacturers for custom home furnishings. Monorepo at ${REPO} (pnpm/Turborepo; Supabase-first — Postgres/Auth/Storage/Realtime on Supabase Cloud project "Strata"; 3 NestJS services orders/media/projects; ~45 Deno edge functions under supabase/functions; Next.js designer portal at apps/designer-portal; data layer packages/supabase with ~88 React Query hook modules; two Swift/SwiftUI iOS apps: Patina (client/homeowner, apps/mobile/Patina) and Patina Field (designer/trades, apps/mobile/Capture, bundle cloud.patina.field, scheme field://)).

PROGRAM GOAL: turn Patina Field into a TRUE FIELD COMPANION to the designer portal's project flow. Today Field has room capture (LiDAR site scan → bundle → Room File drawings) and product capture (specimens at markets/showrooms). Kody (founder) wants a streamlined flow for capturing whatever a designer needs while on the move — site visits, client walk-throughs, markets/showrooms, trade/install days — including voice notes with transcription, so field information lands in the right place in the portal's project flow with minimal friction. Designer persona: "Leah" (working interior designer; retires the tape measure; mobile, busy, one-handed).

PRIOR KNOWLEDGE FROM PROJECT MEMORY (verify in the repo — do not trust blindly; cite what you confirm):
- Field app split 2026-07-07: Capture rebranded Patina Field with designer parity; 51 screens incl. 18 "Work" flows (W1/P1-2/L1-2/D1-2/M1-2/G1-3/Q1-2/F1-4) behind 7 frozen protocols in CaptureKit/Work/ with per-flow <Flow>ServiceFactory; simulator default = ALL MOCK, real on device or -CaptureForceReal; persistent App-Group store; FieldCapturePayload mirrors migration 00235 SQL; capture-media/<uid>/<clientToken>/ storage path (lowercase).
- Field Capture P1 (2026-07-17/18): instrumented site scan rig (shared ARSession, depth/mesh recorders, keyframes, coach/QA scorecard, typed anchors, UNVERIFIED stamp), bundle+background upload, confirm-scan-bundle edge fn, scan-pipeline Python worker on Kody's GPU box, Room File v0 in portal (flag room-file). Item 7: context capture → field_captures via outbox; project association lives ONLY in provenance.siteScanContext.* (project_id column NULL by RPC design); voice notes are transcript-only, audio-write seam TODO. All coach/anchor/scorecard strings were placeholders at M2.
- Field Coordination (00281–00284): project_parties, SMS conversations (Twilio 10DLC live 2026-08-12), apply_field_effect RPC, field_link_tokens + client-portal /field/[token] no-login page, field-daily digest cron, People Room, Desk triage cards.
- Designer handoff pipeline (00285–00288): client scans local-until-request; submit_design_request/claim_design_request; open pool on Desk.
- Designer portal recent programs (Aug 2026): "The Document" (desk + documents = THE surface), Project Composed, Shelved Spine, Date Instruments, FF&E GA, Start-to-Signature worktable, Call Sheet (flag call-sheet), Single Pane client portal, Room View (/rooms, /room/[id]).
- Agent OS rules: task queue = agent_tasks via @patina/agent-queue RPCs; never a parallel queue; agents write business data ONLY via enqueue_agent_task; no automated external sends (drafts land awaiting_review); scheduled jobs = pg_cron; NestJS services: only orders/media/projects — new server logic goes in Supabase edge functions.
- Auth = Supabase Auth only. Types from @patina/types. Migrations hand-numbered NNNNN_slug.sql (prod ledger head 00513; 00512 is parked/unapplied; check the filesystem for the true max).

RULES FOR THIS AGENT: READ-ONLY against the repo — do NOT modify, create, or delete any file under ${REPO} (scratchpad writes are fine). Do not run git mutations, builds that write into the repo, or anything touching production. Evidence-grounded: cite file paths (and line numbers where useful); mark inferences as inferences. Report EVERY relevant finding — do not filter by perceived importance; the orchestrator filters. Prefer Serena symbolic tools (load via ToolSearch: mcp__serena__get_symbols_overview, mcp__serena__find_symbol, mcp__serena__find_referencing_symbols — always scope relative_path to one workspace) for Swift/TS reading; Swift symbol lookups may be incomplete without a build — fall back to grep/sed. Bash, grep, find, sed, Read are available.`

const DISCOVERY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '≤400 words: what exists, what is partial, what is missing — the headline for the orchestrator' },
    report_path: { type: 'string' },
    key_findings: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'report_path', 'key_findings', 'open_questions'],
}

const discoveryBriefs = [
  {
    key: 'field-app',
    model: 'opus',
    prompt: `${PROGRAM}

YOUR TASK (D1 — Patina Field iOS app deep map). Scope: EVERYTHING under ${REPO}/apps/mobile/Capture (Capture/, CaptureKit/, CaptureKitMocks/, CaptureShareExtension/, CaptureWidgets/, CaptureTests/, CaptureUITests/, scripts/, README.md). 242 Swift files — cover all Feature directories (Account, Auth, Capture, Companion, Decisions, Leads, Library, Messages, Onboarding, Projects, QRApprove, Receiving, Recognition, Resilience, Root, Route, Session, Settings, SiteRequests, SiteScan, Specimen, SystemEntry, Work).
Produce, in ${SCRATCH}/01-field-app-map.md:
1. Screen inventory table: every screen/flow (id like C1/T2/W1/P1… where the code uses them), file, purpose, entry point/navigation path, real-vs-mock service composition, placeholder copy present?
2. Navigation/IA model: Root, Route, the home screen, the WORK pill, tab/sheet structure, deep links (field://), share extension and widgets' roles.
3. Domain + persistence: CaptureKit Domain (Specimen, CaptureEnums, …), SwiftData/@Model types, App-Group store, outbox/sync model (FieldCapturePayload, commit path, retry, offline behavior), what survives relaunch.
4. Services: auth (SupabaseSessionService, roles/workspace hydration, QR approval), camera, recognition, SpeechVoiceNoteService + VoiceNoteSheet (EXACTLY what the voice path does today: on-device SFSpeech? audio retained? where the transcript goes), site scan (ContextCaptureService, SiteScanContextCapture, bundle assembler, background upload, confirm-scan-bundle call), media-service upload-session client, PostHog.
5. End-to-end flows as step lists with file citations: (a) product/specimen capture at a market → where it lands server-side (library? minted products? field_captures?); (b) site scan → Room File; (c) voice note today; (d) how a capture gets associated with a project/room (pickers? provenance keys?); (e) Work flows W/P/L/D/M/G/Q/F — what each does against which tables/RPCs.
6. Ledger: exists / partial / stubbed / mock-only, with the TODOs and placeholder strings you find (grep TODO/FIXME/placeholder/"lorem"/"TBD").
7. Tests: list CaptureTests suites and what they cover; capture-gate script; what a device pass has historically required.
8. Pain points and opportunities you see for a "capture on the move" flow (tap counts to capture a photo+note into a project, required context, offline gaps).
Return the structured output with report_path = that file.`,
  },
  {
    key: 'backend',
    model: 'sonnet',
    prompt: `${PROGRAM}

YOUR TASK (D2 — backend contract for field capture). Scope: ${REPO}/supabase/migrations (grep for: field_captures, capture_media, commit_field_capture, room_scans, room_scan_photos, scan_anchors, room_files, room_file_measurements, field_site_request / site_request, project_parties, sms_, field_link, apply_field_effect, specimen, library_products / products minted from captures, project_notes / notes, project_tasks / tasks, decisions, project_rooms, rooms, documents, document_* ), ${REPO}/supabase/functions (identify every function Field talks to or that processes field data: confirm-scan-bundle, site-request-dispatch, sms-*, field-daily, parse-room-scan, derive-scan-photo-media, any media/upload fns), ${REPO}/supabase/config.toml (buckets, [functions] verify_jwt), storage bucket policies, and ${REPO}/packages/supabase/src/hooks (every hook that reads field_captures, room_scans, site requests, parties, captures inbox — name the portal consumers) plus ${REPO}/services/media (upload-session API used by iOS). Also check for any existing transcription/audio/voice columns or functions anywhere in supabase/ and packages/ (grep transcript, audio, voice, whisper, speech).
Produce ${SCRATCH}/02-backend-contract.md with: entity map (tables, key columns, FKs, RLS posture per table, which role writes), RPC/edge-function contract list (name, caller, inputs, side effects, verify_jwt), storage bucket/path conventions (capture-media, room-scans, field-media, photo_derivatives…), the exact shape of field_captures + provenance keys today, the portal consumers of each field-originated table (hook file → page/component), queue/cron patterns in use (agent_tasks task kinds, invoke_edge_function crons), and a GAPS section: what is missing for voice audio storage, transcription, structured note extraction, capture→project/room association, task/decision creation from field input, and where the repo's conventions say such things must live (edge fn vs pg_cron vs agent_tasks). Note the highest migration number present in supabase/migrations and any numbering hazards.
Return the structured output with report_path = that file.`,
  },
  {
    key: 'portal-flow',
    model: 'opus',
    prompt: `${PROGRAM}

YOUR TASK (D3 — designer portal project flow map). Scope: ${REPO}/apps/designer-portal/src (app routes, especially project/document/desk/rooms/people/schedule/ffe/library/tasks/decisions/receiving surfaces), ${REPO}/packages/supabase/src/hooks (hooks those pages use), ${REPO}/packages/types, and design docs under ${REPO}/docs/design/the-document, ${REPO}/docs/design/* for "Project, Composed", Shelved Spine, Date Instruments, Call Sheet, Start to Signature, Room View/Room Files, FF&E.
Map the designer's PROJECT FLOW end-to-end as it exists in code: lead/design request → project creation → brief/discovery → rooms & Room Files → concept/mood boards → FF&E/specification → proposals/approvals (Start to Signature) → procurement/orders → receiving/install → close. For each stage: route(s), principal components, hooks, tables, flags (PostHog fail-closed flags), and what INPUTS a designer gathers in the field that this stage needs (photos, measurements, scans, voice/text notes, product specs, client preferences/decisions, punch-list items, delivery/receiving status, party contacts, site conditions). Identify every existing surface that already displays field-originated data (field_captures inbox? desk "In the field" cards? Room Files zone? BriefScanStrip? receiving inspections? SMS thread on party sheet?) and every surface that has a natural slot for it but nothing today. Identify where notes/tasks/decisions live (tables + UI) so a field voice note could become a task/decision/note. Identify the Desk model (what shows up, how triage works, needs_review queue).
Produce ${SCRATCH}/03-portal-project-flow.md: stage-by-stage map; a "field input → portal destination" table with current state (exists/partial/missing) and the exact hook/table that would receive it; Desk/inbox mechanics; flags to be aware of; gaps and recommendations for where field captures should land so the designer never re-enters data. Return the structured output with report_path = that file.`,
  },
  {
    key: 'docs-rulings',
    model: 'sonnet',
    prompt: `${PROGRAM}

YOUR TASK (D4 — product intent, rulings, and promised-but-unbuilt items). Read ALL of: ${REPO}/docs/prds/FieldCaptrueApp/* (note the directory's misspelling is real), ${REPO}/docs/design/field-capture/* (markdown files; the .html files — skim for stated intent), ${REPO}/docs/field/*, ${REPO}/DECISIONS.md (grep for Field, capture, voice, R108, R109, R114, I53, I84, specimen, market, site visit — read the surrounding rulings), ${REPO}/HANDOFF.md (field/capture sections), ${REPO}/apps/mobile/Capture/README.md, ${REPO}/docs/design/the-document/leah-session-* (designer-persona findings that mention mobile/field/on-site needs), and any docs mentioning "Leah" + "field" or "site visit" (grep under docs/). Also grep docs/ and plans under ${REPO}/docs for "voice", "transcri", "dictat", "quick capture", "inbox".
Produce ${SCRATCH}/04-intent-and-rulings.md: (1) the stated product intent for Patina Field over time (with dates/sources); (2) a constraint ledger — every ruling that binds this program (e.g. rulings about scans, privacy, worker home, queue usage, SMS governance, flags) with citation and a one-line "how it constrains the field companion"; (3) persona facts about Leah/designers relevant to mobile capture; (4) promised-but-unbuilt items related to field capture (voice-audio seam, P2 ledger items, Work-flow warts, placeholder copy, device passes owed); (5) open rulings Kody still owes that intersect this program; (6) naming/lexicon conventions Patina uses (The Document, Desk, Rooms, Room File, Call Sheet, parties, specimen…) so new surfaces are named consistently — also read ${REPO}/.agents/skills/patina-brand-voice/SKILL.md if present and summarize copy rules. Return the structured output with report_path = that file.`,
  },
  {
    key: 'patina-substrate',
    model: 'sonnet',
    prompt: `${PROGRAM}

YOUR TASK (D5 — reusable substrate in the Patina client app and shared iOS code). Scope: ${REPO}/apps/mobile/Patina (434 Swift files) and any shared Swift packages under ${REPO}/apps/mobile or ${REPO}/packages used by both apps (check both .xcodeproj / Package.swift / workspace files, and apps/mobile/Mobile.xcworkspace).
Answer: (1) Is there ANY code shared between Patina and Patina Field today (package, symlink, copied files)? Cite. (2) Inventory portable capabilities in Patina relevant to a field companion: ScanManifest v3 + ScanBundleWriter, BackgroundScanUploader (x-metadata sha256 lesson), RoomScanSyncService, ScanRecoveryService/ScanDiskBudget, StyleConversation (does it have voice input / speech?), WhisperState/WhisperBarView (what "whisper" means there), Messaging (ThreadDetailView), QRAuth, DesignRequest flow, design tokens/theme/components (Hero design language), haptics, PostHog wiring, offline/sync queue (SyncQueueItem), photo capture + thumbnails, any AVAudioRecorder / Speech framework usage. For each: file paths, what it does, dependencies, and a port-vs-share recommendation with effort (S/M/L). (3) Divergences between the two apps' architectures that would make sharing hard (DI container pattern, persistence, auth service, navigation). (4) Info.plist permissions and entitlements each app already declares (microphone, speech recognition, camera, location, background modes, App Groups).
Produce ${SCRATCH}/05-patina-substrate.md. Return the structured output with report_path = that file.`,
  },
  {
    key: 'external-research',
    model: 'sonnet',
    prompt: `${PROGRAM}

YOUR TASK (D6 — external research; use WebSearch/WebFetch via ToolSearch, and context7 docs where useful; cite URLs for every claim). Do NOT read the repo except ${REPO}/apps/mobile/Capture/Capture/Info.plist and the Capture project's deployment target (grep IPHONEOS_DEPLOYMENT_TARGET in apps/mobile/Capture/Capture.xcodeproj/project.pbxproj) to anchor platform minimums.
Research and write ${SCRATCH}/06-external-research.md covering:
A. Transcription options for iOS field voice notes as of 2026: Apple Speech framework — SpeechAnalyzer / SpeechTranscriber (iOS 26+) on-device: languages, long-form/file vs live, asset download model, accuracy/latency claims, availability on older OS; SFSpeechRecognizer (limits — ~1 min server requests, requiresOnDeviceRecognition, supportsOnDeviceRecognition); WhisperKit (argmax) on-device models, binary size, speed on A17/A18/A19-class devices; server-side APIs — OpenAI gpt-4o-transcribe / gpt-4o-mini-transcribe / whisper-1, Deepgram Nova-3, AssemblyAI Universal, Google Chirp 3, Groq whisper — price per minute/hour, latency, diarization, word timestamps, language support, file limits; Cloudflare Workers AI whisper (relevant: prod is on Cloudflare). Produce a decision matrix (offline-capable, noisy-site robustness, cost at 500 and 5,000 minutes/month, privacy, integration effort in a Swift app + Supabase edge function) and a recommendation for a hybrid (on-device draft immediately + server re-transcription for quality) with rationale.
B. Structuring voice transcripts into actionable items with an LLM (Claude) — patterns for extracting tasks/decisions/measurements/product mentions with confidence and human confirmation; cost per note; prompt/structured-output patterns; pitfalls (hallucinated tasks, numbers/units). Note Anthropic model IDs current as of 2026 from official docs if findable.
C. Adjacent/competitor field UX patterns (with screenshots described or feature pages cited): Houzz Pro (site visit, mood boards, mobile capture), Mydoma, DesignFiles, Studio Designer / Ivy mobile, Programa, CompanyCam (photo-first field documentation: auto-tag to project by location, before/after, voice-to-text notes, daily reports), Magicplan, Fieldwire / Buildertrend / Procore (daily logs, punch lists, voice notes), Apple Notes / Voice Memos (iOS 26 transcription UX), Otter/Plaud/Limitless (meeting capture → action items), Google Keep / Things quick-entry. Extract 10–15 concrete UX patterns worth borrowing (e.g., capture-first then file; context pinned for the session; auto-association by GPS/calendar; review-later inbox; one-thumb capture bar; lock-screen/Action-button/Control-Center entry; Siri/App Intents; Apple Watch quick note) with a note on applicability.
D. iOS platform affordances for "capture on the move": App Intents + Action button + Control Center controls + Lock Screen widgets + Live Activities for an active site visit + Siri Shortcuts + CarPlay-free dictation; background audio recording rules; Core Location visit monitoring for auto-project detection; EventKit calendar read for "which project am I at".
Return the structured output with report_path = that file.`,
  },
  {
    key: 'delivery-infra',
    model: 'sonnet',
    prompt: `${PROGRAM}

YOUR TASK (D7 — delivery, verification, and analytics infrastructure for Field). Read ${REPO}/.agents/skills/patina-ios-verification/SKILL.md (and any referenced files), ${REPO}/.agents/skills/patina-verification/SKILL.md, ${REPO}/.agents/skills/patina-testing/SKILL.md (iOS parts), ${REPO}/.agents/skills/patina-parallel-work/SKILL.md, ${REPO}/apps/mobile/Capture/scripts/* (capture-gate, generate_project.rb, capture-shots.sh, lint), ${REPO}/.github/workflows/* (iOS gates), ${REPO}/apps/mobile/Capture/Capture/Info.plist + entitlements + Capture.xcodeproj settings (deployment target, Swift version, SwiftLint config, test targets, signing team), ${REPO}/apps/mobile/Capture/README.md, and docs about TestFlight/distribution (grep docs/ for TestFlight, "device pass", cbe88574, "Field build"). Check whether Field has PostHog wired and which events it emits (grep capture(…) / PostHog in apps/mobile/Capture). Check feature-flag mechanism available to iOS (PostHog flags in Swift? remote config? compile-time?). Optionally: load the PostHog exec tool via ToolSearch and query whether ANY events from the Field app exist in the last 90 days (filter by $lib ios / app bundle or app name); if the tool is unavailable or unclear, say so — do not guess.
Produce ${SCRATCH}/07-delivery-infra.md: the exact gate commands that must pass for Field changes (build, tests, lint, shots), what a device pass requires and who can run it (Kody's LiDAR iPhone, blitz/MobAI harness — list the skills), pbxproj regen traps, Secrets.swift handling, permissions/entitlements checklist for adding microphone + speech recognition + background audio + App Intents + location, flag mechanism available, analytics state, CI coverage reality, and any distribution/TestFlight facts. Return the structured output with report_path = that file.`,
  },
]

phase('Discovery')
log(`Dispatching ${discoveryBriefs.length} discovery agents`)
const discovery = await parallel(discoveryBriefs.map(b => () =>
  agent(b.prompt, { label: `discover:${b.key}`, phase: 'Discovery', model: b.model, schema: DISCOVERY_SCHEMA })
    .then(r => r ? { key: b.key, ...r } : null)
))
const reports = discovery.filter(Boolean)
const missing = discoveryBriefs.map(b => b.key).filter(k => !reports.find(r => r.key === k))
if (missing.length) log(`WARNING: discovery agents returned nothing for: ${missing.join(', ')}`)
const reportIndex = reports.map(r => `- [${r.key}] ${r.report_path}`).join('\n')
const digest = reports.map(r => `### ${r.key}\n${r.summary}\nKey findings:\n${r.key_findings.map(f => `- ${f}`).join('\n')}\nOpen questions:\n${r.open_questions.map(q => `- ${q}`).join('\n')}`).join('\n\n')

const READ_ALL = `Discovery reports (READ ALL OF THEM IN FULL before writing — they are the evidence base; cite them as [D-key] and keep file citations they carry):\n${reportIndex}\n\nDiscovery digest:\n${digest}`

const SYNTH_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '≤500 words' },
    report_path: { type: 'string' },
    headline_points: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'report_path', 'headline_points'],
}

phase('Synthesis')
const [gap, tech] = await parallel([
  () => agent(`${PROGRAM}

${READ_ALL}

YOUR TASK (G1 — gap analysis and field-moments map). You may read the repo to verify any claim (read-only). Write ${SCRATCH}/10-gap-analysis.md:
1. Define "true field companion" as measurable outcomes (e.g., "a photo + voice note lands on the right project room in ≤3 taps and ≤10 s, offline-safe"; "a designer's site-visit output is a shareable site report without retyping"; "a market find becomes a Library product + FF&E candidate with price/lead-time captured").
2. FIELD MOMENTS: enumerate the designer's mobile moments (initial site visit/measure; client walk-through/meeting; market/showroom/sourcing trip; trade walk & punch list; delivery/receiving/install day; on-the-go thought/phone call aftermath; vendor visit; photo of a sample/finish; reading a plan on site) × CAPTURE TYPES (photo, burst/annotated photo, video clip, LiDAR scan, measurement, voice note → transcript → structured items, text note, product/specimen spec, finish/material sample, client preference/decision, task/punch item, party/contact, site condition/issue, delivery status) × PORTAL DESTINATIONS (Room File, project room, brief, FF&E line, Library product, task, decision, note/thread, Call Sheet party, receiving inspection, Desk triage). For each cell that matters, grade current state: EXISTS / PARTIAL / MISSING with the evidence file, and the friction (taps, required context, offline behavior).
3. Top 12 friction points ranked by designer impact, each with evidence.
4. What already works and must NOT be broken (site scan rig, specimen flow, Work flows, SMS rail, scan privacy rulings).
5. Guardrails from the constraint ledger that any design must satisfy.
Return structured output.`, { label: 'synth:gap-analysis', phase: 'Synthesis', model: 'opus', schema: SYNTH_SCHEMA }),
  () => agent(`${PROGRAM}

${READ_ALL}

YOUR TASK (T1 — technical architecture for the voice-note + field-note pipeline and capture→project landing). You may read the repo to verify (read-only) — especially supabase/functions/_shared, an existing edge function that uses an LLM (grep anthropic/claude in supabase/functions), the agent_tasks queue docs under ${REPO}/docs/agent-os/, packages/agent-queue, and how field_captures/commit_field_capture work. Write ${SCRATCH}/11-tech-architecture.md:
1. Capture pipeline design: iOS record (AVAudioRecorder / AVAudioEngine; format, chunking, interruption handling, background audio), immediate on-device draft transcript (Apple SpeechAnalyzer on iOS 26 with SFSpeechRecognizer fallback — confirm the app's deployment target from D7), durable local outbox (SwiftData @Model) surviving kill/offline, upload of audio to a bucket (propose exact path convention consistent with capture-media/<uid>/<clientToken>/), commit via an RPC (extend commit_field_capture or new RPC — argue which, with RLS), server-side re-transcription + structuring via an edge function triggered how (Storage webhook? DB trigger → pg_net? pg_cron sweep? agent_tasks kind?) — pick one consistent with Agent OS rules and justify; LLM structuring (Claude, structured output) into candidate items {task, decision, measurement, product mention, client preference, note} with confidence, landing as DRAFTS the designer confirms (portal Desk triage and/or in-app) — never auto-mutating business tables; idempotency keys; cost model; failure modes and retries; PII/consent considerations (recording people; client meetings).
2. Data model proposal: exact tables/columns (new vs extended), enums, RLS policies, indexes, and the provenance keys for project/room association; storage bucket policies; which migration files (numbered after the current filesystem max — state the number you observed and flag the prod-ledger-head-vs-parked-00512 hazard).
3. Edge functions: names, verify_jwt, inputs/outputs, shared modules; secrets needed; crons.
4. Portal surfaces (minimal): where drafts surface (Desk "From the field" / project inbox), confirm/dismiss actions, hooks to add (packages/supabase).
5. iOS architecture: which CaptureKit protocols/factories to add (follow the frozen-seam pattern), models, services, screens; App Intents / Action button / Control Center entry; offline semantics; telemetry events.
6. Sequencing: what can ship first with on-device transcript only (no server AI), then server re-transcribe, then structuring, then auto-association.
7. Risks and unknowns with mitigation; explicit list of Kody rulings needed.
Return structured output.`, { label: 'synth:tech-architecture', phase: 'Synthesis', model: 'opus', schema: SYNTH_SCHEMA }),
])
const synthDigest = [gap, tech].filter(Boolean).map(s => `### ${s.report_path}\n${s.summary}\n${s.headline_points.map(p => `- ${p}`).join('\n')}`).join('\n\n')
const SYNTH_PATHS = `Synthesis documents (READ IN FULL): ${gap ? gap.report_path : '(gap analysis missing)'} and ${tech ? tech.report_path : '(tech architecture missing)'}\n\nSynthesis digest:\n${synthDigest}`

phase('Directions')
const DIRECTION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    one_liner: { type: 'string' },
    report_path: { type: 'string' },
    summary: { type: 'string', description: '≤400 words' },
    effort_estimate: { type: 'string' },
    biggest_risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'one_liner', 'report_path', 'summary', 'effort_estimate', 'biggest_risks'],
}
const directions = [
  { key: 'A', lens: `DIRECTION A — "Project spine": Field's home is the designer's day (today's visits, active projects, rooms). Every capture happens INSIDE a project/room context chosen up front (or auto-detected from calendar/location), and lands directly in that place in the portal. The portal shows field material in place (room, brief, FF&E, tasks) with no inbox step.` },
  { key: 'B', lens: `DIRECTION B — "Capture first, file later": one-tap capture of anything (photo, voice, scan, specimen) with ZERO required context; the app pins context for a session when it can (last project, GPS, calendar) but never blocks; everything flows to a Field Inbox (in-app and on the portal Desk) where the designer or an assistant files items to rooms/FF&E/tasks — with AI-suggested filing the designer confirms.` },
  { key: 'C', lens: `DIRECTION C — "Moments as modes": explicit modes the designer starts — Site Visit, Client Walk-through, Market/Showroom, Trade Walk / Punch List, Install & Receiving — each with a tuned capture kit (what's one tap away), running as a Live Activity, and each ending with a GENERATED OUTPUT the portal understands (site report + Room File, meeting notes + decisions, sourcing sheet + Library products, punch list tasks assigned to parties, receiving inspection).` },
]
const dirResults = await parallel(directions.map(d => () => agent(`${PROGRAM}

${READ_ALL}

${SYNTH_PATHS}

YOUR TASK — design ONE direction independently and thoroughly (you may read the repo read-only to ground screen/flow proposals in what exists; reuse existing screens/flows/services wherever they fit):
${d.lens}
Write ${SCRATCH}/20-direction-${d.key}.md with:
1. Thesis (why this shape serves Leah on the move) and what it deliberately does NOT do (YAGNI).
2. Information architecture: home, primary nav, entry points (incl. Action button / Control Center / widget / Siri / share extension), session/context model, offline posture.
3. The 6–8 key user flows as numbered step lists with tap counts and timing targets, from the designer's hands to the portal surface where it lands (name the exact portal route/component/hook from [D-portal-flow]/[D-backend]).
4. Screen list with WIREFRAME DESCRIPTIONS precise enough for a designer to draw (layout regions, primary action, secondary actions, states: empty/recording/offline/syncing/needs-review), reusing Field's existing screens/components by name where possible; call out new vs modified vs removed screens.
5. Voice notes: how recording, transcript, structured items, confirmation and landing work in THIS direction.
6. Portal side: what changes (minimal) so field output appears in the project flow.
7. Data/back-end touchpoints (reference the tech architecture; note divergences you need).
8. Migration path from today's Field app (what gets kept, re-homed, retired; copy/placeholder cleanup).
9. Effort estimate by wave (S/M/L per work package, rough engineer-weeks), risks, and open rulings for Kody.
Return structured output.`, { label: `direction:${d.key}`, phase: 'Directions', model: 'opus', schema: DIRECTION_SCHEMA })))
const dirs = dirResults.filter(Boolean)
const DIR_PATHS = dirs.map(x => `- ${x.name}: ${x.report_path} — ${x.one_liner} (effort: ${x.effort_estimate})`).join('\n')

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    scores: { type: 'array', items: { type: 'object', properties: {
      direction: { type: 'string' }, workflow_fit: { type: 'number' }, speed_on_the_move: { type: 'number' }, feasibility_repo_fit: { type: 'number' }, effort_to_first_value: { type: 'number' }, risk: { type: 'number' }, total: { type: 'number' }, rationale: { type: 'string' } },
      required: ['direction', 'workflow_fit', 'speed_on_the_move', 'feasibility_repo_fit', 'effort_to_first_value', 'risk', 'total', 'rationale'] } },
    best_elements_to_graft: { type: 'array', items: { type: 'string' } },
    recommended_synthesis: { type: 'string' },
    concerns: { type: 'array', items: { type: 'string' } },
    report_path: { type: 'string' },
  },
  required: ['lens', 'scores', 'best_elements_to_graft', 'recommended_synthesis', 'concerns', 'report_path'],
}
const judgeLenses = [
  { key: 'designer-workflow', lens: 'DESIGNER-WORKFLOW lens: judge as Leah and as the portal product owner — does this make field work faster and land information where the project flow needs it without re-entry? Does it respect how designers actually work on site, at markets, with clients and trades? Copy/lexicon fit with Patina.' },
  { key: 'engineering', lens: 'ENGINEERING lens: judge feasibility against the actual repo (read code where needed): reuse of existing Field screens/services/seams, Supabase/Agent-OS rule compliance, migration/RLS burden, iOS platform risk (iOS 26 APIs, background audio, offline outbox), verification burden (device passes), and time-to-first-shippable-value.' },
]
const judges = (await parallel(judgeLenses.map(j => () => agent(`${PROGRAM}

${READ_ALL}

${SYNTH_PATHS}

Three design directions were produced independently (READ ALL THREE IN FULL):
${DIR_PATHS}

YOUR TASK — judge panel. ${j.lens}
Score each direction 1–10 on: workflow_fit, speed_on_the_move, feasibility_repo_fit, effort_to_first_value (10 = fastest), risk (10 = lowest risk); total = sum. Write a rationale per direction with evidence. Then: list the best elements to graft from the non-winning directions; write a recommended synthesis (what the final direction should be — it may be a hybrid); list concerns the plan writer must resolve. Write your full assessment to ${SCRATCH}/30-judge-${j.key}.md and return structured output.`, { label: `judge:${j.key}`, phase: 'Directions', model: 'opus', schema: JUDGE_SCHEMA })))).filter(Boolean)
const JUDGE_DIGEST = judges.map(j => `### Judge (${j.lens.slice(0, 60)}…) — ${j.report_path}\nScores: ${j.scores.map(s => `${s.direction}=${s.total}`).join(', ')}\nRecommended synthesis: ${j.recommended_synthesis}\nGraft: ${j.best_elements_to_graft.map(b => `\n- ${b}`).join('')}\nConcerns: ${j.concerns.map(c => `\n- ${c}`).join('')}`).join('\n\n')

phase('Plan')
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    package_path: { type: 'string' },
    plan_path: { type: 'string' },
    rulings_path: { type: 'string' },
    summary: { type: 'string', description: '≤600 words: the chosen direction, waves, first shippable slice, rulings needed' },
    wave_list: { type: 'array', items: { type: 'string' } },
  },
  required: ['package_path', 'plan_path', 'rulings_path', 'summary', 'wave_list'],
}
const CONVENTIONS = `REPO CONVENTIONS THE PACKAGE MUST HONOR (from CLAUDE.md/AGENTS.md): Supabase Auth only; types from @patina/types; data access via @patina/supabase hooks (portal) — no ad-hoc fetch; new server logic = Supabase edge functions (no new NestJS services); migrations hand-numbered NNNNN_slug.sql (never supabase migration new) — number after the true filesystem max and note that numbers are claimed at implementation time; every new public function must REVOKE anon EXECUTE explicitly (prod default-privs auto-grant anon); RLS policies TO authenticated; Agent OS: queue = agent_tasks via enqueue_agent_task, every transition audited, no automated external sends, drafts land awaiting_review; pg_cron for schedules; feature flags = PostHog fail-closed; Conventional Commits; never git add -A; parallel agents in separate worktrees; iOS verification per patina-ios-verification (Simulator proves little for camera/mic/LiDAR — device pass required; never install CODE_SIGNING_ALLOWED=NO builds for walks); pbxproj regen must be committed; Secrets.swift is gitignored; commit-msg hook rejects 'merge:' subjects. Patina lexicon: The Document, Desk, Rooms, Room File, Call Sheet, parties, specimen, Library — name new surfaces in that register; copy per patina-brand-voice.`

const plan = await agent(`${PROGRAM}

${READ_ALL}

${SYNTH_PATHS}

Design directions (read all): 
${DIR_PATHS}

Judge panel verdicts (read both full reports):
${JUDGE_DIGEST}

${CONVENTIONS}

YOUR TASK (P1 — write the development-ready package). Read ${REPO}/docs/design/field-capture/field-capture-p1-package.md first to match house style (numbered items, milestones/gates, rulings register). You may read the repo read-only to make every file reference real. Deliver exactly these three files (create the directory ${OUT}; do not touch any other repo file):

1. ${OUT}/field-companion-package.md — the SPEC/design doc: executive summary; chosen direction (synthesized per the judges — say what was taken from each and why); principles; personas and field moments; information architecture + navigation; user flows (numbered step lists with tap/time targets); screen catalogue with wireframe descriptions and states; voice-note pipeline end-to-end (iOS → storage → transcription → structuring → drafts → confirmation → landing) with the chosen transcription stack and costs; data model (tables/columns/enums/RLS/storage paths/migrations — exact DDL sketches); edge functions and crons; portal surfaces (routes/components/hooks, minimal); App Intents/Action button/Control Center/widgets/share-extension entry points; offline & sync semantics; telemetry events; security/privacy/consent; non-goals; migration path from today's app (keep/re-home/retire; placeholder-copy cleanup); rulings register (numbered rulings Kody must make, each with a recommended default).
2. ${OUT}/field-companion-plan.md — the PROGRAM PLAN: waves (Wave 1 = first shippable slice in ≤2 engineer-weeks that a designer would feel — make it voice-note-capable and project-landing-capable), each wave = work packages with: goal, files to create/modify (exact paths), interfaces (exact Swift/TS/SQL signatures neighbors rely on), acceptance criteria, test plan (Swift Testing / pgTAP / deno / jest names), gate commands (capture-gate, pnpm type-check, etc.), device-pass requirements, flags, rollout/rollback, dependencies, owner model size (Opus/Sonnet/Haiku), estimate. Then a FULL bite-sized implementation plan for Wave 1 ONLY in the superpowers writing-plans format: header block (Goal/Architecture/Tech Stack/Spec path/Global Constraints), then tasks of ≤10 steps each with checkboxes: write failing test (real test code), run (exact command + expected failure), implement (real code), run (expected pass), commit (exact pathspec git add + conventional message). No placeholders ("TBD", "add validation", "similar to task N") — every step shows the actual content. Later waves stay at work-package granularity with a note that each gets its own bite-sized plan at wave start.
3. ${OUT}/field-companion-rulings.md — the open rulings for Kody (numbered FC-R1…), each: question, options, recommended default, what it blocks.
Also append nothing to DECISIONS.md (Kody rules first). Return structured output with the three paths and a summary.`, { label: 'plan:write-package', phase: 'Plan', model: 'opus', schema: PLAN_SCHEMA })

if (!plan) { log('Plan writer returned nothing — stopping before review'); return { reports, gap, tech, dirs, judges, plan: null } }

phase('Review')
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }, confidence: { type: 'number' }, file: { type: 'string' }, location: { type: 'string' }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } },
      required: ['id', 'severity', 'confidence', 'file', 'location', 'claim', 'evidence', 'fix'] } },
    overall: { type: 'string' },
    report_path: { type: 'string' },
  },
  required: ['lens', 'findings', 'overall', 'report_path'],
}
const reviewLenses = [
  { key: 'repo-correctness', lens: `REPO-CORRECTNESS lens: verify EVERY concrete reference in the package and plan against the actual repo (read-only): file paths, Swift types/protocols/factories, hooks, tables/columns/RPCs, edge-function names, migration numbering (filesystem max; prod ledger head 00513 with 00512 parked), RLS/grant conventions, Agent OS rules (agent_tasks, awaiting_review, no external sends), no-new-NestJS rule, flag mechanism, Info.plist/entitlement needs, pbxproj regen, test-target names, gate commands. Flag any plan step whose code would not compile or whose SQL would not apply; flag placeholders; flag type-name drift between tasks.` },
  { key: 'product-ux', lens: `PRODUCT/UX + SCOPE lens: judge as Leah and as Kody. Does Wave 1 deliver felt value on the move? Are flows truly few-tap, offline-safe, one-handed? Does field output land where the portal project flow needs it without re-entry? Does it respect existing rulings (scan privacy, SMS governance, drafts-need-confirmation)? Is anything gold-plated (YAGNI) or missing (markets/showroom sourcing, trades/punch list, receiving, client meeting)? Are the rulings for Kody the right ones with sane defaults? Is copy in Patina's register? Is the sequencing right for learning fast?` },
]
const reviews = (await parallel(reviewLenses.map(r => () => agent(`${PROGRAM}

${READ_ALL}

${SYNTH_PATHS}

The package under review (READ ALL THREE IN FULL): ${plan.package_path}, ${plan.plan_path}, ${plan.rulings_path}.
Author's summary: ${plan.summary}

${CONVENTIONS}

YOUR TASK — adversarial review. ${r.lens}
Report EVERY finding, each with severity (critical/high/medium/low) AND confidence (0–1), file + location (heading/task/step), the claim, the evidence (what you checked in the repo or docs), and a concrete fix. Do not filter to high-severity only — the orchestrator filters. Write the full review to ${SCRATCH}/40-review-${r.key}.md and return structured output.`, { label: `review:${r.key}`, phase: 'Review', model: 'opus', schema: REVIEW_SCHEMA })))).filter(Boolean)
const allFindings = reviews.flatMap(rv => rv.findings.map(f => ({ ...f, lens: rv.lens.slice(0, 40) })))
log(`Review produced ${allFindings.length} findings (${allFindings.filter(f => f.severity === 'critical').length} critical, ${allFindings.filter(f => f.severity === 'high').length} high)`)

const revision = await agent(`${PROGRAM}

${SYNTH_PATHS}

${CONVENTIONS}

YOUR TASK (P2 — revise the package). The package files are ${plan.package_path}, ${plan.plan_path}, ${plan.rulings_path} (read all three in full). Two adversarial reviews were produced — read both in full: ${reviews.map(rv => rv.report_path).join(' and ')}.
Structured findings (${allFindings.length}):
${JSON.stringify(allFindings, null, 1)}

For each finding: verify it against the repo (read-only) — apply the fix if it holds (edit the three package files in place; you may read any repo file but edit ONLY those three), or reject with a one-line reason if it does not hold. Keep the writing-plans format for Wave 1 intact (no placeholders introduced). Append a "Revision log" section at the end of ${plan.plan_path} listing every finding id → applied/rejected + reason. Return structured output summarizing what changed and which findings were rejected.`, {
  label: 'plan:revise', phase: 'Review', model: 'opus',
  schema: { type: 'object', properties: { applied: { type: 'array', items: { type: 'string' } }, rejected: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['applied', 'rejected', 'summary'] },
})

return {
  discovery: reports.map(r => ({ key: r.key, report_path: r.report_path, summary: r.summary, key_findings: r.key_findings, open_questions: r.open_questions })),
  missingDiscovery: missing,
  gap: gap && { path: gap.report_path, summary: gap.summary, points: gap.headline_points },
  tech: tech && { path: tech.report_path, summary: tech.summary, points: tech.headline_points },
  directions: dirs,
  judges,
  plan,
  reviews: reviews.map(rv => ({ lens: rv.lens, report_path: rv.report_path, overall: rv.overall, findings: rv.findings })),
  revision,
}