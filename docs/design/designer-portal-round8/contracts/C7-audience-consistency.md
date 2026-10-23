# C7 — Audience, delivery and consistency

**Status:** proposed contract, awaiting cross-provider review (`review-audit-frontier`).
**Ticket:** SQ-1812 (WP-00.5a).
**Source inspected at:** `0fabcadf2`.
**Serves:** A01, A02, A14, A15, X01, X02, X03, X08, X09. It feeds P08 and WP-07.

**Citations.** `NNNNN:L` refers to line `L` of `supabase/migrations/NNNNN_*.sql`. `SB` = `packages/supabase/src`, `DP` = `apps/designer-portal/src`. Before any migration, copy the latest head body of every function or view named here.

## 1. Audience projections

**Rule C7-R1.** Every audience reads through its existing projection. A field becomes visible to a new audience only when that projection's server reader changes. Hiding a field in the UI does not count: a hidden control is not authorization (DOMAIN-CONTRACTS boundary matrix).

| Audience | Projection today (cite) | Must never contain |
|---|---|---|
| Studio, full seat | Direct RLS reads gated by `can_buy_for_project` (head 00813:157-182) or `is_design_studio_comember`. Private marginalia live in `margin_notes`, which is studio-only, never client-visible (00196:43-44). Its write policies are `is_studio_comember(designer_id)` (00584:678-694) | Another studio's job: the tenant check comes first, as in 00624:966-985 |
| Studio, seat without money | `availableLenses(canSeeMoney)` drops Price (`DP/lib/document/pieces/build-room-url.ts:37-39`). Margin visibility is gated by `can_see_studio_margin` / `set_studio_margin_visibility` (`SB/hooks/use-studio-buying.ts:481-502`) | Margin or cost where the studio switch denies it. Enforced server-side by those RPCs, not only by the lens list |
| Job client (web) | Editorial reader `get_client_project_editorial` (00842:13-36): the client or `can_buy_for_project`. Threshold reader (00840:36-47). Shared sheets only (00429:2057-2063). `project_notes` (00565:228-250), with a frozen byline (00581:100-115) | Prices or any `*_cents`, SKU, notes, site address, PO fields (00842:37-39). Trade cost, markup, competing bids. Private notes, unshared Field captures, raw tokens |
| Job client (iOS Patina) | `get_client_project_selections`, `sign_proposal`, `client_pick`, `room_scans`, `project_documents`, `decision_comments` (repo grep of `apps/mobile/Patina`) | Same as the web client |
| Field (Capture) | Explicit select lists. `project_party_authority` is read without `threshold_cents` (PR-t, `apps/mobile/Capture/Capture/Features/People/SupabasePeopleRoomService.swift:234-240`). Captures: `field_captures` (00233), with `suggested_*` never treated as truth (00532:98-104) | Money thresholds, client-private notes, studio margin |
| Maker / GC / supplier (token links) | `resolve_plan_transmittal` (00429:1787), `resolve_trade_rfq_link`, `resolve_trade_agreement_link`, `resolve_paperwork_link`, `submit_trade_rfq_response` (client-portal call sites, repo grep) | Competing bids, private client thread, other recipients' links. Whole-job visibility |
| Studio-side handoff read model | `get_project_contextual_handoffs` (00469:10-30): studio only, redacted. Actor ids, contact details, raw snapshots, payloads, storage paths and tokens stay private (00469:3-6) | n/a: studio only |

**Tokens.** A raw transmittal token appears once, at mint. Only `sha256` is stored, and it is column-granted to `service_role` alone (00429:299-332). The web hook keeps the raw token only in the mutation result, with `gcTime: 0`, and never writes it to the cache (`SB/hooks/use-plan-room.ts:2, 528, 560, 588`).

**Rule C7-R2.** Round 8 must not move a token into React Query data, URL state, sessionStorage, the paper-origin record (C1 §2) or analytics.

**Known gap, not fixed here.** `margin_notes` write policies check only `is_studio_comember(designer_id)` (00584:678-694). They have no tenant-first leg, unlike the hardened `project_party_authority` (00624:966-985). A second studio that the designer also works in may therefore read and write that designer's private marginalia. Recommendation: file this as a separate ticket for a `review-audit-frontier` review, and give it a tenant-first policy rewrite before WP-07 adds typed subjects to `margin_notes` (§2).

## 2. Typed contextual subjects (WP-07 migration, wave 3)

**Today:**
- `margin_notes.anchor_kind` has a CHECK of `line`, `section` or `letterhead`, with an untyped `anchor_id uuid` (00196:30-32). 00543 deliberately left that CHECK alone (00543:39-41).
- `outbound_drafts` carries `ref_type text NOT NULL` + `ref_id uuid NOT NULL` with **no CHECK** on `ref_type` (00775:21-22). Current writers use `project`, `site_request`, PO, shipment and exception subjects through their own RPCs (`SB/hooks/use-buying-phase2.ts:600, 917-920`; `supabase/functions/_shared/outbound-send.test.ts:31, 74`).
- No subject type exists for a print, an issue, an order or a package.

**Contract.** Use one closed subject vocabulary, plus one validator, and attach it additively.

```sql
-- Vocabulary (closed; widened only by a reviewed migration):
--   'ffe_item' | 'project_room' | 'plan_print' | 'plan_issue' | 'purchase_order'
--   | 'project_package' (C1) | 'field_capture' | 'coordination_item'
CREATE FUNCTION public._subject_project_id(p_kind text, p_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ … $$;
-- Returns the subject's projects.id, or NULL when the kind is unknown or the row is absent.
REVOKE ALL ON FUNCTION public._subject_project_id(text, uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.margin_notes
  ADD COLUMN IF NOT EXISTS subject_kind text,
  ADD COLUMN IF NOT EXISTS subject_id   uuid,
  ADD CONSTRAINT margin_notes_subject_pair_check CHECK ((subject_kind IS NULL) = (subject_id IS NULL)),
  ADD CONSTRAINT margin_notes_subject_kind_check CHECK (subject_kind IS NULL OR subject_kind IN (…vocabulary…));
-- BEFORE INSERT/UPDATE trigger: _subject_project_id(subject_kind, subject_id) = NEW.project_id,
-- else raise 'subject_off_project'.
```

- **`margin_notes`.** Keep `anchor_kind` and `anchor_id` exactly as they are. Legacy readers (margin derivation, escalation) keep working, and a note with `anchor_kind='line'` stays an FF&E line note. New writers set both pairs, so a line note writes `anchor_kind='line'` and `subject_kind='ffe_item'`.
- **`outbound_drafts`.** Add **no** CHECK to `ref_type`. Existing service-side writers use values outside the vocabulary, and a CHECK would break them or require a risky `NOT VALID`. New subject-specific compose RPCs, which are service-side like `compose_outbound_draft` (00775:144-145, 00783:46-47), call `_subject_project_id` before insert and pass the vocabulary kind as `ref_type`.
- **Recipient agreement.** A note's type and its recipient must agree at every entry point:
  - `margin_notes` is never sent.
  - `project_notes` always reaches the job client.
  - `outbound_drafts.recipient_kind` is one of `client`, `vendor` or `trade` (00775:39).
  - A compose RPC refuses a client recipient for a subject whose projection excludes the client. Example: `purchase_order` raises `subject_not_client_visible`.
- **Backfill.** None. Existing notes keep `subject_*` NULL, meaning unknown. Nothing derives a subject from `anchor_id`, because `anchor_id` was untyped for `section` and `letterhead`.
- **Activation.** Adding the subject columns is not consequential. The compose RPCs that create client-facing drafts follow V22: the draft lands `awaiting_review` (00775:27, 40), and only a designer Send moves it. No automated send is added.

## 3. Write transaction per act

Each act is one server transaction. The UI never splits a business transition across two client calls.

| Act | Server write (cite) | Concurrency / idempotency | Cache settlement: reuse the hook, never export a private helper |
|---|---|---|---|
| Save a line specification | `project_ffe_specs` UPDATE … `eq('row_version', expected)`. Zero rows = conflict, `retry:false` (`SB/hooks/use-spec-books.ts:346-382`) | Optimistic. `row_version` is bumped by trigger (`:359-361`) | `useUpdateProjectFfeSpec` invalidates `specBookKeys.workbench` and `['project-ffe-items', projectId]` (`:375-381`) |
| Place a library item in a room | `place_product_in_project_v2` (`SB/hooks/use-project-ffe-ga.ts:179-185`) | Server idempotency per A05 | `invalidateProjectFfe` (private, `:162-177`) runs through the hook's `onSuccess`. It already calls exported `invalidateFfeCaches` (`SB/hooks/use-procurement.ts:300-313`) |
| Any write that moves procurement-derived line state | Owning RPC | Owning RPC | `invalidateFfeCaches`: items, project, `procurement-items`, `project-ffe-readiness`, pricing approval and workflow (`use-procurement.ts:300-313`) |
| Commerce acts (budget, instruments, authority, trade scope) | `DP/hooks/use-commercial-documents.ts` RPCs | Server | `invalidateProjectCommerce` (private, `:935-960`) and `invalidateTradeScope` (private, `:1644-1656`), each through its mutation hook |
| Resolve a submittal / RFI / selection | `resolve_coordination_item`, then `_resolve_coordination_item_authorized` (00808:2059). Lock order: job label lock, then decision row (00808:2084-2091) | Idempotent receipt after authorization (00808:2126-2134) | Coordination channel invalidation (`SB/hooks/use-coordination.ts:1605-1650`), but see §4 |
| Private note | `margin_notes` direct insert/update (`DP/hooks/use-margin-notes.ts:38, 147, 160`) | None needed | `invalidateMarginSurfaces` through the hook |
| Escalate a private note to a decision | **Two client calls today:** `create_client_decision` with a client-generated `p_decision_id`, then a `margin_notes` update (`use-margin-notes.ts:96-120`) | The first call replays safely by id. A failure between the calls leaves a decision without its note link | **Gap:** WP-07 makes this one RPC (`escalate_margin_note(p_note_id, p_decision_id)`) when it touches escalation. Until then round 8 reuses the hook unchanged |
| Client note | `project_notes` direct insert (`SB/hooks/use-project-notes.ts:110`) | None needed | Hook invalidates `projectNotesKeys.list`. Realtime channel (`:168-180`) works because the table is published (00565:331) |
| Compose a maker/GC/receiver draft | Subject RPCs `compose_ack_chase_draft`, `compose_receiver_inbound_draft`, `compose_vendor_claim_draft` (`use-buying-phase2.ts:917-920`). Generic `compose_outbound_draft` is service-role only (00775:144-145) | `dedupe_key UNIQUE` (00775:24) | `invalidateDrafts` (`use-buying-phase2.ts:851`) |
| Send a draft | Edge function `procurement-draft-send` (`use-buying-phase2.ts:856`): claim for send (00785:32), then provider, then delivery record. `last_send_outcome` is `rejected` or `unknown` (00785:21-26) | An unknown outcome blocks blind resend. Resend of a stalled send is a separate, explicit act (`useResendStalledProcurementDraft`, `:880`) | `invalidateDrafts` in `onSettled` |
| Grant party authority | `useSetPartyAuthority` direct table write (`SB/hooks/use-coordination.ts:2096-2150`). Fabrication uses the RPC only (C3 §2) | Check-then-write. One open grant per seat and scope (00624:901-903) | `partyAuthorityKeys.all`, roster, people seats, households (`:2141-2150`) |

**Rule C7-R3.** Round 8 must not add a "refresh the whole job" helper or invalidate `['document-state']` broadly from new code. Existing calls already invalidate `["document-state"]` (`use-commercial-documents.ts:645, 729, 900, 1639`; `use-coordination.ts:1614`); leave them as they are. New acts settle through their own mutation hook. If a new act needs another key refreshed, add that key to the owning hook's `onSuccess`. Do not export a private invalidator for round-8 callers (spec correction 11).

**Rule C7-R4.** `docKeys` stays the document identity namespace (`SB/query-keys/document.ts:2-8`: `desk`, `engagement`, `sectionTasks`, `sectionGates`). Round-8 chapters use the existing domain keys of the hooks they wrap. Adding a `docKeys` entry needs the integration lead, because the file is listed as lead-only.

## 4. Cross-client refresh: what really exists

**Realtime publication.** The repository's migrations add exactly four tables to `supabase_realtime`:

| Table | Migration |
|---|---|
| `profiles` | 00183:24 |
| `fulfillment_events` | 00351:204 |
| `project_phases` | 00396:22 |
| `project_notes` | 00565:331 |

A read-only query of `pg_publication_tables` on the local stack (127.0.0.1:54322, 2026-10-23) returned exactly those four.

**Subscriptions that cannot fire.** Code subscribes `postgres_changes` to these tables, none of which is in that publication:

| Table | Subscribed in |
|---|---|
| `client_decisions`, `project_tasks`, `project_ffe_items` | `SB/hooks/use-coordination.ts:1619-1650` |
| `client_decisions`, `client_decision_options`, `decision_comments` | `SB/hooks/use-decisions.ts:789-815` |
| `comms_messages` | `SB/hooks/use-comms.ts:545-576, 615` |
| `notification_log` | `SB/hooks/use-inbox.ts:220, 283` |

Locally these channels receive nothing. The Strata publication is **unverified**. Do not assume it differs from the repo.

**Presence.** Per-document presence uses a Realtime presence channel `document:<engagementId>` (`DP/hooks/use-document-presence.ts:22-23`). Presence carries names only, not data.

**Query defaults.** `staleTime` is 5 minutes and `refetchOnWindowFocus: false` (`DP/lib/react-query.ts:375, 392`). `refetchOnReconnect` is true (`:393`).

**Contract:**
1. Round 8 promises same-tab consistency only, through the mutation hooks (§3). Cross-tab and cross-actor consistency is "on next read": navigation, a mount, reconnect, or an explicit refresh act.
2. Round 8 must not claim live cross-client updates for decisions, FF&E lines, tasks or messages.
3. Concurrency safety does not depend on Realtime. It comes from `row_version` (specs), idempotent receipts (resolver, `dedupe_key`, idempotency keys) and server conflict errors surfaced inline (R83 error grammar, `DP/lib/react-query.ts` header).
4. **Open question 3 asks whether to publish the subscribed tables.** That is a separate, explicitly reviewed migration. `project_ffe_items` and `client_decisions` carry cost and private fields, and Realtime applies RLS per subscriber. A publication change therefore needs a tenancy and payload-size review, and it must not ride inside a UI slice.

## 5. Delivery states stay separate

Draft, attempt, provider delivery and after-send completion are distinct facts:

- `status`: `awaiting_review`, `sending`, `sent`, `discarded`, `superseded` or `expired` (00775:40).
- `last_send_outcome`: `rejected` or `unknown` (00785:21-26).
- `after_send_done_at` (00785:22, 30).

The round-8 UI prints each one as is.

- **"Saved" never means "sent".** A note save, a draft save and a send are three acts with three receipts (A14).
- **An unknown outcome keeps the draft and its evidence.** The UI offers the explicit stalled-send path, never an automatic resend.

## 6. Consumer compatibility

| Consumer | Effect of this contract |
|---|---|
| Designer, legacy renderer | None. The subject columns are additive, legacy anchors are unchanged, and there is no new invalidation fan-out |
| Designer, round 8 | Reads through the same hooks, and writes typed subjects only after the WP-07 migration |
| Client portal | None. Projections are unchanged. A future client-visible subject needs a reader change plus a client-portal test, and the old reader must ignore unknown keys |
| iOS Patina | None. It does not read `margin_notes` or `outbound_drafts` |
| Field | None. A Field capture can become a `field_capture` subject. Capture rows are unchanged |

## 7. Tests the implementing slices own

- **SQL (WP-07):**
  - Subject on another project → `subject_off_project`.
  - Unknown kind rejected.
  - Client-recipient compose on a `purchase_order` subject → `subject_not_client_visible`.
  - Legacy `anchor_kind` rows read unchanged.
  - Second-studio member denied once the tenant-first leg lands.
- **Projection negative tests (X02):** the client and iOS readers return no `*_cents`, SKU, notes or PO fields for a populated F01 job. Assert on the RPC JSON, not on the rendered DOM.
- **Jest (wave 1):** each round-8 mutation call site uses the existing hook. A static test guards against new direct `invalidateQueries({queryKey:['document-state']})` calls under `DP/components/document/paper/**`.
- **Playwright (X03):**
  - Two tabs save the same line specification; the second gets the inline conflict with its typed value kept (first vertical slice, step 7).
  - A draft whose provider outcome is unknown is not resent by a reload.

## 8. Open product questions (recommendation first)

1. **Which subject kinds are client-visible?** Recommend `ffe_item` (signed lines only, as in the existing editorial reader), `project_room` and `plan_issue` (shared sheets only). Recommend that `plan_print`, `purchase_order`, `project_package` and `field_capture` stay studio, maker or GC only until an explicit share act exists.
2. **May a private note be promoted to a client note?** Recommend yes, but only as a new `project_notes` row created by an explicit act. The private note is never re-typed in place, and its text is copied only after the designer edits and confirms it.
3. **Should the coordination, decision, comms and inbox tables join `supabase_realtime`?** Recommend **not in this program by default**. Keep correctness on server concurrency and mutation-hook settlement. If live updates are wanted, open a separate reviewed migration with an RLS and payload audit. The current dead subscriptions should be either published deliberately or removed in a follow-up, so the code stops implying a live update it cannot deliver.
4. **The cross-studio reach of `margin_notes`.** Recommend fixing it before typed subjects land (§1 known gap).
