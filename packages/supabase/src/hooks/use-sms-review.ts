'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { invalidateProjectWorkflow } from './use-project-workflow';

// ═══════════════════════════════════════════════════════════════════════════
// SMS REVIEW — the Desk field-triage queue (Field Coordination · Wave 5)
//
// Low-confidence / needs-review inbound field texts across the designer's
// projects (sms_messages.needs_review, 00282). RLS (team-scoped SELECT) already
// bounds the queue to the querying team member's projects, so this is a thin
// typed read (party + project joined, target title resolved for the human
// "Move 'Rough-in plumbing' to Tue" line) plus the review_sms_message mutation.
// 30s poll, matching the Post/Desk background-resort cadence (use-inbox).
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

/** The parse result parked on a needs_review message (00282 parsed_intent).
 *  Shaped like apply_field_effect's p_effect so review_sms_message can replay
 *  it directly; every field is optional/defensive (the parser is upstream). */
export interface FieldParsedIntent {
  type?: string;
  intent?: string;
  target?: { kind?: 'task' | 'coordination'; id?: string } | null;
  new_date?: string | null;
  note?: string | null;
  media?: unknown[];
  [key: string]: unknown;
}

export interface SmsReviewMessage {
  id: string;
  conversation_id: string;
  project_id: string | null;
  party_id: string | null;
  body: string | null;
  media: unknown[];
  parsed_intent: FieldParsedIntent | null;
  confidence: number | null;
  owner_user_id: string | null;
  owner_name: string | null;
  paused_until: string | null;
  notified_name: string | null;
  twilio_status: string | null;
  error_code: string | null;
  applied_effect: Record<string, unknown> | null;
  project_lead_id: string | null;
  created_at: string;
  party: {
    id: string;
    display_name: string;
    party_kind: string;
    trade: string | null;
  } | null;
  project: { id: string; name: string | null } | null;
  /** Title of the parse's target task / coordination item (for the effect line). */
  target_title: string | null;
  target_kind: 'task' | 'coordination' | null;
}

export const smsReviewKeys = {
  all: ['sms-review'] as const,
};

/**
 * The field-triage queue: unreviewed inbound texts across my projects, newest
 * first. Resolves each parse's target title so the card can state the proposed
 * effect in words.
 */
export function useSmsReviewQueue() {
  return useQuery({
    queryKey: smsReviewKeys.all,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<SmsReviewMessage[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('sms_review_queue')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (data ?? []) as any[];

      if (!raw.length) return [];
      // The view owns membership/queue filtering. Enrichment never reads the
      // unattributed holding context, and every pause is joined by BOTH keys.
      const projectIds = [...new Set(raw.map((row) => row.project_id))];
      const [projects, messages, contexts, notifications] = await Promise.all([
        supabase.from('projects').select('id, name, designer_id').in('id', projectIds),
        supabase.from('sms_messages').select('id, twilio_status, error_code, applied_effect').in('id', raw.map((row) => row.id)),
        supabase.from('sms_conversation_context').select('conversation_id, project_id, paused_until')
          .in('project_id', projectIds).in('conversation_id', raw.map((row) => row.conversation_id)),
        supabase.from('notification_log').select('user_id, metadata').eq('type', 'field_needs_review')
          .eq('channel', 'in_app').eq('status', 'delivered').in('metadata->>message_id', raw.map((row) => row.id)),
      ]);
      for (const result of [projects, messages, contexts, notifications]) if (result.error) throw result.error;
      const userIds = [...new Set([...raw.map((row) => row.owner_user_id),
        ...(notifications.data ?? []).map((row: { user_id: string }) => row.user_id)].filter(Boolean))];
      const profiles = userIds.length
        ? await supabase.from('profiles').select('id, full_name, display_name').in('id', userIds)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const name = (id: string | null) => {
        const profile = profiles.data?.find((row: { id: string }) => row.id === id);
        return profile?.display_name || profile?.full_name || null;
      };

      // Resolve target titles in two batched reads (task / coordination).
      const taskIds = new Set<string>();
      const coordIds = new Set<string>();
      for (const r of raw) {
        const t = (r.parsed_intent as FieldParsedIntent | null)?.target;
        if (t?.id && t.kind === 'task') taskIds.add(t.id);
        else if (t?.id && t.kind === 'coordination') coordIds.add(t.id);
      }
      const titles = new Map<string, string>();
      if (taskIds.size > 0) {
        const { data: tasks } = await supabase
          .from('project_tasks')
          .select('id, title')
          .in('id', [...taskIds]);
        for (const t of (tasks ?? []) as Array<{ id: string; title: string }>) {
          titles.set(t.id, t.title);
        }
      }
      if (coordIds.size > 0) {
        const { data: items } = await supabase
          .from('client_decisions')
          .select('id, title')
          .in('id', [...coordIds]);
        for (const it of (items ?? []) as Array<{ id: string; title: string }>) {
          titles.set(it.id, it.title);
        }
      }

      return raw.map((r): SmsReviewMessage => {
        const parsed = (r.parsed_intent ?? null) as FieldParsedIntent | null;
        const target = parsed?.target ?? null;
        return {
          id: r.id,
          conversation_id: r.conversation_id,
          project_id: r.project_id ?? null,
          party_id: r.party_id ?? null,
          body: r.body ?? null,
          media: Array.isArray(r.media) ? r.media : [],
          parsed_intent: parsed,
          confidence: r.confidence ?? null,
          created_at: r.created_at,
          owner_user_id: r.owner_user_id ?? null,
          owner_name: name(r.owner_user_id),
          paused_until: contexts.data?.find((row: { conversation_id: string; project_id: string }) =>
            row.conversation_id === r.conversation_id && row.project_id === r.project_id)?.paused_until ?? null,
          notified_name: (() => {
            const notification = notifications.data?.find((row: { metadata?: { message_id?: string } }) => row.metadata?.message_id === r.id);
            return notification ? (name(notification.user_id)?.split(' ')[0] ?? 'a studio member') : null;
          })(),
          twilio_status: messages.data?.find((row: { id: string }) => row.id === r.id)?.twilio_status ?? null,
          error_code: messages.data?.find((row: { id: string }) => row.id === r.id)?.error_code ?? null,
          applied_effect: messages.data?.find((row: { id: string }) => row.id === r.id)?.applied_effect ?? null,
          project_lead_id: projects.data?.find((row: { id: string }) => row.id === r.project_id)?.designer_id ?? null,
          party: r.party_id ? { id: r.party_id, display_name: r.party_display_name, party_kind: r.party_kind, trade: r.trade } : null,
          project: projects.data?.find((row: { id: string }) => row.id === r.project_id) ?? null,
          target_title: target?.id ? (titles.get(target.id) ?? null) : null,
          target_kind: (target?.kind as 'task' | 'coordination' | undefined) ?? null,
        };
      });
    },
  });
}

export interface ReviewSmsInput {
  messageId: string;
  action: 'apply' | 'dismiss';
  /** A designer-edited effect (e.g. an adjusted date) — overrides the parked
   *  parsed_intent when applying. Omit to apply exactly what was parsed. */
  effect?: FieldParsedIntent | null;
  /** Carried for cache scoping (invalidate the project's coordination/tasks). */
  projectId?: string | null;
}

/**
 * Apply or dismiss a needs_review field text. Wraps review_sms_message (00282,
 * SECURITY DEFINER — authorizes the caller via is_project_team_member, then runs
 * the parked/edited effect through the apply_field_effect choke point). Sweeps
 * the queue + every surface a field effect touches (Post, coordination, tasks,
 * Desk field rollup) so one act settles everywhere.
 */
export function useReviewSmsMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReviewSmsInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('review_sms_message', {
        p_message_id: input.messageId,
        p_action: input.action,
        p_effect: input.effect ?? null,
      });
      if (error) throw error;
      return data as { action: string; result: Record<string, unknown> };
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: smsReviewKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['field-activity'] });
      void queryClient.invalidateQueries({ queryKey: ['margin-items'] });
      void queryClient.invalidateQueries({ queryKey: ['document-state'] });
      if (input.projectId) {
        void queryClient.invalidateQueries({ queryKey: ['coordination-items', input.projectId] });
        void queryClient.invalidateQueries({ queryKey: ['section-tasks', input.projectId] });
        void invalidateProjectWorkflow(queryClient, input.projectId);
      }
    },
  });
}
