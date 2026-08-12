'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { ProductConfigurationSelection, PartyKind as SharedPartyKind } from '@patina/types';
import type { ClientDecisionOption, DecisionType } from './use-decisions';
import { peopleKeys } from './use-people';
import { invalidateProjectWorkflow } from './use-project-workflow';

// ═══════════════════════════════════════════════════════════════════════════
// Track 5 — Project Coordination data layer (the ball-in-court).
//
// An RFI / Submittal / Sign-off / Punch IS a decision with an owner — the table
// is the widened `client_decisions` (00213: coordination_kind + court +
// blocks_kind), the option child table is `client_decision_options`, the resolve
// path is the one-tx SECURITY DEFINER `resolve_coordination_item` (00218), and the
// read models are `coordination_court_summary` / `task_blocked_state` (00219).
//
// Mirrors use-decisions.ts conventions: createBrowserClient via getSupabase(),
// React Query keys, fan-out invalidation, the one-act-many-surfaces pass on resolve.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

// The ball-in-court axis (00213 court CHECK, widened by 00281 with the field
// kinds so a task/item can sit in a sub/installer/receiver court). Field-kind
// labels/colors live in @patina/types field-config + coordination/party.ts.
export type Court =
  | 'designer'
  | 'client'
  | 'gc'
  | 'vendor'
  | 'sub'
  | 'installer'
  | 'receiver';
export type CoordinationKind = 'selection' | 'rfi' | 'submittal' | 'signoff' | 'punch';
export type BlocksKind = 'none' | 'ffe' | 'task' | 'phase';
export type CoordinationStatus = 'draft' | 'pending' | 'responded' | 'expired';

/** The project_parties.party_kind vocab (00212 + 00281 field kinds + 00419
 *  architect/photographer/stager/client — Call Sheet Wave 3). Re-exported
 *  from @patina/types field-config, the single source of truth, so this
 *  file's own consumers never see a stale local copy. */
export type PartyKind = SharedPartyKind;

/** A project_parties row (00212/00281) the court / owner can point at. */
export interface ProjectParty {
  id: string;
  project_id: string;
  party_kind: PartyKind;
  display_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  /** E.164-normalized phone (00281, derived by trigger from `phone`). */
  phone_e164: string | null;
  /** The party's trade — free TEXT, vocab in @patina/types field-config (00281). */
  trade: string | null;
  /** TCPA consent state (00281): not_asked | pending | granted | opted_out. */
  sms_consent_status: 'not_asked' | 'pending' | 'granted' | 'opted_out';
  sms_consented_at: string | null;
  sms_opt_out_at: string | null;
  sms_consent_source: string | null;
  sms_consent_evidence: string | null;
  sms_consent_recorded_at: string | null;
  sms_consent_recorded_by: string | null;
  sms_consent_disclosure_version: string | null;
  vendor_id: string | null;
  profile_id: string | null;
  /** Lineage into the shared studio rolodex (00417/00418) — set by the
   *  auto-fold's Pass D link-back, or by `usePromoteToStudioContact`'s promote
   *  moment (Call Sheet Wave 2, slide 10). NULL = not yet in the rolodex. */
  studio_contact_id: string | null;
  /** Call Sheet (00419, R4/U2): per-row designer opt-in for client portal
   *  visibility. Default false — nothing shows unless chosen. */
  show_to_client: boolean;
  created_at: string;
  updated_at: string;
}

/** A submittal revision row (00214) — Rev-N history for R48. */
export interface CoordinationItemRevision {
  id: string;
  decision_id: string;
  rev_number: number;
  status: 'submitted' | 'approved' | 'rejected' | 'revise_resubmit';
  attachments: unknown[];
  note: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** The latest post on an item's per-item thread (00216), for the row preview. */
export interface CoordinationThreadPost {
  thread_id: string;
  last_message_at: string | null;
  title: string | null;
}

/**
 * A coordination item — the widened `client_decisions` row read at the
 * coordination grain, plus its options and the latest thread post for the
 * open-item row preview.
 */
export interface CoordinationItem {
  id: string;
  designer_client_id: string;
  designer_id: string | null;
  project_id: string | null;
  title: string;
  context: string | null;
  due_date: string | null;
  status: CoordinationStatus;
  /** Stage-2 artifact approvals reuse client_decisions but have their own UI. */
  approval_contract: string | null;
  // Track 5 axis (00213).
  coordination_kind: CoordinationKind;
  court: Court;
  court_party_id: string | null;
  blocks_kind: BlocksKind;
  answer: string | null;
  answered_at: string | null;
  answered_by: string | null;
  // Reused decision columns relevant to coordination.
  blocking_status: string | null;
  section_key: string | null;
  decision_kind: string | null;
  /** The subject-matter taxonomy (00084) — R55's composer "kind" picker writes it. */
  decision_type: string | null;
  /** The real project-phase FK (00084) the composer's "link to a phase" writes. */
  phase_id: string | null;
  reminder_sent_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
  options?: ClientDecisionOption[];
  /** The concrete party (00212) the current court points at, when any. */
  court_party?: ProjectParty | null;
  /** The latest post on the item's per-item thread (00216), when threaded. */
  latest_thread_post?: CoordinationThreadPost | null;
}

export interface CreateCoordinationItemInput {
  /** Optional caller-owned idempotency key. Generated when omitted. */
  itemId?: string;
  designerClientId: string;
  projectId?: string;
  title: string;
  context?: string;
  dueDate?: string;
  coordinationKind: CoordinationKind;
  court: Court;
  courtPartyId?: string | null;
  blocksKind?: BlocksKind;
  /** The subject-matter taxonomy (00084), meaningful for a selection. R55. */
  decisionType?: DecisionType;
  /** The project phase (00084 phase_id FK) this item links to. R55. */
  phaseId?: string | null;
  /** Publish straight to pending (default) or persist as a draft. */
  status?: 'draft' | 'pending';
  /** Selection options (only meaningful for coordination_kind='selection'). */
  options?: {
    name: string;
    imageUrl?: string;
    designerNote?: string;
    isRecommended?: boolean;
    price?: number;
    quantity?: number;
    costDeltaCents?: number;
    leadTimeDaysDelta?: number;
    productId?: string;
    /** Saved product configuration this option represents (00413). */
    configurationId?: string;
    /** The option's chosen values in the snapshot vocabulary (00413). */
    selectionSnapshot?: ProductConfigurationSelection[];
  }[];
  /** project_ffe_items.id[] this item blocks (sets blocked_by_decision_id). */
  blockedFfeItemIds?: string[];
  /** project_tasks.id[] this item blocks (sets blocked_by_item_id + blocked). */
  blockedTaskIds?: string[];
}

export interface ResolveCoordinationItemInput {
  itemId: string;
  /** Selection: the chosen option (delegates to apply_decision). */
  selectedOptionId?: string | null;
  /** RFI / Punch: the recorded answer / verification note. */
  answer?: string | null;
  /** Submittal: the revision id being approved. */
  revisionId?: string | null;
  /** Override the default ball hand-off (R49 punch verify step). */
  nextCourt?: Court | null;
  /** The acting user (defaults to auth.uid() in the RPC). */
  resolvedBy?: string | null;
  /** Carried for optimistic rollback / cache scoping. */
  designerClientId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// The widened SELECT — coordination kinds, options, court party, latest thread
// ═══════════════════════════════════════════════════════════════════════════

const COORDINATION_SELECT = `
  id, designer_client_id, designer_id, project_id, title, context, due_date, status,
  approval_contract,
  coordination_kind, court, court_party_id, blocks_kind, answer, answered_at, answered_by,
  blocking_status, section_key, decision_kind, decision_type, phase_id,
  reminder_sent_at, sent_at, responded_at,
  viewed_at, created_at, updated_at,
  options:client_decision_options!decision_id(*),
  court_party:project_parties!court_party_id(*),
  latest_thread_post:comms_threads!coordination_item_id(thread_id:id, last_message_at, title)
`;

export function isProjectArtifactApproval(
  item: Pick<CoordinationItem, 'approval_contract'>,
): boolean {
  return item.approval_contract === 'project_artifact_v1';
}

/** Presentation-only filter. Authoritative blocker consumers still read all rows. */
export function excludeProjectArtifactApprovals<T extends Pick<CoordinationItem, 'approval_contract'>>(
  items: readonly T[],
): T[] {
  return items.filter((item) => !isProjectArtifactApproval(item));
}

/** The 5 coordination kinds (selection IS the shipped path; the other four are
 *  the new generalization). The read model includes all so the band shows them
 *  grouped by court. */
const COORDINATION_KINDS: CoordinationKind[] = [
  'selection',
  'rfi',
  'submittal',
  'signoff',
  'punch',
];

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Queries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The coordination read model for a project: every coordination-kind open item
 * (selection / rfi / submittal / signoff / punch) with its options, the concrete
 * court party, and the latest per-item thread post for the row preview.
 *
 * Key `['coordination-items', projectId]`, 30s refetchInterval (mirrors the
 * margin read model). Realtime is layered by `useCoordinationRealtime`.
 */
export function useCoordinationItems(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['coordination-items', projectId],
    enabled: !!projectId,
    refetchInterval: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_decisions')
        .select(COORDINATION_SELECT)
        .eq('project_id', projectId)
        .in('coordination_kind', COORDINATION_KINDS)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalizeThreadPost) as CoordinationItem[];
    },
  });
}

/** The embed comes back as an array (a thread→item is 1:1 via the partial unique
 *  index, but PostgREST types the reverse embed as a list); collapse to one. */
function normalizeThreadPost(row: CoordinationItem & {
  latest_thread_post?: CoordinationThreadPost[] | CoordinationThreadPost | null;
}): CoordinationItem {
  const tp = row.latest_thread_post;
  return {
    ...row,
    latest_thread_post: Array.isArray(tp) ? (tp[0] ?? null) : (tp ?? null),
  };
}

export interface CourtCount {
  court: Court;
  open: number;
  overdue: number;
  nextDue: string | null;
}

/**
 * The court bar's per-court rollup. A `select` OVER the same coordination-items
 * query (no second fetch) — counts open/overdue/next-due per court client-side,
 * exactly as `coordination_court_summary` (00219) does server-side. Pass
 * `now` only in tests; production uses the live clock at render.
 */
export function useCourtSummary(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['coordination-items', projectId],
    enabled: !!projectId,
    refetchInterval: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_decisions')
        .select(COORDINATION_SELECT)
        .eq('project_id', projectId)
        .in('coordination_kind', COORDINATION_KINDS)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalizeThreadPost) as CoordinationItem[];
    },
    select: (items: CoordinationItem[]): CourtCount[] =>
      summarizeCourts(excludeProjectArtifactApprovals(items)),
  });
}

const COURT_ORDER: Court[] = [
  'designer',
  'client',
  'gc',
  'vendor',
  'sub',
  'installer',
  'receiver',
];

/** Per-court open/overdue/next-due rollup over the items list (the select body). */
function summarizeCourts(items: CoordinationItem[], now: Date = new Date()): CourtCount[] {
  const nowMs = now.getTime();
  const acc = new Map<Court, { open: number; overdue: number; nextDue: number | null }>();
  for (const c of COURT_ORDER) acc.set(c, { open: 0, overdue: 0, nextDue: null });
  for (const item of items) {
    if (item.status !== 'pending') continue;
    const b = acc.get(item.court);
    if (!b) continue;
    b.open += 1;
    if (item.due_date) {
      const dueMs = new Date(item.due_date).getTime();
      if (dueMs < nowMs) b.overdue += 1;
      if (b.nextDue === null || dueMs < b.nextDue) b.nextDue = dueMs;
    }
  }
  return COURT_ORDER.map((court) => {
    const b = acc.get(court)!;
    return {
      court,
      open: b.open,
      overdue: b.overdue,
      nextDue: b.nextDue === null ? null : new Date(b.nextDue).toISOString(),
    };
  });
}

/** The project's coordination courts (00212 project_parties). */
export function useProjectParties(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-parties', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_parties')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectParty[];
    },
  });
}

export interface AddProjectPartyInput {
  projectId: string;
  partyKind: PartyKind;
  displayName: string;
  companyName?: string | null;
  trade?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Whether to text this party updates. true → sms_consent_status 'pending',
   *  which fires the opt-in invite server-side (Track B DB trigger); false →
   *  'not_asked'. The UI only writes the row; it never sends the invite. */
  textUpdates?: boolean;
  smsConsentSource?: 'verbal' | 'written' | 'web_form' | 'other';
  smsConsentEvidence?: string;
  /** Lineage into the shared studio rolodex (00417/00418) — set when the row
   *  is added FROM a rolodex pick (Call Sheet Wave 3's rolodex-picker). Omit
   *  or null for an inline add with no rolodex link. */
  studioContactId?: string | null;
  /** Call Sheet (00419, R4/U2): per-row client-portal visibility opt-in.
   *  Defaults false — nothing shows on the client roster unless chosen. */
  showToClient?: boolean;
}

/**
 * Add a field party (gc / sub / installer / receiver) to a project. Inserts a
 * project_parties row; the 00281 trigger normalizes phone_e164, and — per the
 * Track B contract — a row written with a phone + sms_consent_status='pending'
 * fires the opt-in SMS invite server-side. The UI writes the row only.
 */
export function useAddProjectParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddProjectPartyInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const wantsText = input.textUpdates && !!input.phone?.trim();
      const consentSource = input.smsConsentSource?.trim() || null;
      const consentEvidence = input.smsConsentEvidence?.trim() || null;
      if (wantsText && (!consentSource || !consentEvidence)) {
        throw new Error(
          'Record how and where this person gave prior consent before sending a text.',
        );
      }
      const { data, error } = await supabase
        .from('project_parties')
        .insert({
          project_id: input.projectId,
          party_kind: input.partyKind,
          display_name: input.displayName,
          company_name: input.companyName?.trim() || null,
          trade: input.trade?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          sms_consent_status: wantsText ? 'pending' : 'not_asked',
          sms_consent_source: wantsText ? consentSource : null,
          sms_consent_evidence: wantsText ? consentEvidence : null,
          sms_consent_recorded_at: wantsText ? new Date().toISOString() : null,
          sms_consent_disclosure_version: wantsText ? 'field-sms-v1' : null,
          studio_contact_id: input.studioContactId ?? null,
          show_to_client: input.showToClient ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProjectParty;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', data.project_id] });
      // The party joins the People Room roster (people_directory, 00281).
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}

export interface UpdateProjectPartyPatch {
  displayName?: string;
  companyName?: string | null;
  trade?: string | null;
  phone?: string | null;
  email?: string | null;
  showToClient?: boolean;
  studioContactId?: string | null;
}

export interface UpdateProjectPartyInput {
  id: string;
  projectId: string;
  patch: Partial<UpdateProjectPartyPatch>;
}

/**
 * Edit a project_parties row in place (Call Sheet Wave 3 — roster-row unfold:
 * rename, re-trade, re-phone/email, toggle SHOW TO CLIENT, or re-point the
 * rolodex link). Patches only the provided columns. Invalidates the roster
 * read models (project-parties, project-roster) plus the People Room, since a
 * studio_contact_id change or a display-name edit can move where this row
 * surfaces there.
 */
export function useUpdateProjectParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateProjectPartyInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const dbPatch: Record<string, unknown> = {};
      if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName;
      if (patch.companyName !== undefined) dbPatch.company_name = patch.companyName?.trim() || null;
      if (patch.trade !== undefined) dbPatch.trade = patch.trade?.trim() || null;
      if (patch.phone !== undefined) dbPatch.phone = patch.phone?.trim() || null;
      if (patch.email !== undefined) dbPatch.email = patch.email?.trim() || null;
      if (patch.showToClient !== undefined) dbPatch.show_to_client = patch.showToClient;
      if (patch.studioContactId !== undefined) dbPatch.studio_contact_id = patch.studioContactId;

      const { data, error } = await supabase
        .from('project_parties')
        .update(dbPatch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ProjectParty;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}

export interface RecordPartySmsConsentInput {
  partyId: string;
  /** The party's current phone — required client-side (mirrors
   *  useAddProjectParty's `wantsText` guard): consent for texts is
   *  meaningless without a number to text. Also pinned into the UPDATE's
   *  WHERE clause (F4) so a phone edit racing this submit can't re-target
   *  the attestation onto a number the designer never actually saw consent
   *  for. */
  phone: string | null | undefined;
  smsConsentSource: 'verbal' | 'written' | 'web_form' | 'other';
  smsConsentEvidence: string;
}

/** The five evidence columns `fc_dispatch_optin_invite` (00432) reads, plus
 *  `sms_consent_status` — the exact six-column bundle every write (and every
 *  not_asked revert) in this hook sets together. */
const NOT_ASKED_CONSENT_COLUMNS = {
  sms_consent_status: 'not_asked' as const,
  sms_consent_source: null,
  sms_consent_evidence: null,
  sms_consent_recorded_at: null,
  sms_consent_recorded_by: null,
  sms_consent_disclosure_version: null,
};

/**
 * Invite an EXISTING party to texts — the only writer of consent columns
 * outside `useAddProjectParty`'s create path. Flips `not_asked` → `pending`
 * with the same six-column evidence bundle `fc_dispatch_optin_invite` (00432)
 * requires to treat the UPDATE as a fresh invite-eligible transition: source,
 * evidence, recorded_at, recorded_by, disclosure_version, plus the status
 * flip itself. `sms_consent_recorded_by`'s `DEFAULT auth.uid()` (00432) is
 * INSERT-only, so an UPDATE must stamp the attester explicitly or the audit
 * trail silently loses who recorded consent.
 *
 * Three guards run before/around the write:
 *  · a phone-global opt-out check (F3) — a STOP opts out every row sharing a
 *    phone_e164 (00432's sendPartySms contract), so a sibling row still
 *    sitting at not_asked on the same number must never be invited;
 *  · `.eq('sms_consent_status', 'not_asked')` + `.eq('phone', input.phone)`
 *    (F4) make the only legal transition — and the exact phone the designer
 *    saw — explicit server-side; a zero-row match (guard column or phone
 *    moved under us) surfaces as a friendly race message, not a raw
 *    PostgREST error;
 *  · a post-write phone_e164 check (F2) — the trigger gates dispatch on the
 *    normalized `phone_e164`, not the raw `phone` column, so a row whose
 *    number fails to normalize is reverted straight back to `not_asked`
 *    (never left stranded at `pending` with no invite and no way back).
 *
 * `granted` never routes here (TCPA: consent, once given, isn't re-recorded)
 * and `opted_out` is never designer-flippable — only the recipient's own
 * STOP/START reply changes that state. This hook cannot express either.
 */
export function useRecordPartySmsConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordPartySmsConsentInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const phone = input.phone?.trim();
      if (!phone) {
        throw new Error(
          'Texting updates needs a phone number — add one first.',
        );
      }
      const consentEvidence = input.smsConsentEvidence?.trim() || null;
      if (!input.smsConsentSource || !consentEvidence) {
        throw new Error(
          'Record how and where this person gave prior consent before sending a text.',
        );
      }

      // F3 — a STOP reply opts out every row on that phone_e164; a sibling
      // row still at not_asked must not silently re-invite a number that
      // already opted out on another party/project row.
      const { data: selfRow, error: selfError } = await supabase
        .from('project_parties')
        .select('phone_e164')
        .eq('id', input.partyId)
        .maybeSingle();
      if (selfError) throw selfError;
      const phoneE164 = selfRow?.phone_e164 ?? null;
      if (phoneE164) {
        const { data: optedOutSiblings, error: siblingError } = await supabase
          .from('project_parties')
          .select('id')
          .eq('phone_e164', phoneE164)
          .eq('sms_consent_status', 'opted_out')
          .limit(1);
        if (siblingError) throw siblingError;
        if (optedOutSiblings && optedOutSiblings.length > 0) {
          throw new Error(
            'This number already opted out of Patina texts. Only they can rejoin by replying START.',
          );
        }
      }

      // F1 — sms_consent_recorded_by's DEFAULT auth.uid() only fires on
      // INSERT; stamp the attester explicitly on this UPDATE.
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const recordedBy = userData?.user?.id ?? null;

      const { data, error } = await supabase
        .from('project_parties')
        .update({
          sms_consent_status: 'pending',
          sms_consent_source: input.smsConsentSource,
          sms_consent_evidence: consentEvidence,
          sms_consent_recorded_at: new Date().toISOString(),
          sms_consent_recorded_by: recordedBy,
          sms_consent_disclosure_version: 'field-sms-v1',
        })
        .eq('id', input.partyId)
        .eq('phone', phone)
        .eq('sms_consent_status', 'not_asked')
        .select()
        .single();
      if (error) {
        // F6 — zero rows matched (the guard column or the phone moved under
        // us between render and submit): a friendly race message, not the
        // raw PostgREST "no rows" error.
        if (error.code === 'PGRST116') {
          throw new Error(
            "This person's texting status just changed — refresh to see it.",
          );
        }
        throw error;
      }

      // F2 — the trigger gates dispatch on phone_e164 (NULL for unparseable
      // input), not the raw `phone` column just pinned above. A row that
      // flipped to pending with no valid E.164 gets no invite and no way
      // back without this revert.
      if (!data.phone_e164) {
        const { error: revertError } = await supabase
          .from('project_parties')
          .update(NOT_ASKED_CONSENT_COLUMNS)
          .eq('id', input.partyId);
        if (revertError) throw revertError;
        throw new Error(
          "That phone can't receive texts — fix the number first.",
        );
      }

      return data as ProjectParty;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', data.project_id] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', data.project_id] });
      // The party's row in the People Room roster (people_directory, 00281).
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}

export interface RemoveProjectPartyInput {
  id: string;
  projectId: string;
}

/**
 * Remove a party from a project's roster. A real DELETE (00212's
 * `project_parties_designer_all` policy is `FOR ALL` — the project's designer
 * can delete their own project's rows; the table also carries a DELETE grant
 * to `authenticated`). Any coordination item still pointing `court_party_id`
 * at this row degrades gracefully — the FK is `ON DELETE SET NULL` (00213) —
 * so a removed party never leaves a dangling reference.
 */
export function useRemoveProjectParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: RemoveProjectPartyInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('project_parties').delete().eq('id', id);
      if (error) throw error;
      return { id };
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}

/** A `v_project_roster` (00419) row — the party branch (project_parties) UNION
 *  ALL the team branch (project_team_members), one shape for the Call Sheet.
 *  `source` distinguishes which table the row came from; team-branch rows
 *  never carry `studio_contact_id` / real `show_to_client` / a field link. */
export interface ProjectRosterRow {
  roster_id: string | null;
  source: 'party' | 'team' | string | null;
  project_id: string | null;
  kind: string | null;
  display_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  trade: string | null;
  job_title: string | null;
  staff_role: string | null;
  studio_contact_id: string | null;
  profile_id: string | null;
  show_to_client: boolean | null;
  has_active_field_link: boolean | null;
  sms_consent_status: string | null;
  updated_at: string | null;
}

/**
 * The Call Sheet's project-scoped roster — every tracked party plus every
 * real project team login, in one shape (`v_project_roster`, 00419,
 * security_invoker: base-table RLS on project_parties / project_team_members
 * / profiles / organization_members governs what the caller actually sees).
 * Key `['project-roster', projectId]`.
 */
export function useProjectRoster(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-roster', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('v_project_roster')
        .select('*')
        .eq('project_id', projectId);
      if (error) throw error;
      return (data ?? []) as ProjectRosterRow[];
    },
  });
}

/** A submittal's Rev-N history (00214), latest first. */
export function useItemRevisions(itemId: string | null | undefined) {
  return useQuery({
    queryKey: ['coordination-revisions', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('coordination_item_revisions')
        .select('*')
        .eq('decision_id', itemId)
        .order('rev_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CoordinationItemRevision[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Mutations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a coordination item — the one act, many surfaces (spec §5). Calls the
 * SECURITY DEFINER `resolve_coordination_item` (00218): dispatches by kind
 * (selection → apply_decision; rfi → answer; submittal → approve revision;
 * signoff/punch → record), then in the SAME transaction clears FF&E blocks, flips
 * downstream tasks blocked→todo, and shifts the ball to the next court.
 *
 * onMutate optimistically flips the item to responded and clears
 * `blocked_by_item_id` on its dependent tasks (the cascade preview); onError rolls
 * both back; onSuccess invalidates coordination-items + section-tasks +
 * project-decisions + the margin surfaces (margin-items / document-state / FF&E).
 */
export function useResolveCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ResolveCoordinationItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error: rpcError } = await supabase.rpc('resolve_coordination_item', {
        p_item_id: input.itemId,
        p_selected_option_id: input.selectedOptionId ?? null,
        p_answer: input.answer ?? null,
        p_revision_id: input.revisionId ?? null,
        p_next_court: input.nextCourt ?? null,
        // Compatibility parameter remains in the SQL signature, but browser
        // attribution always comes from auth.uid(); never forward a spoofable id.
        p_resolved_by: null,
      });
      if (rpcError) throw rpcError;

      return data as CoordinationItem;
    },

    // Optimistic cascade preview: the item resolves, its dependent tasks unblock.
    onMutate: async (input) => {
      const itemsKey = ['coordination-items', projectId];
      const tasksKey = ['section-tasks', projectId];
      await queryClient.cancelQueries({ queryKey: itemsKey });
      await queryClient.cancelQueries({ queryKey: tasksKey });

      const prevItems = queryClient.getQueryData<CoordinationItem[]>(itemsKey);
      const prevTasks = queryClient.getQueryData<unknown[]>(tasksKey);

      const nextCourt = input.nextCourt ?? defaultNextCourt(prevItems, input.itemId);

      if (prevItems) {
        queryClient.setQueryData<CoordinationItem[]>(
          itemsKey,
          prevItems.map((it) =>
            it.id === input.itemId
              ? {
                  ...it,
                  status: 'responded',
                  responded_at: new Date().toISOString(),
                  court: nextCourt ?? it.court,
                  answer: input.answer ?? it.answer,
                }
              : it,
          ),
        );
      }

      if (Array.isArray(prevTasks)) {
        queryClient.setQueryData(
          tasksKey,
          prevTasks.map((t) => {
            const task = t as { blocked_by_item_id?: string | null; status?: string };
            return task.blocked_by_item_id === input.itemId
              ? { ...task, blocked_by_item_id: null, status: 'todo' }
              : t;
          }),
        );
      }

      return { itemsKey, tasksKey, prevItems, prevTasks };
    },

    onError: (_err, _input, ctx) => {
      if (!ctx) return;
      if (ctx.prevItems !== undefined) queryClient.setQueryData(ctx.itemsKey, ctx.prevItems);
      if (ctx.prevTasks !== undefined) queryClient.setQueryData(ctx.tasksKey, ctx.prevTasks);
    },

    onSettled: (data) => {
      // One act, many surfaces (§5): re-read every surface the resolve touched.
      void queryClient.invalidateQueries({ queryKey: ['coordination-items', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['section-tasks', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['coordination-revisions'] });
      // Margin / Desk / document FF&E (the margin one-act trio).
      void queryClient.invalidateQueries({ queryKey: ['margin-items'] });
      void queryClient.invalidateQueries({ queryKey: ['document-state'] });
      const pid = data?.project_id ?? projectId;
      if (pid) {
        void queryClient.invalidateQueries({ queryKey: ['project-decisions', pid] });
        void queryClient.invalidateQueries({ queryKey: ['project-ffe-items', pid] });
        void queryClient.invalidateQueries({ queryKey: ['project-ffe', pid] });
        void invalidateProjectWorkflow(queryClient, pid);
      }
    },
  });
}

/** The default ball hand-off (mirrors next_court_for, 00218) for the optimistic
 *  preview only — the RPC is the source of truth on the server. */
function defaultNextCourt(
  items: CoordinationItem[] | undefined,
  itemId: string,
): Court {
  const kind = items?.find((i) => i.id === itemId)?.coordination_kind;
  switch (kind) {
    case 'rfi':
      return 'gc';
    case 'submittal':
      return 'vendor';
    default:
      return 'designer';
  }
}

/**
 * Raise a coordination item — generalizes useCreateDecision across all five
 * kinds. The checked create RPC owns the decision row, selection options,
 * dependency web, and first notification in one transaction. Drafts stay quiet.
 */
export function useCreateCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCoordinationItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const status = input.status ?? 'pending';
      const itemId = input.itemId ?? crypto.randomUUID();
      const rpcOptions = input.coordinationKind === 'selection'
        ? (input.options ?? []).map((opt, i) => ({
              name: opt.name,
              image_url: opt.imageUrl ?? null,
              designer_note: opt.designerNote ?? null,
              is_recommended: opt.isRecommended ?? false,
              price: opt.price ?? null,
              quantity: opt.quantity ?? 1,
              cost_delta_cents: opt.costDeltaCents ?? null,
              lead_time_days_delta: opt.leadTimeDaysDelta ?? null,
              product_id: opt.productId ?? null,
              // 00413 — configuration provenance + the option's selections.
              configuration_id: opt.configurationId ?? null,
              selection_snapshot: opt.selectionSnapshot ?? null,
              sort_order: i,
            }))
        : [];

      const { data: item, error: itemError } = await supabase.rpc('create_client_decision', {
        p_decision_id: itemId,
        p_payload: {
          designer_client_id: input.designerClientId,
          project_id: input.projectId ?? projectId ?? null,
          title: input.title,
          context: input.context ?? null,
          due_date: input.dueDate ?? null,
          coordination_kind: input.coordinationKind,
          court: input.court,
          court_party_id: input.courtPartyId ?? null,
          blocks_kind: input.blocksKind ?? 'none',
          decision_kind: 'choice',
          decision_type: input.decisionType ?? 'product',
          phase_id: input.phaseId ?? null,
          blocking_status: blockingStatusFor(input.blocksKind),
          status,
        },
        p_options: rpcOptions,
        p_blocked_ffe_item_ids: input.blockedFfeItemIds ?? [],
        p_blocked_task_ids: input.blockedTaskIds ?? [],
      });
      if (itemError) throw itemError;
      if (!item) throw new Error('Coordination item creation returned no row');

      return item as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(queryClient, data.project_id ?? projectId ?? null, data.designer_client_id);
    },
  });
}

/** A blocks_kind maps onto the existing blocking_status axis so the legacy
 *  FF&E/phase machinery and the Desk need-lines still read truthfully. */
function blockingStatusFor(blocksKind: BlocksKind | undefined): string {
  switch (blocksKind) {
    case 'ffe':
      return 'blocks_procurement';
    case 'phase':
      return 'blocks_phase';
    case 'task':
    case 'none':
    default:
      return 'non_blocking';
  }
}

/**
 * Nudge — record a reminder on a waiting item (reuses the decision reminder
 * path: stamps reminder_sent_at, surfaces in the margin, fires no toast per R51).
 */
export function useNudgeCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('stamp_client_decision_reminder', {
        p_decision_id: itemId,
      });
      if (error) throw error;

      return data as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(queryClient, data.project_id ?? projectId ?? null, data.designer_client_id);
    },
  });
}

/** Extend — push a waiting item's due date out (reuses the decision update path). */
export interface ExtendCoordinationItemInput {
  itemId: string;
  dueDate: string | null;
  expectedUpdatedAt: string;
}

export function useExtendCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      dueDate,
      expectedUpdatedAt,
    }: ExtendCoordinationItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('update_client_decision', {
        p_decision_id: itemId,
        p_patch: { due_date: dueDate },
        p_options: null,
        p_expected_updated_at: expectedUpdatedAt,
      });
      if (error) throw error;
      return data as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(queryClient, data.project_id ?? projectId ?? null, data.designer_client_id);
    },
  });
}

/**
 * Reassign — move the ball to a different court (the accountability primitive).
 * A plain `court` update (+ the concrete party row when gc/vendor). The item
 * stays pending; only whose move it is changes.
 */
export interface ReassignCoordinationItemInput {
  itemId: string;
  court: Court;
  courtPartyId?: string | null;
  expectedUpdatedAt: string;
}

export function useReassignCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      court,
      courtPartyId,
      expectedUpdatedAt,
    }: ReassignCoordinationItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const patch: Record<string, unknown> = { court };
      if (courtPartyId !== undefined) patch.court_party_id = courtPartyId;
      const { data, error } = await supabase.rpc('update_client_decision', {
        p_decision_id: itemId,
        p_patch: patch,
        p_options: null,
        p_expected_updated_at: expectedUpdatedAt,
      });
      if (error) throw error;
      return data as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(queryClient, data.project_id ?? projectId ?? null, data.designer_client_id);
    },
  });
}

/**
 * Record a submittal revision round (R48 revise & resubmit) — the RPC-only write
 * path (coordination_item_revisions has no broad write policy, 00214). Adds the
 * next revision row and leaves the item pending; the resolve RPC later approves a
 * revision id.
 */
export interface SubmitCoordinationRevisionInput {
  itemId: string;
  attachments?: unknown[];
  note?: string | null;
  status?: 'submitted' | 'revise_resubmit';
}

export function useSubmitCoordinationRevision(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      attachments,
      note,
      status,
    }: SubmitCoordinationRevisionInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('submit_coordination_revision', {
        p_item_id: itemId,
        p_attachments: attachments ?? [],
        p_note: note ?? null,
        p_status: status ?? 'submitted',
        p_submitted_by: null,
      });
      if (error) throw error;
      return data as CoordinationItemRevision;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['coordination-revisions', data.decision_id] });
      void queryClient.invalidateQueries({ queryKey: ['coordination-items', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Realtime
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Project-grain realtime for the coordination band — mirrors useDecisionRealtime
 * at the project level so a designer-recorded GC answer (or a client pick from
 * the mirror) surfaces live. Invalidates the items read model + the dependency
 * web on any change to client_decisions / project_tasks on this project.
 */
export function useCoordinationRealtime(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['coordination-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['section-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['margin-items'] });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      void invalidateProjectWorkflow(queryClient, projectId);
    };

    const channel: RealtimeChannel = supabase
      .channel(`coordination:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_decisions',
          filter: `project_id=eq.${projectId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_tasks',
          filter: `project_id=eq.${projectId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_ffe_items',
          filter: `project_id=eq.${projectId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, queryClient]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared invalidation — the coordination read model + the surfaces it feeds
// ═══════════════════════════════════════════════════════════════════════════

function invalidateCoordination(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string | null,
  designerClientId?: string | null,
) {
  void queryClient.invalidateQueries({ queryKey: ['coordination-items', projectId] });
  void queryClient.invalidateQueries({ queryKey: ['margin-items'] });
  void queryClient.invalidateQueries({ queryKey: ['document-state'] });
  if (projectId) {
    void queryClient.invalidateQueries({ queryKey: ['section-tasks', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-decisions', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
    void invalidateProjectWorkflow(queryClient, projectId);
  }
  if (designerClientId) {
    void queryClient.invalidateQueries({ queryKey: ['client-decisions', designerClientId] });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// R55 — the composer's edit / publish / delete lifecycle over a draft item
//
// These complete the create→light direction of the one-act invariant (§5): the
// composer authors a draft, edits it in place, publishes it (draft→pending,
// which lights the decision_due stamp on any gated FF&E line), or deletes it
// (clearing the dependency web first so no line is left blocked by a ghost).
// The CLEAR/resolve direction stays Track 5's `resolve_coordination_item` (00218).
// ═══════════════════════════════════════════════════════════════════════════

export interface UpdateCoordinationItemInput {
  itemId: string;
  /** Compare-and-swap token from the draft shown in the composer. */
  expectedUpdatedAt: string;
  /** Carried for cache scoping (the client-decisions key). */
  designerClientId: string;
  /** Carried for cache scoping; coordination edits cannot move projects. */
  projectId?: string;
  title?: string;
  context?: string | null;
  dueDate?: string | null;
  coordinationKind?: CoordinationKind;
  court?: Court;
  courtPartyId?: string | null;
  blocksKind?: BlocksKind;
  decisionType?: DecisionType;
  phaseId?: string | null;
  /** When provided, REPLACES the option set (delete-then-insert). Omit to leave. */
  options?: CreateCoordinationItemInput['options'];
  /** When provided (incl. []), RE-TAGS which FF&E lines this item gates. */
  blockedFfeItemIds?: string[];
  /** When provided (incl. []), RE-TAGS which tasks this item blocks. */
  blockedTaskIds?: string[];
}

/**
 * Edit a draft coordination item in place — the composer re-opens on a draft and
 * saves changes. Patches only the provided columns, replaces options when given,
 * and re-tags the dependency web (clear this item's old FF&E/task links, set the
 * new ones). A draft stays quiet (no notify). Intended for status='draft' rows.
 */
export function useUpdateCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateCoordinationItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // 1) Patch only the columns the caller supplied (never null untouched cols).
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.context !== undefined) patch.context = input.context || null;
      if (input.dueDate !== undefined) patch.due_date = input.dueDate || null;
      if (input.coordinationKind !== undefined) patch.coordination_kind = input.coordinationKind;
      if (input.court !== undefined) patch.court = input.court;
      if (input.courtPartyId !== undefined) patch.court_party_id = input.courtPartyId ?? null;
      if (input.blocksKind !== undefined) {
        patch.blocks_kind = input.blocksKind;
        patch.blocking_status = blockingStatusFor(input.blocksKind);
      }
      if (input.decisionType !== undefined) patch.decision_type = input.decisionType;
      if (input.phaseId !== undefined) patch.phase_id = input.phaseId ?? null;

      const rpcOptions = input.options === undefined
        ? null
        : input.options.map((opt, i) => ({
            name: opt.name,
            image_url: opt.imageUrl || null,
            designer_note: opt.designerNote || null,
            is_recommended: opt.isRecommended || false,
            price: opt.price ?? null,
            quantity: opt.quantity ?? 1,
            cost_delta_cents: opt.costDeltaCents ?? null,
            lead_time_days_delta: opt.leadTimeDaysDelta ?? null,
            product_id: opt.productId || null,
            configuration_id: opt.configurationId || null,
            selection_snapshot: opt.selectionSnapshot ?? null,
            sort_order: i,
          }));

      const { data: item, error: itemError } = await supabase.rpc(
        'update_coordination_item',
        {
          p_item_id: input.itemId,
          p_patch: patch,
          p_options: rpcOptions,
          p_blocked_ffe_item_ids: input.blockedFfeItemIds ?? null,
          p_blocked_task_ids: input.blockedTaskIds ?? null,
          p_expected_updated_at: input.expectedUpdatedAt,
        },
      );
      if (itemError) throw itemError;
      if (!item) throw new Error('Coordination item update returned no row');

      return item as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(
        queryClient,
        data.project_id ?? projectId ?? null,
        data.designer_client_id,
      );
    },
  });
}

/**
 * Publish a draft (draft→pending) — the composer's "Publish →" on an existing
 * draft. Its lifecycle RPC owns the status, sent_at stamp, and notification.
 * Because a gated FF&E line already carries blocked=true (set at create),
 * flipping the decision to 'pending' lights the `decision_due` stamp (§5, R55).
 * Idempotent: a no-op when the row is already past draft.
 */
export function usePublishCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { itemId: string; designerClientId?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: item, error } = await supabase.rpc('publish_client_decision', {
        p_decision_id: input.itemId,
      });
      if (error) throw error;
      return item as CoordinationItem;
    },
    onSuccess: (data, input) => {
      invalidateCoordination(
        queryClient,
        data.project_id ?? projectId ?? null,
        data.designer_client_id ?? input.designerClientId ?? null,
      );
    },
  });
}

/**
 * Delete a coordination item (destructive). Clears the dependency web FIRST —
 * un-blocks any FF&E line or task gated by this item — so deleting a draft can
 * never leave a line blocked by a ghost decision (the FK is ON DELETE SET NULL,
 * which would null the pointer but strand blocked=true). The row delete cascades
 * its options / overrides / events (ON DELETE CASCADE).
 */
export function useDeleteCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { itemId: string; designerClientId?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase.rpc('delete_client_decision_draft', {
        p_decision_id: input.itemId,
      });
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      invalidateCoordination(queryClient, projectId ?? null, input.designerClientId ?? null);
    },
  });
}
