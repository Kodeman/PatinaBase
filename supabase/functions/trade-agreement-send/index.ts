// Supabase Edge Function: trade-agreement-send
//
// The Trade Agreement rail (Wave 3, P14/R16 — "The Agreement, Composed").
// Delivers a studio's Trade Agreement to the subcontractor it names and opens
// their login-less signing page on the client portal. Modeled file-for-file on
// trade-rfq-send: a *-send function that is the single send authority — it
// loads the row (service role), re-checks authorship as the CALLER, composes
// the email through the _shared conventions, sends via the sendCompliantEmail
// chokepoint, and stamps the sent state.
//
// The studio_trade_agreements draft is created separately, via
// create_trade_agreement — the same two-step shape as the RFQ rail: create the
// draft, then invoke this function to send it.
//
// Flow:
//   1. Auth: resolve the caller from the Authorization header (verify_jwt is
//      on at the gateway; gateway verification alone doesn't prove membership
//      of THIS agreement's studio).
//   2. Load the agreement (service role) + its contact snapshot. Not found →
//      404.
//   3. Re-check authorship AS THE CALLER: public.is_active_studio_member needs
//      auth.uid() from the caller's own JWT to resolve, so this call goes
//      through an anon-key client carrying the caller's Authorization header,
//      not the service-role client used to load the row. Not a member → the
//      SAME 404 (no confirmation a foreign id exists).
//   4. Recipient = studio_trade_agreements.contact_email (or an explicit
//      override). No usable email → 422 no_recipient (never a silent success).
//   5. Mode:
//        'preview' → compose subject/html and return them; no send, no token
//                    mint, no stamp (the CTA link is a non-functional
//                    placeholder, since minting is a real, auditable act).
//        'send'    → mint a fresh studio_trade_agreement_tokens row (service
//                    role, revoke-then-mint), compose the link as
//                    CLIENT_PORTAL_URL + '/trade/' + token, email the sub
//                    (operational, reply-to the studio, no attachment, no
//                    userId — the sub is not a platform user); on success
//                    snapshot contact_email (always) and sent_at (on the first
//                    send only); state moves draft/sent → 'sent' but a resend
//                    never moves 'signed' or 'void' back to 'sent'.
//
// The sub's own side never calls an edge function: they reach the DB through
// the client-portal server action on /trade/[token], exactly as /rfq/[token]
// does. So no verify_jwt exemption is needed here — see config.toml.
//
// Body: { agreementId: string, mode?: 'preview' | 'send', recipientEmail?: string }
// Returns (preview) { ok, mode, agreementId, recipient?, subject, html }
//         (send)    { ok, mode, agreementId, recipient, emailSent, sentAt, state }
// Errors as { error, detail? } with the trade-rfq-send / po-send status idiom.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import {
  resolveStudioIdentity,
  studioDisplayName,
} from "../_shared/studio-identity.ts";
import {
  type CallerUser,
  handleTradeAgreementSend,
  type MintTokenResult,
  type SendEmailResult,
  type StudioIdentity,
  type TradeAgreementRow,
  type TradeAgreementSendDeps,
} from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_PORTAL_URL = (Deno.env.get("CLIENT_PORTAL_URL") ??
  "https://client.patina.cloud").replace(/\/$/, "");

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// deno-lint-ignore no-explicit-any
type Row = any;

const deps: TradeAgreementSendDeps = {
  // Canonical Supabase Edge Function pattern: a client carrying the caller's
  // Authorization header resolves the caller via getUser().
  getCallerUser: async (req): Promise<CallerUser | null> => {
    const auth = req.headers.get("Authorization");
    if (!auth) return null;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },

  // The column list here is the whole privacy boundary (R13): project_id is
  // deliberately NOT selected, so the project's name — which studios write
  // from the client's surname — has no route into this function, let alone the
  // letter. Neither is source_proposal_id, sov_line_ids, or anything that
  // could reach the prime's contract sum.
  loadAgreement: async (agreementId): Promise<TradeAgreementRow | null> => {
    const { data, error } = await admin()
      .from("studio_trade_agreements")
      .select(
        `
        id, studio_id, title, scope, price_cents, currency, schedule,
        retainage_bps, pay_when_paid_days, insurance_certificate_required,
        lien_waiver_policy, contact_id, contact_display_name,
        contact_company_name, contact_email, created_by, state, sent_at
      `,
      )
      .eq("id", agreementId)
      .maybeSingle();

    if (error) {
      console.error("trade-agreement-send: lookup failed", error);
      return null;
    }
    const row = data as Row | null;
    if (!row || !row.studio_id) return null;

    const schedule = row.schedule && typeof row.schedule === "object" &&
        !Array.isArray(row.schedule)
      ? {
        startOn: row.schedule.startOn ?? null,
        durationDays: typeof row.schedule.durationDays === "number"
          ? row.schedule.durationDays
          : null,
        sequencing: row.schedule.sequencing ?? null,
      }
      : null;

    return {
      id: row.id,
      studioId: row.studio_id,
      title: typeof row.title === "string" && row.title.trim()
        ? row.title
        : "this scope of work",
      scope: row.scope ?? "",
      priceCents: Number(row.price_cents ?? 0),
      currency: row.currency ?? "USD",
      schedule,
      retainageBps: Number(row.retainage_bps ?? 0),
      payWhenPaidDays: typeof row.pay_when_paid_days === "number"
        ? row.pay_when_paid_days
        : null,
      insuranceCertificateRequired: row.insurance_certificate_required === true,
      lienWaiverPolicy: row.lien_waiver_policy ?? "",
      contactId: row.contact_id ?? null,
      // The roster snapshot survives a deleted contact; the company name is
      // the trade's own name and is the better greeting when both exist.
      contactDisplayName: row.contact_company_name?.trim() ||
        row.contact_display_name || null,
      contactEmail: row.contact_email ?? null,
      createdBy: row.created_by ?? null,
      state: row.state,
      sentAt: row.sent_at ?? null,
    };
  },

  // public.is_active_studio_member reads auth.uid() from the request's own JWT
  // (SECURITY DEFINER, but auth.uid() is a per-request session setting
  // PostgREST derives from the Authorization header of THIS call) — so this
  // must run through an anon-key client carrying the caller's header, never
  // the service-role admin client (which has no user identity; auth.uid()
  // would resolve NULL and the predicate would always read false).
  isActiveStudioMember: async (req, studioId): Promise<boolean> => {
    const auth = req.headers.get("Authorization");
    if (!auth) return false;
    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await caller.rpc("is_active_studio_member", {
      p_org: studioId,
    });
    if (error) {
      console.error(
        "trade-agreement-send: is_active_studio_member rpc error",
        error.message,
      );
      return false;
    }
    return data === true;
  },

  resolveStudioIdentity: async (studioId, createdBy): Promise<StudioIdentity> => {
    const supa = admin();
    let profile: Row | null = null;
    if (createdBy) {
      const { data: authorProfile } = await supa
        .from("profiles")
        .select("full_name, business_name, email")
        .eq("id", createdBy)
        .maybeSingle();
      profile = authorProfile as Row | null;
    }

    // The agreement carries its studio_id directly, so the resolver takes the
    // most specific path it has — no project id is read here on purpose (R13).
    const identity = await resolveStudioIdentity(supa, { studioId });
    const studioName = studioDisplayName(
      identity,
      profile?.business_name?.trim() || profile?.full_name?.trim() ||
        "Patina Designer",
    );

    return {
      studioName,
      studioLogoUrl: identity?.logoUrl ?? undefined,
      designerName: profile?.full_name?.trim() || studioName,
      designerEmail: profile?.email ?? null,
    };
  },

  mintToken: async (agreementId): Promise<MintTokenResult> => {
    const { data, error } = await admin().rpc("mint_trade_agreement_token", {
      p_agreement_id: agreementId,
    });
    if (error) {
      console.error(
        "trade-agreement-send: mint_trade_agreement_token rpc error",
        error.message,
      );
      return { error: error.message };
    }
    // RETURNS TABLE(id, token) → PostgREST yields an array of rows.
    const row = (Array.isArray(data) ? data[0] : data) as Row | null;
    const token = row?.token;
    if (!token) {
      console.error(
        "trade-agreement-send: mint_trade_agreement_token returned no token",
      );
      return { error: "no_token" };
    }
    return { token };
  },

  sendEmail: async (opts): Promise<SendEmailResult> => {
    const result = await sendCompliantEmail(admin(), {
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
      // The sub is not a platform user — no userId, so no suppression check /
      // unsubscribe headers / notification_log row. Operational: tied to the
      // studio ↔ sub business relationship (trade-rfq-send precedent).
      category: "operational",
      notificationType: "trade_agreement",
      templateId: "trade-agreement",
      metadata: opts.metadata,
    });
    return {
      success: result.success,
      suppressed: result.suppressed,
      error: result.error,
    };
  },

  stampSent: async (agreementId, patch): Promise<{ error?: string }> => {
    const dbPatch: Record<string, unknown> = {
      contact_email: patch.contactEmail,
    };
    // Never downgrade: lib.ts only sends state='sent' when the row's current
    // state was 'draft' or 'sent' — a resend of a 'signed' or 'void'
    // agreement omits state entirely, so the column is left untouched.
    if (patch.state) dbPatch.state = patch.state;
    if (patch.sentAt) dbPatch.sent_at = patch.sentAt;
    const { error } = await admin()
      .from("studio_trade_agreements")
      .update(dbPatch)
      .eq("id", agreementId);
    if (error) return { error: error.message };
    return {};
  },

  clientPortalUrl: CLIENT_PORTAL_URL,
  now: () => new Date().toISOString(),
};

Deno.serve((req) => handleTradeAgreementSend(req, deps));
