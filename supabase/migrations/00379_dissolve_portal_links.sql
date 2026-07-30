-- ═══════════════════════════════════════════════════════════════════════════
-- 00379 — R21 dissolve: repoint /portal links that live in the DATABASE
--
-- The R21 dissolve retires the designer portal's `/portal/*` route zone in
-- favour of the Document surface (/desk, /doc, /library, /people, /rooms).
-- Source code and edge functions are fixed in the same change, but two
-- classes of link live in Postgres and are therefore NOT covered by any
-- code fix or redeploy:
--
--   (a) public.email_templates.html_content — 00310 seeded 17 designer
--       onboarding drip templates as PRE-RENDERED React-Email output, so
--       `https://app.patina.cloud/portal/settings/notifications` is baked in
--       as a LITERAL string (not a {{prefs_url}} mustache token). Fixing
--       packages/email/src/components/brand.ts and the two Deno shared
--       shells does nothing for these already-seeded rows.
--       Column audit: 00045 created the table (slug/name/description/
--       category/subject_default/content_blocks/variables/thumbnail_url/…),
--       00051 added html_content, 00123 added the frequency-cap columns.
--       html_content is the ONLY column carrying the literal — verified by
--       grep over 00310 (17 hits, all inside the html_content values) and
--       over every other migration (zero hits). content_blocks/
--       subject_default are clean, so there is no text/plaintext sibling
--       column to sweep.
--
--   (b) draft_invoice_from_milestone — writes `deep_link`/`url` into
--       notification_log.metadata pointing at /portal/billing/invoices/<id>.
--       This is a live function body, so only a migration can change it.
--
-- Link contract applied (R21 canonical):
--   /portal/settings/notifications   → /desk?account=notifications
--   /portal/billing/invoices/:id     → /desk?book=accounts&page=ledger&invoiceId=:id
--
-- Lineage for draft_invoice_from_milestone: 00204 → 00280 → 00379.
-- Verified before writing: `grep -rln "CREATE OR REPLACE FUNCTION[^(]*
-- draft_invoice_from_milestone" supabase/migrations/*.sql | sort` returns
-- exactly 00204 and 00280 — so 00280 is the latest body and it is reproduced
-- VERBATIM below with ONLY the two deep-link literals changed. 00206 and
-- 00274 merely CALL it.
--
-- No GRANT/REVOKE is added: CREATE OR REPLACE preserves the 00204/00280 ACLs,
-- and the "internal, definer-context callers only" REVOKE already landed in
-- 00280 (which precedes this file in every replay). Nothing to regenerate in
-- seed/00-legacy-grants.sql.
--
-- Historical notification_log rows are deliberately NOT rewritten — they are
-- an audit trail of what was sent, and the permanent redirect table in
-- next.config.js carries any stale in-app deep link forward.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (a) Seeded onboarding-drip templates ────────────────────────────────────
-- Idempotent: the WHERE clause makes a rerun a no-op once every row is clean.
UPDATE public.email_templates
   SET html_content = replace(
         html_content,
         'https://app.patina.cloud/portal/settings/notifications',
         'https://app.patina.cloud/desk?account=notifications'
       )
 WHERE html_content LIKE '%https://app.patina.cloud/portal/settings/notifications%';

-- ── (b) draft_invoice_from_milestone — 00280's body, links repointed ────────
create or replace function draft_invoice_from_milestone(p_milestone_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m    project_payment_milestones%rowtype;
  v_p    projects%rowtype;
  v_inv  uuid;
begin
  select * into v_m from project_payment_milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'draft_invoice_from_milestone: milestone % not found', p_milestone_id;
  end if;

  -- Idempotent: a milestone drafts at most one invoice.
  if v_m.invoice_id is not null then
    return v_m.invoice_id;
  end if;

  select * into v_p from projects where id = v_m.project_id;

  insert into invoices (project_id, designer_id, client_id, status,
                        subtotal_cents, tax_cents, total_cents, memo)
  values (v_m.project_id, v_p.designer_id, v_p.client_id, 'draft',
          v_m.amount_cents, 0, v_m.amount_cents,
          v_m.label || ' — payment milestone')
  returning id into v_inv;

  update project_payment_milestones
     set invoice_id = v_inv,
         status     = case when status = 'pending' then 'outstanding' else status end,
         updated_at = now()
   where id = p_milestone_id;

  -- 00280: surface the fresh draft in the designer's in-app inbox. Best-effort
  -- only — a notification failure must never fail drafting; the invoice is the
  -- money act, the inbox row is a courtesy. Runs once per milestone (the
  -- invoice_id latch above returns early on any re-draft, so no dupes).
  -- 00379: deep_link/url repointed off the dissolved /portal/billing zone onto
  -- the Accounts ledger doorway on /desk (R21 link contract).
  begin
    insert into notification_log (user_id, type, channel, status, template_id, metadata)
    values (
      v_p.designer_id,
      'invoice_draft_created',
      'in_app',
      'delivered',
      'invoice-draft-created',
      jsonb_build_object(
        'invoice_id',   v_inv,
        'milestone_id', p_milestone_id,
        'project_id',   v_m.project_id,
        'amount_cents', v_m.amount_cents,
        'subject',      'Draft invoice ready — ' || v_m.label,
        'title',        'Draft invoice ready — ' || v_m.label,
        'message',      coalesce(v_p.name, 'Your project') || ': a draft invoice for '
                          || v_m.label || ' is ready to review and send.',
        'deep_link',    '/desk?book=accounts&page=ledger&invoiceId=' || v_inv::text,
        'url',          '/desk?book=accounts&page=ledger&invoiceId=' || v_inv::text
      )
    );
  exception when others then
    raise warning 'draft_invoice_from_milestone: notification insert failed for milestone % (invoice %): %',
      p_milestone_id, v_inv, sqlerrm;
  end;

  return v_inv;
end;
$$;

comment on function draft_invoice_from_milestone(uuid) is
  'R26: drafts ONE invoice from a payment milestone (idempotent via invoice_id). Draft only — the designer reviews and sends through issue_invoice. SECURITY DEFINER: settlement triggers fire from client responses. 00280: also posts a best-effort in_app notification_log row (type=invoice_draft_created) to the project designer once per milestone; a notification failure never fails drafting. 00379: its deep_link/url point at /desk?book=accounts&page=ledger&invoiceId=<id> (R21 dissolve).';
