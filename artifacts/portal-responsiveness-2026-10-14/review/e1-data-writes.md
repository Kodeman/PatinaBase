# E1: Data and writes (US-33, SQ-953)

Seat: frontend/data engineer. Base: main `0c474d53b`. Code was read in this worktree. One scenario was
measured: P6, the task tick, in the local throttled lab. P7–P9 are **derived**. Every derived number is
marked **ESTIMATE** and is built from the code path and the prod request durations in
`baseline/BASELINE.md:97`: `auth/v1/user` p50 104 ms / p90 367 ms; other API p50 243 ms / p90 803 ms.
No product code changed.

## 0. What this seat found first (it changes the plan's premises)

1. **The Desk load runs on every document route, and every whole-`['document-state']` invalidation
   re-runs it.** `CommandBar` calls `useDeskEngagements()` unconditionally
   (`components/document/command-bar.tsx:404`) and is mounted once for all of `(document)`
   (`app/(document)/layout.tsx:125`). TanStack's default `invalidateQueries` refetches *active*
   queries, so a write anywhere re-runs the Desk queryFn. That queryFn is not 18 queries. It is 23
   parallel reads plus `outbound_drafts`, so 24 requests (`hooks/use-desk-engagements.ts:690-739`),
   plus one `procurement_claim_deadline` RPC per live claim PO (`:486-492`). It also polls every 60 s
   (`:692`).
2. **Measured P6:** one tick causes **27 refetches**: 24 for the Desk, 1 for the engagement row, 1 for
   `project_tasks` and 1 for `get_project_workflow`. The tick shows its new state at **748 ms** median
   and the network settles at **1,368 ms** (`baseline/data/e1-P6-1440.json`, §1.1).
3. **The realtime echo does not exist today.** `useCoordinationRealtime` listens to `client_decisions`,
   `project_tasks` and `project_ffe_items` (`packages/supabase/src/hooks/use-coordination.ts:1617-1648`).
   None of those tables is in the `supabase_realtime` publication. Locally the publication holds only
   `profiles`, `project_phases`, `fulfillment_events` and `project_notes`, and no migration adds the
   other three (`grep "publication supabase_realtime" supabase/migrations`). The lab saw **0**
   `postgres_changes` frames after the write (`e1-P6-1440.json`, `realtimeEchoFrames: []`). Prod
   membership was not queried, because this seat had no authorised prod-DB lane.
4. **The double subscription does not exist today either.** `CoordinationBand` "no longer mounts
   anywhere" (`app/(document)/doc/[id]/page.tsx:3780-3783`). Only `ScheduleSpine` subscribes
   (`schedule-spine.tsx:202`). A latent hazard remains, covered in §4.
5. **The counts differ from the plan.** In `packages/supabase/src` and `apps/designer-portal/src`
   (non-test) I counted:
   - 655 `useMutation` lines;
   - 9 `onMutate` sites across 7 files, not 5:
     - `use-availability.ts:82`;
     - `use-coordination.ts:1291`;
     - `use-scope-builder.ts:235` and `:285`;
     - designer `hooks/use-comms.ts:71`;
     - `hooks/use-orders.ts:161`, `:200` and `:234`;
     - `hooks/use-piece-field.ts:64`;
   - 1,400 `invalidateQueries` lines;
   - 51 single-line whole-`['document-state']` invalidations across 38 files;
   - 212 `auth.getUser()` sites.

## 1. Mutation ranking

**Use signal.** I ran a read-only PostHog query over 30 days on `app.patina.cloud` (Appendix A). It
covers at most 3 people, so it shows which surfaces get used. It is not a volume estimate. The task tick
is not instrumented at all. The scenarios carry the rest of the weight: P6 tick, P7 phase advance,
P8 add room/piece/line and P9 approve/send.

Several high-count keys are not writes:
- `document_margin_note` (78) is a wayfinding hint (`components/document/margin-note.tsx:289,303`);
- `toggle-library-add` and `toggle-record` are disclosures;
- `add-folio-image-url` edits local draft state (`compose/composing-page.tsx:487`).

### 1.1 P6 measured: the tick (CPU 4×, Fast 4G, 3 pairs, `baseline/data/e1-P6-1440.json`)

| | write (PATCH `project_tasks`) | tick shows new state | network settled | refetches after write |
|---|---|---|---|---|
| tick | 214→447 (233 ms) | **748** [579–789] | **1,368** [1,234–1,453] | 27 [27–29] |
| untick | 37→218 (177 ms) | **465** [456–470] | **1,126** [1,118–1,135] | 27 |

How a click plays out:
1. The click issues the write.
2. About 50–100 ms after the write ends, `onSuccess` invalidates (`hooks/use-section-work.ts:155-159`).
3. `project_tasks` is refetched (about 170 ms).
4. The tick shows its new state about 25 ms after that.
5. The network then stays busy for another 650–700 ms, and **all of that is the Desk sweep.**

The tick's later write start (87–236 ms) comes from main-thread contention. Late page-load reads
(`project_ffe_placements`, `project_palettes`, `can_see_studio_margin`) were still landing when the click
fired (`beforeWrite`). That is E2's lane.

Against B1 (a visible change within 100 ms), today's tick misses by **4.6–7.5×**.

**Prod ESTIMATE for the same path:**
- the write plus the tasks refetch takes 2 × 243 ≈ 0.49 s p50, or 1.6 s p90;
- the network settles at about 243 + 803 ≈ 1.05 s, because the slowest of 27 parallel requests sits
  near p90.

### 1.2 Ranked list

The legend for the "Click→settled" column:
- *W* is the write.
- *R* is the refetch count on a Document route.
- *Desk* means the 24-request Desk sweep plus 1 engagement-row refetch.

Visible and settled times for P7–P9 are **ESTIMATES** (model in §1.3).

| # | Action (signal) | Hook | Click→settled today | Proposal | Rollback | Honesty constraint |
|---|---|---|---|---|---|---|
| 1 | Tick / untick a task (P6) | `useToggleSectionTask` `apps/designer-portal/src/hooks/use-section-work.ts:141` | W PATCH; inv `section-tasks`, **whole `document-state`**, workflow (`:155-159`); **R 27 measured** | **OPTIMISTIC** | restore the previous `['section-tasks',pid]`; inline error on the row | internal record; nothing leaves the studio |
| 2 | Add a task (`add-task` 2) | `useCreateSectionTask` `use-section-work.ts:105` | `getUser` (`:116`) + INSERT; inv `section-tasks` + whole `document-state` (`:133-137`); R ≈ 26 | **OPTIMISTIC** (client UUID) | remove the temp row; restore the typed title | internal |
| 3 | Resolve a coordination item | `useResolveCoordinationItem` `packages/supabase/src/hooks/use-coordination.ts:1268` | already optimistic (`:1291`); onSettled inv 10 keys incl. whole `document-state` + whole `margin-items` (`:1340-1355`); R ≈ 30 | keep **OPTIMISTIC**, narrow | as today (`:1331-1335`) | the RPC may notify the court party, so the optimistic state must not say "sent to GC"; it may say "answered" |
| 4 | Advance a phase (P7) | `useUpdateProjectPhaseStatus` `packages/supabase/src/hooks/use-project-v2.ts:592` | RPC `advance_project_phase` with CAS (`:626-630`); inv phases, project-v2, **whole `['projects']`**, **whole `document-state`**, workflow (`:638-642`); R ≥ 29. ESTIMATE visible 0.49 s p50 / 1.6 s p90, settled ≈ 1.05–1.6 s | **PENDING-ONLY** | n/a; on refusal show the server's blocker | server-gated (`expected_status`, `blocks_advance`); the client portal shows the phase. Re-evaluate for optimistic once the refusal rate is measured |
| 5 | Add a room (P8; `add-project-room` 6) | `useAddDocumentRoom` `apps/designer-portal/src/hooks/use-document-rooms.ts:40` | **3 serial RTTs**: SELECT max `sort_order` (`:45-50`), INSERT (`:52-61`), refetch `['document-rooms',pid]` (`:66`). The form closes at 0 ms (`ffe-section.tsx:940-946`). ESTIMATE visible 0.73 s p50 / 2.4 s p90 | **OPTIMISTIC** | remove the temp row; reopen the inline form with name/budget restored | internal |
| 6 | Add a schedule line (P8; 16+5) | `useCreateNamedProjectNeed` `packages/supabase/src/hooks/use-project-ffe-ga.ts:224` | RPC; `invalidateProjectFfe` (`:161-176`): `project-ffe-items` prefix (every filter variant), `['projects',pid]` prefix, whole `procurement-items`, whole `project-ffe-readiness`, workflow, 2 board keys, 2 review keys; R ≈ 8–12. ESTIMATE visible 0.49 s / 1.6 s | **OPTIMISTIC** (placeholder row) | remove the row; reopen the sheet with its input | internal placeholder line |
| 7 | Place a piece in a project (`add-piece-to-project` 16, `open-add-to-project` 19) | `usePlaceInDocument` `apps/designer-portal/src/hooks/use-place-in-document.ts:26` → `usePlaceProductInProjectV2` `use-project-ffe-ga.ts:178` | RPC with idempotency key; `invalidateProjectFfe` + `library-piece-usage`; R ≈ 9–13 | **PENDING-ONLY** | n/a | the server decides the outcome (created / reused / filled / **held for duplicate review**, `components/document/rooms/piece/add-to-project-sheet.tsx:95-97`), so the UI cannot honestly predict it |
| 8 | Promote a piece to the studio library (19) | `usePromoteToStudio` `packages/supabase/src/hooks/use-promote-to-studio.ts:30` | sheet then write; prefix sweeps | **PENDING-ONLY** | n/a | the studio-wide library changes for every member |
| 9 | Save / compose a piece (17+17) | `useComposePiece` `apps/designer-portal/src/hooks/use-compose-piece.ts:43` | `getUser` (`:50`) + up to 4 serial writes (`:69-103`); inv whole `products`, `layer-products`, `layer-counts` (`:120-122`) | **LEAVE** (already reads `isPending`) | n/a | drop the `getUser` (§5) |
| 10 | Edit a piece field | `usePieceField` `apps/designer-portal/src/hooks/use-piece-field.ts:64` | already optimistic | **LEAVE** | as today | internal |
| 11 | Add an invoice line (12) | `useAddInvoiceBillingLines` `packages/supabase/src/hooks/use-buying-phase2.ts:1381` | RPC; inv whole `['invoices']` + 4 keys (`:1401-1405`) | **PENDING-ONLY** | n/a | totals are computed by the server; a draft invoice is money copy |
| 12 | Record an invoice payment (7+6) | `useRecordPayment` `packages/supabase/src/hooks/use-invoices.ts:1058` | RPC `record_invoice_payment` (`:1079`) | **LEAVE (never optimistic)** | n/a | **payment** |
| 13 | Issue / send an invoice (1) | `useSendInvoice` `use-invoices.ts:1111` | `functions.invoke('invoice-send')` (`:1141`) | **LEAVE (never optimistic)** | n/a | **external send** |
| 14 | Send outbound drafts (P9) | `useSendOutboundDrafts` `packages/supabase/src/hooks/use-outbound-drafts.ts:59` | edge fn `outbound-draft-send`; inv only `['outbound-drafts']` (`:13-15,67`). ESTIMATE ≥ 0.49 s p50 plus provider time (not measured) | **LEAVE (never optimistic)**; pending already exists (`ready-to-send-sheet.tsx:167,314`) | n/a | **external send.** Per-id results only. **Gap:** the Desk card reads `outbound_drafts` under `['document-state','desk']` (`use-desk-engagements.ts:707`) and is not invalidated, so it stays up to 60 s after a send |
| 15 | Discard an outbound draft (P9) | `useDiscardOutboundDraft` `use-outbound-drafts.ts:47` | RPC; inv `['outbound-drafts']` | **PENDING-ONLY** | n/a | **delete without Undo** |
| 16 | Edit an outbound draft's text (P9) | `useUpdateOutboundDraft` `use-outbound-drafts.ts:33` | RPC; inv `['outbound-drafts']` | **OPTIMISTIC** | restore the previous text | the edit is internal; the optimistic state must never read "sent" |
| 17 | Timer start (`time_timer_started` 50, mostly `timer_auto`) | `useStartTimer` `packages/supabase/src/hooks/use-time-tracking.ts:724` | RPC; inv `runningTimer` (`:745`) | **LEAVE** | n/a | background act |
| 18 | Timer stop (26) | `useStopTimer` `use-time-tracking.ts:768` | 2 serial writes (`:777,800`); `invalidateProjectTime` | **PENDING-ONLY** | n/a | the stopped minutes are billable money |
| 19 | Edit FF&E spec fields (5) | `useSetFfeLineSpecFields` `packages/supabase/src/hooks/use-add-to-the-job.ts:90` | write; `invalidateFfeCaches` (`use-procurement.ts:298-308`): 4 keys, 2 of them whole-prefix | **PENDING-ONLY** + narrow | n/a | spec readiness is computed by the server |
| 20 | Set line commercials | `useSetFfeLineCommercials` `use-project-v2.ts:325` | RPC; refused once the line is on a PO | **PENDING-ONLY** | n/a | money; server-refusable |
| 21 | Hold an install window (2) | `useHoldInstallWindow` `packages/supabase/src/hooks/use-install-window.ts:93` | RPC; `invalidateAfterInstallWindowAct` + `settleScheduleWrite` fresh-fetch (`:72-90`, `schedule-write-settle.ts:38-60`) | **PENDING-ONLY** | n/a | proposes a date to the household |
| 22 | Add / update a schedule milestone | `useAddScheduleMilestone` `packages/supabase/src/hooks/use-schedule-compose.ts:65` | write + `settleScheduleWrite` | **PENDING-ONLY** | n/a | the server resolves dates (00480 materialisation) |
| 23 | Archive a project (3) | `useSetProjectStatus` (bound at `components/document/doc-colophon.tsx:92`) | confirm sheet, then write | **LEAVE** | n/a | ends the job; a confirm already exists |
| 24 | Reorder proposal lines / rooms | `use-scope-builder.ts:222`, `:285` | already optimistic | **LEAVE** | as today | the pattern source for §2 |
| 25 | Milestone trigger select | `useUpdateMilestoneTrigger` `apps/designer-portal/src/hooks/use-account-page.ts:300` | write; inv `['account-page',pid]`. The select is controlled by the server value (`account-band.tsx:79`), so it **snaps back** until the refetch lands | **OPTIMISTIC** | restore the previous value | config, not payment |
| 26 | Feedback reaction | `useReactToFeedback` `packages/supabase/src/hooks/use-feedback.ts:293` | RPC; inv `['feedback-note',id]` | **OPTIMISTIC** | remove the reaction | internal |

### 1.3 Model behind the ESTIMATES

- Serial stages add up. Each stage is the slowest request in it.
- A lone request costs p50 243 / p90 803.
- A parallel wave of 20 or more requests is bounded near p90 (803), because its slowest member sits in
  the tail.
- "Visible" means the stage that refetches the key the clicked surface renders. "Settled" means the
  slowest member of the wave.

The model reproduces the lab's shape (visible = write + one refetch; settled = write + slowest of 27).
The absolute numbers are prod-scale, not lab-scale.

## 2. Shared helper: `useOptimisticMutation` (packages/supabase)

The helper generalises the four existing shapes:
- `use-scope-builder.ts:234-261`: cancel, snapshot, `setQueryData`, return `{ previous, key }`, restore
  on error, invalidate on settle;
- `use-coordination.ts:1291-1335`: the same shape over **two** keys, a context that holds every snapshot
  and per-key restore;
- `use-piece-field.ts:64-87`;
- `use-availability.ts:82-95`.

It adds no new semantics. It only makes the shape impossible to write wrong.

```ts
// packages/supabase/src/hooks/optimistic.ts
export interface OptimisticPatch<TVars> {
  /** Exact cache key this patch rewrites (never a prefix). */
  queryKey: QueryKey;
  /** Pure updater; receives undefined when the key is not cached → return undefined to skip. */
  apply: (old: unknown, vars: TVars) => unknown;
}

export interface UseOptimisticMutationOptions<TData, TVars>
  extends Omit<UseMutationOptions<TData, Error, TVars, OptimisticContext>, 'onMutate' | 'onError' | 'onSettled'> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** One or more cache rewrites; resolved per call so keys can depend on vars. */
  patches: (vars: TVars) => OptimisticPatch<TVars>[];
  /** Keys to re-read on settle — exact keys from the factory (§3), refetchType defaults 'active'. */
  settle: (vars: TVars, data: TData | undefined) => InvalidateTarget[];
  /** Serialises same-row clicks (TanStack v5 `scope`). Required. */
  scopeId: (vars: TVars) => string;
  /** Category guard; see §2.2. */
  honesty: 'internal';
  onError?: (err: Error, vars: TVars) => void;     // surface; rollback already done
}
export type InvalidateTarget = { queryKey: QueryKey; refetchType?: 'active' | 'none' };
type OptimisticContext = { snapshots: Array<[QueryKey, unknown]> };
```

### 2.1 Contract

- **onMutate(vars):**
  1. For each patch, `await qc.cancelQueries({ queryKey, exact: true })`. This copies
     `use-coordination.ts:1294-1295`, so an in-flight refetch cannot overwrite the patch.
  2. Snapshot `qc.getQueryData(queryKey)`.
  3. If a snapshot is not `undefined`, `setQueryData(queryKey, apply(old, vars))`. This matches the
     `if (prevItems)` / `Array.isArray` guards at `:1300` and `:1316`.
  4. Return `{ snapshots }`.

  Rows the patch creates carry a client-generated UUID that is also sent as the row id. Inserts then
  need no temp-id swap, and duplicate clicks dedupe on the primary key.
- **onError(err, vars, ctx):** restore every snapshot that is not `undefined`, in reverse order
  (`:1331-1335`, `use-scope-builder.ts:251-255`). Then call the caller's `onError` for the inline
  message. The global `MutationCache.onError` toast still runs unless `meta.errorSurface === 'inline'`
  (`apps/designer-portal/src/lib/react-query.ts:109-140`).
- **onSettled(data, err, vars):** `invalidateQueries` for each `settle()` target with `exact`
  semantics from the key factory. Return the promise, so that `isPending` covers the reconcile, as
  `use-scope-builder.ts:257-261` does with `await`.
- **scope:** `{ id: scopeId(vars) }` (`@tanstack/query-core@5.90.20` supports mutation scopes). Two
  fast clicks on the same task then run in order and cannot race into a lost state. The second click
  reads the optimistic row, so it sends the reverse transition. That is the intended toggle.

### 2.2 Honesty guard

`honesty: 'internal'` is a required literal. It exists so a reviewer must assert it. Payment, send and
delete-without-Undo hooks (#12–15, #23) never use this helper; they use plain `useMutation` with
pending UI. The gate is a unit test that greps the helper's call sites against a deny list of RPC and
edge names (`record_invoice_payment`, `invoice-send`, `outbound-draft-send`, `discard_*`, `delete`).

### 2.3 What D2 can rely on

- **Optimistic actions:** the cache changes before the network request leaves, so the visible change
  costs one React render.
  - Lab evidence: the tick shows its new state about 25 ms after its data lands (`e1-P6-1440.json`).
  - That bounds an optimistic tick at roughly one frame plus a render at 4× CPU. ESTIMATE ≤ 50 ms;
    the Playwright gate is in §7.
  - D2 gets `mutation.isPending` for the "not yet confirmed" period, and `isError` plus a restored
    previous value on failure.
  - Rollback lands at write failure: p50 243 / p90 803, plus up to one network-error retry
    (`react-query.ts:233-240`).
- **Pending-only actions:** `isPending` is true synchronously on click, so the pending mark can appear
  in the same frame.
  - The confirmed state arrives after write + one narrowed refetch: ESTIMATE 0.49 s p50 / 1.6 s p90
    in prod.
  - Sends are additionally gated on per-id results (`use-outbound-drafts.ts:62`).
- **What D2 must never show** before `onSuccess`: "sent", "paid", "removed" without Undo, or "approved
  by client".

## 3. Invalidation narrowing map

### 3.1 Key factory shape

Extend the existing factory idiom (`peopleKeys` in `packages/supabase/src/hooks/use-people.ts:209-214`,
`outboundDraftKeys` in `use-outbound-drafts.ts:8-12`) to the document model, in
`packages/supabase/src/query-keys/document.ts`:

```ts
export const docKeys = {
  all:        ['document-state'] as const,                                    // never invalidated directly
  desk:       (orgId?: string) => ['document-state', 'desk', ...(orgId ? [orgId] : [])] as const,
  engagement: (id: string)     => ['document-state', 'engagement', id] as const,
  person:     (dcId: string, profileId: string | null) => ['document-state', 'person', dcId, profileId] as const,
};
export const projectKeys = {
  tasks:      (pid: string) => ['section-tasks', pid] as const,
  workflow:   (pid: string) => ['project-workflow', pid] as const,               // = projectWorkflowQueryKey
  phases:     (pid: string) => ['project-phases', pid] as const,
  ffe:        (pid: string) => ['project-ffe-items', pid] as const,              // prefix of the 2 variant keys
  rooms:      (pid: string) => ['document-rooms', pid] as const,
  margin:     (pid: string) => ['margin-items', pid] as const,
  coordination: (pid: string) => ['coordination-items', pid] as const,
};
/** One write → which surfaces. The Desk is marked stale, not refetched, off /desk. */
export function touch(qc: QueryClient, pid: string, engagementId: string | null, opts: { desk: boolean }) { … }
```

The rule: a write invalidates **its own project's keys plus its own engagement row**. It marks the
Desk stale with `refetchType: 'none'` only when the write changes a Desk input. The Desk then refetches
when `/desk` mounts it, through the default `refetchOnMount` for stale data. That is a cheap read of a
warm cache: it was stale anyway.

### 3.2 Map

| Today | Replace with | Refetches saved per action (Document route) |
|---|---|---|
| whole `['document-state']` (51 sites, e.g. `use-section-work.ts:136,157`, `use-project-v2.ts:641`, `use-coordination.ts:1347,1670`, designer `hooks/use-margin-items.ts:41`) | `docKeys.engagement(id)` + `docKeys.desk()` with `refetchType:'none'` | **−24** (the Desk sweep). Measured P6: 27 → 3 |
| `['margin-items']` whole (`use-coordination.ts:1346`, designer `hooks/use-margin-items.ts:40`, realtime `:1623`) | `projectKeys.margin(pid)` | every other project's margin key; 0–1 active on a single Document (30 s poll, `use-margin-items.ts:20`) |
| `['projects']` whole (`use-project-v2.ts:640`; 14 single-line sites) | `['projects', pid]` | every `['projects', …]` list and detail mounted elsewhere; ESTIMATE 1–3 on a Document |
| `['procurement-items']`, `['project-ffe-readiness']` whole (`use-procurement.ts:302,305`) | keep the prefix, **`refetchType:'none'`** when off the Buying surface | these are cross-project reads; this stays honest because they refetch on mount |
| `['invoices']` whole (`use-buying-phase2.ts:1401`) | `['invoices', 'project', pid]` | ESTIMATE 1–2 |
| `peopleKeys.all` (25), `peopleSeatKeys.all` (22), `emailDeliveryKeys.all` (11) … 112 `Keys.all` sites in total | `peopleKeys.person(id, role)` + `list` with `refetchType:'none'` | the People directory refetch (1 big read) per contact edit, when not on /people |
| `['desk-engagements']` (10 sites) | **delete**: no query uses this key (`grep` finds only invalidations) | 0 requests; the gain is honesty in the code |
| `CommandBar` holds the Desk load hot (`command-bar.tsx:404`) | `useDeskEngagements({ enabled: open })`, or a slim ⌘K index query | removes the 60 s 24-request poll from every non-Desk route. **Risk:** `doc/[id]/page.tsx:1103-1110` and `page.test.tsx:133` rely on the warm key; the page's own enrichment observer still fetches when `deskEnrichment` applies |

**Under-invalidation to fix in the same pass:** send and discard (#14, #15) must also mark
`docKeys.desk()` stale. Today the Desk's "ready to send" card persists for up to 60 s after a send
(`use-desk-engagements.ts:692,707`).

**Per action, ESTIMATE of requests removed:**
- tick or add-task: −24 (measured base 27);
- phase advance: −24 to −27;
- resolve item: −24 to −25;
- schedule line: −2 to −4 (no `document-state` today, but whole `procurement-items` and readiness);
- add room: 0, because it is already narrow. Its cost is the 3 serial RTTs, not fan-out.

## 4. Realtime

**The echo of your own write.** Today it costs nothing, because no event arrives (§0.3). If the three
tables are ever published, the current handler (`use-coordination.ts:1620-1626`) would **double** every
write's wave, since the handler re-invalidates whole `['document-state']` and `['margin-items']`. It
would also, per TanStack's default `cancelRefetch`, cancel and restart the refetch that `onSuccess`
already started. Before or together with any publication change:

1. **Apply rather than invalidate.** For `project_tasks` and `client_decisions` UPDATE events, write
   `payload.new` into `projectKeys.tasks(pid)` / `projectKeys.coordination(pid)` by id, as
   `use-comms.ts:550-575` already does. That handler skips existing ids on INSERT and replaces by id on
   UPDATE. The echo of your own write then becomes a no-op that rewrites identical data.
2. **Drop the echo explicitly.** The optimistic helper records `{table, id, updated_at}` for writes it
   sent, for 10 s. The realtime handler ignores a matching event. This works because the server
   `updated_at` comes back in the write response; `.select().single()` is already used at
   `use-section-work.ts:130-131`.
3. **Narrow the handler's invalidations** to the §3 keys, with the Desk at `refetchType: 'none'`.

**The double subscription (latent).** realtime-js 2.98 returns the **existing** channel for a duplicate
topic (`RealtimeClient.js:277-287`). A second `useCoordinationRealtime(pid)` would add 3 bindings to a
channel that is already joining. On join-ok the client then compares 6 client bindings with 3 server
bindings and unsubscribes the channel with a silent "mismatch" error (`RealtimeChannel.js:160-178`).
Whichever hook unmounts first calls `removeChannel` and kills the other's subscription. The fix is a
ref-counted channel registry in packages/supabase (`acquireChannel(topic, bind) → release`). Keep one
owner per topic (today: `schedule-spine.tsx:202`), and delete the dead call at
`components/document/coordination/coordination-band.tsx:80` together with the unmounted band.

**Prod question for synthesis (PQ):** Should coordination tables be published at all? Live updates
for co-members versus WAL and RLS cost per subscriber. Until that is decided, the 30 s
`refetchInterval` on coordination items (`use-coordination.ts:312,358`) and margin items is the only
"live" path. That interval is honest, and it is the thing to keep.

## 5. Hook-level `auth.getUser()`

**Scale.** There are 212 sites: 126 in packages/supabase and 86 in the designer portal. At least 55 sit
directly in a `queryFn`, which is the read path (for example `use-inbox.ts:98,137,254`,
`use-permissions.ts:123,155,231,260`, `use-gdpr.ts` ×5). 76 sit in a `mutationFn`, and 81 sit in
helpers or components. The baseline measured 16–21 `auth/v1/user` per hard load and 5 on one SPA
navigation (`BASELINE.md:46-50,164`). Each costs p50 104 / p90 367 ms in prod (`BASELINE.md:97`).
Where a `queryFn` awaits `getUser` before its own read, the call adds one serial hop to a chain that is
already 19–25 deep (`BASELINE.md:81-87`).

**Where the truth lives.** The user's identity is decided in three places:
- server-side by `middleware.ts:40` on every navigation (`getUser`, a network call);
- by Postgres RLS on every request, through `auth.uid()` from the JWT;
- in the browser by the `@supabase/ssr` session cookie, held by the singleton `createBrowserClient()`
  (`packages/supabase/src/client.ts`).

A browser hook therefore needs the **id**, not a fresh server verdict. `getSession()` reads the cookie
locally, with no network unless the token needs refreshing. `getClaims()` would fall back to
`getUser()` for HS256 tokens (`auth-js@2.98 GoTrueClient.js:2810-2822`), so it saves nothing here.

**Proposal:** add `packages/supabase/src/auth/session-user.ts` with:
- a module store seeded once from `getSession()`;
- updates from one `onAuthStateChange` listener;
- `getSessionUserId(): Promise<string | null>` for queryFns and mutationFns;
- `useSessionUserId()` built on `useSyncExternalStore`.

Rebase the existing `useSession` (`packages/supabase/src/hooks/use-auth.ts:22-46`) on it. It currently
opens its own `getSession` and listener per component.

Guards:
- **Writes keep server attribution.** Prefer column defaults or RPC `auth.uid()` over a client-sent
  `created_by`, as `use-coordination.ts:1283-1285` already rules ("never forward a spoofable id").
- **No cross-user cache bleed.** Moving the id out of the queryFn requires it in the `queryKey`, or
  `queryClient.clear()` on `SIGNED_OUT`. No `clear()` exists today (grep of `apps/designer-portal/src`).
- **Keep `getUser`** only where liveness is the point: auth flows, accept-invite. The Desk's I64 empty
  guard already uses `getSession` (`use-desk-engagements.ts:971`).

## 6. Components with no pending state

A sweep for bindings that call `.mutate(` from a handler and never read
`isPending`/`status`/`variables` found 9 bindings in 8 files (`scratch nopending.mjs`, Appendix B).
Reading the code adds 2 more.

| # | Site | Behaviour today | Minimal fix |
|---|---|---|---|
| 1 | `components/document/work-block.tsx:314` (tick) | nothing changes for 465–748 ms (measured) | hook #1 → `useOptimisticMutation` with scope = task id |
| 2 | `components/document/coordination/coordination-work.tsx:152,160` (tick, the one on the project spread) | same as #1. Not in the sweep, because `onTick` is a named function | the same hook fix covers it. Note for D2: the tick is 13 px (`:177-178`), which fails the 44 px rule |
| 3 | `components/document/ffe-section.tsx:940-946` (add room) | the form closes at once and the row appears after 3 RTTs | hook #5 optimistic; reopen the form on error |
| 4 | `components/document/account-band.tsx:81,103,124` (milestone trigger select) | the controlled select snaps back to the old value until the refetch lands | hook #25 optimistic on `['account-page',pid]` |
| 5 | `components/document/feedback/feedback-detail.tsx:210` (reaction) | silent | hook #26 optimistic |
| 6 | `components/portal/scope-builder/exclusions-list.tsx:143` (remove) | silent; delete | `disabled={removeExclusion.isPending}` + `aria-busy` on the row; **not optimistic** (delete without Undo) |
| 7 | `components/portal/scope-builder/gate-conditions-editor.tsx:302` (Mark satisfied) | silent; `getUser` in the mutation (`use-phase-gates.ts:179`) | pending-only: disable while `isPending`; drop `getUser` (§5) |
| 8 | `gate-conditions-editor.tsx:310` (remove gate) | silent; delete | pending-only, as #6 |
| 9 | `components/document/account/account-sheet.tsx:229` (availability) | **false positive**: the hook is already optimistic (`use-availability.ts:82-95`) | none |
| 10 | `components/document/feedback/feedback-ledger.tsx:83` (mark seen) | runs in an effect, not a click | none |
| 11 | `hooks/document-time-provider.tsx:792` (disclosure stamp) | a background stamp | none |

## 7. Effort, risk and gates

| Item | Size | Risk | Gate that proves it |
|---|---|---|---|
| `useOptimisticMutation` (§2) | S | the helper hides a wrong `apply` | unit tests (jest, packages/supabase): snapshot/restore over 2 keys; scope serialises 2 rapid calls; error restores the exact previous object; the deny-list test from §2.2 |
| Tick + add task optimistic (#1, #2) | S | double-click race (covered by scope); a section filter that hides the new row | Playwright under `lab.mjs` throttling: the tick shows its new state ≤100 ms (B1) on 3/3 runs; forced 500 via `page.route` restores the label |
| Narrow `['document-state']` at 51 sites (§3) | M | **under-invalidation**: a Desk input goes stale | per-action request count from the `e1-P6` harness: tick ≤3 refetches (today 27); plus a Desk test that a ticked overdue task is gone after navigating to /desk |
| CommandBar `enabled: open` | S | the doc page enrichment reads a cold key | `doc/[id]/page.test.tsx` "populated cache it did not ask for" suite, updated; P2/P10 lab rerun shows no Desk reads on /doc |
| Desk stale on outbound send/discard | S | none | unit test: send calls invalidate with `docKeys.desk()` |
| Room add optimistic + one-RTT insert | S | `sort_order` collisions (compute from cache, or move to a server default) | Playwright: the row appears ≤100 ms; forced error reopens the form with its text |
| Realtime apply-not-invalidate + channel registry (§4) | M | duplicate topic regressions | jest with a mocked channel: 2 acquirers → 1 subscribe, release order-independent; an own-echo event is dropped |
| Publish coordination tables | — | WAL/RLS cost; echo doubling | **PQ for synthesis**; do not do it before §4 lands |
| `getSessionUserId` + migrate ≥55 queryFn sites (§5) | M (mechanical) | cross-user cache bleed on account switch | lab hard-load P1hard/P2hard: `auth/v1/user` 16–21 → ≤2 per load; an account-switch test asserts no prior-user rows |
| Pending-only fixes (§6 #6–8) | S | none | RTL tests: the button is `disabled` + `aria-busy` while the mutation promise is unresolved |

## Appendix A: PostHog (read-only, 2026-10-14)

Query (HogQL):
```sql
SELECT event, properties.action_key, count(), uniq(person_id) FROM events
WHERE timestamp > now() - INTERVAL 30 DAY AND properties.$host = 'app.patina.cloud'
  AND event NOT LIKE '$%' AND event NOT IN (<shown-only events>)
GROUP BY 1, 2 ORDER BY 3 DESC
```

Results:
- **Write-shaped keys:**
  - `open-add-to-project` 19 (2 people), `promote-piece` 19 (2);
  - `save-piece-draft` 17 (1), `compose-piece` 17 (1);
  - `add-piece-to-project` 16 (2), `open-add-schedule-line` 16 (3), `add-schedule-line` 5 (1);
  - `add-invoice-line` 12 (1);
  - `record-invoice-payment` 7 (2), `confirm-record-payment` 6 (1);
  - `open-add-project-room` 7 (2), `add-project-room` 6 (2);
  - `set-time-entry-billable` 5, `add-person` 5, `edit-ffe-line-spec-details` 5;
  - `archive-project` 3, `create-project` 3;
  - `add-task` 2, `hold-install-window` 2, `put-line-on-schedule` 2, `confirm-issue-and-send` 1.
- **Timer events:** `time_timer_started` 50 (3), `time_timer_stopped` 26 (3).
- **Not writes:** `document_margin_note` 78, `document_wayfinding_door_opened` 59.
- **Rage and dead clicks** (`$rageclick`/`$dead_click` by path): dead `/doc/[id]/pieces` 6; rage
  `/desk` 5; rage `/doc/[id]` 4; dead `/desk` 3; `/library` 3+3; dead `/doc/[id]` 3.

## Appendix B: Reproduction

- **P6 harness.** The script is `scratchpad p6.mjs`, derived from `baseline/harness/lab.mjs` (it copies
  `signIn` and `settle`). It ran with the same CDP throttling against
  `next start -p 3120` from this worktree, with a throwaway local-only `.env.local` (`API_URL`
  127.0.0.1:54321, flags as in `designer-portal-uplift-2026-10-09/walk/WALK.md:9-12`).
- **Why the baseline P6 failed.** Local `…00d1` tasks have `section_key` NULL. `useSectionTasks`
  excludes those (`use-section-work.ts:96`), and `WorkBlock` mounts only in install mode
  (`ffe-section.tsx:2428`).
- **Fixture.** One `project_tasks` row (`e9530000-…0001`, `section_key 'project'`, `owner_party_id`
  NULL, so `fc_dispatch_task_assignment` is a no-op) was inserted, ticked and unticked 3 times, and
  **deleted**. `…00d1` is back to 3 tasks. The server was killed and the env file was removed.
- **Code sweeps.** `sweep.mjs` (getUser and onMutate) and `nopending.mjs` (§6) are read-only node
  scripts over `packages/supabase/src` and `apps/designer-portal/src`, excluding tests.
