// Supabase Edge Function: trade-rfq-send
//
// Trade Instrument RFQ rail (migration 00424). Delivers a trade scope's RFQ
// to a subcontractor (project_parties) and opens their single-use response
// form on the client portal. Modeled structurally on quote-request-send: a
// *-send function that is the single send authority — it loads the row
// (service role), re-checks authorship (designer-of-scope-project, via
// public.is_design_studio_comember — a broader "any active comember of the
// design studio", not a bare designer_id match, so the check runs as the
// CALLER rather than compared on a service-role-loaded row), composes the
// email through the _shared conventions, sends via the sendCompliantEmail
// chokepoint, and stamps the sent state.
//
// The trade_rfq_requests draft (message/timeline/scope_snapshot) is created
// separately, via prepare_trade_rfq (upsert-by-draft, 00403 idiom) — the same
// two-step shape as vendor_quote_requests: create the draft, then invoke this
// function to send it.
//
// Flow:
//   1. Auth: resolve the caller from the Authorization header (verify_jwt is
//      on at the gateway; gateway verification alone doesn't prove authorship
//      of this specific scope).
//   2. Load the RFQ (service role) + its proposal (designer_id, title) + its
//      party (project_parties). Not found → 404.
//   3. Re-check authorship AS THE CALLER: public.is_design_studio_comember
//      needs auth.uid() from the caller's own JWT to resolve, so this call
//      goes through an anon-key client carrying the caller's Authorization
//      header, not the service-role client used to load the row. Not a
//      comember → the SAME 404 (no confirmation a foreign id exists).
//   4. Recipient = project_parties.email (or an explicit override). No usable
//      email → 422 no_recipient (never a silent success).
//   5. Mode:
//        'preview' → compose subject/html and return them; no send, no token
//                    mint, no stamp (recipient may be null — you can preview
//                    without an email; the CTA link is a non-functional
//                    placeholder, since minting is a real, auditable act).
//        'send'    → mint a fresh trade_rfq_tokens row (service role,
//                    revoke-then-mint), compose the link as
//                    CLIENT_PORTAL_URL + '/rfq/' + token, email the party
//                    (operational, reply-to the designer, no attachment,
//                    no userId — the party is not a platform user); on
//                    success set status='sent' + party_email snapshot, and
//                    sent_at on the first send only.
//
// Body: { rfqRequestId: string, mode?: 'preview' | 'send', recipientEmail?: string }
// Returns (preview) { ok, mode, rfqRequestId, recipient?, subject, html }
//         (send)    { ok, mode, rfqRequestId, recipient, emailSent, sentAt }
// Errors as { error, detail? } with the po-send / quote-request-send status idiom.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import { resolveStudioIdentity, studioDisplayName } from "../_shared/studio-identity.ts";
import {
  type CallerUser,
  type DesignerIdentity,
  handleTradeRfqSend,
  type MintTokenResult,
  type SendEmailResult,
  type TradeRfqRequestRow,
  type TradeRfqSendDeps,
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

const deps: TradeRfqSendDeps = {
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

  loadRequest: async (rfqRequestId): Promise<TradeRfqRequestRow | null> => {
    const { data, error } = await admin()
      .from("trade_rfq_requests")
      .select(
        `
        id, proposal_id, party_id, party_display_name, message, timeline,
        scope_snapshot, status, sent_at,
        proposal:proposals!proposal_id(designer_id, title),
        party:project_parties!party_id(email)
      `,
      )
      .eq("id", rfqRequestId)
      .maybeSingle();

    if (error) {
      console.error("trade-rfq-send: lookup failed", error);
      return null;
    }
    const row = data as Row | null;
    // proposal is NOT NULL FK (proposal_id CASCADE) — a missing join means the
    // row itself is missing (maybeSingle returned null) or a data integrity
    // gap; either way, treat as not found rather than throw.
    if (!row || !row.proposal?.designer_id) return null;

    return {
      id: row.id,
      proposalId: row.proposal_id,
      partyId: row.party_id,
      designerId: row.proposal.designer_id,
      scopeTitle:
        typeof row.proposal.title === "string" && row.proposal.title.trim()
          ? row.proposal.title
          : "this scope",
      partyDisplayName: row.party_display_name ?? null,
      party: row.party ? { email: row.party.email ?? null } : null,
      message: row.message ?? null,
      timeline: row.timeline ?? null,
      scopeSnapshot: row.scope_snapshot,
      status: row.status,
      sentAt: row.sent_at ?? null,
    };
  },

  // public.is_design_studio_comember reads auth.uid() from the request's own
  // JWT (SECURITY DEFINER, but auth.uid() is a per-request session setting
  // PostgREST derives from the Authorization header of THIS call) — so this
  // must run through an anon-key client carrying the caller's header, never
  // the service-role admin client (which has no user identity; auth.uid()
  // would resolve NULL and the predicate would always read false).
  isDesignStudioComember: async (req, designerId): Promise<boolean> => {
    const auth = req.headers.get("Authorization");
    if (!auth) return false;
    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await caller.rpc("is_design_studio_comember", {
      p_owner: designerId,
    });
    if (error) {
      console.error("trade-rfq-send: is_design_studio_comember rpc error", error.message);
      return false;
    }
    return data === true;
  },

  resolveDesignerIdentity: async (designerId): Promise<DesignerIdentity> => {
    const supa = admin();
    const { data: designerProfile } = await supa
      .from("profiles")
      .select("full_name, business_name, email")
      .eq("id", designerId)
      .maybeSingle();
    const profile = designerProfile as Row | null;

    // Studio identity via the canonical resolver (Designer Studios). An RFQ
    // has no project column of its own on this row (the proposal does, but
    // the resolver's designerId path is sufficient and matches
    // quote-request-send's precedent); the profile fields stay the fallback.
    const identity = await resolveStudioIdentity(supa, { designerId });
    const studioName = studioDisplayName(
      identity,
      profile?.business_name?.trim() || profile?.full_name?.trim() || "Patina Designer",
    );

    return {
      studioName,
      studioLogoUrl: identity?.logoUrl ?? undefined,
      designerName: profile?.full_name?.trim() || studioName,
      designerEmail: profile?.email ?? null,
    };
  },

  mintToken: async (rfqRequestId): Promise<MintTokenResult> => {
    const { data, error } = await admin().rpc("mint_trade_rfq_token", {
      p_rfq_id: rfqRequestId,
    });
    if (error) {
      console.error("trade-rfq-send: mint_trade_rfq_token rpc error", error.message);
      return { error: error.message };
    }
    // RETURNS TABLE(id, token) → PostgREST yields an array of rows.
    const row = (Array.isArray(data) ? data[0] : data) as Row | null;
    const token = row?.token;
    if (!token) {
      console.error("trade-rfq-send: mint_trade_rfq_token returned no token");
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
      // The party is not a platform user — no userId, so no suppression
      // check / unsubscribe headers / notification_log row. Operational: tied
      // to the designer's studio ↔ party business relationship (po-send /
      // quote-request-send precedent).
      category: "operational",
      notificationType: "trade_rfq",
      templateId: "trade-rfq",
      metadata: opts.metadata,
    });
    return {
      success: result.success,
      suppressed: result.suppressed,
      error: result.error,
    };
  },

  stampSent: async (rfqRequestId, patch): Promise<{ error?: string }> => {
    const dbPatch: Record<string, unknown> = {
      status: "sent",
      party_email: patch.partyEmail,
    };
    if (patch.sentAt) dbPatch.sent_at = patch.sentAt;
    const { error } = await admin()
      .from("trade_rfq_requests")
      .update(dbPatch)
      .eq("id", rfqRequestId);
    if (error) return { error: error.message };
    return {};
  },

  clientPortalUrl: CLIENT_PORTAL_URL,
  now: () => new Date().toISOString(),
};

Deno.serve((req) => handleTradeRfqSend(req, deps));
