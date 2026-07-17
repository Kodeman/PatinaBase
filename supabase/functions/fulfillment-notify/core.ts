// fulfillment-notify/core.ts — draft + send client notifications through the
// dispatcher (S4, spec §6). Pure orchestration: this module never imports
// Resend/APNs/Postgres directly — supabase/sendEmail/sendPush are injected so
// tests run against fake-supabase + fake senders, no live stack (mirrors
// fulfillment-intake/core.ts's IntakeDeps pattern).
//
// Two actions share this core:
//
//   draftClientNote(deps, input) — render the EMAIL template from a
//     CLIENT-SAFE context the caller (the admin API route) has already
//     redacted (see fulfillment-templates.ts's header — vendor/PO/cost data
//     never reaches this file), persist it via fulfillment_record_client_note
//     (00353)'s draft phase (writes a notification.drafted event), return it
//     for the operator to review/edit before sending.
//
//   sendClientNote(deps, input) — read back the drafted (or operator-edited)
//     email body, send it, stamp the send-phase (edit_diff captured only when
//     the operator actually changed the text), THEN always attempt the push
//     leg too — a second, sibling notification row drafted+stamped in the
//     same call. apns-send's `apns_not_configured` skip (O1) — or a missing
//     client_profile_id, or zero registered tokens — becomes a
//     notification.push_skipped event via the RPC's skipped_reason param,
//     never a thrown error. The email leg degrades the same way: a failed
//     send still stamps skipped_reason and the call still returns 200 with
//     `email.success = false` rather than throwing. "Dispatcher degrades
//     per-channel, never throws" (S4 brief) applies to both legs — the ONLY
//     things this module throws for are programmer/data errors (missing
//     order, missing notification row, wrong channel), never a channel-send
//     failure.
import {
  type ClientNotificationTransition,
  type ClientSafeOrderProjection,
  type ShippingMode,
  pushCopyForTransition,
  renderClientNoteTemplate,
  subjectForTransition,
} from '../_shared/fulfillment-templates.ts';

// ── The narrow Supabase surface this module needs (satisfied by both the
// real supabase-js client and _tests/fake-supabase.ts). ─────────────────────
export interface SupabaseSelectResult<T> {
  data: T | null;
  error: { message: string } | null;
}
export interface SupabaseLike {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: unknown): {
        maybeSingle(): Promise<SupabaseSelectResult<Record<string, unknown>>>;
      };
    };
  };
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface EmailSendResult {
  success: boolean;
  id?: string;
  error?: string;
}
export interface PushSendResult {
  sent?: number;
  failed?: number;
  skipped?: string;
}

export interface NotifyDeps {
  supabase: SupabaseLike;
  sendEmail(opts: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    userId?: string;
    templateId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<EmailSendResult>;
  sendPush(opts: {
    user_id: string;
    title: string;
    body: string;
    entity_type?: string;
    entity_id?: string;
  }): Promise<PushSendResult>;
  /** Default actor for both RPC calls when the input doesn't override it. */
  actor?: string;
}

interface OrderIdentity {
  order_no: number;
  client_name: string;
  client_email: string | null;
  client_profile_id: string | null;
}

async function fetchOrderIdentity(supabase: SupabaseLike, orderId: string): Promise<OrderIdentity> {
  const { data, error } = await supabase
    .from('fulfillment_orders')
    .select('order_no, client_name, client_email, client_profile_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(`fulfillment-notify: ${error.message}`);
  if (!data) throw new Error(`fulfillment-notify: order ${orderId} not found`);
  return data as unknown as OrderIdentity;
}

// ── draft ────────────────────────────────────────────────────────────────

export interface DraftContext {
  items: Array<{ name: string; qty: number }>;
  eta?: string | null;
  previousEta?: string | null;
  shippingMode?: ShippingMode | null;
  exceptionNote?: string | null;
}

export interface DraftInput {
  order_id: string;
  transition: ClientNotificationTransition;
  context: DraftContext;
  actor?: string;
}

export interface DraftResult {
  note_id: string;
  order_id: string;
  transition: ClientNotificationTransition;
  template_key: string;
  subject: string;
  drafted_body: string;
}

function toProjection(order: OrderIdentity, ctx: DraftContext): ClientSafeOrderProjection {
  return {
    orderNumber: order.order_no,
    clientName: order.client_name,
    items: ctx.items,
    eta: ctx.eta ?? null,
    previousEta: ctx.previousEta ?? null,
    shippingMode: ctx.shippingMode ?? null,
    exceptionNote: ctx.exceptionNote ?? null,
  };
}

export async function draftClientNote(deps: NotifyDeps, input: DraftInput): Promise<DraftResult> {
  const order = await fetchOrderIdentity(deps.supabase, input.order_id);
  const rendered = renderClientNoteTemplate(input.transition, toProjection(order, input.context));

  const { data: noteId, error } = await deps.supabase.rpc('fulfillment_record_client_note', {
    p_note_id: null,
    p_order_id: input.order_id,
    p_transition: input.transition,
    p_channel: 'email',
    p_template_key: rendered.templateKey,
    p_drafted_body: rendered.html,
    p_sent_body: null,
    p_edit_diff: null,
    p_resend_message_id: null,
    p_skipped_reason: null,
    p_actor: input.actor ?? deps.actor ?? 'operator',
  });
  if (error) throw new Error(`fulfillment-notify: ${error.message}`);

  return {
    note_id: noteId as string,
    order_id: input.order_id,
    transition: input.transition,
    template_key: rendered.templateKey,
    subject: rendered.subject,
    drafted_body: rendered.html,
  };
}

// ── send ─────────────────────────────────────────────────────────────────

export interface SendInput {
  notification_id: string;
  edited_body?: string;
  actor?: string;
}

export interface EmailLegResult extends EmailSendResult {
  skipped_reason: string | null;
}
export interface PushLegResult extends PushSendResult {
  skipped_reason: string | null;
}

export interface SendResult {
  notification_id: string;
  transition: ClientNotificationTransition;
  email: EmailLegResult;
  push: PushLegResult;
  /** True when edited_body differed from the drafted body — an edit_diff was stamped. */
  edited: boolean;
}

interface NotificationRow {
  id: string;
  order_id: string;
  transition: string;
  channel: string;
  template_key: string;
  drafted_body: string | null;
}

async function fetchNotification(supabase: SupabaseLike, id: string): Promise<NotificationRow> {
  const { data, error } = await supabase
    .from('fulfillment_client_notifications')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`fulfillment-notify: ${error.message}`);
  if (!data) throw new Error(`fulfillment-notify: notification ${id} not found`);
  return data as unknown as NotificationRow;
}

/** Attempt the push leg for a just-sent (or just-failed) email note. Always
 *  resolves — apns_not_configured, no client_profile_id, zero tokens, and any
 *  dispatch-time error all become a skipped_reason rather than a throw. */
async function dispatchPushLeg(
  deps: NotifyDeps,
  order: OrderIdentity,
  note: NotificationRow,
  actor: string,
): Promise<PushLegResult> {
  const transition = note.transition as ClientNotificationTransition;
  const push = pushCopyForTransition(transition, order.order_no);

  let pushNoteId: string | null = null;
  try {
    const { data, error } = await deps.supabase.rpc('fulfillment_record_client_note', {
      p_note_id: null,
      p_order_id: note.order_id,
      p_transition: note.transition,
      p_channel: 'push',
      p_template_key: note.template_key,
      p_drafted_body: push.body,
      p_sent_body: null,
      p_edit_diff: null,
      p_resend_message_id: null,
      p_skipped_reason: null,
      p_actor: actor,
    });
    if (error) throw new Error(error.message);
    pushNoteId = data as string;
  } catch (err) {
    // Couldn't even draft the push row — degrade, never throw the send() call.
    return { skipped: 'push_draft_failed', skipped_reason: String(err) };
  }

  let skippedReason: string | null = null;
  let sentCount = 0;
  if (!order.client_profile_id) {
    skippedReason = 'no_client_profile';
  } else {
    try {
      const res = await deps.sendPush({
        user_id: order.client_profile_id,
        title: push.title,
        body: push.body,
        entity_type: 'fulfillment_order',
        entity_id: note.order_id,
      });
      if (res.skipped) {
        skippedReason = res.skipped;
      } else {
        sentCount = res.sent ?? 0;
        if (sentCount === 0) skippedReason = 'no_tokens';
      }
    } catch (err) {
      skippedReason = `push_dispatch_error: ${String(err)}`;
    }
  }

  await deps.supabase.rpc('fulfillment_record_client_note', {
    p_note_id: pushNoteId,
    p_order_id: note.order_id,
    p_transition: note.transition,
    p_channel: 'push',
    p_template_key: note.template_key,
    p_drafted_body: null,
    p_sent_body: push.body,
    p_edit_diff: null,
    p_resend_message_id: null,
    p_skipped_reason: skippedReason,
    p_actor: actor,
  });

  return { sent: sentCount, skipped: skippedReason ?? undefined, skipped_reason: skippedReason };
}

export async function sendClientNote(deps: NotifyDeps, input: SendInput): Promise<SendResult> {
  const note = await fetchNotification(deps.supabase, input.notification_id);
  if (note.channel !== 'email') {
    throw new Error(
      "fulfillment-notify: send() takes the EMAIL draft's notification_id (push is dispatched automatically alongside it)",
    );
  }
  const order = await fetchOrderIdentity(deps.supabase, note.order_id);
  const actor = input.actor ?? deps.actor ?? 'operator';

  const draftedBody = note.drafted_body ?? '';
  const edited = input.edited_body != null && input.edited_body !== draftedBody;
  const sentBody = edited ? (input.edited_body as string) : draftedBody;
  const editDiff = edited ? { original: draftedBody, sent: sentBody } : null;

  // ── email leg ────────────────────────────────────────────────────────
  let emailResult: EmailSendResult;
  if (order.client_email) {
    emailResult = await deps.sendEmail({
      to: order.client_email,
      subject: subjectForTransition(note.transition as ClientNotificationTransition, order.order_no),
      html: sentBody,
      from: 'Patina Orders <orders@patina.cloud>',
      userId: order.client_profile_id ?? undefined,
      templateId: note.template_key,
      metadata: { order_id: note.order_id, transition: note.transition },
    });
  } else {
    emailResult = { success: false, error: 'no_client_email' };
  }
  const emailSkipReason = emailResult.success ? null : (emailResult.error ?? 'email_send_failed');

  await deps.supabase.rpc('fulfillment_record_client_note', {
    p_note_id: note.id,
    p_order_id: note.order_id,
    p_transition: note.transition,
    p_channel: 'email',
    p_template_key: note.template_key,
    p_drafted_body: null,
    p_sent_body: sentBody,
    p_edit_diff: editDiff,
    p_resend_message_id: emailResult.success ? (emailResult.id ?? null) : null,
    p_skipped_reason: emailSkipReason,
    p_actor: actor,
  });

  // ── push leg (best-effort sibling row; never throws) ────────────────
  const pushResult = await dispatchPushLeg(deps, order, note, actor);

  return {
    notification_id: note.id,
    transition: note.transition as ClientNotificationTransition,
    email: { ...emailResult, skipped_reason: emailSkipReason },
    push: pushResult,
    edited,
  };
}
