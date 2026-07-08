'use server';

/**
 * Field guest page server actions (Field Coordination Wave 4).
 *
 * Every action re-resolves the token SERVER-SIDE via resolve_field_link() and
 * derives party/project from that result — a client-passed party/project id
 * is never trusted. Every mutation funnels through apply_field_effect()
 * (00282), the single choke point SMS/the field page/Desk triage all share,
 * so behavior can never diverge between rails. p_source is always
 * 'field_link' so applied_effect provenance is honest.
 *
 * apply_field_effect is REVOKEd from authenticated (00282) — only the service
 * client (service_role) may call it, which is exactly what a login-less
 * guest surface uses anyway (there is no session to scope RLS to).
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@patina/supabase/server';
import { isLikelyFieldToken, type FieldEffectTarget } from './types';

export interface FieldActionResult {
  ok: boolean;
  summaryText?: string;
  remainingCount?: number;
  error?: string;
}

interface ResolvedGuest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  partyId: string;
  projectId: string;
}

/** Re-resolve the token server-side. Never trust a client-supplied id. */
async function resolveGuest(token: string): Promise<ResolvedGuest | null> {
  if (!isLikelyFieldToken(token)) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;
  const { data, error } = await admin.rpc('resolve_field_link', { p_token: token });
  const dto = Array.isArray(data) ? data[0] : data;
  if (error || !dto?.party?.id || !dto?.project?.id) return null;

  return { admin, partyId: dto.party.id as string, projectId: dto.project.id as string };
}

/** apply_field_effect raises plain-English exceptions; only a couple are worth surfacing verbatim. */
function friendlyError(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? '';
  if (msg.includes('cannot be marked done from the field')) {
    return 'That one needs a pick from your designer — flag it as a problem instead.';
  }
  return 'That didn’t go through. Try again in a moment.';
}

export async function completeItem(token: string, target: FieldEffectTarget): Promise<FieldActionResult> {
  const guest = await resolveGuest(token);
  if (!guest) return { ok: false, error: 'This link is no longer active.' };

  const { data, error } = await guest.admin.rpc('apply_field_effect', {
    p_party_id: guest.partyId,
    p_effect: { type: 'mark_done', target },
    p_source: 'field_link',
  });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(`/field/${token}`);
  return { ok: true, summaryText: data?.summary_text, remainingCount: data?.remaining_count };
}

/**
 * Problem report → flag_blocker (an RFI lands in the designer's court; a
 * task target is also marked blocked). photoFormData, when present, carries
 * a single `photo` File — uploaded to field-media first, then its object
 * path rides p_effect.media. Note: apply_field_effect's flag_blocker branch
 * does not persist media on the client_decisions row it inserts today (only
 * punch_report reflects a photo count in its text) — the object still lands
 * safely in storage either way, and we fold a "[photo attached]" marker into
 * the note itself so the designer sees it in the Post regardless.
 */
export async function reportProblem(
  token: string,
  target: FieldEffectTarget,
  note: string,
  photoFormData?: FormData,
): Promise<FieldActionResult> {
  const guest = await resolveGuest(token);
  if (!guest) return { ok: false, error: 'This link is no longer active.' };

  let media: string[] = [];
  let effectNote = note.trim();

  const photo = photoFormData?.get('photo');
  if (photo instanceof File && photo.size > 0) {
    const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `project/${guest.projectId}/field/${randomUUID()}/1.${ext}`;
    const { error: uploadError } = await guest.admin.storage
      .from('field-media')
      .upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
    if (!uploadError) {
      media = [path];
      effectNote = effectNote ? `${effectNote}\n[photo attached]` : '[photo attached]';
    }
  }

  const { data, error } = await guest.admin.rpc('apply_field_effect', {
    p_party_id: guest.partyId,
    p_effect: {
      type: 'flag_blocker',
      target,
      note: effectNote || 'Flagged from the field.',
      media,
    },
    p_source: 'field_link',
  });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(`/field/${token}`);
  return { ok: true, summaryText: data?.summary_text, remainingCount: data?.remaining_count };
}

/**
 * Delivery confirms are note-only in v1 (no receiving_inspections auto-create
 * — the lighter path the RPC's own comments call out as the default; see
 * plan Open-Q3). deliveryLabel is folded into the note for context since
 * delivery_events rows aren't tasks/coordination items and carry no target id
 * apply_field_effect can reference.
 */
export async function confirmDelivery(token: string, deliveryLabel: string): Promise<FieldActionResult> {
  const guest = await resolveGuest(token);
  if (!guest) return { ok: false, error: 'This link is no longer active.' };

  const { data, error } = await guest.admin.rpc('apply_field_effect', {
    p_party_id: guest.partyId,
    p_effect: { type: 'confirm_delivery', note: `Delivery confirmed: ${deliveryLabel}` },
    p_source: 'field_link',
  });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(`/field/${token}`);
  return { ok: true, summaryText: data?.summary_text, remainingCount: data?.remaining_count };
}
