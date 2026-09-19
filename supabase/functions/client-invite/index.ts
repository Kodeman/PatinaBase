// Supabase Edge Function: client-invite — The First Letter
//
// POST /         send a studio's letter to a homeowner (kind 'invite' | 'notice')
// POST /accept   redeem our 7-day token: mark accepted, mint a magic link, return it
// POST /resend   R10 — new token, same frozen letter, one per hour
// POST /refresh  the lapsed page's one tap; never says whether the token existed
//
// EVERY LEG IS SERVICE-ROLE ONLY. The browser never calls this function; the
// designer portal's /api/clients/invite and the client portal's
// /api/auth/invite/{accept,refresh} call it server-to-server with the
// service-role key. verify_jwt stays true (config.toml) and isServiceRoleCaller
// is the compensating in-code check, because these legs name an arbitrary
// writer, signer and recipient.
//
// R5 — THE HYBRID PATH. GoTrue mints the account at send and its action_link is
// DISCARDED: every GoTrue link expires at the shared otp_expiry (3600s,
// config.toml), which also governs password recovery and cannot be raised for
// one channel. The seven-day object is ours — client_invitations.expires_at —
// so the letter's CTA points at our token and a GoTrue magic link is minted at
// CLICK time, on a button POST. Mint on POST, never on GET: Outlook SafeLinks
// and similar scanners follow links in mail and would otherwise burn the token
// before she ever clicks it.
//
// notification_log.user_id is NOT NULL (00041). That is why the account is
// minted BEFORE the send, not after — a hard ordering constraint, not a taste.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from
  "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import { sendClientSms } from "../_shared/sms.ts";
import {
  formatFromAddress,
  letterSubject,
  renderClientLetter,
  senderDisplayName,
  standingSentence,
  type ClientLetterSnapshot,
} from "../_shared/client-letter.ts";
import {
  resolveStudioIdentity,
  studioDisplayName,
  studioSignatureCity,
} from "../_shared/studio-identity.ts";
import {
  buildSnapshot,
  chooseSigner,
  CLIENT_LINK_ACTIONS,
  generateToken,
  isServiceRoleCaller,
  RESEND_COOLDOWN_MS,
  resendCooldownRemainingMs,
  resendEligibility,
  resolveIdentity,
  validateNote,
  validateToken,
  type SignerProfile,
} from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
// Host label of https://<ref>.supabase.co — pins the legacy-JWT arm to this project.
const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
})();
const CLIENT_PORTAL_URL =
  Deno.env.get("CLIENT_PORTAL_URL") ?? "https://client.patina.cloud";
// R1: the envelope stays a patina.cloud address; only the display name changes.
const LETTER_FROM_EMAIL =
  Deno.env.get("CLIENT_LETTER_FROM_EMAIL") ?? "hello@patina.cloud";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** R11 — the studio owner signs. The writer's words stay the writer's. */
async function resolveSigner(
  admin: SupabaseClient,
  opts: { writerId: string; projectId: string | null },
): Promise<{
  signerId: string;
  signerFullName: string | null;
  signerEmail: string | null;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  senderDisplay: string;
}> {
  const identity = await resolveStudioIdentity(admin, {
    projectId: opts.projectId,
    designerId: opts.writerId,
  });

  // The owner of the resolved studio, when there is one. Otherwise the writer
  // signs her own letter — a solo designer IS the studio.
  let ownerId: string | null = null;
  if (identity?.studioId) {
    const { data: owner } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", identity.studioId)
      .eq("role", "owner")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    ownerId = (owner as { user_id?: string } | null)?.user_id ?? null;
  }

  // Both profiles in one read — the owner names the letter, the writer is the
  // fallback when the owner has no name on file (the production defect: a
  // studio owner whose profiles row carries neither full_name nor display_name).
  const ids = ownerId && ownerId !== opts.writerId
    ? [ownerId, opts.writerId]
    : [opts.writerId];
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, full_name, display_name, email, city")
    .in("id", ids);
  const rows = (profileRows ?? []) as SignerProfile[];
  const ownerProfile = ownerId
    ? rows.find((r) => r.id === ownerId) ?? null
    : null;
  const writerProfile = rows.find((r) => r.id === opts.writerId) ?? null;

  const { signerId, signerFullName, profile: p } = chooseSigner({
    writerId: opts.writerId,
    ownerId,
    ownerProfile,
    writerProfile,
  });

  // studioCobrand is deliberately NOT used: it withholds the name for a
  // source='full_name' identity because renderBrandedShell would then show a
  // co-brand under a Patina wordmark. This letter has no wordmark — the
  // letterhead IS the studio, or the designer where there is no studio — so it
  // takes the studio name only when a real studio or business name resolved.
  const studioName =
    identity?.source === "studio" || identity?.source === "business_name"
      ? identity.name
      : null;
  const studioLogoUrl = identity?.source === "studio" ? identity.logoUrl : null;
  const signatureCity =
    (await studioSignatureCity(admin, identity, p?.city)) ?? null;

  return {
    signerId,
    signerFullName,
    signerEmail: p?.email ?? null,
    studioName,
    studioLogoUrl,
    signatureCity,
    senderDisplay: studioDisplayName(identity, signerFullName ?? ""),
  };
}

async function projectNameFor(
  admin: SupabaseClient,
  projectId: string | null,
): Promise<string | null> {
  if (!projectId) return null;
  const { data } = await admin
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  return (data as { name?: string | null } | null)?.name ?? null;
}

/**
 * Render the letter, send it through the one chokepoint, and write what came
 * back onto the invitation. Shared by the send and resend legs so a resent
 * letter is byte-identical to the one it replaces.
 */
async function sendLetter(
  admin: SupabaseClient,
  opts: {
    invitationId: string;
    snapshot: ClientLetterSnapshot;
    token: string;
    replyTo: string | null;
    userId: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const letter = renderClientLetter(opts.snapshot);
  const idempotencyKey = `client-invite:${opts.token}`;

  const result = await sendCompliantEmail(admin, {
    to: opts.snapshot.recipientEmail,
    subject: letter.subject,
    html: letter.html,
    // lens 3: the plain-text part is mandatory on a cold first touch.
    text: letter.text,
    from: formatFromAddress(
      senderDisplayName(opts.snapshot),
      LETTER_FROM_EMAIL,
    ),
    // R1 — replies go to the person, not to Patina.
    replyTo: opts.replyTo ?? undefined,
    userId: opts.userId,
    notificationType: "client_invite_letter",
    category: "transactional",
    templateId: "client-invite-letter",
    ref: { type: "client_invitation", id: opts.invitationId },
    idempotencyKey,
    metadata: {
      invitation_id: opts.invitationId,
      kind: opts.snapshot.kind,
      has_note: !!opts.snapshot.personalMessage,
    },
  });

  await admin
    .from("client_invitations")
    .update({
      email_log_id: result.logId ?? null,
      provider_idempotency_key: idempotencyKey,
      last_sent_at: new Date().toISOString(),
    })
    .eq("id", opts.invitationId);

  if (!result.success && !result.suppressed) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

/**
 * P21 — mint the scoped capability a phone-only homeowner reaches her letter
 * with. Inside the send path, right after the invitation row exists: the
 * capability IS the letter's way in, so a row without one is a letter nobody
 * can open, and the caller sees the send fail rather than a half-sent letter.
 *
 * The raw token GOES NOWHERE. Only sha256(token) is at rest, inside
 * client_links (00650), and this function does not hand the raw value back
 * either: SQ-111 INFO-7. It used to answer with `${CLIENT_PORTAL_URL}/auth/
 * invite/<token>`, which travelled out of the edge function, through the
 * designer portal's route, and into the designer's browser — a live credential
 * for the homeowner's letter, sitting in someone else's network log, and dead on
 * arrival anyway because the text's own dispatch-time mint (sendClientSms,
 * _shared/sms.ts) supersedes this link before anything could use it. The mint
 * itself stays exactly where it is: a letter row with no capability behind it is
 * a letter nobody can open, so the send fails here rather than half-succeeding.
 */
async function mintCapability(
  admin: SupabaseClient,
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  const { data, error } = await admin.rpc("create_client_link", {
    p_invitation_id: invitationId,
    p_actions: CLIENT_LINK_ACTIONS,
  });
  if (error) {
    console.error("client-invite: capability mint failed", error);
    return { ok: false, error: error.message };
  }
  // RETURNS TABLE (id, token) — PostgREST hands back a one-row array. The token
  // is read only to prove one was minted, and is never returned or logged.
  const row = (Array.isArray(data) ? data[0] : data) as { token?: string } | null;
  if (!row?.token) return { ok: false, error: "capability_returned_no_token" };
  return { ok: true };
}

/**
 * The seat 00650 froze the capability onto — resolved by the SAME one-match
 * rule create_client_link applies (00650:274): exactly one party row on this
 * job carrying this number, or none. Two rows, or none, means the letter has no
 * seat and the text goes out on the phone alone: it still gets the consent gate
 * (which resolves the studio from the project), and it simply is not paced,
 * because a cadence budget is kept per seat and there is no seat to keep one on.
 */
async function clientSeatFor(
  admin: SupabaseClient,
  projectId: string | null,
  phone: string | null,
): Promise<string | null> {
  if (!projectId || !phone) return null;
  const { data, error } = await admin
    .from("project_parties")
    .select("id")
    .eq("project_id", projectId)
    .eq("phone_e164", phone);
  if (error) {
    console.error("client-invite: the client seat could not be read", error);
    return null;
  }
  const rows = (data ?? []) as Array<{ id: string }>;
  return rows.length === 1 ? rows[0].id : null;
}

/**
 * P24 — THE FIRST LETTER, AS A TEXT, AND NEVER BESIDE A MAGIC LINK.
 *
 * This leg exists only for a phone identity, which is the identity that minted
 * no GoTrue user above: a homeowner never receives both an account invitation
 * and a text about the same letter, because a phone letter has no account to
 * invite her to.
 *
 * Everything that decides whether the text goes lives in sendClientSms — phase
 * 2, the campaign flag, her studio's own consent record, the studio's "never
 * text" rule, the daily budget and the dead-end pause. The link is NOT the URL
 * this function already minted: sendClientSms mints the capability at the moment
 * the text is actually dispatched, from the letter id (contract S6), so a send
 * quiet hours stores for the morning hands her a live link rather than one that
 * has been sitting in a table all night.
 *
 * NON-FATAL. The letter row exists, the capability exists, and the designer's
 * own record of the letter is complete: a provider that refuses is a thing to
 * show her in the room, not a reason to answer 502 and have her press Send
 * again. `deliver` is what the response says about it.
 */
async function sendFirstLetterSms(
  admin: SupabaseClient,
  args: {
    invitationId: string;
    projectId: string | null;
    phone: string | null;
  },
): Promise<{ deliver: string; reason?: string }> {
  if (!args.phone) return { deliver: "sms_failed", reason: "no_phone_number" };
  const partyId = await clientSeatFor(admin, args.projectId, args.phone);
  try {
    const res = await sendClientSms(admin, {
      partyId: partyId ?? undefined,
      phone: args.phone,
      projectId: args.projectId ?? undefined,
      templateKey: "sms_client_first_letter",
      clientInvitationId: args.invitationId,
      // One first letter per invitation, whichever writer gets there first: a
      // retry of this POST must not text her twice about the same letter.
      dedupeKey: `client_first_letter:${args.invitationId}`,
    });
    if (res.deferred) return { deliver: "sms_deferred", reason: res.reason };
    if (res.sent || res.status === "queued") {
      return { deliver: "sms_sent", reason: res.reason };
    }
    console.warn("client-invite: the first letter text was refused", res.reason);
    return { deliver: "sms_failed", reason: res.reason };
  } catch (error) {
    console.error("client-invite: the first letter text threw", error);
    return { deliver: "sms_failed", reason: "send_threw" };
  }
}

interface SendBody {
  designerClientId?: string | null;
  email?: string;
  /** P21: the homeowner's phone. Required when kind is 'phone'. */
  phone?: string | null;
  clientName?: string | null;
  projectId?: string | null;
  note?: string | null;
  /** 'phone' names the IDENTITY, not the letter — see resolveIdentity in lib.ts. */
  kind?: "invite" | "notice" | "phone";
  writerId?: string;
}

async function handleSend(req: Request): Promise<Response> {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const identity = resolveIdentity(body);
  if (!identity.ok) return json({ error: identity.error }, 400);
  const email = identity.email;
  const phone = identity.phone;
  const byPhone = identity.identity === "phone";
  const writerId = body.writerId?.trim();
  if (!writerId) return json({ error: "writer_required" }, 400);

  const note = validateNote(body.note);
  if (!note.ok) return json({ error: note.error }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const projectId = body.projectId ?? null;
  // A phone letter has nothing to notice: R13's 'notice' means "already has an
  // account", and a phone-only recipient has no account by construction.
  let kind: "invite" | "notice" = !byPhone && body.kind === "notice"
    ? "notice"
    : "invite";

  // ── 1. The account, minted before the send (notification_log.user_id) ────
  // NOT FOR A PHONE LETTER. There is no email to mint a GoTrue user against and
  // no session to hand her: her way in is the capability, and P21 is explicit
  // that a phone-only invitation never calls GoTrue and never gets a user.
  let profileId: string | null = null;
  const accountEmail = identity.identity === "email" ? identity.email : null;
  if (accountEmail && kind === "invite") {
    const { data: gen, error: genErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email: accountEmail,
      options: {
        // 'homeowner' is the ONLY client-supplied role hint handle_new_user
        // honours (00313:47-48); 'client' falls through to the 'designer'
        // default and has to be corrected afterwards. Passing the recognised
        // value costs nothing and stops asking the trigger for the impossible.
        data: {
          role: "homeowner",
          full_name: body.clientName ?? undefined,
          display_name: body.clientName ?? undefined,
        },
        redirectTo: `${CLIENT_PORTAL_URL}/auth/callback?type=invite`,
      },
    });
    if (genErr) {
      // Most commonly "User already registered" — the account exists, so this
      // is R13's case and the letter becomes a notice.
      console.warn("client-invite: generateLink invite failed, switching to notice:", genErr.message);
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      const existingId = (existing as { id?: string } | null)?.id;
      if (!existingId) {
        return json({ error: "generate_link_failed", detail: genErr.message }, 502);
      }
      kind = "notice";
      profileId = existingId;
    } else {
      profileId = (gen as any)?.user?.id ?? null;
      if (!profileId) return json({ error: "generate_link_returned_no_user" }, 502);
      // The action_link from this call is DISCARDED — see the header. It is
      // sixty minutes old the moment it is minted and it is not what we mail.

      // Identical to the shape today's route writes, so the flag-off and
      // flag-on paths leave the same profiles row behind. The accept leg's
      // existing relabel to 'homeowner' still runs when she signs in.
      await admin.from("profiles").upsert({
        id: profileId,
        email: accountEmail,
        display_name: body.clientName ?? null,
        full_name: body.clientName ?? null,
        role: "client",
      });
      const { data: clientRole } = await admin
        .from("roles")
        .select("id")
        .eq("name", "client")
        .maybeSingle();
      const roleId = (clientRole as { id?: string } | null)?.id;
      if (roleId) {
        await admin.from("user_roles").upsert(
          { user_id: profileId, role_id: roleId, granted_by: writerId },
          { onConflict: "user_id,role_id", ignoreDuplicates: true },
        );
      }
    }
  } else if (accountEmail) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", accountEmail)
      .maybeSingle();
    profileId = (existing as { id?: string } | null)?.id ?? null;
    if (!profileId) return json({ error: "notice_requires_existing_profile" }, 400);
  }

  // ── 2. The snapshot ─────────────────────────────────────────────────────
  const signer = await resolveSigner(admin, { writerId, projectId });
  const projectName = await projectNameFor(admin, projectId);
  const token = generateToken();
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  // A phone letter renders nothing by email, so no CTA is composed into it and
  // none is frozen: the row carries no cta column, and the way in is the
  // capability URL minted from the invitation id below.
  const ctaUrl = !byPhone && kind === "invite"
    ? `${CLIENT_PORTAL_URL}/auth/invite/${token}`
    : `${CLIENT_PORTAL_URL}/`;

  const snapshot = buildSnapshot({
    kind,
    // No email to address. Nothing the frozen scalars below print reads this
    // slot (letterSubject / standingSentence / senderDisplayName all compose
    // from the names, the studio and the project), and no letter is rendered.
    email: email ?? "",
    clientName: body.clientName ?? null,
    signerFullName: signer.signerFullName,
    studioName: signer.studioName,
    studioLogoUrl: signer.studioLogoUrl,
    signatureCity: signer.signatureCity,
    projectName,
    note: note.value,
    sentAt: sentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ctaUrl,
  });

  const { data: inserted, error: insErr } = await admin
    .from("client_invitations")
    .insert({
      token,
      email,
      // P21: NULL for an email-only letter, exactly as today. Stored in E.164 —
      // 00650's trigger normalizes it through normalize_phone_e164 and refuses
      // anything it cannot read as a number.
      phone,
      designer_id: writerId,
      designer_client_id: body.designerClientId ?? null,
      project_id: projectId,
      personal_message: note.value,
      kind,
      recipient_name: snapshot.recipientName,
      sender_display_name: senderDisplayName(snapshot),
      designer_given_name: snapshot.designerGivenName,
      designer_full_name: snapshot.designerFullName,
      studio_name: snapshot.studioName,
      studio_logo_url: snapshot.studioLogoUrl,
      signature_city: snapshot.signatureCity,
      project_name: snapshot.projectName,
      rendered_subject: letterSubject(snapshot),
      rendered_standing_sentence: standingSentence(snapshot),
      signer_id: signer.signerId,
      writer_id: writerId,
      sent_at: sentAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      // R13: a notice has nothing to accept.
      accepted_at: kind === "notice" ? sentAt.toISOString() : null,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("client-invite: snapshot insert failed", insErr);
    // The one refusal the caller can act on: a number the database cannot read.
    if ((insErr?.message ?? "").includes("invalid_client_phone")) {
      return json({ error: "invalid_phone" }, 400);
    }
    return json({ error: "insert_failed", detail: insErr?.message }, 500);
  }
  const invitationId = (inserted as { id: string }).id;

  // ── 3. The letter ───────────────────────────────────────────────────────
  // A PHONE LETTER IS NOT MAILED, AND NOT TEXTED HERE EITHER. The capability is
  // minted inside this send path so the link exists the moment the row does;
  // the text that carries it is SQ-18's leg, named on the response as
  // `deliver: 'sms_pending'` rather than left to be inferred.
  let deliver: string | null = null;
  let deliverReason: string | undefined;
  if (byPhone) {
    const capability = await mintCapability(admin, invitationId);
    if (!capability.ok) {
      // SQ-108 LOW-1 — THE MINT IS NOT ATOMIC WITH THE ROW, SO THE ROW IS TAKEN
      // BACK. The insert above and this mint are two round trips; until now a
      // mint failure answered 502 and left a live, undelivered letter behind
      // it, and the designer's retry inserted a second one — two letters on the
      // record for one send, the newer silently superseding nothing. Nothing
      // references the row yet (no capability, no text, no standing note), so
      // deleting it is the whole compensation: the retry inserts one letter,
      // not a second.
      const { error: undoErr } = await admin
        .from("client_invitations")
        .delete()
        .eq("id", invitationId);
      if (undoErr) {
        console.error(
          "client-invite: the letter row could not be taken back after a failed mint",
          undoErr,
        );
      }
      return json({
        error: "capability_failed",
        detail: capability.error,
        rolledBack: !undoErr,
      }, 502);
    }
    const smsLeg = await sendFirstLetterSms(admin, {
      invitationId,
      projectId,
      phone,
    });
    deliver = smsLeg.deliver;
    deliverReason = smsLeg.reason;
  } else {
    // notification_log.user_id is NOT NULL (00041) and the account is minted
    // above for every email letter. Stated rather than assumed now that the
    // account legs are conditional: a send with no account behind it would
    // fail inside the chokepoint with nothing to tell the designer.
    if (!profileId) return json({ error: "recipient_profile_missing" }, 500);
    const sent = await sendLetter(admin, {
      invitationId,
      snapshot,
      token,
      replyTo: signer.signerEmail,
      userId: profileId,
    });
    if (!sent.ok) return json({ error: "send_failed", detail: sent.error }, 502);
  }

  // ── 4. R8 — the note becomes the house's first standing note ────────────
  // FROZEN byline: a studio that renames itself must not silently relabel a
  // letter it sent last month. With no project there is no house for it to
  // land in, and nothing is seeded.
  if (projectId && note.value) {
    const byline = [
      snapshot.designerFullName,
      snapshot.studioName,
      // R7': full name and date on the first-visit note.
      new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
        .format(sentAt),
    ].filter(Boolean).join(" · ");
    const { error: noteErr } = await admin.from("project_notes").insert({
      project_id: projectId,
      author_id: signer.signerId,
      body: note.value,
      author_byline: byline,
      state: "standing",
      sent_at: sentAt.toISOString(),
    });
    // Non-fatal: a letter that went and a note that did not seed is a missing
    // line on a page; a 500 here after the send would tell the designer nothing
    // went out when it did.
    if (noteErr) console.error("client-invite: standing-note seed failed", noteErr);
  }

  return json({
    invitationId,
    token,
    profileId,
    kind,
    // `deliver` is what happened to the text, not a promise that one is coming:
    // 'sms_sent', 'sms_deferred' (quiet hours has it stored for the morning) or
    // 'sms_failed' with the gate's own reason. That is the whole phone-letter
    // seam now: NO capability link comes back. The send is server-side end to
    // end, so nothing downstream needs the homeowner's credential, and the one
    // caller that used to be handed it (the designer portal's route) only ever
    // passed it on towards a browser (SQ-111 INFO-7).
    ...(byPhone
      ? { deliver, ...(deliverReason ? { deliverReason } : {}) }
      : {}),
  });
}

/**
 * Resolve a client capability and record the acceptance it stands for. Returns
 * null when the token is not a live capability, so the caller falls through to
 * the plaintext token's own verdict and leaks nothing either way.
 *
 * IDEMPOTENT ON PURPOSE. The email token is single-use because it mints a
 * session; a capability mints nothing and lives for its own 90 days, so a
 * homeowner opening her link a second time is not an error — `accepted_at`
 * keeps the FIRST time she opened it and the use row records every one.
 */
async function acceptByCapability(
  admin: SupabaseClient,
  token: string,
): Promise<Response | null> {
  const { data, error } = await admin.rpc("resolve_client_link", {
    p_token: token,
    p_action: "accept",
    p_source: "client_portal",
  });
  if (error) {
    console.error("client-invite: capability resolve failed", error);
    return null;
  }
  const resolved = data as { invitation_id?: string } | null;
  const invitationId = resolved?.invitation_id;
  if (!invitationId) return null;

  const { data: row } = await admin
    .from("client_invitations")
    .select("id, revoked_at, superseded_by, accepted_at")
    .eq("id", invitationId)
    .maybeSingle();
  const inv = row as
    | { id: string; revoked_at: string | null; superseded_by: string | null }
    | null;
  if (!inv) return json({ error: "not_found" }, 404);
  if (inv.revoked_at || inv.superseded_by) return json({ error: "revoked" }, 403);

  await admin
    .from("client_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id)
    .is("accepted_at", null);

  // No actionLink, because no session was minted.
  return json({ accepted: true, invitationId: inv.id });
}

async function handleAccept(req: Request): Promise<Response> {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const token = body.token?.trim();
  if (!token) return json({ error: "token_required" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: invite, error } = await admin
    .from("client_invitations")
    .select("id, email, expires_at, accepted_at, revoked_at, designer_id")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("client-invite: accept lookup failed", error);
    return json({ error: "lookup_failed" }, 500);
  }

  // P21 — THE CAPABILITY LEG, AND NO SESSION IN IT. The plaintext token is
  // tried first, so the email path below is untouched; a token that is not one
  // is offered to resolve_client_link, which answers only for a live, unrevoked,
  // unexpired capability and writes the use row itself.
  //
  // Nothing here calls GoTrue. A phone-only homeowner has no account to sign
  // into, and minting one off a texted link would be inventing an identity she
  // never asked for. Acceptance is a FACT on her invitation, not a session.
  if (!invite) {
    const accepted = await acceptByCapability(admin, token);
    if (accepted) return accepted;
  }

  const verdict = validateToken(invite as any);
  if (!verdict.ok) return json({ error: verdict.error }, verdict.status);

  const inv = invite as { id: string; email: string };

  // Single-use: claim the row BEFORE minting, guarded on it still being
  // unaccepted, so two clicks in flight cannot both mint a session.
  const { data: claimed, error: updErr } = await admin
    .from("client_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();
  if (updErr) {
    console.error("client-invite: accept update failed", updErr);
    return json({ error: "update_failed" }, 500);
  }
  if (!claimed) return json({ error: "already_accepted" }, 409);

  // Minted HERE, on a POST, three hundred milliseconds before it is followed.
  // Sixty minutes is plenty for that.
  const { data: gen, error: genErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: inv.email,
    options: { redirectTo: `${CLIENT_PORTAL_URL}/auth/callback?type=invite` },
  });
  const actionLink = (gen as any)?.properties?.action_link as string | undefined;
  if (genErr || !actionLink) {
    // Give the token back rather than stranding her on a used letter.
    await admin.from("client_invitations").update({ accepted_at: null }).eq("id", inv.id);
    console.error("client-invite: magiclink mint failed", genErr);
    return json({ error: "magiclink_failed" }, 502);
  }

  const userId = (gen as any)?.user?.id as string | undefined;
  if (userId) {
    await admin
      .from("client_invitations")
      .update({ accepted_by: userId })
      .eq("id", inv.id);
    // Ruling B2 v3(d) / 00555: this handler is the one server-side moment that
    // KNOWS the caller is a client — she holds an unexpired token addressed to
    // her own email. Unchanged from the pre-letter accept leg; must never fail
    // the request.
    const { error: roleErr } = await admin
      .from("profiles")
      .update({ role: "homeowner" })
      .eq("id", userId)
      .neq("role", "homeowner");
    if (roleErr) console.error("client-invite: accept role relabel failed", roleErr);
  }

  return json({ actionLink });
}

/** Copy a snapshot onto a new token and send the identical letter again. */
async function resendFrom(
  admin: SupabaseClient,
  oldId: string,
  writerId: string | null,
): Promise<Response> {
  const { data: old } = await admin
    .from("client_invitations")
    .select("*")
    .eq("id", oldId)
    .maybeSingle();
  if (!old) return json({ error: "not_found" }, 404);
  const row = old as any;

  const eligibility = resendEligibility(row.kind);
  if (!eligibility.ok) return json({ error: eligibility.error }, eligibility.status);
  if (row.superseded_by) return json({ error: "already_superseded" }, 409);
  const remaining = resendCooldownRemainingMs(row.last_sent_at ?? row.sent_at);
  if (remaining > 0) {
    return json(
      { error: "too_soon", retryAfterMs: remaining, cooldownMs: RESEND_COOLDOWN_MS },
      429,
    );
  }

  // A phone letter is the row with no email on it (P21). Nothing about the
  // cooldown above changes for it: `last_sent_at` is never stamped because no
  // email goes out, so the floor reads `sent_at` — one re-mint per hour.
  const byPhone = !row.email;

  const token = generateToken();
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const ctaUrl = !byPhone && row.kind === "invite"
    ? `${CLIENT_PORTAL_URL}/auth/invite/${token}`
    : `${CLIENT_PORTAL_URL}/`;

  const { data: fresh, error: insErr } = await admin
    .from("client_invitations")
    .insert({
      token,
      email: row.email,
      phone: row.phone ?? null,
      designer_id: row.designer_id,
      designer_client_id: row.designer_client_id,
      project_id: row.project_id,
      personal_message: row.personal_message,
      kind: row.kind,
      recipient_name: row.recipient_name,
      sender_display_name: row.sender_display_name,
      designer_given_name: row.designer_given_name,
      designer_full_name: row.designer_full_name,
      studio_name: row.studio_name,
      studio_logo_url: row.studio_logo_url,
      signature_city: row.signature_city,
      project_name: row.project_name,
      rendered_subject: row.rendered_subject,
      rendered_standing_sentence: row.rendered_standing_sentence,
      signer_id: row.signer_id,
      writer_id: writerId ?? row.writer_id,
      resend_count: (row.resend_count ?? 0) + 1,
      sent_at: sentAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      accepted_at: row.kind === "notice" ? sentAt.toISOString() : null,
    })
    .select("id")
    .single();
  if (insErr || !fresh) {
    console.error("client-invite: resend insert failed", insErr);
    return json({ error: "insert_failed" }, 500);
  }
  const newId = (fresh as { id: string }).id;
  await admin
    .from("client_invitations")
    .update({ superseded_by: newId })
    .eq("id", oldId);

  // R10 — the SAME frozen letter, with a new date. Nothing is re-resolved.
  const snapshot: ClientLetterSnapshot = {
    kind: row.kind,
    recipientEmail: row.email,
    recipientName: row.recipient_name,
    designerFullName: row.designer_full_name,
    designerGivenName: row.designer_given_name,
    studioName: row.studio_name,
    studioLogoUrl: row.studio_logo_url,
    signatureCity: row.signature_city,
    projectName: row.project_name,
    personalMessage: row.personal_message,
    sentAt: sentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ctaUrl,
  };

  // SQ-108 LOW-2 — MINT FIRST, REVOKE SECOND.
  //
  // This order was the other way round: supersede, revoke the live capability,
  // then mint. A mint failure in the middle of that left the homeowner with no
  // working link at all and no way to ask for one — the hourly floor above
  // refuses the retry for up to an hour, and the page she would tap to refresh
  // is behind the link that was just revoked. Minting first means the worst case
  // is two live capabilities for a moment, and the revoke below closes that;
  // 00650's create_client_link only supersedes the links of the invitation it is
  // minting FOR, so the old letter's link is untouched until we revoke it.
  //
  // And if the mint fails, the letter she is holding is put back: the new row is
  // deleted and superseded_by cleared, so the capability we are about to revoke
  // stays valid against an unsuperseded letter (apply_client_effect refuses a
  // superseded one — 00651:531). Nothing else references the new row yet.
  if (byPhone) {
    const capability = await mintCapability(admin, newId);
    if (!capability.ok) {
      const { error: unsupersedeErr } = await admin
        .from("client_invitations")
        .update({ superseded_by: null })
        .eq("id", oldId);
      const { error: undoErr } = await admin
        .from("client_invitations")
        .delete()
        .eq("id", newId);
      if (unsupersedeErr || undoErr) {
        console.error(
          "client-invite: the resend could not be taken back after a failed mint",
          unsupersedeErr ?? undoErr,
        );
      }
      return json({
        error: "capability_failed",
        detail: capability.error,
        rolledBack: !unsupersedeErr && !undoErr,
      }, 502);
    }

    // The superseded letter's capability dies with it: a link already forwarded
    // must not outlive the letter it belonged to.
    const { data: oldLinks } = await admin
      .from("client_links")
      .select("id")
      .eq("invitation_id", oldId)
      .eq("status", "active");
    for (const link of (oldLinks ?? []) as Array<{ id: string }>) {
      const { error: revokeErr } = await admin.rpc("revoke_client_link", {
        p_link_id: link.id,
      });
      if (revokeErr) console.error("client-invite: revoke of a superseded capability failed", revokeErr);
    }

    const smsLeg = await sendFirstLetterSms(admin, {
      invitationId: newId,
      projectId: row.project_id ?? null,
      phone: row.phone ?? null,
    });
    // No capability link on the way out (SQ-111 INFO-7): the resend route pipes
    // this body straight to the designer's browser, and the homeowner's own
    // credential has no business there. `deliver` says what happened to the text.
    return json({
      invitationId: newId,
      token,
      deliver: smsLeg.deliver,
      ...(smsLeg.reason ? { deliverReason: smsLeg.reason } : {}),
    });
  }

  const { data: signerProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", row.signer_id)
    .maybeSingle();
  const { data: recipient } = await admin
    .from("profiles")
    .select("id")
    .eq("email", row.email)
    .maybeSingle();
  const userId = (recipient as { id?: string } | null)?.id;
  if (!userId) return json({ error: "recipient_profile_missing" }, 500);

  const sent = await sendLetter(admin, {
    invitationId: newId,
    snapshot,
    token,
    replyTo: (signerProfile as { email?: string } | null)?.email ?? null,
    userId,
  });
  if (!sent.ok) return json({ error: "send_failed", detail: sent.error }, 502);

  return json({ invitationId: newId, token });
}

async function handleResend(req: Request): Promise<Response> {
  let body: { invitationId?: string; writerId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!body.invitationId) return json({ error: "invitation_required" }, 400);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return resendFrom(admin, body.invitationId, body.writerId ?? null);
}

/**
 * The lapsed page's one tap. ALWAYS answers 200 { ok: true } — a page a
 * stranger can open must not become an oracle for which tokens exist.
 *
 * TWO DOORS, ONE TAP (SQ-108 LOW-4). The mailed token is a column you can look
 * up; a capability is a sha256 and nothing else (00650:172), so one lookup
 * cannot find both. Only the first was tried, so the homeowner reached by text —
 * the one identity that CANNOT ask her studio through a portal she has no
 * account on — tapped a button that answered "a fresh letter is on its way" and
 * re-minted nothing, for the whole 90th day onward.
 *
 * `client_link_refresh_target` (00654) is the other side: it hashes what she
 * holds and names the invitation behind a DEAD capability whose letter is still
 * the current, unrevoked one. From there it is the same `resendFrom` the mailed
 * token takes — the same hourly floor, the same frozen letter, a new capability
 * and the text that carries it.
 *
 * The plaintext token is never exposed by either arm: resendFrom's body is read
 * for its status and discarded, and this leg answers { ok: true } to everything.
 */
async function handleRefresh(req: Request): Promise<Response> {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: true });
  }
  const token = body.token?.trim();
  if (!token) return json({ ok: true });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: row } = await admin
    .from("client_invitations")
    .select("id, accepted_at, revoked_at, expires_at, superseded_by, last_sent_at, sent_at")
    .eq("token", token)
    .maybeSingle();
  const r = row as any;
  if (r) {
    if (
      !r.accepted_at && !r.revoked_at && !r.superseded_by &&
      new Date(r.expires_at).getTime() < Date.now()
    ) {
      const res = await resendFrom(admin, r.id, null);
      if (res.status >= 400) {
        console.warn("client-invite: refresh could not resend", res.status);
      }
    }
    return json({ ok: true });
  }

  // The capability arm. `accepted_at` is deliberately NOT asked about here: on
  // this identity it records that she said she has the letter, not a burned
  // session, and taking her way back in for having answered would be a
  // punishment for doing the one thing the letter asked. Everything that IS a
  // refusal — a live capability, a revoked letter, a superseded one — 00654
  // answers NULL for.
  const { data: target, error: targetErr } = await admin.rpc(
    "client_link_refresh_target",
    { p_token: token },
  );
  if (targetErr) {
    console.error("client-invite: the capability refresh lookup failed", targetErr);
    return json({ ok: true });
  }
  const invitationId = typeof target === "string" && target ? target : null;
  if (invitationId) {
    const res = await resendFrom(admin, invitationId, null);
    if (res.status >= 400) {
      console.warn("client-invite: capability refresh could not resend", res.status);
    }
  }
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (
    !isServiceRoleCaller(
      req.headers.get("Authorization"),
      SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_SECRET_KEYS,
      PROJECT_REF,
    )
  ) {
    return json({ error: "unauthorized" }, 401);
  }
  const path = new URL(req.url).pathname;
  if (path.endsWith("/accept")) return handleAccept(req);
  if (path.endsWith("/resend")) return handleResend(req);
  if (path.endsWith("/refresh")) return handleRefresh(req);
  return handleSend(req);
});
