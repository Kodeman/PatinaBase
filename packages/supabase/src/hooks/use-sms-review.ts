'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

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

const REVIEW_SELECT = `
  id, conversation_id, project_id, party_id, body, media, parsed_intent, confidence, created_at,
  party:project_parties!party_id(id, display_name, party_kind, trade),
  project:projects!project_id(id, name)
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

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
        .from('sms_messages')
        .select(REVIEW_SELECT)
        .eq('direction', 'inbound')
        .eq('needs_review', true)
        .is('reviewed_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (data ?? []) as any[];

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
          party: one(r.party),
          project: one(r.project),
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
      }
    },
  });
}
