// Internal selection questions. The outbound row, not conversation metadata,
// is the recovery authority. No caller prose or credentials enter this rail.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  channelConsentDecision,
  contactRuleForbidsSms,
  smsConversationNumber,
  smsIsSuppressed,
} from "./sms.ts";
import type { SendPartySmsResult, SmsDeps } from "./sms.ts";
import { interpolate } from "./render-template.ts";

export const SELECTION_TEMPLATE = "sms_selection";
const TTL_MS = 24 * 3600 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE = /^\+[1-9][0-9]{7,14}$/;
const CREDENTIAL = /https?:|www\.|\/field\/|[0-9a-f]{32,}/i;
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

/** Null means non-GSM-7; extension characters consume two septets. */
export function selectionSeptets(text: string): number | null {
  let count = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) count++;
    else if (GSM_EXTENDED.includes(ch)) count += 2;
    else return null;
  }
  return count;
}

export type SelectionKind = "project_choice" | "ref_clarify";
export type SelectionIntent =
  | {
    kind: "project_choice";
    inboundMessageId: string;
    options: { partyId: string; projectId: string }[];
  }
  | {
    kind: "ref_clarify";
    inboundMessageId: string;
    options: { partyId: string; projectId: string; promptId: string }[];
  };

export interface SelectionSmsInput {
  kind: "selection";
  phone: string;
  selection: SelectionIntent;
  automationPhase?: number;
  partyId?: never;
  projectId?: never;
  body?: never;
  auditBody?: never;
  templateKey?: never;
  vars?: never;
  link?: never;
  dedupeKey?: never;
  deferToCaller?: never;
  siteRequestDispatchOutboxId?: never;
}

export interface SelectionOption {
  partyId: string;
  projectId: string;
  promptId?: string;
  number?: number;
  shortCode?: string;
}

export interface SelectionManifest {
  version: 1;
  kind: SelectionKind;
  inboundMessageId: string;
  conversationId: string;
  senderNumber: string;
  recipientPhone: string;
  expiresAt: string;
  options: SelectionOption[];
}

export interface ValidatedSelection {
  manifest: SelectionManifest;
  body: string;
}
export type SelectionValidation =
  | { ok: true; value: ValidatedSelection }
  | { ok: false; reason: string; unreadable?: boolean };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function validIntent(
  value: unknown,
  stored: boolean,
): value is SelectionIntent {
  if (
    !object(value) ||
    !["project_choice", "ref_clarify"].includes(String(value.kind)) ||
    !uuid(value.inboundMessageId) || !Array.isArray(value.options) ||
    !value.options.length
  ) return false;
  if (!stored && !keys(value, ["kind", "inboundMessageId", "options"])) {
    return false;
  }
  const seen = new Set<string>();
  return value.options.every((option, index) => {
    if (!object(option) || !uuid(option.partyId) || !uuid(option.projectId)) {
      return false;
    }
    const ref = value.kind === "ref_clarify";
    const allowed = [
      "partyId",
      "projectId",
      ...(ref ? ["promptId"] : []),
      ...(stored ? [ref ? "shortCode" : "number"] : []),
    ];
    if (!keys(option, allowed) || (ref && !uuid(option.promptId))) return false;
    if (
      stored &&
      (ref
        ? !/^[0-9]{2,3}$/.test(String(option.shortCode))
        : option.number !== index + 1)
    ) return false;
    const identity = String(ref ? option.promptId : option.projectId);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function isSelectionInput(value: SelectionSmsInput): boolean {
  return keys(value as unknown as Record<string, unknown>, [
    "kind",
    "phone",
    "selection",
    "automationPhase",
  ]) &&
    value.kind === "selection" && PHONE.test(value.phone) &&
    validIntent(value.selection, false) &&
    (value.automationPhase === undefined ||
      (Number.isInteger(value.automationPhase) && value.automationPhase >= 0));
}

export function selectionDedupeKey(
  inboundMessageId: string,
  kind: SelectionKind,
): string {
  return `selection:${inboundMessageId}:${kind}`;
}

function safeName(value: unknown): value is string {
  if (
    typeof value !== "string" || value.trim() !== value || !value ||
    /[\r\n]/.test(value) || CREDENTIAL.test(value)
  ) return false;
  const count = selectionSeptets(value);
  return count !== null && count <= 24;
}

/** Initial mode filters known denials before numbering. Stored mode NEVER
 * filters: any withdrawn binding/permission invalidates the entire question. */
export async function validateSmsSelection(
  supabase: SupabaseClient,
  intent: SelectionIntent | SelectionManifest,
  phone: string,
  sender: string,
  now: Date,
  stored = false,
): Promise<SelectionValidation> {
  const refuse = (reason: string, unreadable = false): SelectionValidation => ({
    ok: false,
    reason,
    unreadable,
  });
  try {
    if (
      !validIntent(intent, stored) || !PHONE.test(phone) || !PHONE.test(sender)
    ) return refuse("selection_invalid");
    const held = stored ? intent as SelectionManifest : null;
    if (
      held &&
      (!keys(held as unknown as Record<string, unknown>, [
        "version",
        "kind",
        "inboundMessageId",
        "conversationId",
        "senderNumber",
        "recipientPhone",
        "expiresAt",
        "options",
      ]) ||
        held.version !== 1 || !uuid(held.conversationId) ||
        held.senderNumber !== sender || held.recipientPhone !== phone)
    ) return refuse("selection_binding_mismatch");
    const suppression = await smsIsSuppressed(supabase, sender, phone);
    if (suppression === null) return refuse("suppression_unreadable", true);
    if (suppression) return refuse("suppressed");
    const { data: inbound, error: inboundError } = await supabase.from(
      "sms_messages",
    )
      .select("id, direction, conversation_id, created_at").eq(
        "id",
        intent.inboundMessageId,
      ).maybeSingle();
    if (inboundError) return refuse("selection_source_unreadable", true);
    if (
      !inbound || inbound.direction !== "inbound" ||
      !uuid(inbound.conversation_id)
    ) return refuse("selection_source_invalid");
    const { data: conversation, error: conversationError } = await supabase
      .from("sms_conversations")
      .select("id, phone_e164, twilio_number").eq("id", inbound.conversation_id)
      .maybeSingle();
    if (conversationError) return refuse("selection_source_unreadable", true);
    if (
      !conversation || conversation.phone_e164 !== phone ||
      conversation.twilio_number !== sender ||
      (held && held.conversationId !== conversation.id)
    ) return refuse("selection_binding_mismatch");
    const sourceTime = Date.parse(inbound.created_at);
    let expiry = sourceTime + TTL_MS;
    if (
      !Number.isFinite(sourceTime) || sourceTime > now.getTime() ||
      expiry <= now.getTime()
    ) return refuse("selection_expired");
    if (held) {
      const heldExpiry = Date.parse(held.expiresAt);
      if (!Number.isFinite(heldExpiry) || heldExpiry > expiry) {
        return refuse("selection_binding_mismatch");
      }
      if (heldExpiry <= now.getTime()) return refuse("selection_expired");
      expiry = heldExpiry;
    }
    const options: SelectionOption[] = [];
    const sections: string[] = [];
    const codes = new Set<string>();
    for (const option of intent.options as SelectionOption[]) {
      const { data: party, error: partyError } = await supabase.from(
        "project_parties",
      )
        .select("id, project_id, phone_e164").eq("id", option.partyId)
        .maybeSingle();
      if (partyError) return refuse("selection_binding_unreadable", true);
      if (
        !party || party.project_id !== option.projectId ||
        party.phone_e164 !== phone
      ) return refuse("selection_binding_mismatch");
      let code: string | undefined;
      let promptExpiry = expiry;
      if (intent.kind === "ref_clarify") {
        const { data: prompt, error: promptError } = await supabase.from(
          "sms_prompts",
        )
          .select(
            "id, party_id, project_id, sender_number, recipient_phone, short_code, expires_at, answered_at",
          )
          .eq("id", option.promptId).maybeSingle();
        if (promptError) return refuse("selection_binding_unreadable", true);
        if (
          !prompt || prompt.party_id !== option.partyId ||
          prompt.project_id !== option.projectId ||
          prompt.sender_number !== sender || prompt.recipient_phone !== phone ||
          prompt.answered_at ||
          !/^[0-9]{2,3}$/.test(prompt.short_code) ||
          !Number.isFinite(Date.parse(prompt.expires_at)) ||
          Date.parse(prompt.expires_at) <= now.getTime()
        ) return refuse("selection_prompt_invalid");
        code = prompt.short_code;
        promptExpiry = Date.parse(prompt.expires_at);
        if (
          held &&
          ((option as SelectionOption).shortCode !== code ||
            expiry > promptExpiry)
        ) return refuse("selection_binding_mismatch");
      }
      const decision = await channelConsentDecision(
        supabase,
        phone,
        option.projectId,
      );
      const contact = { unreadable: false };
      const forbidden = await contactRuleForbidsSms(
        supabase,
        option.partyId,
        phone,
        contact,
      );
      if (decision.unreadable || contact.unreadable) {
        return refuse("selection_authority_unreadable", true);
      }
      // Consent supplies the exact resolveProjectOrg identity it authorized.
      // A separate naming lookup must never choose a different studio.
      if (!decision.organizationId) {
        return refuse("selection_authority_missing");
      }
      if (
        decision.verdict !== "allow" || !decision.recordPresent || forbidden
      ) {
        if (held) return refuse("selection_authorization_withdrawn");
        continue;
      }
      const { data: organization, error: orgError } = await supabase.from(
        "organizations",
      )
        .select("id, name").eq("id", decision.organizationId).maybeSingle();
      const { data: project, error: projectError } = await supabase.from(
        "projects",
      )
        .select("id, name").eq("id", option.projectId).maybeSingle();
      if (orgError || projectError) {
        return refuse("selection_labels_unreadable", true);
      }
      if (!safeName(organization?.name) || !safeName(project?.name)) {
        return refuse("selection_labels_invalid");
      }
      const permitted: SelectionOption = {
        partyId: option.partyId,
        projectId: option.projectId,
      };
      if (intent.kind === "ref_clarify") {
        if (codes.has(code!)) return refuse("selection_prompt_invalid");
        codes.add(code!);
        permitted.promptId = option.promptId;
        permitted.shortCode = code;
        sections.push(`${organization.name}: ${project.name}, Ref ${code}.`);
        expiry = Math.min(expiry, promptExpiry);
      } else {
        permitted.number = options.length + 1;
        sections.push(
          `${organization.name}: ${permitted.number}) ${project.name}.`,
        );
      }
      options.push(permitted);
    }
    if (!options.length) return refuse("selection_review_needed");
    const instruction = intent.kind === "project_choice"
      ? "Which project? Reply a number."
      : "Repeat your word with a Ref code.";
    const { data: template, error: templateError } = await supabase.from(
      "email_templates",
    )
      .select("html_content, is_active").eq("slug", SELECTION_TEMPLATE)
      .maybeSingle();
    if (templateError) return refuse("selection_template_unreadable", true);
    const raw = template?.html_content;
    if (
      template?.is_active === false || typeof raw !== "string" ||
      !raw.startsWith("{{selection}} ") ||
      (raw.match(/\{\{/g) ?? []).length !== 1
    ) return refuse("selection_template_invalid");
    const body = interpolate(raw, {
      selection: `${sections.join(" ")} ${instruction}`,
    });
    const septets = selectionSeptets(body);
    if (septets === null || septets > 306 || CREDENTIAL.test(body)) {
      return refuse("selection_copy_invalid");
    }
    return {
      ok: true,
      value: {
        body,
        manifest: {
          version: 1,
          kind: intent.kind,
          inboundMessageId: intent.inboundMessageId,
          conversationId: conversation.id,
          senderNumber: sender,
          recipientPhone: phone,
          expiresAt: new Date(expiry).toISOString(),
          options,
        },
      },
    };
  } catch {
    return refuse("selection_unreadable", true);
  }
}

export interface SelectionRecoveryInput {
  inboundMessageId: string;
  kind: SelectionKind;
  phone: string;
  /** When context already names a row, it must match the origin/kind too. */
  messageId?: string;
}
export interface SelectionQuestion {
  manifest: SelectionManifest;
  deliveryStatus: string;
  /** Only sent/delivered/dry_run questions may accept choices. Deferred,
   * claimed, sending and provider-queued questions have NOT yet been asked. */
  usable: boolean;
}
export interface SelectionRecoveryResult extends SendPartySmsResult {
  /** False only after a successful read proved absence. Never on read error. */
  found: boolean;
  selection?: SelectionQuestion;
}

/** Re-read the one durable question. A duplicate never invents 'queued', never
 * replaces its manifest, and never retries a terminally suppressed question. */
export async function recoverSmsSelection(
  supabase: SupabaseClient,
  input: SelectionRecoveryInput,
  deps: SmsDeps = {},
): Promise<SelectionRecoveryResult> {
  const failure = (reason: string): SelectionRecoveryResult => ({
    found: true,
    sent: false,
    status: "failed",
    reason,
  });
  try {
    const sender = smsConversationNumber(deps);
    if (
      !uuid(input.inboundMessageId) ||
      !["project_choice", "ref_clarify"].includes(input.kind) ||
      !PHONE.test(input.phone) || !sender ||
      (input.messageId !== undefined && !uuid(input.messageId))
    ) return failure("selection_invalid");
    let query = supabase.from("sms_messages")
      .select(
        "id, conversation_id, direction, party_id, project_id, template_key, recipe, twilio_status, twilio_sid, error_code",
      )
      .eq("direction", "outbound").eq("template_key", SELECTION_TEMPLATE)
      .eq("dedupe_key", selectionDedupeKey(input.inboundMessageId, input.kind))
      .is("party_id", null).is("project_id", null);
    if (input.messageId) query = query.eq("id", input.messageId);
    const { data: row, error } = await query.maybeSingle();
    if (error) return failure("selection_recovery_unreadable");
    if (!row) {
      return {
        found: false,
        sent: false,
        status: "failed",
        reason: "selection_not_found",
      };
    }
    const base = {
      ...failure("selection_unusable"),
      messageId: row.id,
      conversationId: row.conversation_id,
    };
    const recipe = row.recipe;
    if (
      !object(recipe) || recipe.template_key !== SELECTION_TEMPLATE ||
      recipe.party_id !== null ||
      recipe.project_id !== null || recipe.link_kind !== null ||
      !object(recipe.params) || Object.keys(recipe.params).length ||
      !object(recipe.selection) ||
      recipe.selection.inboundMessageId !== input.inboundMessageId ||
      recipe.selection.kind !== input.kind ||
      recipe.selection.conversationId !== row.conversation_id
    ) return { ...base, reason: "selection_recipe_invalid" };
    if (
      ![
        "deferred",
        "claimed",
        "sending",
        "queued",
        "accepted",
        "sent",
        "delivered",
        "dry_run",
      ].includes(row.twilio_status)
    ) {
      return {
        ...base,
        reason: `selection_${row.twilio_status}`,
        provider_code: row.error_code ?? undefined,
      };
    }
    const validation = await validateSmsSelection(
      supabase,
      recipe.selection as unknown as SelectionManifest,
      input.phone,
      sender,
      deps.now ?? new Date(),
      true,
    );
    if (!validation.ok) return { ...base, reason: validation.reason };
    const deliveryStatus = String(row.twilio_status);
    const usable = ["sent", "delivered", "dry_run"].includes(deliveryStatus);
    const deferred = deliveryStatus === "deferred";
    const accepted =
      ["queued", "accepted", "sending"].includes(deliveryStatus) &&
      !!row.twilio_sid;
    return {
      ...base,
      reason:
        deliveryStatus === "claimed" || (!deferred && !usable && !accepted)
          ? "selection_pending"
          : undefined,
      status: usable
        ? "sent"
        : deferred
        ? "deferred"
        : accepted
        ? "queued"
        : "failed",
      sent: usable || accepted,
      deferred,
      twilioSid: row.twilio_sid ?? undefined,
      selection: {
        manifest: validation.value.manifest,
        deliveryStatus,
        usable,
      },
    };
  } catch {
    return failure("selection_recovery_unreadable");
  }
}
