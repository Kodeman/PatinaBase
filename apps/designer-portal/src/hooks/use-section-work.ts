/**
 * The Work (R23) — section tasks + approval gates, both riding shipped
 * tables (audit-first: project_tasks 00169 + client_decisions; additive
 * columns in 00202). Gates ARE decisions: requesting one creates a real
 * client_decision (kind 'approval', two options, the approving one flagged),
 * mirrored to the client portal through the existing decision machinery —
 * notification included. Approval settles the section server-side (00204
 * trigger: phase advance + on_section_settled milestone drafts) so the act
 * is one transaction whoever performs it (§5).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBrowserClient,
  invalidateProjectWorkflow,
} from '@patina/supabase';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { invalidateMarginSurfaces } from './use-margin-items';

// Track 5: resolving a coordination item flips this section's blocked tasks
// todo (the cascade, 00218). The Work renders that unblock inline, so the
// coordination resolve hook is re-exported here alongside the task read model
// it invalidates — one import for "the work + the items that gate it".
export {
  useResolveCoordinationItem,
  useCoordinationItems,
  useCourtSummary,
  useCreateCoordinationItem,
} from '@patina/supabase';
export type { CoordinationItem, Court } from '@patina/supabase';

const getSupabase = () => createBrowserClient() as any;

export interface SectionTask {
  id: string;
  project_id: string;
  section_key: SectionKey | null;
  title: string;
  status: 'todo' | 'done' | 'blocked';
  due_date: string | null;
  // Date Instruments (lane D2): a task's working window start. NULL for
  // every legacy single-day task and for a fresh day-pick through the Folio
  // — only a span commit sets it. due_date stays the ONE "when it's needed"
  // source either way (overdue logic, Desk derivation never read this).
  starts_on: string | null;
  completed_at: string | null;
  estimate_minutes: number | null;
  sort_order: number;
  // Track 5 dependency web (00215). owner='designer' + both deps NULL = today's
  // behavior for legacy tasks; the coordination band reads these to render the
  // owner chip + the ⊘ blocked tick / "↳ after …" sequence line.
  owner: 'designer' | 'client' | 'gc' | 'vendor';
  owner_party_id: string | null;
  blocked_by_item_id: string | null;
  seq_after_task_id: string | null;
  // Field Companion wave 4 (FC-R7 + FC-R15): the field_captures row a
  // Field-raised punch item was photographed and spoken into. NULL for
  // every task typed at the desk.
  field_capture_id: string | null;
}

export interface SectionGateOption {
  id: string;
  name: string;
  approves: boolean;
  selected: boolean;
  client_note: string | null;
}

export interface SectionGate {
  id: string;
  section_key: SectionKey;
  title: string;
  status: string;
  due_date: string | null;
  responded_at: string | null;
  options: SectionGateOption[];
}

/** The gate's read state: requested · approved · declined. */
export function gateState(gate: SectionGate): 'requested' | 'approved' | 'declined' {
  if (gate.status !== 'responded') return 'requested';
  const picked = gate.options.find((o) => o.selected);
  return picked?.approves ? 'approved' : 'declined';
}

export function useSectionTasks(projectId: string | null) {
  return useQuery<SectionTask[]>({
    queryKey: ['section-tasks', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_tasks')
        .select('id, project_id, section_key, title, status, due_date, starts_on, completed_at, estimate_minutes, sort_order, owner, owner_party_id, blocked_by_item_id, seq_after_task_id, field_capture_id')
        .eq('project_id', projectId)
        .not('section_key', 'is', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SectionTask[];
    },
  });
}

export function useCreateSectionTask(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      sectionKey: SectionKey;
      dueDate?: string | null;
      startsOn?: string | null;
      estimateMinutes?: number | null;
    }) => {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('project_tasks')
        .insert({
          project_id: projectId,
          title: input.title,
          section_key: input.sectionKey,
          due_date: input.dueDate ?? null,
          starts_on: input.startsOn ?? null,
          estimate_minutes: input.estimateMinutes ?? null,
          created_by: auth?.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['section-tasks', projectId] });
      // A dued task is a Desk input (R23) — the folder re-derives.
      void qc.invalidateQueries({ queryKey: ['document-state'] });
    },
  });
}

export function useToggleSectionTask(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: Pick<SectionTask, 'id' | 'status'>) => {
      const done = task.status !== 'done';
      const { error } = await getSupabase()
        .from('project_tasks')
        .update({
          status: done ? 'done' : 'todo',
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['section-tasks', projectId] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      void invalidateProjectWorkflow(qc, projectId);
    },
  });
}

export function useSectionGates(projectId: string | null) {
  return useQuery<SectionGate[]>({
    queryKey: ['section-gates', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('client_decisions')
        .select(
          // disambiguated: client_decisions also points at options via
          // recommended_option_id — we want the decision_id children.
          'id, section_key, title, status, due_date, responded_at, options:client_decision_options!client_decision_options_decision_id_fkey(id, name, approves, selected, client_note)',
        )
        .eq('project_id', projectId)
        .eq('decision_kind', 'approval')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SectionGate[];
    },
  });
}

export function useRequestSectionGate(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      designerClientId: string;
      sectionKey: SectionKey;
      sectionLabel: string;
      dueDate?: string | null;
    }) => {
      const supabase = getSupabase();
      const decisionId = crypto.randomUUID();
      const { data: decision, error } = await supabase.rpc('create_client_decision', {
        p_decision_id: decisionId,
        p_payload: {
          designer_client_id: input.designerClientId,
          project_id: projectId,
          title: `Approve ${input.sectionLabel}`,
          context: `Your approval settles the ${input.sectionLabel} section.`,
          due_date: input.dueDate ?? null,
          decision_kind: 'approval',
          section_key: input.sectionKey,
          blocking_status: 'non_blocking',
          status: 'pending',
        },
        p_options: [
          { name: 'Approve', approves: true, sort_order: 0 },
          { name: 'Request changes', approves: false, sort_order: 1 },
        ],
        p_blocked_ffe_item_ids: [],
        p_blocked_task_ids: [],
      });
      if (error) throw error;
      if (!decision) throw new Error('Section gate creation returned no row');

      return decision;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['section-gates', projectId] });
      invalidateMarginSurfaces(qc, projectId);
    },
  });
}

/** Work-head meta (R23): logged minutes for the section's phases vs the
 *  section's task estimates. Phase→section mirrors document_state (00202). */
export function useSectionLoggedMinutes(projectId: string | null, sectionKey: SectionKey) {
  return useQuery<number>({
    queryKey: ['section-logged-minutes', projectId, sectionKey],
    enabled: Boolean(projectId) && (sectionKey === 'project' || sectionKey === 'install' || sectionKey === 'care'),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_time_entries')
        .select('duration_minutes, phase_key')
        .eq('project_id', projectId)
        .not('duration_minutes', 'is', null);
      if (error) throw error;
      const installPhases = new Set(['installation', 'final_walkthrough']);
      return (data ?? []).reduce((sum: number, e: any) => {
        const inInstall = installPhases.has(e.phase_key ?? '');
        const matches = sectionKey === 'install' || sectionKey === 'care' ? inInstall : !inInstall;
        return matches ? sum + (e.duration_minutes ?? 0) : sum;
      }, 0);
    },
  });
}
