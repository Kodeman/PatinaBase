# THE CLIENT PAGE — technical blueprint (Path B · The Threshold) — 2026-09-04

Rulings (Kody, 2026-09-04): Path B "The Threshold" is the destination; Path A "The Attendance" is its
ground floor for a project with no rooms. Any member of the studio that owns the project can write the
note. The drawing layer starts as a KEY generated once per project from project_rooms; replacing keys
with plan-set drawings comes later (out of scope).

UI spec = the two mockups in docs/design/the-client-page/ (path-b-the-threshold.html is the target;
path-a-the-attendance.html is the ground-floor composition). Fixture voice/copy rules apply.

## 0. Verified patterns

| Fact | Evidence |
|---|---|
| Shipped body surface | apps/client-portal/src/components/making/the-making.tsx — masthead + spine + open chapter (gates → tolls → tracking). "Absence is silence" rule in its header comment. |
| Flag read is client-side, fail-closed | apps/client-portal/src/hooks/use-feature-flag.ts:96; project-surface-switch.tsx:52 renders today's tree while isLoading. |
| Sole emitter of `client_project_view` | project-surface-switch.tsx:48 — never add a second emitter. |
| Chrome is global | apps/client-portal/src/app/layout.tsx:79 mounts <AppChrome projects>; app-chrome.tsx:18 PUBLIC_PREFIXES is a pathname allowlist, no flag read. |
| Destinations | nav-config.ts:25 — today, decisions, proposals, invoices, budget, documents, orders. `/messages` is a corner link in making-masthead.tsx:43. |
| Solo-redirect precedent | making/single-pane-solo-redirect.tsx — effect + router.replace, renders null. |
| Rooms carry order | project_rooms.sort_order integer NOT NULL DEFAULT 0 — 00066:234. EXISTS; do not add. No (project_id, sort_order) index. |
| Client can read rooms + FF&E | 00066:249 and 00066:297 policies. |
| Studio-member-of-project idiom | is_studio_comember(pj.designer_id) OR is_studio_comember(pj.lead_designer_id) OR is_studio_comember(pj.created_by) — 00420:248. Head body of is_studio_comember(uuid) = 00556:51 (SQL, STABLE, SECURITY DEFINER, search_path=public, org status='active'). |
| Client-of-project idiom | projects.client_id = auth.uid() (00441:88); broader party read = public.is_coordination_party(project_id) (00217:30). |
| Realtime pattern | postgres_changes on a filtered table + qc invalidation — use-comms.ts:533 (useThreadRealtime). Publication membership by migration: 00396_project_phases_realtime.sql (catalog precheck + EXCEPTION WHEN duplicate_object). |
| Designer composer precedent | apps/designer-portal/src/components/document/margin-rail.tsx:523-578 (useCreateMarginNote, composing/body state, announceDocumentWrite / DOCUMENT_WRITE_EVENT). Designer project page = apps/designer-portal/src/app/(document)/doc/[id]/page.tsx (3,241 lines, hot file). |
| Seeded client fixture | supabase/seed/first-flight-client-fixture.sql:36-42 — designer a0000000-…-0004, client a0000000-…-0005 (client@patina.dev), project b0000000-…-00d1 "Aspen Loft Refresh", sent proposal b0000000-…-0002. |
| Migration head | 00564. Next = 00565. 00555/00557/00562/00563/00564 deliberately UNAPPLIED on Strata — never plain `db push`. |
| Playwright override | apps/client-portal/playwright.config.ts webServer.env NEXT_PUBLIC_FLAG_OVERRIDES (beats .env.local for Playwright-started servers). |

### 🔴 Pre-condition (verified by Fable 2026-09-04)
`get_client_project_selections` lineage: 00422 → 00423 → 00433 → 00435 → 00439 → 00441 (head). 00423 emitted
origin, kind, clientUnitPriceCents, clientLineTotalCents, itemType, tradeJourney, instrument, allowance,
docCode, imageUrl, status; the head emits only id/threadId/name/category/assignmentScope/roomId/roomName/
quantity/productId/logisticsStatus. apps/client-portal/src/lib/commercial-documents.ts:782 defaults
origin→'legacy' → the-making.tsx:588 isCommercial=false → every selection-derived region is dark. Lane 0
restores the CLIENT-SAFE payload (read the banners of 00433/00435/00439/00441 first — they were
"safe reader"/"rpc boundaries"/"hardening" migrations; never re-expose trade cost / vendor pricing to the
client; client prices, origin, kind, instrument, tradeJourney, allowance, docCode, imageUrl are client-facing
by design in 00423).

## 1. DATA MODEL — supabase/migrations/00565_the_client_page.sql
Banner: intent; lineage of get_client_project_selections through 00565; note that grants are added
(regenerate seed/00-legacy-grants.sql via python3 scripts/generate-legacy-grants.py).

1a. Private predicates (policy-only) in schema app_private (precedent 00467): 
- app_private.is_project_studio_member(p_project uuid) RETURNS boolean — SQL STABLE SECURITY DEFINER
  SET search_path = public, pg_temp: EXISTS project where is_studio_comember(designer_id) OR
  is_studio_comember(lead_designer_id) OR is_studio_comember(created_by).
- app_private.is_project_client(p_project uuid) — projects.client_id = (select auth.uid()) OR
  public.is_coordination_party(p_project).
REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role. Reuse, never redefine,
is_studio_comember (head 00556) and is_coordination_party (00217).

1b. public.project_notes: id uuid PK; project_id → projects ON DELETE CASCADE; author_id → profiles
ON DELETE RESTRICT; body text CHECK(btrim<>'' AND char_length<=2000); enclosures jsonb NOT NULL DEFAULT
'[]' CHECK(array, length<=6, each element {kind in proposal|trade_scope|invoice, id uuid}); state text
CHECK IN ('standing','answered','retired') DEFAULT 'standing'; sent_at timestamptz DEFAULT now();
answered_at; retired_at; created_at/updated_at; CHECK ((state='retired') = (retired_at IS NOT NULL)).
Indexes (project_id, sent_at DESC); partial (project_id) WHERE state='standing'. updated_at trigger via
public.update_updated_at_column(). RLS TO authenticated: studio insert (WITH CHECK is_project_studio_member
AND author_id = auth.uid()); studio update (USING/WITH CHECK is_project_studio_member); studio select;
client select (is_project_client AND sent_at <= now()). NO DELETE policy. GRANT SELECT, INSERT, UPDATE TO
authenticated; ALL TO service_role. Realtime publication block copied from 00396.

1c. public.project_reading_marks (project_id, user_id) PK, read_at DEFAULT now(). RLS owner-only
(user_id = auth.uid()) SELECT/INSERT/UPDATE TO authenticated (WITH CHECK includes user_id).
RPC public.mark_project_read(p_project_id uuid) RETURNS timestamptz — plpgsql SECURITY DEFINER
search_path public, pg_temp: reject auth.uid() NULL; reject unless client or studio member; return the
PREVIOUS read_at (or NULL) then upsert read_at = now(). REVOKE FROM PUBLIC, anon; GRANT TO authenticated,
service_role.

1d. Repair get_client_project_selections in the same file: graft 00423:2940's body verbatim (furnishings +
trade branches; origin from project_commercial_documents is_origin AND document_kind='design_services'),
then keep: 00441's 'logisticsStatus' key (rename of 'status'), 00435's imageUrl LEFT JOIN products, 00441's
ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id, the head's authorization
preamble. Re-state grants in 00441:112 form. Verify the head-lineage banners' intent first (§0 pre-condition).

1e. Add CREATE INDEX IF NOT EXISTS idx_project_rooms_project_sort ON public.project_rooms(project_id, sort_order).

1f. Types + seed: export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres;
pnpm supabase:reset; python3 scripts/generate-legacy-grants.py; pnpm db:generate; commit
packages/supabase/src/database.types.ts. Seed supabase/seed/the-client-page.sql appended to BOTH
[db.seed] sql_paths and [remotes.staging.db.seed] sql_paths in supabase/config.toml; idempotent with fixed
UUIDs, guarded like first-flight-client-fixture.sql:46: one standing note on b0000000-…-00d1 by
a0000000-…-0004 with enclosure → proposal b0000000-…-0002; one retired note; one reading mark for
a0000000-…-0005 at now()-1 day. If the seeded project lacks a project_commercial_documents is_origin row,
the seed adds one so origin resolves 'commercial' locally.

## 2. HOOKS — packages/supabase/src/hooks/ (export from src/hooks/index.ts)
use-project-notes.ts: projectNotesKeys.list(projectId) = ['project-notes', projectId]; useProjectNotes
(select * where project_id order sent_at desc, enabled !!projectId; hand-typed ProjectNote interface
mirroring the row); useSendProjectNote({projectId, body, enclosures}) inserts with author_id from
auth.getUser(), invalidates list; useRetireProjectNote({noteId, projectId}) updates state='retired',
retired_at; useProjectNotesRealtime(projectId) postgres_changes on project_notes filter project_id, →
invalidate list; removeChannel on cleanup (lifecycle from use-comms.ts:533).
use-reading-marks.ts: useReadingMark(projectId) ['project-reading-mark', projectId] maybeSingle read_at;
useMarkProjectRead({projectId}) rpc mark_project_read → cache previous under
['project-reading-mark','previous',projectId]; invalidate the mark key only.

## 3. THE PAGE — apps/client-portal/src/components/threshold/
page.tsx stays a server component (fetchClientProjects + fetchClientProjectView + notFound); everything
flag-dependent is client-side via the extended ProjectSurfaceSwitch (§3.11).

Files: threshold.tsx (wiring, mirrors the-making.tsx; owns all hooks: useAuth, useHydrated,
useClientProposals + partitionProposals, useClientSelections, useProjectInvoices, useProjectRooms,
approvals via props, useProjectNotes, useProjectNotesRealtime, useReadingMark, useMarkProjectRead);
doorplate.tsx (making-masthead minus CORNER_LINKS, keeps StrataMark); doorstep.tsx (standing sentence,
Previously line, since row, house ledger, Letterbox); house-ledger.tsx; letterbox.tsx (wraps SpineToll);
plan-key.tsx (SVG from pure helper; <a href="#room-…"> per room; role="group"); room-band.tsx (sticky
lintel + ledger; pieces via TrackingRow; room-scoped gates); door-gate.tsx (SpineGate variant="signature"
+ leaf/hinge chrome + open/shut; uses useClientCommercialDocument); wall-gate.tsx (AcceptanceGate logic
lifted verbatim from the-making.tsx:396-509: useAcceptTradeScope, useClientCommercialDocument);
the-road.tsx (roomId null OR journeyStageIndexForStatus < delivered; reuses GOODS_JOURNEY_STAGES from
@/components/commercial/journey-stepper); the-note.tsx; previously.tsx; mat.tsx (people, papers, your
details, Leave the house = sign-out — REQUIRED or the page traps the client; /account reachable);
story-pole.tsx (splitSpinePhases + openChapterOf from making-spine.tsx; only the caret moves);
since-yesterday.tsx (dims [data-threshold-unit] without data-changed; open gates + toll never dim);
ground-floor.tsx (Path A order: Doorstep → Note → Enclosures → Bench → Toll → Rooms-as-lines →
Previously → Ahead → Colophon; same leaf components, no PlanKey/RoomBand).
Pure: apps/client-portal/src/lib/threshold/plan-key.ts (planKeyGeometry(rooms, marks) → rects, labels,
roadDash, doorMarks, leaders, viewBox; rooms in (sort_order, name, id); width ∝ floor_area_sqft else
equal, min 84px; road right of last room; door mark = 3px brass on the room carrying an open ask),
derive.ts (deriveThreshold(input) → marks, roomBands, road, ledger, changed — the ONLY join of
selections/proposals/invoices/rooms/notes/previousReadAt), standing.ts (thresholdStanding, previouslyLine,
keySentence — IMPORTS countInWords/moneyInWords/todayInWords/joinClauses from making/standing-sentence.ts;
edits nothing there).

Data map: Doorplate ← server project.name/location, openChapterOf().label, monthAndYear, useAuth user.
Doorstep sentence ← standing.ts from derived marks + openBalanceCents; null until hydrated && !loading.
House ledger ← computeInvoiceRollup (import '@/app/budget/rollup'; do not move) + useClientPlan
(use-commercial-client.ts:155) liveAuthorizedTotalCents vs Σ targetCents; held = gated trade draw;
awaiting = Σ proposal.total_amount over signatureGates. Letterbox ← soonest-due open invoice
(sortByDueDate from the-making.tsx:881) → SpineToll. PlanKey ← useProjectRooms + marks. RoomBand ←
rooms × selections grouped by roomId; lintel sums clientLineTotalCents. Door ← signatureGates proposal
whose selections (selection.instrument.proposalId) fall in the room; multi-room → highest-value room;
no room → Doorstep. Wall ← selection.kind==='trade' && tradeJourney==='substantially_complete' &&
instrument.proposalId (the-making.tsx:608-617) scoped by roomId. Road ← furnishings with roomId null or
stage < delivered. Note ← first standing note; enclosures resolved from proposals/invoices caches.
Previously ← retired notes + accepted instruments (partitionProposals). Mat ← useAuth, /account,
sign-out. StoryPole ← milestones. SinceYesterday ← useReadingMark; fire useMarkProjectRead once after
hydrated (ref-guarded); diff against the PREVIOUS timestamp. Ground floor ← rooms settled with length 0
or errored; while pending render the Doorstep and hold the house's place (never swap ground→house).
Project approvals (phaseId, no room) always stand on the Doorstep.

3.11 Switch: modify making/project-surface-switch.tsx — add useFeatureFlag('threshold'); branch FIRST on
!thresholdLoading && threshold → <Threshold/>; then single-pane → TheMaking; else ProjectViewWrapper.
Still the sole projectView emitter.

## 4. CHROME
Modify components/layout/app-chrome.tsx minimally: wrap the authenticated branch in a new
components/layout/threshold-chrome-gate.tsx that reads useFeatureFlag('threshold') and returns children
bare when !isLoading && value && /^\/projects\/[^/]+$/.test(pathname); otherwise renders the header.
Never add /projects to PUBLIC_PREFIXES. Accept one header→gone shift on flag resolve.
Create components/threshold/route-collapse.ts: ROUTE_COLLAPSE {'/today':'doorstep','/decisions':'doorstep',
'/proposals':'door','/invoices':'letterbox','/budget':'ledger','/documents':'mat-papers','/orders':'road',
'/messages':'note'}; collapsedHref(pathname, projectId) → `/projects/${id}#${anchor}` or null; exact
matches only (/proposals/[id]/sign, /decisions/[id] keep their routes).
Create components/threshold/threshold-route-collapse.tsx mirroring single-pane-solo-redirect.tsx:
props {projectIds}; usePathname + useFeatureFlag('threshold'); router.replace only when flag resolved
true AND projectIds.length === 1; renders null. Mount in app/layout.tsx beside AppChrome.
Multi-project clients: /projects list unchanged, full header everywhere, Threshold body only on detail.

## 5. FLAG
Mint NEW PostHog flag `threshold` (project 326191). Do not reuse single-pane. Targeting: distinct_id =
Supabase user UUID (identifyUser sends platform/email_domain/display_name/role, never email) → target an
explicit distinct_id list (pilot clients; Kody's client accounts 7d08a720…, d7c72fdb…, 839a0465…,
aca048c5… per the Single Pane memory) or add a `client_pilot` person property first. Local/e2e:
NEXT_PUBLIC_FLAG_OVERRIDES=threshold:true.

## 6. DESIGNER SIDE — "Write to your client"
Create apps/designer-portal/src/components/document/client-note-composer.tsx; mount in
app/(document)/doc/[id]/page.tsx in the letterhead instruments region beside ClientMirror, only for
row.engagement_kind === 'project', gated on useFeatureFlag('threshold').value. Shape from
margin-rail.tsx:517-578: collapsed DocumentAction "Write to your client"; textarea + enclosure checkbox row
+ DocumentActionRow Send / Never mind; on success dispatch DOCUMENT_WRITE_EVENT. Hook: useSendProjectNote.
Retire via useRetireProjectNote on the standing note. Enclosures default: pre-tick open proposal(s)
(furnishings_authorization/design_services pending) and any trade_scope at substantially_complete; open
invoice offered, not pre-ticked. Copy: field label "A line to <ClientFirstName>"; placeholder "Three last
pieces for the library — sign and I'll have them ordered by Friday."; enclosure "Send it with authorization
No. 7" / "Send it with the paintwork scope"; act "Send" / pending "Sending" / receipt "Sent <date>. It
stands on her page until she answers."; retire "Take it down" → "Taken down <date>. It moves to
Previously."; guardrail "She reads this on her page. Nothing is emailed." Keep the page.tsx diff to one
import + one mount; rebase before merge.

## 7. TESTS (client-portal coverage floor 70/60/70/70 — every new src file ships its test)
plan-key.test.ts (order, equal/proportional widths, door mark only where an ask is scoped, zero rooms →
rects [], road always). derive.test.ts (one wall mark for substantially_complete trade w/ proposalId;
roomId null → road; multi-room proposal → higher-value room; origin!=='commercial' → empty bands).
standing.test.ts (exact sentences for 1 door/0 walls, two-mark, zero-mark; keySentence 2|1|0).
doorplate.test.tsx (no <a> to /budget,/messages,/documents). doorstep.test.tsx. plan-key-render.test.tsx
(one <a href="#room-…"> per room; role group). room-band.test.tsx. threshold.test.tsx (rooms → house;
rooms [] → ground-floor testid; pending → neither; five facts in DOM). ground-floor.test.tsx (section
order). route-collapse.test.ts (8 paths; /proposals/abc/sign → null). threshold-route-collapse.test.tsx
(no redirect while loading / with 2 projects; replace once when true+solo). threshold-chrome-gate.test.tsx
(header while loading; absent on /projects/x flag true; present on /projects/x/scope-change/y).
project-surface-switch.test.tsx extended (threshold wins; projectView fires once per branch).
packages/supabase vitest: use-project-notes.test.ts, use-reading-marks.test.ts. Designer:
client-note-composer.test.tsx (defaults pre-ticked; DOCUMENT_WRITE_EVENT; nothing with flag off — do
NOT jest.mock('@patina/help-system'); mock @portabletext/react leaf if reached).
SQL: supabase/tests/rls/project_notes_test.sql (co-member inserts; other studio cannot; client SELECT only;
stranger zero rows; marks owner-only; mark_project_read returns previous then advances;
get_client_project_selections emits origin/kind/clientLineTotalCents/instrument/tradeJourney/logisticsStatus
for the seeded project and NEVER a trade/vendor cost key).
Playwright: apps/client-portal/tests/threshold.spec.ts (sign in client@patina.dev; open
/projects/b0000000-…-00d1; header count 0; doorplate; five facts from the seed; one key <a> per room;
standing note body). Add threshold:true to playwright.config.ts webServer.env NEXT_PUBLIC_FLAG_OVERRIDES.

## 8. GATES
DB: reset → generate-legacy-grants → db:generate + git diff --exit-code database.types.ts → psql rls test
→ probe jsonb_object_keys(get_client_project_selections(seed project)->'selections'->0).
pnpm --filter @patina/supabase type-check && test; pnpm --filter @patina/client-portal type-check && test
&& test:e2e -- tests/threshold.spec.ts; pnpm --filter @patina/designer-portal type-check && test -- <composer
test> && lint; pnpm --filter @patina/admin-portal build (shared package edited).
Deploy (migrations → portals → smoke): apply ONLY 00565:
  supabase db query --linked --file supabase/migrations/00565_the_client_page.sql
  supabase migration repair --status applied 00565
  supabase migration list --linked   # 00565 applied; 00555/00557/00562/00563/00564 still pending
Object probes on Strata (has_function_privilege authenticated on mark_project_read; select from
project_notes; jsonb keys of get_client_project_selections for a real project). Then
./infra/deploy-portal.sh client, ./infra/deploy-portal.sh designer (type-check both first;
client deploy needs NEXT_PUBLIC_SUPABASE_STORAGE_KEY exported per memory). wrangler deployments list
bottom row + rollback ids. Browser walk flag-on (header absent, key drawn, five facts) and flag-off
(header present, unchanged).

## 9. LANES (branch prefix client-page/, integration branch client-page/integration, worktree per lane)
| # | Lane | Size | Depends | Owns |
| 0 | RPC repair + 00565 + seed + types + SQL test | L | — | 00565, seed/the-client-page.sql, config.toml, seed/00-legacy-grants.sql, tests/rls/project_notes_test.sql, database.types.ts |
| 1 | Hooks | S | 0 | use-project-notes.ts, use-reading-marks.ts, hooks/index.ts, their tests |
| 2 | Pure derivations | M | 0 (shape only) | lib/threshold/{plan-key,derive,standing}.ts + tests |
| 3 | Leaf components | L | 2 | components/threshold/* leaves + tests |
| 4 | Wiring + ground floor + switch | M | 1,2,3 | threshold.tsx, ground-floor.tsx, project-surface-switch.tsx, projects/[projectId]/page.tsx (prefer no edit) |
| 5 | Chrome + route collapse | M | — | threshold-chrome-gate.tsx, app-chrome.tsx (minimal), route-collapse.ts, threshold-route-collapse.tsx, app/layout.tsx |
| 6 | Designer composer | M | 1 | client-note-composer.tsx + test, doc/[id]/page.tsx (one import + one mount) |
| 7 | E2E + flag + ship | S | 4,5,6 | tests/threshold.spec.ts, playwright.config.ts |
Shared-file rules: hooks/index.ts → lane 1 only; project-surface-switch.tsx → lane 4 only; app/layout.tsx →
lane 5 only; config.toml → lane 0 only; playwright.config.ts → lane 7 only; doc/[id]/page.tsx → lane 6 only.

## 10. RISKS
1 stripped RPC (Lane 0; SQL test asserts keys). 2 standing-sentence.ts shared + string-pinned → new
standing.ts imports primitives. 3 rollup.ts under app/budget → import, don't move. 4 header renders ≥1
commit before flag resolves → accept single shift; never blank. 5 sort_order uniform 0 → tiebreak
(sort_order, name, id). 6 proposals don't map to rooms → via selections; fallback Doorstep. 7 studio RLS
leak → app_private SECURITY DEFINER helper + cross-studio SQL test. 8 realtime publication → copy 00396;
refetch-on-focus fallback. Also: .env.local may point at prod — verify NEXT_PUBLIC_SUPABASE_URL is
127.0.0.1 before any reset; db push banned.
UNVERIFIED: PostHog flag name `threshold` free; seeded project has an is_origin commercial document.
