// Supabase Edge Function: procurement-draft-send
//
// The one send authority for procurement_drafts (00706, US-16 C-28, d2 §M11).
// A draft is composed deterministically by SQL, lands awaiting_review, and a
// studio member may edit its subject and body (update_procurement_draft). It
// leaves only when a member calls this function, which:
//   1. resolves the caller from the JWT (verify_jwt is on at the gateway, but
//      that alone does not prove the caller may send THIS draft);
//   2. selects the draft AS THE CALLER, through an anon-key client carrying the
//      caller's Authorization header, so RLS (can_buy_for_project, else
//      is_active_org_member) is the co-membership re-check. Not readable → 404,
//      the same answer as a draft that does not exist;
//   3. requires status awaiting_review (sent and discarded drafts never go);
//   4. sends the stored subject and body through the sendCompliantEmail
//      chokepoint, operational, reply-to the sending member, keyed for
//      idempotency on the draft id;
//   5. marks the draft sent with a service-role call to
//      mark_procurement_draft_sent(draft, caller, provider message id).
// No service-role bearer is compared to anything here: the caller is whoever
// GoTrue says the JWT belongs to.
//
// Body: { draftId: string }
// Returns { ok, draftId, messageId } or { error, detail? } (see lib.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import {
  type CallerUser,
  handleProcurementDraftSend,
  type ProcurementDraft,
  type ProcurementDraftSendDeps,
} from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asCaller(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const deps: ProcurementDraftSendDeps = {
  getCallerUser: async (req): Promise<CallerUser | null> => {
    const caller = asCaller(req);
    if (!caller) return null;
    const { data, error } = await caller.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },

  loadDraftAsCaller: async (req, draftId): Promise<ProcurementDraft | null> => {
    const caller = asCaller(req);
    if (!caller) return null;
    const { data, error } = await caller
      .from("procurement_drafts")
      .select("id, organization_id, project_id, kind, to_email, subject, body, status")
      .eq("id", draftId)
      .maybeSingle();
    if (error) {
      // A malformed id (22P02) or any read error answers as not found.
      console.error("procurement-draft-send: draft read failed", error.message);
      return null;
    }
    if (!data) return null;
    return {
      id: data.id,
      organizationId: data.organization_id ?? null,
      projectId: data.project_id ?? null,
      kind: data.kind,
      toEmail: data.to_email ?? null,
      subject: data.subject,
      body: data.body,
      status: data.status,
    };
  },

  sendEmail: async (input) => {
    const result = await sendCompliantEmail(admin(), {
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      // A vendor or receiver is not a platform user: no userId, operational
      // (the studio's business correspondence), po-send precedent.
      category: "operational",
      notificationType: "procurement_draft",
      templateId: `procurement-draft-${input.kind}`,
      metadata: { procurement_draft_id: input.draftId, kind: input.kind },
      ref: { type: "procurement_draft", id: input.draftId },
      idempotencyKey: `procurement-draft-${input.draftId}`,
      organizationId: input.organizationId,
    });
    return { success: result.success, id: result.id, error: result.error, suppressed: result.suppressed };
  },

  markSent: async (draftId, sentBy, messageId) => {
    const { error } = await admin().rpc("mark_procurement_draft_sent", {
      p_draft_id: draftId,
      p_sent_by: sentBy,
      p_message_id: messageId,
    });
    return error ? { error: error.message } : {};
  },
};

Deno.serve((req) => handleProcurementDraftSend(req, deps));
