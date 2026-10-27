# C7 — Audience, delivery and consistency

**Status:** proposed contract, revised 2026-10-23 after the SQ-1817 frontier review (CHANGES REQUIRED). Re-review pending (`review-audit-frontier`).
**Ticket:** SQ-1812 (WP-00.5a); revision SQ-1849.
**Source inspected at:** `0fabcadf2`. Revision anchors re-checked at `4952624a16d1`.

**Revision 2026-10-23 (SQ-1817).** This file answers findings F15 and F19, plus the C7 tenant-first amendments (SQ-1817 comment `c_mvlbeqkd_05f9fd`). Each change is marked inline:
- **SQ-1846 F1/F2 prerequisite** (§1, §2, §7, §8 Q4). `margin_notes` cross-studio reach is a confirmed defect, being repaired in SQ-1847 (migration 00867). That repair is now a hard prerequisite for WP-07, not an optional follow-up.
- **Typed subjects** (§2):
  - subject integrity is never tenant authorization;
  - NULL-subject legacy writes are preserved;
  - every engagement anchor is authorised on old and new row images;
  - any SECURITY DEFINER escalation enforces note authority itself.
- **F19** (§1 studio rows, §8 Q5): the claim that the server denies cost and margin is corrected. Server-enforced margin visibility is OPEN for Kody.
- **F15** (§1 client rows, §7): the blanket "no cents" rule is replaced by a precise audience rule. The audience questions stay open.
**Serves:** A01, A02, A14, A15, X01, X02, X03, X08, X09. It feeds P08 and WP-07.

**Citations.** `NNNNN:L` refers to line `L` of `supabase/migrations/NNNNN_*.sql`. `SB` = `packages/supabase/src`, `DP` = `apps/designer-portal/src`. Before any migration, copy the latest head body of every function or view named here.

## 1. Audience projections

**Rule C7-R1.** Every audience reads through its existing projection. A field becomes visible to a new audience only when that projection's server reader changes. Hiding a field in the UI does not count: a hidden control is not authorization (DOMAIN-CONTRACTS boundary matrix).

| Audience | Projection today (cite) | Must never contain |
|---|---|---|
| Studio, full seat | Direct RLS reads gated by `can_buy_for_project` (head 00813:157-182) or `is_design_studio_comember`. Private marginalia live in `margin_notes`, which is studio-only, never client-visible (00196:43-44). Its SELECT is 00316:310-330, its write policies are `is_studio_comember(designer_id)` (00584:678-694), and the original permissive `margin_notes_designer_all` (00196:51-54) is still in force | Another studio's job: the tenant check comes first, as in 00624:966-985. **Not true today for `margin_notes`.** That is SQ-1846 F1/F2, under repair in SQ-1847 (00867); see the prerequisite below |
| Studio, seat without money | `availableLenses(canSeeMoney)` drops Price (`DP/lib/document/pieces/build-room-url.ts:37-39`). The studio switch is read by `can_see_studio_margin` and written by `set_studio_margin_visibility` (`SB/hooks/use-studio-buying.ts:481-502`) | Margin or cost where the studio switch denies it. **Today this is a presentation boundary for FF&E lines, not a server one.** See the F19 correction below |
| Job client (web) | Editorial reader `get_client_project_editorial` (00842:13-36): the client or `can_buy_for_project`. Threshold reader `get_client_project_threshold` (00840:22 onward). Shared sheets only (00429:2057-2063). `project_notes` (00565:228-250), with a frozen byline (00581:100-115) | Per reader; see the F15 audience rule below. The editorial reader carries no prices or `*_cents`, SKU, notes, site address or PO fields (00842:37-39). No client reader carries trade cost, markup, margin or competing bids. Never private notes, unshared Field captures or raw tokens |
| Job client (iOS Patina) | `get_client_project_selections` (head 00841:22), `sign_proposal`, `client_pick`, `room_scans`, `project_documents`, `decision_comments` (repo grep of `apps/mobile/Patina`) | The same private-field prohibition as the web client. Client-agreed money only where that reader already carries it (F15 rule) |

**Correction 2026-10-23 (SQ-1817 F19): cost and margin are not denied by the server today.** The original row said margin and cost were "enforced server-side by those RPCs, not only by the lens list". That is false for FF&E lines:
- `can_see_studio_margin` (00713:85-101) only returns a boolean for the caller. Its SQL callers mask vendor-account trade discount (00716), not FF&E rows.
- `project_ffe_items_studio_rw` (head 00721:39-44) is `FOR ALL USING (can_buy_for_project(project_id))`. `can_buy_for_project` (head 00813:157-182) admits every active non-guest member of the job's recorded studio (or, on a studio-less job, the lead and the lead's design-studio co-members). It never consults `organizations.margin_visibility`.
- `useProjectFFEItems` selects `*` from `project_ffe_items` (`SB/hooks/use-project-v2.ts:159-189`). That includes the raw `trade_price_cents` and `markup_percent` columns (00185).
- So a plain member of a studio set to `owners_admins` receives those bytes in the response, even though the Price lens is hidden.

The true current boundary is that the studio switch hides the Price lens and other margin presentation, while **the payload still carries cost and markup to every buying member of the job's studio**. This is an inherited same-studio gap, not a cross-tenant one; the 00316 citation in the review was corrected to 00721 in SQ-1817 `c_mvlbfpvt_092ec2`. It is a source finding, not a claim about deployed Strata.
- Round 8 must not describe Price-lens hiding as access control, in copy, docs or tests.
- **Server-enforced margin visibility is OPEN for Kody (§8 Q5).** This contract does not design the fix.

**Audience rule for money (Revision 2026-10-23, SQ-1817 F15).** The original blanket rule, "no prices or any `*_cents`" for every client and iOS reader, is withdrawn. It contradicted readers that legitimately show the client the price she agreed to. `get_client_project_threshold` returns `clientUnitPriceCents` and `clientLineTotalCents` from the frozen authorization snapshot the client signed (00840:61-89; the review cited this as `get_client_project_selections`, but the function at 00840:22 is the threshold reader). Its trade branch returns the executed scope's frozen `line_total_cents` (00840:158-185). The client portal renders these (`apps/client-portal/src/components/threshold/door-gate.tsx:500-503`, `wall-gate.tsx:279`). The rule is now:
1. **Never, in any client, iOS, Field or token projection:** trade or cost price, markup or margin, studio sell-side working figures that the client has not agreed to, competing bids, PO fields, vendor-account terms, and private notes. Asserted on raw RPC JSON.
2. **Client-agreed money is allowed only where a reader already carries it,** read from the frozen record the client agreed to, never from the live working row. That means the signed authorization snapshot (`furnishing_authorization_items.client_*`), an executed trade scope's frozen line, a signed proposal's or invoice's own figures, and C5's `price_visibility = 'client_visible'` external reference price.
3. **Money-free readers stay money-free.** `get_client_project_editorial` (00842:37-39) and the iOS `get_client_project_selections` head (00841, which carries no `*_cents`) must not gain money keys without a reviewed reader change and a client-portal test.
4. **Open per the K-rulings.** Which new round-8 client surfaces may show agreed money, and whether iOS shows signed prices at all, is not decided here (§8 Q1, and K3–K5 for acceptance surfaces). The safe default for a new client surface is money-free.
| Field (Capture) | Explicit select lists. `project_party_authority` is read without `threshold_cents` (PR-t, `apps/mobile/Capture/Capture/Features/People/SupabasePeopleRoomService.swift:234-240`). Captures: `field_captures` (00233), with `suggested_*` never treated as truth (00532:98-104) | Money thresholds, client-private notes, studio margin |
| Maker / GC / supplier (token links) | `resolve_plan_transmittal` (00429:1787), `resolve_trade_rfq_link`, `resolve_trade_agreement_link`, `resolve_paperwork_link`, `submit_trade_rfq_response` (client-portal call sites, repo grep) | Competing bids, private client thread, other recipients' links. Whole-job visibility |
| Studio-side handoff read model | `get_project_contextual_handoffs` (00469:10-30): studio only, redacted. Actor ids, contact details, raw snapshots, payloads, storage paths and tokens stay private (00469:3-6) | n/a: studio only |

**Tokens.** A raw transmittal token appears once, at mint. Only `sha256` is stored, and it is column-granted to `service_role` alone (00429:299-332). The web hook keeps the raw token only in the mutation result, with `gcTime: 0`, and never writes it to the cache (`SB/hooks/use-plan-room.ts:2, 528, 560, 588`).

**Rule C7-R2.** Round 8 must not move a token into React Query data, URL state, sessionStorage, the paper-origin record (C1 §2) or analytics.

**Hard prerequisite: SQ-1846 F1/F2, repaired by SQ-1847 (migration 00867).** (Revision 2026-10-23, SQ-1817 `c_mvlbeqkd_05f9fd`; replaces the "known gap … file separately" paragraph.)
- **The confirmed defect** (SQ-1846 comment `c_mvlb3oa0_b2e94a`, HIGH severity, HIGH confidence) has two parts:
  - **F1.** With designer D in studios A and B, a B-only member can read, update and delete D-authored notes on A's job. SELECT (00316:310-330) follows designer co-membership, and the writes (00584:678-694) check only `is_studio_comember(designer_id)`.
  - **F2.** The permissive `margin_notes_designer_all` (00196:51-54) also lets an unrelated actor insert a self-authored note that references a foreign project.
- **The prerequisite.** WP-07 (SQ-1839) must not add a column, trigger or RPC to `margin_notes` until the SQ-1847 repair has landed on the integration branch and passed its independent frontier review. That repair is a tenant guard over every verb, on the old and new row images, for every engagement anchor, using the recorded tenant and never one derived from the caller. C7 cites the repair's outcome, not its moving draft. WP-07 copies whatever 00867 actually ships.
- **Do not reproduce or relax the old policy.** No WP-07 migration may recreate, copy or widen the 00316, 00584 or 00196 policy text when it adds columns. Any policy WP-07 touches is grafted from the 00867 head.

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
-- Integrity only: never an authorization answer (SQ-1817 c_mvlbeqkd_05f9fd).
REVOKE ALL ON FUNCTION public._subject_project_id(text, uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.margin_notes
  ADD COLUMN IF NOT EXISTS subject_kind text,
  ADD COLUMN IF NOT EXISTS subject_id   uuid,
  ADD CONSTRAINT margin_notes_subject_pair_check CHECK ((subject_kind IS NULL) = (subject_id IS NULL)),
  ADD CONSTRAINT margin_notes_subject_kind_check CHECK (subject_kind IS NULL OR subject_kind IN (…vocabulary…));
-- BEFORE INSERT/UPDATE trigger (revised 2026-10-23, SQ-1817):
--   IF NEW.subject_kind IS NULL AND NEW.subject_id IS NULL THEN
--     RETURN NEW;                       -- legacy / untyped note: no subject lookup
--   END IF;
--   IF NEW.project_id IS NULL THEN
--     RAISE 'subject_requires_project'; -- proposal-only / Discovery-only notes stay untyped
--   END IF;
--   IF _subject_project_id(NEW.subject_kind, NEW.subject_id) IS DISTINCT FROM NEW.project_id THEN
--     RAISE 'subject_off_project';
--   END IF;
--   RETURN NEW;
-- The 00867 tenant guard runs as RLS on the same statement and is NOT replaced by this trigger.
```

**Revision 2026-10-23 (SQ-1817 `c_mvlbeqkd_05f9fd`): subject integrity is not authorization.**
- **Integrity versus tenancy.** `_subject_project_id(...) = NEW.project_id` proves only that the subject belongs to the note's project. It says nothing about whether the caller may write that project's notes. Authorization stays with the repaired SQ-1847 restrictive gate (00867). That gate is evaluated on **every supplied engagement anchor** (`project_id`, `proposal_id`, `designer_client_id`), on the **old row image** (USING) and the **new row image** (WITH CHECK). A matching subject and project never substitutes for that gate, and no WP-07 code path calls `_subject_project_id` in place of it.
- **The helper stays non-callable by clients.** It is revoked from PUBLIC, `anon` and `authenticated`, with no grant. Only SECURITY DEFINER bodies call it: the subject trigger function (declared `SECURITY DEFINER SET search_path = public, pg_temp`, because a trigger otherwise runs with the writing user's privileges) and the compose RPCs. It is never referenced from an RLS policy, because a policy would need `authenticated` EXECUTE.
- **NULL-subject legacy writes are preserved.** When both subject columns are NULL, the trigger returns without any subject lookup, and the row still goes through the 00867 tenant gate. Every existing writer (`DP/hooks/use-margin-notes.ts:38-47`, which never sets `subject_*`) keeps working unchanged. Updating an untyped legacy note, for its body, due date or escalation link, never needs a subject.
- **Proposal-only and Discovery-only notes stay untyped.** They are real (`use-margin-notes.ts:18-24`; `margin_notes.project_id` is nullable, 00196:26-27; the Discovery anchor `designer_client_id` is R66). They have no `project_id`, so a typed subject on them raises `subject_requires_project`. They are never given a project or tenant synthesised from the caller. Typing them needs an explicit engagement-to-subject binding in a later reviewed contract.
- **Typed project notes.** A new typed note must have a subject that exists and belongs to `NEW.project_id`. It must also pass the 00867 gate for that project **and** for every other anchor it carries, such as a `proposal_id` on the same row. Contradictory anchors are refused by the 00867 gate (SQ-1846 repair spec), and WP-07 adds no path around that refusal. Legacy readers (margin derivation, escalation) keep working, and a note with `anchor_kind='line'` stays an FF&E line note. New writers set both pairs, so a line note writes `anchor_kind='line'` and `subject_kind='ffe_item'`.
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
| Escalate a private note to a decision | **Two client calls today:** `create_client_decision` with a client-generated `p_decision_id`, then a `margin_notes` update (`use-margin-notes.ts:96-120`) | The first call replays safely by id. A failure between the calls leaves a decision without its note link | **Gap:** WP-07 makes this one RPC (`escalate_margin_note(p_note_id, p_decision_id)`) when it touches escalation. Until then round 8 reuses the hook unchanged. **Revision 2026-10-23 (SQ-1817 `c_mvlbeqkd_05f9fd`):** this contract does not fix the RPC's security mode. If it is SECURITY DEFINER, table RLS no longer protects it. Before it reads or copies the note's private text or creates the decision, it must lock the note `FOR UPDATE` and re-check, in its own body, the repaired 00867 note authority on every engagement anchor of that row. It must also check that the decision's project is the note's project. Any failure raises 42501 with no write. If it is SECURITY INVOKER, RLS applies as for the hook |
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
| Designer, legacy renderer | None. The subject columns are additive, legacy anchors are unchanged, untyped (NULL-subject) writes bypass the subject trigger (§2), and there is no new invalidation fan-out. The SQ-1847 repair (00867) is the only access change to `margin_notes`, and it lands before WP-07 |
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
  - **Prerequisite (SQ-1846 F1/F2, SQ-1817 `c_mvlbeqkd_05f9fd`).** The WP-07 suite fails fast unless the 00867 tenant guard is present. It re-runs the SQ-1847 actor matrix after adding the subject columns, and the result must match exactly. In particular, a B-only member is denied on every verb, which is now an unconditional test.
  - **NULL-subject legacy writes.**
    - Insert and update an untyped note on a project, on a proposal-only engagement, and on a Discovery-only engagement (`designer_client_id`). Each succeeds for the authorised studio member, does no subject lookup, and is still refused for a B-only member.
  - **Valid typed project note.**
    - `subject_kind='ffe_item'` on the same project succeeds for an authorised member.
    - The same note by a B-only member is refused by the tenant gate, not by the subject trigger.
    - A typed subject on a proposal-only note raises `subject_requires_project`.
  - **Contradictory anchors.**
    - A note whose `project_id` is studio A's job and whose `proposal_id` is studio B's is refused, even when the subject matches `project_id`.
    - An UPDATE that moves a note's `project_id` to another tenant's job is refused on the new image.
    - An UPDATE by a caller authorised only for the new image is refused on the old image.
  - **Escalation after the repair.** If `escalate_margin_note` is SECURITY DEFINER, then:
    - a B-only member calling it on A's note gets 42501, reads no `body` and creates no decision;
    - a decision on another project is refused;
    - the authorised path writes the decision and the note link in one transaction.
- **Projection negative tests (X02), revised for SQ-1817 F15:**
  - For a populated F01 job, every client, iOS, Field and token reader returns no trade or cost price, markup, margin, competing bid, PO field, vendor-account term or private note.
  - `get_client_project_editorial` and the iOS `get_client_project_selections` return no `*_cents` at all.
  - `get_client_project_threshold` returns `clientUnitPriceCents` / `clientLineTotalCents` equal to the signed `furnishing_authorization_items.client_*` values. A later edit to the live line's price does not change them. Positive and negative are asserted together, so the rule cannot be met by deleting agreed money.
  - Assert on the RPC JSON, not on the rendered DOM.
- **Margin boundary (SQ-1817 F19), recording only.** A test records the current fact without asserting the open fix: a plain member of an `owners_admins` studio reading `project_ffe_items` through PostgREST receives `trade_price_cents` and `markup_percent`. Once Kody rules on §8 Q5, the test flips to the chosen boundary.
- **Jest (wave 1):** each round-8 mutation call site uses the existing hook. A static test guards against new direct `invalidateQueries({queryKey:['document-state']})` calls under `DP/components/document/paper/**`.
- **Playwright (X03):**
  - Two tabs save the same line specification; the second gets the inline conflict with its typed value kept (first vertical slice, step 7).
  - A draft whose provider outcome is unknown is not resent by a reload.

## 8. Open product questions (recommendation first)

1. **Which subject kinds are client-visible?** Recommend `ffe_item` (signed lines only, as in the existing editorial reader), `project_room` and `plan_issue` (shared sheets only). Recommend that `plan_print`, `purchase_order`, `project_package` and `field_capture` stay studio, maker or GC only until an explicit share act exists.
2. **May a private note be promoted to a client note?** Recommend yes, but only as a new `project_notes` row created by an explicit act. The private note is never re-typed in place, and its text is copied only after the designer edits and confirms it.
3. **Should the coordination, decision, comms and inbox tables join `supabase_realtime`?** Recommend **not in this program by default**. Keep correctness on server concurrency and mutation-hook settlement. If live updates are wanted, open a separate reviewed migration with an RLS and payload audit. The current dead subscriptions should be either published deliberately or removed in a follow-up, so the code stops implying a live update it cannot deliver.
4. **The cross-studio reach of `margin_notes`.** No longer a question (Revision 2026-10-23). It is confirmed as SQ-1846 F1/F2 and is under repair in SQ-1847 (00867). The repair is a hard prerequisite for WP-07 (§1).
5. **Server-enforced margin visibility. OPEN for Kody (SQ-1817 F19).** Today the studio's `margin_visibility` switch hides presentation, but `project_ffe_items` rows, including `trade_price_cents` and `markup_percent`, reach every buying member of the job's studio (§1 correction). Kody decides whether the studio switch must become a server boundary for FF&E cost and markup, and when, relative to round 8. Until then:
   - round 8 states the boundary truthfully;
   - it adds no new reader that widens cost or markup beyond today's audience;
   - no copy, doc or test calls the hidden lens access control.

   The repair design (projection, column ACL, or view) is deliberately not chosen here.
6. **Which client surfaces may show agreed money? OPEN (SQ-1817 F15).** The audience rule in §1 fixes what is never allowed and protects existing agreed-money readers. Whether new round-8 client surfaces, or iOS, show signed prices waits on the K-rulings. The default for a new surface is money-free.
