# Arrival in production: the briefing data model

Recon, read-only. 2026-09-27. Angle: where each input the cinematic arrival engine consumes comes from in production, what is missing, and the smallest schema that closes the "since your last visit" gap.

Mockup inputs read: `artifacts/designer-portal-motion-2026-09-25/design/cinematic/arrival.js` (NEED_RANK :62, KIND_ORDER :63, EXCLUDED :64, `band` :66-70, `custody` :87, `sinceLine` :103, `select` :125, `desk` :157, visit = 30 min idle :12/:38), plus the `#briefing` JSON in `index.html:264`, `document.html:306`, `document-delgado.html:304`, `document-reyes.html:305`, `document-whitfield.html:304` and `document-okafor-bright.html:304`.

## 0. The main finding

**Production already has a need model. The arrival should consume it, not rebuild it.** The Desk and the Document both derive needs from one portal-local engine: `apps/designer-portal/src/lib/document/desk-derivation.ts`.

- `NeedKind` has 20 kinds (:109-139).
- `NeedLine` (:225-273) carries `kind`, `text`, `actionLabel`, `urgent`, `dueOn` and a **required** `owner: 'designer' | 'client' | 'maker'` (:272).
- `NEED_RANK` gives the severity order (:426-468).
- The need rules are a list (:587-1045). `partitionDesk` (:1305) turns them into folders, each with `need` plus the whole priority-ordered `needs[]` chain.
- The mockup's `band()` (arrival.js:66-70) matches the shipped `claimBand` exactly (`desk-roster-derivation.ts:687-692`): maker = 3, client = 2, overdue studio = 0, other studio = 1. `custodyWord` (:216-230) already speaks "Your pen / With {client} / With the maker / At rest".

**The two vocabularies do not match.** The mockup's 11 need kinds are an invented vocabulary. Only `overdue_decision` exists by name. Its section list (`agreement, procurement, schedule`) also differs from the real `SectionKey` (`brief, discovery, direction, proposal, project, install, care`, desk-derivation.ts:41-48; view derivation 00590_engagement_subject.sql:72-76). The contract must either:

- (a) key the arrival on real `NeedKind`, with a presentation map from kind to headline, brief form and act; or
- (b) add an adapter that maps real kinds onto the mockup's names.

(a) is the smaller and truer path. The real set is also larger: `overdue_invoice`, `proposal_signed`, `damage_claim`, `lines_flagged`, `new_lead`, `ceremony_pending`, `awaiting_inspection`, `schedule_conflict` and more all reach the headline slot in production. The mockup's `select()` has never seen any of them.

## 1. Need kind → source table

"Owner" is the production owner vocabulary. "Due" is the field that fills `NeedLine.dueOn`. The confidence column rates the mapping, not the table.

| Mockup need kind | Production source (table.column / hook) | Owner field | Due field | Confidence |
|---|---|---|---|---|
| `overdue_decision` | Real kind `overdue_decision`. `document_state.overdue_decision_count` / `earliest_overdue_due`, from `client_decisions` where `status='pending' AND due_date < now()` (00590:162-172). Rule at desk-derivation.ts:587-607. | Hard-coded `'client'` (:603). ⚠ It ignores `client_decisions.court`, so a designer-court or vendor-court overdue item is mislabelled "with the client". | `client_decisions.due_date` (timestamptz, 00062:76), min over overdue rows | High |
| `finish_approval` | No such kind. Nearest real shape: `client_decisions` with `coordination_kind='submittal'`, `court='designer'`, `status='pending'`. The latest `coordination_item_revisions.status='submitted'` is the vendor's Rev-N awaiting the studio's review (00213:50-54; 00214:25-48). `decision_type` IN (`material`, `color`, …) gives the "finish" subject (00084:103). `document_state.items_in_your_court` counts these (00590:203-211), but `DocumentStateRow` does not type the column and no rule reads it. | `client_decisions.court` = `'designer'`. There is no teammate: no per-need assignee column exists. | `client_decisions.due_date` | Medium: the source exists, the Desk need does not |
| `client_approval` | `client_decisions` with `decision_kind='approval'` (section gate, 00202:43-46) or `approval_contract='project_artifact_v1'` (00463:26-50), `court='client'`, `status='pending'`. Hook: `use-project-approvals.ts`. Only **overdue** approvals rise today (via `overdue_decision`). A pending, not-yet-due approval is not a Desk need. | `court='client'`. The client name comes from `document_state.client_name`. | `client_decisions.due_date`. `sent_at` / `viewed_at` are provenance. | Medium-high |
| `essentials` | `client_discovery` (read in `use-discovery.ts:107`), through `discovery-readiness.ts` (`essentialsDone` 0-5, :57-61, :109-111). This is page-local derivation, not a `NeedKind`. It applies to Shape C/D engagements (lead or relationship). | None stored. The Desk D6 default is `'designer'`. | None. The "walkthrough Sep 29" ball has no source (see §3). | Medium: derivable, not a need yet |
| `proposal_draft` | "Proposal not started": a Shape D row (`engagement_kind='relationship'`, `active_section='discovery'`, 00590:372-416) with no proposal. "Drafting": motion chip `drafting` from `proposal_status='draft'` + `proposal_updated_at` (desk-derivation.ts:1145). That is a motion, not a need. | Implicit designer | None | Low-medium: the state exists, not as a need |
| `order_send` | Real kind `po_unsent`. `document_state.draft_unsent_po_count` / `oldest_draft_po_created_at` / `draft_po_label` (00590:170-183), from `purchase_orders.status='draft' AND sent_at IS NULL`. Rule :986-1005, gated by `PO_DRAFT_UNSENT_DAYS=1` (:415). | `'designer'` (:1000) | None. `oldest_draft_po_created_at` is the "since", not a due date. | High |
| `booking` ("Delivery not booked") | No delivery-booking object. Partial signals: `purchase_orders.confirmed_eta` (vendor ETA, feeds `delivery_events` 00150:98-133) and `install_windows` (install week only). A studio could log it as a `project_tasks` row, which surfaces as `task_due`. | n/a | n/a | Gap |
| `delivery_window` (client confirms access) | The ask is `sms_prompts` with `kind='window_pick'` and `answered_at IS NULL`, `expires_at` (00639:493). The answer lands in `delivery_availability` (`window_label`, `recorded_at`; 00651:269-289). ⚠ `sms_prompts` has **no authenticated policy** (00639:630), so the portal cannot read the open ask without a new SECURITY DEFINER reader. | The client party (`party_id` → `project_parties`) | `sms_prompts.expires_at` (the reply window). There is no promised date. | Low-medium: needs a reader |
| `sample` (maker, "in transit from the mill") | No sample object anywhere in `database.types.ts`. Nearest shapes: a `client_decisions` submittal in `court='vendor'` with `court_party_id` → `project_parties` (the maker's name) and `due_date`; or `po_unacknowledged` (owner `'maker'`, :1007-1027). "In transit" custody has no source. | `court='vendor'` or `NeedLine.owner='maker'` | `client_decisions.due_date`. `po_unacknowledged` uses `oldest_unacked_sent_at` as `dueOn` (:1021), which is really a sent stamp. | Gap: proxy only |
| `install_date` | `install_windows` (`state` held → confirmed → released, `starts_on`, `ends_on`, `held_until`, `confirmed_at`; 00476:59; hook `use-install-window.ts:60`). Plus real kind `schedule_unconfigured` "Anchor the install week" (`unconfigured='install-unanchored'`, :962-984; `desk-schedule.ts:115`). | `'designer'` | `install_windows.held_until` for a held window. None for unconfigured. | Medium-high |
| `care_note` | Nothing. `active_section='care'` when `projects.status='completed'` (00590:73). `projects.closure_checklist` is jsonb, not a need. | n/a | n/a | Gap |

### Job-level fields

- **`job.name` / `client`**: `document_state.title`, `client_name`, `subject` (00590:66-67, :111).
- **`job.stage`**: `active_section` (a section key) plus the free-text `current_phase`. The roster prettifies it (desk-roster-derivation.ts:178-184).
- **`job.paused`**: only a boolean, `is_paused = projects.status='on_hold'` (00590:77). There is no paused-at timestamp. `projects` has no such column (database.types.ts:19023-19062), and no project status history table exists. R1's "Paused since {date}" has no source.
- **`position {text, fidelity}`**: the `DeskScheduleInput` resolver gives `positionText`, `fidelity` and `unconfigured` (desk-schedule.ts:104-131). Real `Fidelity = 'band'|'frame'|'committed'|'record'` (packages/utils/src/schedule-fidelity.ts:22). The mockup's binary `band|exact` must map `exact` onto committed/record, and `frame` needs a ruling.
- **`milestone {label, date, fidelity}`**: `project_phases.anchor_date` / `target_end_date`, `schedule_milestones.anchor_date`, and `install_windows` (confirmed). All are already read desk-wide in use-desk-engagements.ts:244-268.
- **`act`**: `NeedLine.actionLabel` from `NEED_ACTION_LABELS` (:141-161). Some real labels ("Send reminder", "Revise proposal", "Review and send") fail the mockup's `DOORWAY` regex (arrival.js:124), so those land focus on the head instead. Acceptable, but the contract should name it.
- **`brief`, `ball`, `custody`, `namesCustody`, `who` (teammate)**: no production field for any of them. See §3.

## 2. Change types for "since" and their sources

The mockup's change kinds are `message`, `decision`, `sms`, `pulse` (synthetic), `invoice` (KIND_ORDER), plus the excluded `hours` and `workshop_note`. Every change needs `at`, `by` (actor, so the viewer's own changes can be filtered out) and `need` (to bind it to the headline).

| Change kind | Source | `at` | `by` | Reach under RLS |
|---|---|---|---|---|
| `message` | `comms_messages` (`thread_id` → `comms_threads.project_id` / `proposal_id`) | `created_at` | `sender_id`; `system` bool | 00101/00102 policies (participant-based; not re-read here) |
| `message` (studio→client note, client answer) | `project_notes` | `sent_at`, `answered_at` | `author_id` | 00565 |
| `decision` | `decision_events` (00171:76-84) joined to `client_decisions.project_id` | `created_at` | `changed_by`, `actor_party_id` (party acts, 00651:743) | ⚠ Designer-of-record and client only (00171:137-157). 00584:100-105 explicitly left co-members out, so a teammate sees no decision history. |
| `decision` (submittal revision: "white oak sample recorded") | `coordination_item_revisions` | `created_at`, `reviewed_at` | `submitted_by`, `reviewed_by` | 00217 plus the co-member sweep 00584 |
| `sms` (inbound from client or trade) | `sms_messages` (`direction`, `party_id`, `project_id`) | `created_at` | `party_id` | 00584/00639/00640 |
| `pulse` (fell overdue) | Computed from `dueOn` (arrival.js:106-109). No source needed. | derived | derived | n/a |
| `pulse` (Friday Pulse sent) | `weekly_pulses` | `sent_at` | `designer_id` | 00584 |
| `invoice` | `invoices` (`status`, `due_date`, `ar_last_chased_at`), read at use-desk-engagements.ts:207-212 | not confirmed which stamp | not confirmed | designer-scoped |
| schedule (not in the mockup, likely wanted) | `schedule_revisions` (`cut_at`, `actor`, `reason`); `install_windows.confirmed_at` / `confirmed_by` | as named | as named | 00323 / 00476 |
| PO movement ("sample marked in transit") | `purchase_orders.sent_at`, `acknowledged_at`, `delivered_date`, `confirmed_eta`; `receiving_inspections.inspected_at` | as named | no actor column on `purchase_orders` | designer-scoped |
| `hours` (excluded) | `project_time_entries` | `created_at` / `started_at` | `user_id` | 00611-00612 |
| `workshop_note` (excluded) | Teaching notes (00672). Per-user state, not project-scoped. | n/a | n/a | n/a |

**No unified per-project activity feed exists.** `client_activity_log` is keyed by `designer_client_id` with project in jsonb metadata (`use-activity.ts:66-87`), and only two migrations write it (00395, 00399). It cannot serve as the feed. The "since" line needs a new union reader; see §5.

## 3. Question (1): is there a per-user, per-project "last seen" today?

**Partly, and not usable as is.**

- **`public.project_reading_marks (project_id, user_id, read_at)`** (00565_the_client_page.sql:345-389) with the RPC **`mark_project_read(p_project_id) RETURNS timestamptz`** (:397-440). The RPC returns the previous stamp and advances it: exactly the anchor semantics. It admits studio members, not just clients (:366-371). Hooks: `useReadingMark` / `useMarkProjectRead` / `usePreviousReadingMark` (packages/supabase/src/hooks/use-reading-marks.ts:26-93). The only caller is the client portal's Threshold (`apps/client-portal/src/components/threshold/threshold.tsx:387-419`). **Do not reuse it for the arrival:**
  1. It is keyed on `project_id` (FK to `projects`). The Document exists for leads, proposals and relationships (document_state Shapes B, C and D), so Okafor-Bright (Discovery) could never be anchored.
  2. It cannot hold the Desk's studio-wide anchor.
  3. A studio member who opens the client page would advance the same row the Document reads.
  4. It advances on every call. There is no 30-minute visit window, so a reload says "Nothing new since earlier today".
- **`profile_presence (user_id, last_seen_at)`** (00539:122-131) is global per person, not per project.
- **`comms_thread_participants.last_read_at`** is per thread (database.types.ts:3719-3730).
- **`teaching_note_state`** (00672:36-64) holds release-note cursors only.
- The designer portal keeps no per-project visit record (grep of `apps/designer-portal/src` for last-visit, last-seen and since found only teaching and proposal-watch code).

### Smallest migration draft

Reserve the number per patina-parallel-work; the head on disk is `00674_help_state_merge.sql`. The pattern follows 00565 and 00672: owner-only read, and writes only through one SECURITY DEFINER RPC pinned to `auth.uid()`.

```sql
-- 006NN_arrival_anchors.sql
CREATE TABLE IF NOT EXISTS public.arrival_anchors (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope            text NOT NULL CHECK (scope IN ('desk', 'document')),
  engagement_id    uuid,          -- document_state.engagement_id (any shape); NULL for 'desk'
  seen_at          timestamptz NOT NULL DEFAULT now(),
  previous_seen_at timestamptz,   -- the anchor "since" reads; NULL = first visit
  CONSTRAINT arrival_anchors_shape CHECK ((scope = 'desk') = (engagement_id IS NULL)),
  CONSTRAINT arrival_anchors_key UNIQUE NULLS NOT DISTINCT (user_id, scope, engagement_id)
);
ALTER TABLE public.arrival_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY arrival_anchors_select_own ON public.arrival_anchors
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
REVOKE ALL ON public.arrival_anchors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.arrival_anchors TO authenticated;
GRANT ALL ON public.arrival_anchors TO service_role;

-- Returns the anchor to diff against, and stamps this visit. A load within 30
-- minutes of the last one is the same visit (arrival.js VISIT): previous_seen_at
-- is kept, so a reload never collapses "since" to "earlier today".
CREATE OR REPLACE FUNCTION public.mark_arrival(p_scope text, p_engagement_id uuid DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := (select auth.uid()); v_prev timestamptz;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF p_scope NOT IN ('desk','document') OR ((p_scope = 'desk') <> (p_engagement_id IS NULL)) THEN
    RAISE EXCEPTION 'mark_arrival: bad scope' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.arrival_anchors AS a (user_id, scope, engagement_id)
  VALUES (v_actor, p_scope, p_engagement_id)
  ON CONFLICT ON CONSTRAINT arrival_anchors_key DO UPDATE
    SET previous_seen_at = CASE WHEN now() - a.seen_at >= interval '30 minutes'
                                THEN a.seen_at ELSE a.previous_seen_at END,
        seen_at = now()
  RETURNING previous_seen_at INTO v_prev;
  RETURN v_prev;
END $$;
REVOKE ALL ON FUNCTION public.mark_arrival(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_arrival(text, uuid) TO authenticated, service_role;
```

Notes on the draft:

- **No FK on `engagement_id`, deliberately.** It is a union key across four tables. With no FK there is no existence oracle (the concern at 00565:359-363): a stamp against an arbitrary uuid reveals nothing and touches only the caller's own rows.
- **Stricter option.** Add an access check. Inside SECURITY DEFINER, the `security_invoker` view `document_state` would run as the owner and bypass RLS, so the check would have to be explicit per shape, or the function made SECURITY INVOKER with INSERT/UPDATE policies whose `WITH CHECK` tests `EXISTS (select 1 from document_state where engagement_id = …)`. Not confirmed: whether that view pushes the predicate down cheaply.
- **Orphans.** Rows for deleted engagements are harmless. A later sweep can remove them.
- **Precedents confirmed:** `ON CONFLICT … NULLS NOT DISTINCT` (00639, 00449) and Postgres 17 (`supabase/config.toml:31`). Not confirmed: that the `ON CONFLICT ON CONSTRAINT` arbiter behaves as intended with the NULLS NOT DISTINCT constraint. Test it with the desk scope.
- **Housekeeping.** Regenerate `database.types.ts` and `seed/00-legacy-grants.sql` (the grant change follows the 00565 header note).
- **Timestamps that can define "changes since"** are in §2. Prefer the event and audit stamps (`decision_events.created_at`, `coordination_item_revisions.created_at`, `comms_messages.created_at`, `sms_messages.created_at`, `schedule_revisions.cut_at`, `install_windows.confirmed_at`, `project_notes.answered_at`) over `updated_at`. `document_state.updated_at` is `projects.updated_at` (00590:94) and says *that* something moved, never *what* or *who*.

### How sibling features write rows as the signed-in user

This is portal code acting through RLS or a pinned RPC, which the Agent OS rule allows.

- **Hour tracking**: RPC `log_time` (use-time-tracking.ts:556). `user_id = auth.uid()` is set server-side.
- **Reading mark**: RPC `mark_project_read` (use-reading-marks.ts:53).
- **Teaching state**: RPC `teaching_note_state_patch` (00672:73-143).
- **Tester notes**: the one direct RLS `insert` into `feedback` (use-feedback.ts:233-248), with pinned RPCs for status and seen (:276-337).

The arrival should follow the RPC pattern: one `mark_arrival` hook in `@patina/supabase` beside `use-reading-marks.ts`.

## 4. Question (2): fixture kinds with no real source

Scope these out or stub them:

- **Hard gaps:** `booking`, `sample`, `care_note`.
- **Exist as data, but no rule yet:** `finish_approval`, `client_approval` when not overdue, `essentials`, `proposal_draft`. Each needs a new need rule and, where the data lives in `client_decisions`, a court-aware owner.
- **`delivery_window`:** the data exists, but no portal read path (`sms_prompts` is service-only).
- **Per-need fields with no source:** `who` as a named teammate (no per-need assignee; `project_tasks.owner` is a role, 00281:158-163; the only person link is the job-level `document_state.designer_id`, matched to `organization_members` by `deriveRosterPeople`, desk-roster-derivation.ts:866-900), plus `brief`, `ball`, `custody` text, `namesCustody` and `since` on most kinds.
- **Job-level:** the `paused` date.
- **For the "since" line:** actor on PO movements; decision history for co-members.

## 5. Question (3): the studio-level Desk inputs

**The fetch already exists.** "All my projects with their top need" is `useDeskEngagements()` (`apps/designer-portal/src/hooks/use-desk-engagements.ts:168-391`):

- One React Query key `['document-state','desk']` with a 60 s refetch.
- Ten parallel reads (`document_state` plus delivery_events, invoices, item_feedback ×2, match_ceremonies, project_phases, schedule_milestones, projects.start_date and schedule_proposals, :201-268), folded by `partitionDesk`.
- Output: `folders[].need` / `.needs[]`, `chips`, `live`, `composed`.
- The Desk page calls it at `app/(document)/desk/page.tsx:73`.
- The Document reads the same cache through `selectOperationalNeedsForDocument` (:102-113), which keeps the `undefined` vs `[]` sentinel honest.
- `deriveDeskRoster` → `deriveDeskClaims` (desk-roster-derivation.ts:345, :709) already ranks cards by band, then oldest `dueOn`, then name (:739-744).

**Divergence to rule on.** The mockup's Desk comparator inserts `rank(kind)` between band and date, and breaks ties on kind and section (arrival.js:73-77). The shipped claim order has no kind key, so the two can pick different Desk headlines from the same data.

**What is missing for the Desk briefing:**

- A studio-wide "since" anchor: `mark_arrival('desk')`.
- A changes reader. The recommendation is one SECURITY INVOKER SQL function, `arrival_changes(p_since timestamptz, p_engagement_id uuid DEFAULT NULL)`, that UNION ALLs the §2 sources into `(at, kind, actor_id, actor_label, project_id, engagement_id, need_kind, text)` under the caller's RLS. The alternative is N more client reads added to the desk batch.
- The two teammate data holes above.

## Not confirmed

- Exact RLS predicates on `comms_messages` (00102) and `sms_messages` for studio co-members; not opened line by line.
- Which invoice timestamp should count as an "invoice" change.
- Whether `document_state` filtered by `engagement_id` is cheap enough for a per-write access check.
