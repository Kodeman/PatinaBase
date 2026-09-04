# The Client Page — Implementation Plan (Path B · The Threshold, Path A ground floor)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Fable orchestrates; one
> fresh subagent per lane in its own worktree; a separate reviewer per lane before the next wave stacks on it.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the homeowner's project page as one chrome-less page — the house as a generated plan key with
rooms, doors-as-gates, the letterbox, the note, stamps, the mat — behind a new PostHog flag `threshold`, with a
studio-side "Write to your client" composer, to production on Strata + Cloudflare.

**Architecture:** One migration (00565) adds `project_notes` + `project_reading_marks` + `mark_project_read`
and repairs the stripped `get_client_project_selections` payload. Two `@patina/supabase` hook modules feed a new
`components/threshold/` tree in the client portal that reuses the shipped Making devices (SpineGate, SpineToll,
TrackingRow, StrataMark, standing-sentence primitives). A flag-gated chrome gate drops the global header on
`/projects/[id]`, and the seven old destinations collapse to anchors for solo-project clients. The designer
portal gains a one-instrument composer on the project document.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, Supabase (Postgres RLS, postgres_changes
realtime), PostHog flags, Jest (client/designer), Vitest (@patina/supabase), Playwright (client e2e), psql SQL tests.

**Spec:** `docs/superpowers/specs/2026-09-04-the-client-page-design.md` (the blueprint — sections §0–§10 are
cited by number below). UI spec: `docs/design/the-client-page/path-b-the-threshold.html` (target) and
`path-a-the-attendance.html` (ground floor). Proposal: `docs/design/the-client-page/README.md`.

## Global Constraints

- Rulings (Kody 2026-09-04): Path B is the destination; Path A is the no-rooms ground floor; any member of the
  owning studio writes the note; the drawing is a KEY generated once per project from `project_rooms`; plan-set
  drawings are out of scope.
- VISION §6 on every surface here: no shadows, no red/green status, no badges/count pills, no tabs, no "AI";
  scored-ink actions; page voice third person, first person only inside a quoted note. Patina voice
  (`.claude/skills/patina-brand-voice`).
- Money is integer cents. Types from `@patina/types` / generated `database.types.ts`, never redefined.
- Flag `threshold` is fail-closed everywhere: never render gated UI while `isLoading`; never blank a page.
- `making/standing-sentence.ts`, `app/budget/rollup.ts`, `making/*` components are REUSED, never edited (§10 risks 2–3).
- Migration numbering: `00565_the_client_page.sql` only; re-check head immediately before merge. Never
  `supabase db push` while 00555/00557/00562/00563/00564 are pending on Strata — selective apply (§8).
- Every new `apps/client-portal/src` file ships its test (coverage floor 70/60/70/70).
- Git: worktree per lane at `.codex/worktrees/agent-cp-<lane>`, branch `client-page/<lane>`, integration branch
  `client-page/integration`; pathspec-restricted commits only; worktrees retired at task end.
- Local DB: only Lane 0 runs `supabase db reset`. Verify `NEXT_PUBLIC_SUPABASE_URL` is `127.0.0.1` before any reset.

---

## Team

| Role | Model | Scope |
|---|---|---|
| Orchestrator + adversarial synthesis | Fable | plans, briefs, reviews, gates, ship decision |
| Lane 0 migration engineer | Opus | 00565, RPC repair, seed, SQL test, types |
| Lane 2 derivations engineer | Opus | pure `lib/threshold/*` with exhaustive tests |
| Lane 5 chrome engineer | Sonnet | chrome gate, route collapse |
| Lane 1 hooks engineer | Sonnet | `@patina/supabase` hooks |
| Lane 3 component engineers (×2) | Opus | leaf components, split A (doorplate/doorstep/ledger/letterbox/plan-key/story-pole/since-yesterday/mat) and B (room-band/door-gate/wall-gate/the-road/the-note/previously) |
| Lane 4 wiring engineer | Opus | threshold.tsx, ground-floor.tsx, switch |
| Lane 6 designer composer engineer | Sonnet | composer + mount |
| Lane 7 integration + e2e + ship | Opus | integration branch, e2e, flag, deploy, probes |
| Reviewers (one per lane, fresh context) | Opus | every finding with severity + confidence |

## Waves

- **W0 (parallel):** Lane 0 · Lane 2 · Lane 5
- **W1 (parallel, after W0 review):** Lane 1 (needs Lane 0 types) · Lane 3A + 3B (need Lane 2 interfaces)
- **W2 (parallel, after W1 review):** Lane 4 (needs 1, 2, 3) · Lane 6 (needs 1)
- **W3:** Lane 7 — integrate, full gates, e2e, flag, ship, probes, retire worktrees

---

### Lane 0: Migration 00565 — notes, reading marks, RPC repair, seed, types

**Files:**
- Create: `supabase/migrations/00565_the_client_page.sql`
- Create: `supabase/seed/the-client-page.sql`
- Create: `supabase/tests/rls/project_notes_test.sql`
- Modify: `supabase/config.toml` (`[db.seed] sql_paths` AND `[remotes.staging.db.seed] sql_paths`)
- Regenerate: `supabase/seed/00-legacy-grants.sql` (`python3 scripts/generate-legacy-grants.py`)
- Regenerate: `packages/supabase/src/database.types.ts` (`pnpm db:generate`)

**Interfaces:**
- Produces tables `public.project_notes`, `public.project_reading_marks` (§1b, §1c) exactly as specified;
  RPC `public.mark_project_read(p_project_id uuid) RETURNS timestamptz` (returns PREVIOUS read_at or NULL);
  predicates `app_private.is_project_studio_member(uuid)`, `app_private.is_project_client(uuid)`;
  repaired `get_client_project_selections(p_project_id uuid)` emitting, per selection, at least:
  `id, kind ('furnishings'|'trade'), origin ('commercial'|'legacy'), name, roomId, roomName, quantity,
  productId, imageUrl, clientUnitPriceCents, clientLineTotalCents, itemType, logisticsStatus, tradeJourney,
  instrument {proposalId, documentId, docCode, executedAt}, allowance {ceilingCents, resolvedCents}` —
  and NEVER a trade/vendor cost key.
- Seed rows (fixed UUIDs) consumed by Lane 7's e2e: standing note `c0000000-0000-0000-0000-00000000c001`,
  retired note `…c002`, reading mark for client `a0000000-…-0005`.

- [ ] **Step 1: Read the lineage before writing.** `grep -rln "CREATE OR REPLACE FUNCTION[^(]*get_client_project_selections" supabase/migrations/*.sql | sort` → 00422…00441. Read the banner of each of 00433/00435/00439/00441 and record WHY fields were removed (safe-reader/boundaries). Keep the head's authorization preamble and every hardening that does not concern the client-facing payload.
- [ ] **Step 2: Write the SQL test first** (`supabase/tests/rls/project_notes_test.sql`, `ON_ERROR_STOP=1`, uses `set role authenticated` + `request.jwt.claims` like the existing `supabase/tests/rls/*.sql`): studio co-member inserts a note; a second studio's member gets zero rows and cannot insert; the client SELECTs the standing note and cannot INSERT/UPDATE; a stranger sees zero rows; reading marks owner-only; `mark_project_read` returns NULL first, then the prior timestamp; `get_client_project_selections(seed project)` emits the keys above and no key matching `trade_price|vendor|cost`.
- [ ] **Step 3: Run it against the current stack and confirm it fails** (relations missing).
- [ ] **Step 4: Write 00565** per §1a–§1e (banner with lineage, idempotent, RLS in-file, explicit grants both directions, SECURITY DEFINER with pinned search_path, realtime publication block from 00396, index on `project_rooms(project_id, sort_order)`).
- [ ] **Step 5: Seed** per §1f, guarded/idempotent; add an `is_origin` `project_commercial_documents` row for the seeded project if absent so `origin` resolves `commercial` locally.
- [ ] **Step 6: Apply + regenerate.** `export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres; pnpm supabase:reset; python3 scripts/generate-legacy-grants.py; pnpm supabase:reset` (second reset proves the regenerated ACL seed replays) `; pnpm db:generate`.
- [ ] **Step 7: Gate.** `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls/project_notes_test.sql` PASS; probe `select jsonb_object_keys((get_client_project_selections('b0000000-0000-0000-0000-0000000000d1')->'selections')->0);` as the seeded client; `pnpm --filter @patina/supabase type-check`; `pnpm --filter @patina/client-portal type-check` (the repaired shape must not break the adapter); `pnpm --filter @patina/client-portal test -- making` (The Making's existing tests still green).
- [ ] **Step 8: Commit** with pathspecs: the six files above. Message `feat(db): 00565 — project notes, reading marks, client selections payload restored`.

### Lane 2: Pure derivations — `lib/threshold`

**Files:**
- Create: `apps/client-portal/src/lib/threshold/plan-key.ts`, `derive.ts`, `standing.ts`
- Test: `apps/client-portal/src/lib/threshold/__tests__/{plan-key,derive,standing}.test.ts`

**Interfaces (Produces — Lanes 3 and 4 import these names verbatim):**
```ts
// plan-key.ts
export interface KeyRoom { id: string; name: string; sortOrder: number; floorAreaSqft: number | null }
export type MarkKind = 'door' | 'wall'
export interface KeyMark { kind: MarkKind; roomId: string | null; label: string; anchor: string }
export interface PlanKeyGeometry {
  viewBox: string; rects: Array<{ roomId: string; x: number; y: number; w: number; h: number; anchor: string }>;
  labels: Array<{ roomId: string; x: number; y: number; text: string }>;
  road: { x1: number; x2: number; y: number; anchor: 'road' };
  doorMarks: Array<{ roomId: string; x: number; y1: number; y2: number; kind: MarkKind; anchor: string }>;
  leaders: Array<{ fromX: number; fromY: number; toX: number; toY: number; text: string }>;
}
export function planKeyGeometry(rooms: KeyRoom[], marks: KeyMark[]): PlanKeyGeometry
// derive.ts
export interface ThresholdInput { rooms; selections; proposals: { signatureGates; instrumentReceipts }; invoices; approvals; notes; previousReadAt: string | null; today: Date }
export interface ThresholdModel { marks: KeyMark[]; bands: RoomBandModel[]; road: RoadPieceModel[]; ledger: HouseLedgerModel; letterbox: InvoiceModel | null; note: NoteModel | null; previously: PreviouslyEntry[]; changed: Set<string> /* unit ids */ ; groundFloor: boolean }
export function deriveThreshold(input: ThresholdInput): ThresholdModel
// standing.ts
export function thresholdStanding(m: { doors: number; walls: number; balanceCents: number; nothingOwed: boolean; credenzaLine?: string }): string
export function previouslyLine(receipt: { label: string; date: Date } | null): string | null
export function keySentence(markCount: number): string
```
- Consumes: the RPC payload shape from Lane 0 (§1d) via `apps/client-portal/src/lib/commercial-documents.ts` `ClientSelection` types; `partitionProposals` from `making/the-making.tsx` (import, do not move).

- [ ] Step 1: write the three test files first from §7 (order/width/door-mark/zero-rooms/road; wall mark, road placement, multi-room proposal → highest-value room, `origin !== 'commercial'` → empty bands and `groundFloor` false only when rooms exist; exact sentence strings: "One door in this house is closed until you sign it.", the two-mark and zero-mark forms, "Nothing waits for your name. A balance of $9,125 stands due 15 August, and your walnut credenza is on the bench in Dayton." shape with the fixture, `keySentence(2|1|0)`).
- [ ] Step 2: run, confirm fail. Step 3: implement minimal. Step 4: `pnpm --filter @patina/client-portal test -- lib/threshold` PASS + `type-check`. Step 5: commit `feat(client): threshold derivations — plan key geometry, model, sentences`.

### Lane 5: Chrome gate + route collapse

**Files:**
- Create: `apps/client-portal/src/components/layout/threshold-chrome-gate.tsx` (+ `__tests__/threshold-chrome-gate.test.tsx`)
- Create: `apps/client-portal/src/components/threshold/route-collapse.ts` (+ test), `threshold-route-collapse.tsx` (+ test)
- Modify: `apps/client-portal/src/components/layout/app-chrome.tsx` (wrap the authenticated branch only)
- Modify: `apps/client-portal/src/app/layout.tsx` (mount `<ThresholdRouteCollapse projectIds=…/>` beside AppChrome)

**Interfaces:** `collapsedHref(pathname: string, projectId: string): string | null`; `ROUTE_COLLAPSE` map per §4; anchors `doorstep|door|letterbox|ledger|mat-papers|road|note` are the ids Lane 3 must put on its sections.
- [ ] Tests first per §7 (fail-closed while loading; absent on `/projects/x` when true; present on `/projects/x/scope-change/y`; no redirect with 2 projects; replace once). Implement. Gate: `pnpm --filter @patina/client-portal test -- layout threshold` + `type-check`. Commit `feat(client): threshold chrome gate and route collapse (flag-gated, fail-closed)`.

### Lane 1: Hooks — `@patina/supabase`

**Files:** Create `packages/supabase/src/hooks/use-project-notes.ts`, `use-reading-marks.ts`, tests under `packages/supabase/src/hooks/__tests__/`; Modify `packages/supabase/src/hooks/index.ts` (exports only).
**Interfaces (Produces):** `projectNotesKeys`, `useProjectNotes(projectId)`, `useSendProjectNote()`, `useRetireProjectNote()`, `useProjectNotesRealtime(projectId)`, `readingMarkKeys`, `useReadingMark(projectId)`, `useMarkProjectRead()` per §2; `ProjectNote` interface `{ id, projectId, authorId, body, enclosures: Array<{kind:'proposal'|'trade_scope'|'invoice'; id:string}>, state, sentAt, answeredAt, retiredAt }`.
- [ ] Tests first (vitest; key shapes, retire payload, realtime subscribe/removeChannel, RPC name/arg, previous cached). Implement. Gate: `pnpm --filter @patina/supabase test && type-check`; `pnpm --filter @patina/admin-portal build` (shared package edited). Commit `feat(supabase): project notes + reading mark hooks`.

### Lane 3A / 3B: Leaf components — `components/threshold/`

**Files (3A):** `doorplate.tsx, doorstep.tsx, house-ledger.tsx, letterbox.tsx, plan-key.tsx, story-pole.tsx, since-yesterday.tsx, mat.tsx` + tests. **(3B):** `room-band.tsx, door-gate.tsx, wall-gate.tsx, the-road.tsx, the-note.tsx, previously.tsx` + tests.
**Interfaces:** Consume Lane 2 types; every section root carries `id` from the anchor set (`doorstep, key, door, letterbox, ledger, road, note, previously, mat, mat-papers`, `room-<roomId>`) and `data-threshold-unit="<unit id>"` (+ `data-changed` when in `model.changed`). Styling: house tokens from the mockup (paper, ink, brass phase accent), scored ink from `making/scored-action.tsx`, no shadows, Inter 15px prose floor, mono ≥ 11px. Reuse `SpineGate`, `SpineToll`, `TrackingRow`, `StrataMark`, `journey-stepper` exports.
- [ ] Tests first per §7. Implement to the mockup (path-b) — the door leaf swing/collapse on sign (CSS 3D 520 ms, reduced-motion crossfade), the letterbox unfold, the lift on a piece, the story pole caret via IntersectionObserver. Gate: `pnpm --filter @patina/client-portal test -- threshold` + `type-check`. Commit per lane.

### Lane 4: Wiring + ground floor + switch

**Files:** Create `components/threshold/threshold.tsx`, `ground-floor.tsx` + tests; Modify `components/making/project-surface-switch.tsx` (+ extend its test); `app/projects/[projectId]/page.tsx` only if unavoidable.
- [ ] Tests first (house vs ground floor vs pending; five facts in DOM; switch precedence; projectView fires once). Implement per §3 data map; `useMarkProjectRead` fired once after hydration, diff against the PREVIOUS timestamp. Gate: full `pnpm --filter @patina/client-portal test` (coverage floor) + `type-check`. Commit `feat(client): the threshold — wiring, ground floor, surface switch`.

### Lane 6: Designer composer

**Files:** Create `apps/designer-portal/src/components/document/client-note-composer.tsx` + test; Modify `app/(document)/doc/[id]/page.tsx` (one import + one mount, project documents only, flag-gated).
- [ ] Tests first (enclosure defaults from an open proposal; `DOCUMENT_WRITE_EVENT` on success; nothing renders flag-off; never `jest.mock('@patina/help-system')`). Implement per §6 copy verbatim. Gate: `pnpm --filter @patina/designer-portal test -- client-note-composer`, `type-check`, `lint`. Commit `feat(designer): write to your client — project note composer`.

### Lane 7: Integration, e2e, flag, ship

- [ ] Merge lanes into `client-page/integration` in dependency order (0 → 2 → 5 → 1 → 3A/3B → 4 → 6); re-check migration head vs `main` before merge; renumber the undeployed side on collision.
- [ ] Full gates: `pnpm --filter @patina/supabase test && type-check`; `pnpm --filter @patina/client-portal type-check && test`; `pnpm --filter @patina/designer-portal type-check && test && lint`; `pnpm --filter @patina/admin-portal build`; DB reset + SQL test; probe RPC keys.
- [ ] E2E: `apps/client-portal/tests/threshold.spec.ts` per §7; add `threshold:true` to `playwright.config.ts` `NEXT_PUBLIC_FLAG_OVERRIDES`; run `pnpm --filter @patina/client-portal test:e2e -- tests/threshold.spec.ts`.
- [ ] Adversarial cross-lane review on the integration branch; fix; merge `client-page/integration` → `main` (`merge(client-page): …` lowercase subject per house convention); push.
- [ ] Flag: create PostHog flag `threshold` in project 326191, distinct_id-targeted (pilot client UUIDs + Kody's client accounts from the Single Pane memory), default 0%.
- [ ] Ship (authorized by Kody 2026-09-04 "deliver to prod"): apply ONLY 00565 via `supabase db query --linked --file …` + `supabase migration repair --status applied 00565`; `supabase migration list --linked` shows 00565 applied and the five still pending; object probes; `./infra/deploy-portal.sh client` then `designer` from a clean main checkout (type-check first; export `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` for client); `wrangler deployments list` bottom rows + rollback ids; browser walks flag-on and flag-off.
- [ ] Retire all `agent-cp-*` worktrees; delete merged branches (`git merge-base --is-ancestor`); update memory.

## Self-review (Fable, 2026-09-04)
- Spec coverage: §1 → Lane 0; §2 → Lane 1; §3 → Lanes 2/3/4; §4 → Lane 5; §5, §8 → Lane 7; §6 → Lane 6; §7 → every lane's tests; §10 risks carried into Global Constraints and Lane 0 step 1.
- Known gap accepted: the mockups' specimen controls are not shipped; "since yesterday" reads the reading mark, not a date toggle.
- Type consistency: anchor ids and `data-threshold-unit` names are fixed in Lane 5/3 interfaces; Lane 2's exported names are the ones Lanes 3/4 import.
