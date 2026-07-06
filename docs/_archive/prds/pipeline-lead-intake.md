# Pipeline Lead Intake

_Status: Path A shipped (designer manual add). Path B documented, not built._
_Last updated: 2026-05-28_

## Background

The designer-portal "Pipeline" tracks an engagement from first inquiry to
handoff: **Lead → Proposal → Active project → Completed project**. The first
stage — Leads — had no way to be populated from the product: the only
`leads` INSERT RLS policy allowed a homeowner to insert their own row
(`auth.uid() = homeowner_id`), and there was no homeowner-facing form, no
designer-facing form, and no matching service. On dev the Leads stage was
therefore always empty.

This doc records how leads enter the system across the two intended paths so the
second path isn't lost.

## Path A — Designer manual add (shipped)

A designer captures an inbound prospect (referral, DM, email, event) directly.

- **RLS** — migration `00166_leads_designer_insert.sql` adds
  `CREATE POLICY "Designers can create leads" ON leads FOR INSERT WITH CHECK
  (auth.uid() = designer_id AND homeowner_id IS NULL)`. It is **additive** to
  the `00014` homeowner policy (permissive INSERT policies OR together), so
  Path B is unaffected. `homeowner_id` is forced NULL so a designer cannot
  attribute a lead to a real homeowner profile they don't own.
- **Contact columns** — `leads.contact_name` / `leads.contact_email` (same
  migration) capture a prospect who has no Patina profile yet.
- **Hook** — `useCreateLead()` in `packages/supabase/src/hooks/use-leads.ts`
  (`designer_id = auth.uid()`, `homeowner_id = null`, `status = 'new'`,
  `match_score` left null).
- **UI** — `apps/designer-portal/src/components/portal/add-lead-dialog.tsx`,
  an inline form (mirrors `add-client-dialog.tsx`) mounted on `/portal/leads`.
  Opened by the page's "+ Add Lead" button or via `?add=1` (used by the pipeline
  overview quick-create and the command palette).
- **Accept** — `useAcceptLead` now also handles a lead with no homeowner: it
  inserts a profile-less `designer_clients` row (nullable `client_id` since
  `00018`) carrying `contact_name` / `contact_email`, so accepting always
  produces a client.
- **Notifications** — the `00042` AFTER INSERT triggers are already null-safe:
  the consumer trigger returns early when `homeowner_id IS NULL`; the designer
  trigger wraps its network call in `EXCEPTION WHEN OTHERS`. Neither blocks the
  insert.

## Path B — Consumer / marketing intake (future)

A homeowner submits an inquiry; the system matches it to a designer.

What already exists:

- **RLS** — the `00014` policy `"Homeowners can create leads" WITH CHECK
  (auth.uid() = homeowner_id)` already permits a signed-in homeowner to insert
  their own lead. No new policy needed for the insert itself.
- **Notifications** — once `designer_id` is set, the `00042` designer-notify
  trigger fires the `new-lead-designer` email; once `homeowner_id` is set, the
  consumer-confirmation email fires. Both depend on
  `app.settings.service_role_key` / `supabase_url` being configured in the
  target environment (see the email-system memory notes).

What's missing (the actual work):

1. **Homeowner-facing submission UI** — a form in the client-portal
   (`apps/client-portal`) and/or the marketing site capturing
   `project_type` (required), `budget_range`, `timeline`, location, and a
   description, inserting a `leads` row with `homeowner_id = auth.uid()`. For an
   anonymous marketing lead, either require sign-in first or route through an
   edge function with a service role (the current RLS requires an authenticated
   homeowner).
2. **Matching step** — a process that sets `designer_id`, `match_score`, and
   `match_reasons`. Options: a Supabase edge function triggered on insert, an
   admin assignment screen, or the deferred `aesthete-engine`. Until a designer
   is assigned, the lead has `designer_id = NULL` and is invisible to every
   designer (the SELECT policy is `auth.uid() = designer_id`).
3. **Room-scan linkage** — `leads.room_scan_id` already exists; a consumer flow
   that starts from an iOS room scan should populate it.

### Open questions for Path B

- Anonymous (pre-auth) marketing leads vs. authenticated client-portal leads —
  do we require account creation before a lead can be submitted?
- Matching: automatic (rules/ML) vs. admin-assigned vs. round-robin?
- SLA / `response_deadline` semantics and expiry handling for unaccepted leads.

## Shared contract

Both paths write the **same `leads` table**; they differ only in which party
owns the row (`designer_id`-owned vs `homeowner_id`-owned) and whether matching
is needed. The Path-A policy and Path-B policy coexist, so building Path B later
requires no change to Path A.
