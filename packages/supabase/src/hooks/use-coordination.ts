'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { ProductConfigurationSelection, PartyKind as SharedPartyKind } from '@patina/types';
import type { ClientDecisionOption, DecisionType } from './use-decisions';
import { peopleKeys, peopleSeatKeys, usePeopleSeats } from './use-people';
import { clientHouseholdKeys } from './use-households';
import { asWrittenConsentError, consentKeys } from './use-consent';
import { invalidateProjectWorkflow } from './use-project-workflow';

/**
 * r15 MAJOR (code) — THE HOUSEHOLD BAND SITS OVER THE SEATS THIS FILE WRITES.
 *
 * `useProjectHousehold` is keyed `['client-households', 'project', projectId]`
 * and its queryFn reads `project_parties` and `project_party_authority` to
 * compose `memberCardIds`, `clientSideHasAuthority` and `clientSideMoneyGrants`.
 * No seat or authority mutation invalidated it, and the portal's QueryClient
 * runs `staleTime` five minutes with `refetchOnWindowFocus: false` while the
 * band stays mounted under the Client side for the whole visit. So the band
 * answered a question the studio had just changed on the same screen: the door
 * stayed held ("Seat the client on this job first, then open the household.")
 * over a client row two elements above, and the add sentence promised the
 * household's figure while a foreign money grant — which `add_household_member()`
 * deliberately leaves standing — went on holding the seat.
 *
 * One helper rather than six literals, so the six stay in step (r13 MAJOR-3 was
 * the same shape one wave over, and was closed the same way).
 */
function invalidateClientHouseholds(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: clientHouseholdKeys.all });
}

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
  /**
   * ⚠ FROZEN LEGACY (R-AS / R-AY, 00594's `refuse_legacy_consent_write_trg`).
   * These eight columns are READ BY NOTHING but the one-time backfill and
   * WRITTEN BY NOTHING at all: a BEFORE UPDATE trigger raises
   * `consent_legacy_column_frozen` on a change. Every seat any live path
   * produces sits at the `not_asked` default whatever the studio's record
   * says. The consent word comes from `studio_channel_consent` — read it
   * through `useChannelConsent`, or off the two directory views'
   * `consent_status` column. They stay on this interface because the columns
   * still exist and `select('*')` still returns them.
   */
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
  // ── 00631's bid columns (direction §3.4, R-R) ─────────────────────────────
  /** The day the answer was owed. A DATE: the sheet prints "Due 5 October
   *  2026", never a clock. */
  bid_due_at: string | null;
  bid_outcome: SeatBidOutcome | null;
  /** How long the number holds. */
  bid_valid_until: string | null;
  /** The estimator AT THE FIRM who priced it — a person card in the studio the
   *  job records (00631's `assert_party_bid_quoted_by`). */
  bid_quoted_by_person_id: string | null;
  bid_amount_cents: number | null;
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
  /** Whether to text this party updates. true records the invite on the
   *  studio's consent record (`record_channel_invite`) before the seat is
   *  written; false records nothing. The seat itself carries no consent
   *  column any more (R-AS). */
  textUpdates?: boolean;
  smsConsentSource?: 'verbal' | 'written' | 'web_form' | 'other';
  smsConsentEvidence?: string;
  /** Lineage into the shared studio rolodex (00417/00418) — set when the row
   *  is added FROM a rolodex pick (Call Sheet Wave 3's rolodex-picker). Omit
   *  or null for an inline add with no rolodex link. Note that omitting it
   *  does NOT guarantee an unlinked row: 00626's auto-link stamps the seat
   *  with the one person card in the project's studio carrying its exact
   *  phone_e164 (crm-model §4 rule 2), so an inline add on a number the
   *  rolodex already holds comes back linked rather than as a second
   *  Directory identity. */
  studioContactId?: string | null;
  /**
   * CR-3 — THE FIRM THE SEAT BELONGS TO, as a real card (`project_parties
   * .company_id`, 00624:404). `companyName` is a snapshot STRING and answers
   * nothing: `directoryFirmOf` reads `meta.company_id`, so a seat carrying
   * only the text had no firm identity at all — the Directory's firm banding,
   * "N on the crew", the company card's Crew & designations and R-BJ's seat
   * paper word were all fed by data only the seed could produce. Must name a
   * COMPANY card in the project's own studio rolodex; 00624's
   * `party_card_guard_trg` refuses anything else.
   */
  companyId?: string | null;
  /** Call Sheet (00419, R4/U2): per-row client-portal visibility opt-in.
   *  Defaults false — nothing shows on the client roster unless chosen. */
  showToClient?: boolean;
}

/**
 * Add a field party (gc / sub / installer / receiver) to a project. Inserts a
 * project_parties row; the 00281 trigger normalizes phone_e164.
 *
 * When the designer ticks "text updates" the invite is ALSO recorded on the
 * studio's own consent record (`record_channel_invite`, 00594) before the row
 * is written. Since R-AS that record is the single source both readers take the
 * consent word from, so a seat born `pending` with no record behind it printed
 * "Not asked" for a person Patina had just texted. Recording first also puts
 * 00594's gates ahead of the invite: a number this studio holds a refusal for,
 * or one that cannot be normalized to E.164, is refused before the seat exists
 * and before anything is sent.
 */
export function useAddProjectParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddProjectPartyInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const consentPhone = input.phone?.trim() || null;
      const wantsText = !!input.textUpdates && !!consentPhone;
      const consentSource = input.smsConsentSource?.trim() || null;
      const consentEvidence = input.smsConsentEvidence?.trim() || null;
      if (wantsText && (!consentSource || !consentEvidence)) {
        throw new Error(
          'Record how and where this person gave prior consent before sending a text.',
        );
      }
      // THE RECORD, NOT ONLY THE SEAT (00594 R-AS, close-review r1 MAJOR-2).
      // The freeze is BEFORE UPDATE, so this INSERT still writes the seat and
      // fc_optin_invite_dispatch (00284) still sends the opt-in invite off it.
      // But both readers — v_project_roster and people_directory — take the
      // consent word off studio_channel_consent now, so a seat born `pending`
      // with no record behind it printed "Not asked" for someone Patina had
      // just texted, and §3.8's `Invited` word was unreachable for every newly
      // added party.
      //
      // Recorded BEFORE the insert on purpose: the RPC is the gate. A number
      // this studio already holds a refusal for, or one that cannot be
      // normalized to E.164, is refused HERE — before a seat is born at
      // `pending` and before the invite trigger sends anything.
      //
      // THE DOOR IS record_channel_invite, NOT record_channel_consent
      // (close-review r2 MAJOR-1). `pending` is the first half of the double
      // opt-in, and writing it unconditionally demoted the studio's own
      // recorded grant every time a repeat sub was added to a second job: the
      // room then printed "Invited" for a number the studio holds an evidenced
      // grant for, every non-invite send was refused as not_consented, and the
      // new act's five evidence columns landed on top of the old grant's date.
      // record_channel_invite leaves a standing grant exactly as it is and
      // records the invite only when there is nothing better on the books; the
      // seat below is still born `pending`, and the send rail reads the
      // studio's `granted` record for it (sms.ts channelConsentVerdict).
      if (wantsText) {
        const { data: consentOrg, error: orgError } = await supabase
          .rpc('project_consent_org', { p_project_id: input.projectId });
        if (orgError) throw orgError;
        if (!consentOrg) {
          throw new Error(
            "This project isn't attached to a studio yet, so there's nowhere to record texting consent.",
          );
        }
        const { error: consentError } = await supabase.rpc('record_channel_invite', {
          p_organization_id: consentOrg,
          p_channel_kind: 'sms',
          p_channel_value: consentPhone as string,
          p_source: consentSource,
          p_evidence: consentEvidence,
          p_disclosure_version: 'field-sms-v1',
          p_origin_project_id: input.projectId,
        });
        if (consentError) throw asWrittenConsentRpcError(consentError);
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
          // R-AS: the eight `sms_consent_*` columns are FROZEN LEGACY and this
          // INSERT no longer writes one. The consent fact lives on
          // `studio_channel_consent` alone, recorded above, and both directory
          // views and every send gate read it there.
          //
          // ⚠ ONE SHIPPED BEHAVIOUR MOVES WITH THEM. `fc_optin_invite_dispatch`
          // (00284's trigger on `project_parties`, body at 00432:27-68) fires
          // the double-opt-in SMS off a row landing at `sms_consent_status =
          // 'pending'` WITH the four evidence columns. A seat born at the
          // column default `not_asked` satisfies neither test, so the opt-in
          // invite is not dispatched from here any more. The record-side
          // dispatch trigger that replaces it is owed — see w2a-report.md §
          // "Not done".
          studio_contact_id: input.studioContactId ?? null,
          company_id: input.companyId ?? null,
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
      // CR-18: the Call Sheet reads `['project-roster', projectId]` and the
      // seat views read `peopleSeatKeys`. Every other seat mutation in this
      // file invalidates both; the add path must too, or a seat added from the
      // rolodex picker (the Call Sheet's own add door) never appears.
      void queryClient.invalidateQueries({ queryKey: ['project-roster', data.project_id] });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      invalidateClientHouseholds(queryClient);
      // CR-6: this hook calls `record_channel_invite`, so it MOVES THE CONSENT
      // LEDGER — and the Directory is mounted when the Add sheet is used. Its
      // clause (`useChannelConsentRecords`, keyed under `consentKeys.all`) and
      // the person card's per-channel verdict (`useChannelConsent`) both went
      // stale while the word beside them flipped to `Invited`. Every other door
      // through the same RPC already invalidates this root —
      // `useRecordPartySmsConsent` below, and all of use-consent.ts.
      void queryClient.invalidateQueries({ queryKey: consentKeys.all });
    },
  });
}

export interface UpdateProjectPartyPatch {
  displayName?: string;
  companyName?: string | null;
  /** CR-3: the firm card behind the snapshot name (`project_parties
   *  .company_id`, 00624:404). `null` clears the tie; omitted leaves it. */
  companyId?: string | null;
  trade?: string | null;
  phone?: string | null;
  email?: string | null;
  showToClient?: boolean;
  studioContactId?: string | null;
  /**
   * THE ENGAGEMENT WINDOW (direction §7 P3) — the days this seat is on the
   * job. `''` and `null` both clear the day; a window is two dates or none.
   *
   * Moving it moves what the studio has promised the crew, so direction §7 P3
   * pairs it with a NOTICE: the surface that writes these two columns writes a
   * `record_notice` beside them saying the fact changed and who was told
   * (CRM-23). This hook writes the columns and nothing else — it cannot know
   * who was told — so a caller that moves a window without recording a notice
   * is the defect, not this signature.
   */
  onSiteFrom?: string | null;
  onSiteTo?: string | null;
}

export interface UpdateProjectPartyInput {
  id: string;
  projectId: string;
  patch: Partial<UpdateProjectPartyPatch>;
}

/** What a phone edit on a REFUSED number is refused with (close-review r3
 *  MAJOR-4, repointed at the record in r14 BLOCKING-1). The refusal belongs to
 *  the number on file and cannot travel to a corrected one. */
const OPTED_OUT_PHONE_EDIT_SENTENCE =
  'This person replied STOP, and that refusal is attached to the number on file. ' +
  'Changing it would carry the refusal onto a number that never refused. ' +
  'Add them again with the corrected number instead.';

/** The consent RPCs' named refusals, rendered as sentences. One home, in
 *  `use-consent.ts`, so the party sheet and the roster never drift apart. */
const asWrittenConsentRpcError = asWrittenConsentError;

/** Mirrors the DB's `normalize_phone_e164` (00281) so a client-side "did the
 *  phone actually change" comparison agrees with what the trigger will
 *  derive — a cosmetic reformat of the same digits (different spacing,
 *  parens, a leading +1) must never read as a change. Never raises: an
 *  unparseable phone simply compares as `null`. */
export function normalizePartyPhoneForCompare(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * Edit a project_parties row in place (Call Sheet Wave 3 — roster-row unfold:
 * rename, re-trade, re-phone/email, toggle SHOW TO CLIENT, or re-point the
 * rolodex link). Patches only the provided columns. Invalidates the roster
 * read models (project-parties, project-roster) plus the People Room, since a
 * studio_contact_id change or a display-name edit can move where this row
 * surfaces there.
 *
 * R-AS — THIS HOOK WRITES NO CONSENT COLUMN. The eight
 * `project_parties.sms_consent_*` columns are frozen legacy; a BEFORE UPDATE
 * trigger refuses a change to any of them, and `studio_channel_consent` is the
 * only ledger. So the consent revert this hook used to perform on a phone
 * change — `pending`/`granted` back to `not_asked`, or across to `opted_out`
 * when a sibling row on the new number had refused — is GONE. A seat carries
 * no consent fact to revert; the record is keyed on the NUMBER, so moving the
 * seat's number simply moves which record the seat reads.
 *
 * ONE RULE SURVIVES, and it is a READ, not a write: a number the studio's
 * RECORD refused cannot move (close-review r3 MAJOR-4; repointed at the record
 * in r14 BLOCKING-1). The refusal belongs to the number on file and must not
 * travel to a corrected one, so the verdict is read through
 * `project_consent_org()` + `channel_consent_status()` — the same pair 00594's
 * freeze asks — and a genuine change off a refused number is refused here, in
 * a sentence.
 */
export function useUpdateProjectParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, patch }: UpdateProjectPartyInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const dbPatch: Record<string, unknown> = {};
      if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName;
      if (patch.companyName !== undefined) dbPatch.company_name = patch.companyName?.trim() || null;
      if (patch.companyId !== undefined) dbPatch.company_id = patch.companyId || null;
      if (patch.trade !== undefined) dbPatch.trade = patch.trade?.trim() || null;
      if (patch.phone !== undefined) {
        const nextPhone = patch.phone?.trim() || null;
        dbPatch.phone = nextPhone;
        // 00281's normalizer reads COALESCE(NEW.phone, NEW.phone_e164), so
        // clearing the raw phone alone leaves the old E.164 standing — and
        // that column is the inbound SMS conversation key. Send both.
        if (nextPhone === null) dbPatch.phone_e164 = null;

        const { data: currentRow, error: currentRowError } = await supabase
          .from('project_parties')
          .select('phone_e164, project_id')
          .eq('id', id)
          .maybeSingle();
        if (currentRowError) throw currentRowError;
        const currentE164 = (currentRow?.phone_e164 as string | null) ?? null;
        const nextE164 = normalizePartyPhoneForCompare(nextPhone);
        const phoneGenuinelyChanged = nextE164 !== currentE164;

        // A REFUSED NUMBER CANNOT MOVE, AND THE RECORD IS WHAT KNOWS IT
        // REFUSED (W1b final review r14 BLOCKING-1). R-AS removed the second
        // leg this guard used to carry — `currentStatus === 'opted_out'` off
        // the seat — because the seat's own column is frozen at its
        // `not_asked` default for every row any live write path produces, so
        // the leg could only ever answer for pre-freeze rows the backfill
        // already folded into the record. One reader, one answer.
        let recordRefusedOldNumber = false;
        if (phoneGenuinelyChanged && currentE164) {
          const { data: consentOrg, error: orgError } = await supabase.rpc('project_consent_org', {
            p_project_id: (currentRow?.project_id as string | null) ?? projectId,
          });
          if (orgError) throw orgError;
          if (consentOrg) {
            const { data: verdict, error: verdictError } = await supabase.rpc(
              'channel_consent_status',
              {
                p_organization_id: consentOrg,
                p_channel_kind: 'sms',
                p_channel_value: currentE164,
              },
            );
            if (verdictError) throw verdictError;
            recordRefusedOldNumber = verdict === 'opted_out';
          }
        }
        if (recordRefusedOldNumber) throw new Error(OPTED_OUT_PHONE_EDIT_SENTENCE);

        // Nothing else happens to consent on a phone edit. The record is keyed
        // on the number; moving the seat's number moves which record the seat
        // reads, and no seat column is touched (R-AS).
      }
      if (patch.email !== undefined) dbPatch.email = patch.email?.trim() || null;
      if (patch.showToClient !== undefined) dbPatch.show_to_client = patch.showToClient;
      if (patch.studioContactId !== undefined) dbPatch.studio_contact_id = patch.studioContactId;
      // DATE columns: an empty field is NO DAY, never the epoch.
      if (patch.onSiteFrom !== undefined)
        dbPatch.on_site_from = patch.onSiteFrom?.trim() || null;
      if (patch.onSiteTo !== undefined)
        dbPatch.on_site_to = patch.onSiteTo?.trim() || null;

      const { data, error } = await supabase
        .from('project_parties')
        .update(dbPatch)
        .eq('id', id)
        .select()
        .single();
      // Nothing here names a frozen column any more (R-AS), so the freeze
      // cannot fire. The translation stays because 00594's OTHER trigger,
      // `consent_opted_out_phone_frozen` (R-AX), still guards the two phone
      // columns in the database — and a raw Postgres string is rendered
      // verbatim into the party sheet's error slot.
      if (error) throw asWrittenConsentError(error);
      return data as ProjectParty;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      invalidateClientHouseholds(queryClient);
    },
  });
}

export interface RecordPartySmsConsentInput {
  partyId: string;
  projectId: string;
  /** The party's current phone. Consent for texts is meaningless without a
   *  number to text, and the record is KEYED on the number — so the value the
   *  designer saw is what is recorded against. */
  phone: string | null | undefined;
  smsConsentSource: 'verbal' | 'written' | 'web_form' | 'other';
  smsConsentEvidence: string;
}

/**
 * Invite an EXISTING seat's number to texts.
 *
 * R-AS — THIS WRITES NO SEAT COLUMN. The old body flipped the seat's eight
 * frozen `sms_consent_*` columns and carried three seat-shaped guards (a
 * phone-global sibling probe, a `not_asked` transition pin, a revert when
 * `phone_e164` failed to normalize). Every one of those questions now has a
 * better home: the record's own gates. `record_channel_invite` is studio-member
 * gated BEFORE its read, normalizes through `normalize_channel_value()` — so an
 * un-textable number is refused there rather than reverted after the fact — and
 * leaves a STANDING GRANT exactly as it is rather than demoting a repeat sub's
 * evidenced consent back to `pending` (close-review r2 MAJOR-1).
 *
 * `granted` never routes here (TCPA: consent, once given, is not re-recorded)
 * and a refusal is never designer-flippable — `record_channel_reconsent`
 * (`useRecordChannelReconsent`) is the studio's own way back, and an inbound
 * START is the recipient's.
 */
export function useRecordPartySmsConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordPartySmsConsentInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const phone = input.phone?.trim();
      if (!phone) {
        throw new Error('Texting updates needs a phone number — add one first.');
      }
      const consentEvidence = input.smsConsentEvidence?.trim() || null;
      if (!input.smsConsentSource || !consentEvidence) {
        throw new Error(
          'Record how and where this person gave prior consent before sending a text.',
        );
      }

      const { data: consentOrg, error: orgError } = await supabase.rpc(
        'project_consent_org',
        { p_project_id: input.projectId },
      );
      if (orgError) throw orgError;
      if (!consentOrg) {
        throw new Error(
          "This project isn't attached to a studio yet, so there's nowhere to record texting consent.",
        );
      }

      const { data, error } = await supabase.rpc('record_channel_invite', {
        p_organization_id: consentOrg,
        p_channel_kind: 'sms',
        p_channel_value: phone,
        p_source: input.smsConsentSource,
        p_evidence: consentEvidence,
        p_disclosure_version: 'field-sms-v1',
        p_origin_project_id: input.projectId,
      });
      if (error) throw asWrittenConsentRpcError(error);
      return data as unknown;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['channel-consent'] });
    },
  });
}


export interface CloseProjectPartySeatInput {
  id: string;
  projectId: string;
  /** Why the seat closed, in the studio's own words. "The slab program went to
   *  Stonehaven Tile Gallery." Kept with the seat for ever. */
  reason?: string | null;
  /** The day it closed. Defaults to today. */
  offJobAt?: string | null;
}

/**
 * 00634's OWN REFUSALS, AS SENTENCES (r21 MAJOR-1 / r21 major-2, R-BS).
 *
 * `00634:151` and `:157` raise two BARE TOKENS with no SQLSTATE, so PostgREST
 * hands them back as `message` — and `@supabase/postgrest-js` declares
 * `PostgrestError extends Error`, so every `e instanceof Error ? e.message`
 * catch in the room printed the token itself on the face:
 * `seat_close_money_authority_forbidden`, in the Call Sheet's status line and
 * in the person card's alert. `writeErrorMessage`'s schema-word guard matches
 * none of them (no `duplicate key`, no `constraint`, no `relation `), so the
 * Bidding band's path returned the raw string too.
 *
 * These are the twelfth and thirteenth translations in the same family as
 * CR-3's three, and they say the same thing `household-band.tsx` already says
 * in words one region away: a money delegation is the principal's to take
 * away.
 */
export const SEAT_CLOSE_REFUSAL_SENTENCES: Record<string, string> = {
  seat_close_money_authority_forbidden:
    'This seat signs for money, and ending that is the principal’s. Ask an owner or an admin of the studio to close it.',
  seat_close_authority_forbidden:
    'This seat’s standing grant is recorded in another studio’s book, so closing it is theirs to do. Ask that studio.',
};

export function asSeatCloseError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  for (const [token, sentence] of Object.entries(SEAT_CLOSE_REFUSAL_SENTENCES)) {
    if (message.includes(token)) return sentence;
  }
  return message || 'Could not close the seat.';
}

/**
 * THE ONE STATE IN WHICH "Close this seat" CANNOT BE PRESSED FOR MONEY (PR-n).
 *
 * Mirrors `end_party_authority_at_seat_close()`'s own second leg
 * (00634:156-160): an OPEN grant in one of PR-n's two scopes on the seat, and
 * a caller who is not an owner or an admin of the studio. `effective_to IS
 * NULL` is the trigger's own predicate — a grant already ended gates nothing.
 *
 * Read BEFORE the press, the shape `householdAddIsHeld` already ships, so the
 * studio reads the reason where the act is rather than after the database has
 * refused it.
 */
export function seatCloseIsHeldForMoney(
  authority: ReadonlyArray<{ scope: string; effective_to: string | null }> | null | undefined,
  isPrincipal: boolean,
): boolean {
  if (isPrincipal) return false;
  return (authority ?? []).some(
    (grant) => grant.effective_to == null && isAdminOnlyAuthorityScope(grant.scope),
  );
}

/** The sentence beside that held act, on both close surfaces. */
export const SEAT_CLOSE_MONEY_HELD_REASON =
  'This seat signs for money. Closing it ends that, and ending it is the principal’s. An owner or an admin of the studio can close this seat.';

/**
 * CLOSE THIS SEAT — the act that replaces Remove (CRM-13, direction §1 line 8).
 * A dated `off_job_at` with a reason, and the seat stays on the book: the
 * consent, the bid history, the waivers and the lineage all survive, and the
 * Call Sheet's Done band is where the row goes.
 */
export function useCloseProjectPartySeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CloseProjectPartySeatInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      // r20 major-1 / QA blocking-2 — A SECOND CLOSE NEVER WRITES OVER THE FIRST.
      //
      // The act used to write `off_job_at: today` and `off_job_reason: reason
      // || null` unconditionally, so closing a seat that had ALREADY left the
      // job moved the recorded day to today and blanked the studio's own
      // sentence. Nothing holds a second copy of either. The Call Sheet and
      // the person card now both keep the act off a closed seat, and this is
      // the same rule where every future caller reaches it: the day a seat
      // left the job is written once, and a recorded reason is restated or
      // kept, never nulled. Re-opening a seat stays its own act (00634:59-64).
      const { data: standing, error: readError } = await supabase
        .from('project_parties')
        .select('off_job_at, off_job_reason')
        .eq('id', input.id)
        .maybeSingle();
      if (readError) throw readError;
      const alreadyClosed = !!standing?.off_job_at;
      const writtenReason = input.reason?.trim() || null;
      const { data, error } = await supabase
        .from('project_parties')
        .update({
          stage: 'off_job',
          off_job_at: alreadyClosed
            ? standing.off_job_at
            : (input.offJobAt ?? new Date().toISOString().slice(0, 10)),
          off_job_reason: alreadyClosed
            ? (writtenReason ?? standing.off_job_reason ?? null)
            : writtenReason,
        })
        .eq('id', input.id)
        .select()
        .single();
      // r21 major-2 — NEVER THE BARE POSTGREST OBJECT. 00634's two refusals
      // are bare tokens on an object whose prototype chain says `Error`, so
      // both faces printed the token. The hook is where every future caller
      // reaches the translation.
      if (error) throw new Error(asSeatCloseError(error));
      return data as ProjectParty;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      // r21 major-1 — AND THE GRANTS 00634 JUST ENDED (R-BS).
      // The close ends every open delegation the seat carried
      // (00634:163-167), and none of the five roots above is a prefix of
      // `partyAuthorityKeys.all` — which `projectAuthorityKeys.project` nests
      // under. With `staleTime` five minutes and `refetchOnWindowFocus` false
      // the Call Sheet went on printing "Signs money to $2,500." in the
      // present tense over a grant the same transaction closed, while the
      // household band two elements down — which IS invalidated — refetched
      // and dropped the clause. `useSetHouseholdThreshold` already invalidates
      // this root for exactly this reason (use-households.ts:623).
      void queryClient.invalidateQueries({ queryKey: partyAuthorityKeys.all });
      invalidateClientHouseholds(queryClient);
    },
  });
}

export interface RemoveProjectPartyInput {
  id: string;
  projectId: string;
}

/** Why a seat may not be hard-deleted. Each is a fact the delete would destroy. */
export type SeatDeleteRefusal = 'consent' | 'bid' | 'waiver' | 'unknown';

export const SEAT_DELETE_REFUSAL_SENTENCES: Record<SeatDeleteRefusal, string> = {
  consent:
    'This number has a texting record behind it. Close the seat instead — the record stays either way, and the seat is how you can still see it.',
  bid: 'This seat carries a bid. Close it instead, so the bid history stays on the job.',
  waiver:
    'This seat carries paperwork the studio holds. Close it instead, so the paper keeps its place.',
  unknown: 'Close this seat instead of removing it.',
};

/**
 * THE MISTAKEN-ADD PREDICATE. A hard DELETE survives for exactly one case: a
 * seat added by mistake, minutes ago, that carries nothing. `useRemoveProjectParty`
 * calls this first and refuses when any of the three facts exists.
 *
 * Pure and exported so the surface can disable — or rather, explain — the act
 * before the designer presses it.
 */
export function seatDeleteRefusal(facts: {
  hasConsentRecord: boolean;
  hasBid: boolean;
  hasComplianceDocument: boolean;
}): SeatDeleteRefusal | null {
  if (facts.hasConsentRecord) return 'consent';
  if (facts.hasBid) return 'bid';
  if (facts.hasComplianceDocument) return 'waiver';
  return null;
}

/**
 * Remove a party from a project's roster — a real DELETE, and the LAST resort.
 * Direction §1 line 8 retires Remove in favour of Close this seat; this path
 * survives only for a mistaken add, and refuses the moment the seat carries a
 * consent record, a bid or a document the studio holds.
 *
 * The bid check reads the bid COLUMNS (00631) as well as `stage`. A seat in
 * one of the bid stages is a seat the studio asked for a price whatever
 * columns the row has; and a seat carrying any bid column is one whatever
 * stage it now sits in — `useSetPartyBid` moves `selected → awarded` and
 * `withdrawn → off_job`, so the stage list alone let a seat with a written
 * bid, its dates and its estimator be hard-DELETEd by "Added by mistake"
 * (code review r1 MAJOR-1).
 */
export function useRemoveProjectParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: RemoveProjectPartyInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: seat, error: seatError } = await supabase
        .from('project_parties')
        .select(
          `phone_e164, stage, studio_contact_id, company_id, project_id, ${SEAT_BID_COLUMNS.join(', ')}`,
        )
        .eq('id', id)
        .maybeSingle();
      if (seatError) throw seatError;

      let hasConsentRecord = false;
      const phoneE164 = (seat?.phone_e164 as string | null) ?? null;
      if (phoneE164) {
        const { data: consentOrg, error: orgError } = await supabase.rpc(
          'project_consent_org',
          { p_project_id: (seat?.project_id as string | null) ?? projectId },
        );
        if (orgError) throw orgError;
        if (consentOrg) {
          const { data: verdict, error: verdictError } = await supabase.rpc(
            'channel_consent_status',
            {
              p_organization_id: consentOrg,
              p_channel_kind: 'sms',
              p_channel_value: phoneE164,
            },
          );
          if (verdictError) throw verdictError;
          // `not_asked` and no record both mean the studio has never said
          // anything about this number; anything else is a fact.
          hasConsentRecord = !!verdict && verdict !== 'not_asked';
        }
      }

      const bidStages = ['prospect', 'invited', 'bidding', 'declined', 'no_response'];
      const hasBid =
        bidStages.includes((seat?.stage as string | null) ?? '') ||
        SEAT_BID_COLUMNS.some(
          (column) =>
            (seat as Record<string, unknown> | null)?.[column] != null,
        );

      /**
       * CR13-5 — THE GUARD ASKS THE QUESTION THE FACE ASKS.
       *
       * The face refuses on `row.paper`, which is `identity_paper_state(card,
       * COALESCE(seat.company_id, card.company_id))` (R-BA / R-BJ): the
       * person's own paper AND their firm's. This asked only for the card's
       * own, over a PostgREST read that returns `[]` — not an error — when RLS
       * refuses it, so the last hard delete in the build read "no paper held"
       * exactly where it could see least. Same formula as the face now, and a
       * read that cannot answer is a refusal, not an absence.
       */
      let hasComplianceDocument = false;
      const cardId = (seat?.studio_contact_id as string | null) ?? null;
      if (cardId) {
        let companyId = (seat?.company_id as string | null) ?? null;
        if (!companyId) {
          const { data: card, error: cardError } = await supabase
            .from('studio_contacts')
            .select('company_id')
            .eq('id', cardId)
            .maybeSingle();
          if (cardError) throw cardError;
          companyId = (card?.company_id as string | null) ?? null;
        }
        const { data: paper, error: paperError } = await supabase.rpc(
          'identity_paper_state',
          { p_card_id: cardId, p_company_id: companyId },
        );
        if (paperError) throw paperError;
        hasComplianceDocument =
          typeof paper === 'string' ? paper !== 'not_on_file' : true;
      }

      const refusal = seatDeleteRefusal({ hasConsentRecord, hasBid, hasComplianceDocument });
      if (refusal) throw new Error(SEAT_DELETE_REFUSAL_SENTENCES[refusal]);

      const { error } = await supabase.from('project_parties').delete().eq('id', id);
      if (error) throw error;
      return { id };
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      invalidateClientHouseholds(queryClient);
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
  /** `v_project_roster`'s consent column, repointed by 00594 to the RECORD's
   *  verdict through `channel_consent_status(project_consent_org(...))`. It is
   *  NOT the seat's frozen column. NULL means the caller could not read the
   *  record that decides the word, which prints as nothing (R-BB). */
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

// ═══════════════════════════════════════════════════════════════════════════
// THE CALL SHEET, REGROUPED BY WINDOW (direction §3.4, ux-1-ia §5)
//
// "Build & supply" is replaced by four bands: this week, later, bidding, done.
// The grouping is a PURE function over the seat's `stage` and its window, so
// the rule can be read, tested and reasoned about without a database.
// ═══════════════════════════════════════════════════════════════════════════

/** The four crew bands the Call Sheet prints, in the order it prints them.
 *  (Studio side and Client side are their own bands, from other tables.) */
export type RosterBand = 'this_week' | 'later' | 'bidding' | 'done';

export const ROSTER_BANDS: readonly RosterBand[] = [
  'this_week',
  'later',
  'bidding',
  'done',
] as const;

export const ROSTER_BAND_LABELS: Record<RosterBand, string> = {
  this_week: 'On the job · this week',
  later: 'On the job · later',
  bidding: 'Bidding',
  done: 'Done',
};

/** Stages that put a seat in Bidding whatever its window says: the studio asked
 *  for a price and this seat is the answer, or the absence of one. `prospect`
 *  rides here because it is pre-award and belongs to no crew band. */
const BIDDING_STAGES: readonly string[] = [
  'prospect',
  'invited',
  'bidding',
  'declined',
  'no_response',
];

/** Stages that put a seat in Done whatever its window says. */
const DONE_STAGES: readonly string[] = ['closeout', 'warranty', 'off_job', 'retired'];

/** Stages that are crew: they band by window. */
const CREW_STAGES: readonly string[] = ['awarded', 'mobilized', 'active'];

/** The shape the grouping needs. Both `people_directory_seats` rows and raw
 *  `project_parties` rows satisfy it. */
export interface RosterWindowSeat {
  stage: string | null;
  on_site_from: string | null;
  on_site_to: string | null;
}

/** `YYYY-MM-DD` for a Date, in the caller's own calendar day. Dates on a seat
 *  are DATE columns, not timestamps, so the comparison is a string one and
 *  never crosses a timezone. */
export function rosterDateKey(on: Date): string {
  const y = on.getFullYear();
  const m = String(on.getMonth() + 1).padStart(2, '0');
  const d = String(on.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Which band one seat belongs in (ux-1-ia §5, direction §3.4).
 *
 *  · a bid stage or a done stage decides outright — a bidder with a projected
 *    window is still a bidder, and a warranty seat's window closed months ago;
 *  · otherwise the WINDOW decides: a window that opens in the future is Later,
 *    and everything else — a window covering today, a window that has closed
 *    on a seat still marked crew, or no window at all — is this week.
 *
 * `today` is injected rather than read from the clock, so the rule is testable
 * and the whole Call Sheet bands against ONE moment.
 */
export function rosterBandFor(seat: RosterWindowSeat, today: string): RosterBand {
  const stage = seat.stage ?? '';
  if (DONE_STAGES.includes(stage)) return 'done';
  if (BIDDING_STAGES.includes(stage)) return 'bidding';
  // An unknown stage is treated as crew rather than dropped: a seat the room
  // cannot band is a seat the studio cannot see.
  if (!CREW_STAGES.includes(stage) && stage !== '') {
    // fall through to the window rule — a stage this vocabulary does not know
    // is still a seat on a job.
  }
  if (seat.on_site_from && seat.on_site_from > today) return 'later';
  return 'this_week';
}

/** Every seat, banded, with empty bands kept so the Call Sheet's headings do
 *  not move about as a job turns over. */
export function groupRosterByWindow<T extends RosterWindowSeat>(
  seats: readonly T[],
  today: string,
): Record<RosterBand, T[]> {
  const grouped: Record<RosterBand, T[]> = {
    this_week: [],
    later: [],
    bidding: [],
    done: [],
  };
  for (const seat of seats) grouped[rosterBandFor(seat, today)].push(seat);
  return grouped;
}

/** The Call Sheet's roster, banded. Reads `people_directory_seats`, so every
 *  row carries the identity's reach, consent and paper words beside the seat's
 *  own stage and window. */
export function useProjectRosterByWindow(
  projectId: string | null | undefined,
  today: string = rosterDateKey(new Date()),
) {
  const seats = usePeopleSeats({ projectId });
  const bands = seats.data ? groupRosterByWindow(seats.data, today) : undefined;
  return { ...seats, bands };
}

// ═══════════════════════════════════════════════════════════════════════════
// E12 · AUTHORITY ON THE SEAT — `project_party_authority` (00624)
//
// Who signs, up to what number, who only prepares. PR-n lives in the RLS
// policy, not here: `money` and `draw_certify` are owner/admin only, and a
// plain member's write is refused by Postgres. The hook surfaces that refusal
// as a sentence rather than a policy error.
// ═══════════════════════════════════════════════════════════════════════════

/** `project_party_authority.scope` (00624's CHECK). */
export type AuthorityScope =
  | 'money'
  | 'change_order'
  | 'selections'
  | 'schedule'
  | 'site_access'
  | 'key'
  | 'draw_certify';

export const ALL_AUTHORITY_SCOPES: readonly AuthorityScope[] = [
  'money',
  'change_order',
  'selections',
  'schedule',
  'site_access',
  'key',
  'draw_certify',
] as const;

/** The scopes PR-n reserves to an owner or admin of the studio. */
export const ADMIN_ONLY_AUTHORITY_SCOPES: readonly AuthorityScope[] = [
  'money',
  'draw_certify',
] as const;

export function isAdminOnlyAuthorityScope(scope: string | null | undefined): boolean {
  return !!scope && (ADMIN_ONLY_AUTHORITY_SCOPES as readonly string[]).includes(scope);
}

/** Authority is never a state word — it prints as plain, uncoloured text
 *  (direction §3.8). These are the phrases, one per scope. */
export const AUTHORITY_SCOPE_LABELS: Record<AuthorityScope, string> = {
  money: 'Signs money',
  change_order: 'Approves change orders',
  selections: 'Selections',
  schedule: 'Sets the schedule',
  site_access: 'Controls site access',
  key: 'Holds a key',
  draw_certify: 'Certifies draws',
};

export interface ProjectPartyAuthority {
  id: string;
  engagement_id: string;
  scope: AuthorityScope | string;
  /** Integer CENTS. The $2,500 line is 250000. */
  threshold_cents: number | null;
  /** F-03/F-08's fact: they draft it, somebody else signs it. */
  prepares_only: boolean;
  /** Seats on this SAME project a decision is copied to; a BEFORE trigger
   *  refuses an id off the project (`authority_copy_to_off_project`). */
  copy_to: string[];
  source_clause: string | null;
  granted_by: string | null;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetPartyAuthorityInput {
  engagementId: string;
  projectId: string;
  scope: AuthorityScope;
  thresholdCents?: number | null;
  preparesOnly?: boolean;
  copyTo?: string[];
  sourceClause?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export const partyAuthorityKeys = {
  all: ['project-party-authority'] as const,
  list: (engagementId: string | null | undefined) =>
    ['project-party-authority', engagementId ?? null] as const,
};

/** One seat's grants. */
export function usePartyAuthority(engagementId: string | null | undefined) {
  return useQuery({
    queryKey: partyAuthorityKeys.list(engagementId),
    enabled: !!engagementId,
    queryFn: async (): Promise<ProjectPartyAuthority[]> => {
      if (!engagementId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_party_authority')
        .select('*')
        .eq('engagement_id', engagementId)
        // CR-23: a delegation ENDS as a row, not as an edit (00624's own note
        // on `effective_to`, and the partial unique index keyed on
        // `effective_to IS NULL`). A closed grant must stop printing.
        .or(`effective_to.is.null,effective_to.gte.${new Date().toISOString().slice(0, 10)}`);
      if (error) throw error;
      return (data ?? []) as ProjectPartyAuthority[];
    },
  });
}

const AUTHORITY_ADMIN_ONLY_SENTENCE =
  'Money and draw certification are the principal’s to grant. Ask an owner or an admin of the studio to record this one.';

/**
 * CR-19: PR-n's sentence belongs to an RLS REFUSAL and nothing else. A 42P10,
 * a trigger raise or a dropped connection told an owner to "ask an owner",
 * which is both false and unactionable. An RLS refusal has a recognisable
 * shape: 42501 from the policy itself, or PGRST116 when the WITH CHECK leg
 * returns no row to `.single()`.
 */
function authorityWriteError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any,
  scope: string,
): Error {
  const code = String(error?.code ?? '');
  const refused = code === '42501' || code === 'PGRST116';
  if (refused && isAdminOnlyAuthorityScope(scope)) {
    return new Error(AUTHORITY_ADMIN_ONLY_SENTENCE);
  }
  return error instanceof Error ? error : new Error(String(error?.message ?? error));
}

/** Record or restate one grant. One row per (seat, scope). */
export function useSetPartyAuthority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetPartyAuthorityInput): Promise<ProjectPartyAuthority> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // CR-1: the ONLY unique index on this table is PARTIAL
      // (`00624:901-903`, `WHERE effective_to IS NULL`). Postgres can only use
      // a partial index as an ON CONFLICT arbiter when the statement repeats
      // the index predicate, and PostgREST emits none — so an `.upsert()` with
      // `onConflict: 'engagement_id,scope'` raises 42P10 on every call. Check
      // then write, the pattern `use-leads.ts:481` already documents for this
      // exact trap.
      const row = {
        engagement_id: input.engagementId,
        scope: input.scope,
        threshold_cents: input.thresholdCents ?? null,
        prepares_only: input.preparesOnly ?? false,
        copy_to: input.copyTo ?? [],
        source_clause: input.sourceClause?.trim() || null,
        effective_from: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
        effective_to: input.effectiveTo ?? null,
      };

      const { data: standing, error: readError } = await supabase
        .from('project_party_authority')
        .select('id')
        .eq('engagement_id', input.engagementId)
        .eq('scope', input.scope)
        .is('effective_to', null)
        .maybeSingle();
      if (readError) throw authorityWriteError(readError, input.scope);

      const written = standing?.id
        ? await supabase
            .from('project_party_authority')
            .update(row)
            .eq('id', standing.id)
            .select('*')
            .single()
        : await supabase.from('project_party_authority').insert(row).select('*').single();

      if (written.error) throw authorityWriteError(written.error, input.scope);
      return written.data as ProjectPartyAuthority;
    },
    onSuccess: (_data, input) => {
      // CR-8: `partyAuthorityKeys.list(engagementId)` is
      // `['project-party-authority', <engagementId>]`, which is NOT a prefix of
      // the project-wide key `['project-party-authority', 'project', <id>]`.
      // Invalidating the root reaches both.
      void queryClient.invalidateQueries({ queryKey: partyAuthorityKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      invalidateClientHouseholds(queryClient);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// E15 · THE SITE ACCESS CARD — `project_site_access_cards` (00625)
//
// PR-r IS THE SHAPE: there is NO gate-code column and there is not meant to be
// one. Patina stores the lockbox VERSION, the key holder, the hours and who was
// told, and prints that the code is held off Patina.
//
// PR-w IS THE RLS: four studio policies, no client leg, no `show_to_client`.
// One card per project, so a single toggle would expose the whole card.
// ═══════════════════════════════════════════════════════════════════════════

/** One line on the card's "who to call first" list. */
export interface SiteAccessEmergencyLine {
  name: string;
  role?: string | null;
  phone?: string | null;
}

export interface ProjectSiteAccessCard {
  id: string;
  project_id: string;
  /** The VERSION, never the code. "Lockbox, version 3." */
  lockbox_version: string | null;
  alarm_ref: string | null;
  /** A seat on THIS project; a BEFORE trigger refuses anything else. */
  key_holder_engagement_id: string | null;
  site_hours: string | null;
  site_notes: string | null;
  emergency_lines: SiteAccessEmergencyLine[];
  receiver_instructions: string | null;
  changed_at: string | null;
  changed_by: string | null;
  /** The seats told about the last change. */
  told_refs: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateSiteAccessCardInput {
  projectId: string;
  lockboxVersion?: string | null;
  alarmRef?: string | null;
  keyHolderEngagementId?: string | null;
  siteHours?: string | null;
  siteNotes?: string | null;
  emergencyLines?: SiteAccessEmergencyLine[];
  receiverInstructions?: string | null;
}

export const siteAccessKeys = {
  all: ['project-site-access'] as const,
  detail: (projectId: string | null | undefined) =>
    ['project-site-access', projectId ?? null] as const,
};

/** The card, or `null` when the project has none yet. NULL is the empty state,
 *  not an error: most projects have no card until somebody writes one. */
export function useSiteAccessCard(projectId: string | null | undefined) {
  return useQuery({
    queryKey: siteAccessKeys.detail(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectSiteAccessCard | null> => {
      if (!projectId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_site_access_cards')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      if (error) throw error;
      return (data as ProjectSiteAccessCard | null) ?? null;
    },
  });
}

/**
 * Write the card. Creates it on first write; one row per project.
 *
 * `changed_at` / `changed_by` stamp THE WAY IN, and `told_refs` is cleared
 * with them: telling people about the OLD lockbox is not telling them about
 * this one.
 *
 * CR-4 — AND ONLY THE WAY IN. The stamp used to go on every write, before the
 * hook looked at which field the caller passed, and the card routes seven acts
 * through this one door (Start the card, Add someone to call, Take <name> off
 * the list, the key-holder picker, and three EditableLines). So logging who was
 * told and then adding a gas company's phone number restamped "The way in
 * changed 13 Sep 2026, by <me>." — a false claim about the lockbox — and
 * destroyed the notice that had just been deliberately recorded, with no undo.
 * R-U's Call Sheet fold printed the same wrong date. The way in is the lockbox,
 * the alarm and the key holder; hours, notes, emergency lines and receiving
 * instructions are not it.
 *
 * The upsert's UPDATE leg only sets the columns this payload carries, so a
 * write that leaves the three stamp columns out leaves the standing stamp and
 * the standing `told_refs` exactly as they are.
 */
export function useUpdateSiteAccessCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: UpdateSiteAccessCardInput,
    ): Promise<ProjectSiteAccessCard> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const wayInChanged =
        input.lockboxVersion !== undefined ||
        input.alarmRef !== undefined ||
        input.keyHolderEngagementId !== undefined;

      const row: Record<string, unknown> = { project_id: input.projectId };
      if (wayInChanged) {
        row.changed_at = new Date().toISOString();
        row.changed_by = userData?.user?.id ?? null;
        row.told_refs = [];
      }
      if (input.lockboxVersion !== undefined)
        row.lockbox_version = input.lockboxVersion?.trim() || null;
      if (input.alarmRef !== undefined) row.alarm_ref = input.alarmRef?.trim() || null;
      if (input.keyHolderEngagementId !== undefined)
        row.key_holder_engagement_id = input.keyHolderEngagementId;
      if (input.siteHours !== undefined) row.site_hours = input.siteHours?.trim() || null;
      if (input.siteNotes !== undefined) row.site_notes = input.siteNotes?.trim() || null;
      if (input.emergencyLines !== undefined) row.emergency_lines = input.emergencyLines;
      if (input.receiverInstructions !== undefined)
        row.receiver_instructions = input.receiverInstructions?.trim() || null;

      const { data, error } = await supabase
        .from('project_site_access_cards')
        .upsert(row, { onConflict: 'project_id' })
        .select('*')
        .single();
      if (error) throw error;
      return data as ProjectSiteAccessCard;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: siteAccessKeys.detail(input.projectId),
      });
    },
  });
}

/**
 * "Log who was told" — appends seats to `told_refs` without disturbing the
 * change itself. Appends rather than replaces, and de-duplicates, so telling a
 * second group later does not erase the first.
 */
export function useLogSiteAccessTold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      seatIds: string[];
    }): Promise<ProjectSiteAccessCard> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: card, error: cardError } = await supabase
        .from('project_site_access_cards')
        .select('id, told_refs')
        .eq('project_id', input.projectId)
        .maybeSingle();
      if (cardError) throw cardError;
      if (!card) {
        throw new Error('There is no site access card on this job yet.');
      }
      const existing = ((card.told_refs as string[] | null) ?? []).filter(Boolean);
      const next = Array.from(new Set([...existing, ...input.seatIds]));

      const { data, error } = await supabase
        .from('project_site_access_cards')
        .update({ told_refs: next })
        .eq('id', card.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as ProjectSiteAccessCard;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: siteAccessKeys.detail(input.projectId),
      });
    },
  });
}

/**
 * CR-1 — THE STUDIO A PROJECT'S RECORD NAMES (`project_recorded_studio()`,
 * 00624:335-343 — `projects.studio_id`, no fallback, no caller-relative leg).
 *
 * This is the resolver `assert_project_party_cards()` checks a seat's
 * `studio_contact_id` against, so it is the only correct answer to "which
 * rolodex may this seat's card live in". Guessing it off the caller's
 * membership list — `orgs.find(o => o.type === 'design_studio')` over an
 * unordered PostgREST read — put a brand-new `studio_contacts` row in the
 * WRONG studio for a designer who belongs to two, and the link that followed
 * raised `party_studio_contact_other_studio` without rolling the card back
 * (two PostgREST calls, one transaction between them: none).
 *
 * NULL means the job records no studio. There is no card to mint there at all:
 * the same guard raises `party_card_project_has_no_studio` before a stamp
 * lands, so the caller offers no promote act rather than minting an orphan.
 */
export function useProjectRecordedStudio(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-recorded-studio', projectId ?? null],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<string | null> => {
      if (!projectId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('project_recorded_studio', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE BIDDING BAND (00631, direction §3.4, R-R) — People room CRM · W3/P2
//
// A price nobody has answered is not a body on the site. The Bidding band's
// rows carry four editable facts — when the answer was owed, how it came back,
// how long the number holds, and who at the firm priced it — and the outcome
// is written as a STAGE WORD, so a losing bidder never reads as crew.
// ═══════════════════════════════════════════════════════════════════════════

/** 00631's `project_parties_bid_outcome_check` vocabulary. */
export type SeatBidOutcome =
  | 'asked'
  | 'quoted'
  | 'selected'
  | 'declined'
  | 'no_response'
  | 'withdrawn';

export const ALL_SEAT_BID_OUTCOMES: readonly SeatBidOutcome[] = [
  'asked',
  'quoted',
  'selected',
  'declined',
  'no_response',
  'withdrawn',
];

/**
 * The outcome as the STAGE it puts the seat in (direction §3.8's nine words,
 * through `seatStageWordFor`). `rosterBandFor` then keeps a losing bidder out
 * of every crew band: `declined` and `no_response` stay in Bidding, `off_job`
 * goes to Done, and only `awarded` bands by window.
 */
export const SEAT_BID_OUTCOME_STAGE: Record<SeatBidOutcome, string> = {
  asked: 'invited',
  quoted: 'bidding',
  selected: 'awarded',
  declined: 'declined',
  no_response: 'no_response',
  withdrawn: 'off_job',
};

/** What the studio reads on the row — direction §3.8's own words. */
export const SEAT_BID_OUTCOME_LABELS: Record<SeatBidOutcome, string> = {
  asked: 'Bidding',
  quoted: 'Bidding',
  selected: 'Awarded',
  declined: 'Declined',
  no_response: 'No response',
  withdrawn: 'Off the job',
};

/** The act word beside each outcome in the picker — what the studio DID. */
export const SEAT_BID_OUTCOME_ACTS: Record<SeatBidOutcome, string> = {
  asked: 'Asked for a price',
  quoted: 'They quoted',
  selected: 'Selected',
  declined: 'They declined',
  no_response: 'No response',
  withdrawn: 'They withdrew',
};

export function isSeatBidOutcome(value: unknown): value is SeatBidOutcome {
  return (ALL_SEAT_BID_OUTCOMES as readonly unknown[]).includes(value);
}

/** The bid facts one seat carries, as the Bidding band edits them. */
export interface SeatBid {
  seatId: string;
  bidDueAt: string | null;
  bidOutcome: SeatBidOutcome | null;
  bidValidUntil: string | null;
  bidQuotedByPersonId: string | null;
  bidAmountCents: number | null;
  /** SPEC §5.4 #9 — "Asked 28 September 2026." */
  bidAskedAt: string | null;
  /** R-R — "Quoted 2 October 2026." */
  bidQuotedAt: string | null;
  /** R-R — "Selected 9 October 2026." */
  bidSelectedAt: string | null;
}

/** The columns that ARE the bid — 00631's five facts plus its three dates. */
export const SEAT_BID_COLUMNS = [
  'bid_due_at',
  'bid_outcome',
  'bid_valid_until',
  'bid_quoted_by_person_id',
  'bid_amount_cents',
  'bid_asked_at',
  'bid_quoted_at',
  'bid_selected_at',
] as const;

/**
 * Does this seat carry a bid AT ALL — the question `stage` could only
 * approximate while the columns were P2.
 *
 * `stage` was the whole predicate behind `seatDeleteRefusal`'s `hasBid` and
 * behind the Bidding band's editor, and `useSetPartyBid` writes `selected →
 * awarded` and `withdrawn → off_job`, neither of which is a bid stage. So a
 * seat carrying "Due 5 Oct", "Holds until 4 Nov", "Priced by Tom Marrow" and
 * outcome Selected answered `false` to "does this carry a bid", and "Added by
 * mistake" hard-DELETEd the bid history with it (code review r1 MAJOR-1).
 */
export function seatCarriesBid(bid: SeatBid | null | undefined): boolean {
  if (!bid) return false;
  return (
    bid.bidDueAt != null ||
    bid.bidOutcome != null ||
    bid.bidValidUntil != null ||
    bid.bidQuotedByPersonId != null ||
    bid.bidAmountCents != null ||
    bid.bidAskedAt != null ||
    bid.bidQuotedAt != null ||
    bid.bidSelectedAt != null
  );
}

export interface SetPartyBidInput {
  id: string;
  projectId: string;
  patch: Partial<Omit<SeatBid, 'seatId'>>;
  /**
   * THE SEAT AS IT STANDS BEFORE THE SAVE — required, because the hook cannot
   * otherwise tell a TRANSITION (the studio records an outcome) from a
   * RE-SAVE (the studio corrects the estimator on a seat whose outcome has not
   * moved), and those two writes must not do the same thing to `stage` and
   * `off_job_at` (r7 BLOCKING-1).
   */
  previous: {
    bidOutcome: SeatBidOutcome | null;
    stage: string | null;
    /**
     * THE DAY THE SEAT ALREADY LEFT THE JOB, if one stands (r19 major-1).
     * `off_job_at` is written by three doors and read as a fact by four
     * readers; the one thing none of them can do is recover it once it is
     * overwritten. Optional so an older call site cannot silently lose the
     * guard's meaning — absent reads as "no date stands", which is the
     * pre-r19 behaviour, and `roster-row.tsx` (the only caller) passes the
     * seat's own value.
     */
    offJobAt?: string | null;
    /**
     * THE SENTENCE THE STUDIO TYPED WHEN IT CLOSED THE SEAT BY HAND, if one
     * stands (r21 major-3 / major-4).
     *
     * It is the one signal that tells `off_job_at` written by "Close this
     * seat" from `off_job_at` written by the withdrawal: the withdrawal stamps
     * the DATE and never a reason. Without it a hand-closed seat looked
     * exactly like a withdrawn one, so recording any other outcome on it put
     * the person back in a crew band beside their own closing clause, and one
     * more press NULLed the studio's own words.
     */
    offJobReason?: string | null;
  };
}

/**
 * DID THE STUDIO'S OWN HAND CLOSE THIS SEAT, or did a recorded withdrawal?
 *
 * `off_job_at` has two writers and they mean different things. "Close this
 * seat" writes `stage`, `off_job_at` and the studio's own `off_job_reason`;
 * "They withdrew" writes the date alone, on the transition, and R-BR rules
 * that correcting the outcome away from `withdrawn` takes that date back.
 *
 * A seat is HAND-CLOSED when it carries a date and either
 *
 *   * its recorded outcome is not `withdrawn` — so no withdrawal can have
 *     written the date; or
 *   * a reason stands beside it, which the withdrawal never writes.
 *
 * Everything else is the withdrawal's own record and stays inside R-BR.
 */
export function seatClosedByHand(previous: {
  bidOutcome: SeatBidOutcome | null;
  offJobAt?: string | null;
  offJobReason?: string | null;
}): boolean {
  if (!previous.offJobAt) return false;
  return (
    (previous.bidOutcome ?? null) !== 'withdrawn' ||
    !!(previous.offJobReason ?? '').trim()
  );
}

/**
 * THE STAGES A SEAT REACHES BY WORKING, not by an outcome being recorded.
 *
 * `SEAT_BID_OUTCOME_STAGE` maps `selected -> awarded`, and the editor is
 * offered on any seat carrying a bid — including one that has since been
 * mobilized and is on site. Re-applying the outcome's stage there writes
 * `awarded` over `active`, and `SEAT_STAGE_TO_WORD` / `SEAT_STAGE_WORD_PIGMENTS`
 * then flip the person card's and the Directory's seat line from "On the job"
 * (current) to "Awarded" (pending) for a crew that is on site.
 *
 * `withdrawn` is the one outcome that legitimately reaches past these: a seat
 * that left the job left it, whatever stage it had reached.
 */
const SEAT_STAGES_PAST_THE_BID: readonly string[] = [
  'mobilized',
  'active',
  'closeout',
  'warranty',
  'retired',
];

/** What a bid save would do to the seat's STAGE, read before the press. */
export interface BidStageOutcome {
  /** The outcome the save carries, or null when none is selected. */
  outcome: SeatBidOutcome | null;
  /** Did the outcome CHANGE against the seat as it stands? */
  moved: boolean;
  /** Is the seat already past the bidding lifecycle (and not withdrawing)? */
  pastTheBid: boolean;
  /** The stage the save will write, or null when it writes none. */
  stage: string | null;
}

/**
 * ONE ANSWER, read by the write and by the face (code review r8 BLOCKING-1).
 *
 * `useSetPartyBid` moves the stage under two conditions the bid editor's
 * consequence sentence knew nothing about, so the sentence promised a move on
 * two reachable presses that make none: every ordinary correction (the editor
 * seeds `outcome` from the seat's existing one, so fixing "Who priced it"
 * re-sends it unchanged and nothing moves), and recording "They declined" or
 * "No response" on a seat that is already mobilized, on site, closing out or
 * under warranty — where the stage deliberately stays put. The face said "A
 * bidder who did not win never reads as crew." while the row stayed in its
 * crew band, and `bidNote` prints no outcome word, so the press left no
 * readable trace at all.
 *
 * The predicates now live here, once, and `roster-row.tsx` branches its
 * sentence on the same object the mutation writes from.
 */
export function bidStageOutcome(
  previous: {
    bidOutcome: SeatBidOutcome | null;
    stage: string | null;
    offJobAt?: string | null;
    offJobReason?: string | null;
  },
  next: SeatBidOutcome | null | undefined,
): BidStageOutcome {
  const outcome = next ?? null;
  const moved = outcome !== (previous.bidOutcome ?? null);
  /**
   * r21 major-3 — AND A SEAT THE STUDIO CLOSED BY HAND IS PAST THE BID TOO.
   *
   * `off_job` is deliberately absent from the list above so `withdrawn` can
   * reach past it, and neither r18's guard on the clearing branch nor r19's
   * guard on the stamp constrains THIS predicate. The bid editor is offered on
   * a hand-closed seat ("Change what came back", roster-row.tsx:831,844), so
   * recording "Selected" on a seat closed with the reason "Picked another
   * electrician" wrote stage `awarded` and left `off_job_at` and the reason
   * standing: the row printed the word Awarded beside its own "Off the job
   * 10 Sep 2026. Picked another electrician.", the person card listed it as a
   * LIVE seat and offered Close this seat on it while the Call Sheet HELD that
   * act on the same seat, and `useProjectHousehold`'s open-seat filter went on
   * counting it closed. Four readers, one seat, two answers.
   *
   * Recording an outcome on a closed seat records WHAT CAME BACK. Putting a
   * seat back on the job stays its own named act (00634:59-64).
   */
  const pastTheBid =
    SEAT_STAGES_PAST_THE_BID.includes(previous.stage ?? '') ||
    seatClosedByHand(previous);
  // "They withdrew" is the one outcome that legitimately reaches past the bid:
  // a seat that left the job left it, whatever stage it had reached.
  const writesStage =
    !!outcome && moved && (!pastTheBid || outcome === 'withdrawn');
  return {
    outcome,
    moved,
    pastTheBid,
    stage: writesStage ? SEAT_BID_OUTCOME_STAGE[outcome] : null,
  };
}

export const partyBidKeys = {
  all: ['project-party-bids'] as const,
  list: (projectId: string | null | undefined) =>
    ['project-party-bids', projectId ?? null] as const,
};

/**
 * 00631's own refusals, as sentences.
 *
 * r10 MAJOR-1 — EVERY KEY IS A TOKEN THE DATABASE ACTUALLY RAISES. The
 * date-order key read `project_parties_bid_valid_until_check`, a constraint
 * that does not exist: 00631:86-88 mints it as
 * `project_parties_bid_window_check`, and the live catalog agrees. So the one
 * refusal the seven-field editor can raise from two of its own date inputs
 * matched nothing here, fell through to the raw PostgREST string, and
 * `writeErrorMessage`'s schema-word guard correctly suppressed it — leaving
 * "Could not write the bid." with no field named. The suite was green on a
 * string the database never emits.
 */
const BID_REFUSAL_SENTENCES: Record<string, string> = {
  project_parties_bid_window_check:
    'A number cannot stop holding before the day it was owed.',
  party_bid_quoted_by_project_has_no_studio:
    'This job is not attached to a studio yet, so there is no book to name an estimator from.',
  party_bid_quoted_by_other_studio:
    'That person is in another studio’s book.',
  party_bid_quoted_by_not_a_person:
    'A firm cannot price a job. Name the person at the firm who did.',
  party_bid_quoted_by_merged_away:
    'That card has been folded into another one. Name the card that survived.',
  project_parties_bid_outcome_check: 'That is not one of the outcomes on file.',
};

export function asBidError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  for (const [code, sentence] of Object.entries(BID_REFUSAL_SENTENCES)) {
    if (message.includes(code)) return sentence;
  }
  return message || 'The bid did not take that.';
}

/**
 * The bid columns for one project's seats, keyed by seat id.
 *
 * `people_directory_seats` (00626) predates 00631 and carries none of them, so
 * the Bidding band reads them here rather than inventing dates the view cannot
 * answer for.
 */
export function useProjectPartyBids(projectId: string | null | undefined) {
  return useQuery({
    queryKey: partyBidKeys.list(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<Record<string, SeatBid>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_parties')
        .select(`id, ${SEAT_BID_COLUMNS.join(', ')}`)
        .eq('project_id', projectId);
      if (error) throw error;
      const index: Record<string, SeatBid> = {};
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        index[String(row.id)] = {
          seatId: String(row.id),
          bidDueAt: (row.bid_due_at as string | null) ?? null,
          bidOutcome: isSeatBidOutcome(row.bid_outcome)
            ? row.bid_outcome
            : null,
          bidValidUntil: (row.bid_valid_until as string | null) ?? null,
          bidQuotedByPersonId:
            (row.bid_quoted_by_person_id as string | null) ?? null,
          bidAmountCents: (row.bid_amount_cents as number | null) ?? null,
          bidAskedAt: (row.bid_asked_at as string | null) ?? null,
          bidQuotedAt: (row.bid_quoted_at as string | null) ?? null,
          bidSelectedAt: (row.bid_selected_at as string | null) ?? null,
        };
      }
      return index;
    },
  });
}

/**
 * Write a seat's bid facts, and move its stage with the outcome.
 *
 * The outcome IS the stage word (SEAT_BID_OUTCOME_STAGE): writing "they
 * declined" without moving the stage would leave a losing bidder sitting in a
 * crew band, which is the one thing §3.4 asks the Bidding band to prevent.
 *
 * r7 BLOCKING-1 — BUT ONLY WHEN THE OUTCOME ACTUALLY MOVED. `saveBid` always
 * sends `bidOutcome`, seeded from the row's EXISTING outcome, and the editor
 * is offered on any seat carrying a bid — so correcting "Who priced it" or
 * "The number holds until" on an awarded seat that has since gone to work
 * re-applied `stage = 'awarded'` over `mobilized` / `active` / `closeout` /
 * `warranty`, and re-saving a Done row weeks later re-stamped `off_job_at`
 * with today, moving the recorded day the seat left the job (which
 * `rosterWindowClause` prints in the Done band). Two guards, both keyed on the
 * seat as it stood before the save: the outcome must have CHANGED, and the
 * stage it would write may not regress a seat that is already past the bid.
 *
 * r8 BLOCKING-1 — both guards now live in `bidStageOutcome()`, which the bid
 * editor's consequence sentence reads too. The face was still promising "A
 * bidder who did not win never reads as crew." on the two presses that write
 * no stage at all.
 */
export function useSetPartyBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, previous }: SetPartyBidInput): Promise<ProjectParty> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const dbPatch: Record<string, unknown> = {};
      if (patch.bidDueAt !== undefined) dbPatch.bid_due_at = patch.bidDueAt || null;
      if (patch.bidValidUntil !== undefined)
        dbPatch.bid_valid_until = patch.bidValidUntil || null;
      if (patch.bidQuotedByPersonId !== undefined)
        dbPatch.bid_quoted_by_person_id = patch.bidQuotedByPersonId || null;
      if (patch.bidAmountCents !== undefined)
        dbPatch.bid_amount_cents = patch.bidAmountCents ?? null;
      // 00631's three dated events (SPEC §5.4 #9, R-R). They are a RECORD of
      // what happened, so each is written exactly as the studio typed it and
      // none is derived from the outcome.
      if (patch.bidAskedAt !== undefined)
        dbPatch.bid_asked_at = patch.bidAskedAt || null;
      if (patch.bidQuotedAt !== undefined)
        dbPatch.bid_quoted_at = patch.bidQuotedAt || null;
      if (patch.bidSelectedAt !== undefined)
        dbPatch.bid_selected_at = patch.bidSelectedAt || null;
      if (patch.bidOutcome !== undefined) {
        dbPatch.bid_outcome = patch.bidOutcome ?? null;
        // r8 BLOCKING-1: the same reckoning the editor's consequence sentence
        // reads, so the face and the write can never disagree about whether
        // this press moves the seat. A seat that is mobilized, on site,
        // closing out or under warranty is past the bidding lifecycle: an
        // outcome correction records what came back, it does not send the crew
        // home.
        const written = bidStageOutcome(previous, patch.bidOutcome ?? null);
        if (written.stage) dbPatch.stage = written.stage;
        // "They withdrew" is a seat leaving the job, and every other door
        // that closes a seat dates it. A Done row with no date reads as a
        // row somebody forgot — but the date is stamped on the TRANSITION
        // into `withdrawn` only, so a later correction on that row leaves
        // the day the seat actually left the job alone.
        //
        // AND ONLY ONTO A SEAT THAT IS NOT ALREADY DATED (r19 major-1).
        // r18 BLOCKING-1 narrowed the CLEARING branch below and left this one
        // as it was, on the same population: a seat the studio closed BY HAND
        // ("Close this seat" — stage='off_job', off_job_at='2026-09-10',
        // off_job_reason='Picked another electrician') still carries its bid,
        // so `seatCarriesBid` keeps the editor on the row ("Change what came
        // back"). A week later the studio records what actually happened —
        // "They withdrew" — `previous.bidOutcome` is 'quoted', `written.moved`
        // is true, and the stamp REWROTE `off_job_at` to today.
        // `rosterWindowClause` then printed "Off the job 17 Sep 2026." beside
        // the studio's own untouched reason, a week later than the record, and
        // nothing anywhere held the original date: no audit row, no second
        // copy, and the consequence sentence beside the press promises only
        // the move to Off the job. A date the room already holds is the
        // record; this branch may only WRITE one, never move one.
        if (patch.bidOutcome === 'withdrawn' && written.moved && !previous.offJobAt) {
          dbPatch.off_job_at = new Date().toISOString().slice(0, 10);
        } else if (
          written.stage &&
          previous.bidOutcome === 'withdrawn' &&
          !seatClosedByHand(previous)
        ) {
          // R-BR (r17) — AND A SEAT BACK IN THE BIDDING IS NOT A SEAT THAT
          // LEFT THE JOB. The stamp above was one-way: nothing in the repo
          // ever cleared `off_job_at`, and `off_job` is not in
          // SEAT_STAGES_PAST_THE_BID, so correcting a withdrawal back to a
          // live outcome ("They quoted") DID write the new stage and left the
          // date standing. The row then banded into Bidding while
          // `rosterWindowClause` printed "Off the job 15 Sep 2026." beside its
          // bid note (r15 MAJOR-1 moved that leg ahead of the band test), and
          // `useProjectHousehold`'s open-seat filter went on counting the seat
          // CLOSED — three readers disagreeing about one seat, one of them
          // stating a false fact about whether the person is on the job.
          //
          // GATED ON THE SEAT LEAVING `withdrawn`, WHICH IS R-BR'S OWN SCOPE
          // ("Correcting a bid outcome away from 'withdrawn' clears
          // off_job_at and off_job_reason"), NOT ON A STAGE BEING WRITTEN
          // (r18 BLOCKING-1). `off_job` is deliberately absent from
          // SEAT_STAGES_PAST_THE_BID, so the wider guard let a seat the
          // studio closed BY HAND fall straight through it: "Close this
          // seat" writes stage='off_job', off_job_at and the studio's own
          // off_job_reason (useCloseProjectPartySeat), the bid editor is
          // still offered on that row ("Change what came back"), and one
          // press of "They declined" NULLed both columns — a sentence held
          // nowhere else and carrying no audit row — and put the seat back on
          // the job: the closing clause stopped printing, the row left Done
          // for Bidding, and "Close this seat" was offered on it again. The
          // consequence sentence beside the press promises only the move to
          // Declined. Reopening a hand-closed seat, if the room wants it, is
          // its own named act with its own consequence sentence.
          //
          // AND THE HAND-CLOSED POPULATION IS NAMED HERE TOO (r21 major-4).
          // r18 gated this branch on the seat leaving `withdrawn`, which
          // presupposes the withdrawal is what dated it — and r19's
          // `!previous.offJobAt` guard above made that untrue: recording "They
          // withdrew" on a seat the studio had already closed by hand writes
          // NO date, so three presses (close with a reason → "They withdrew" →
          // "They quoted") reached this branch and NULLed a sentence nothing
          // else in the room holds a copy of. `seatClosedByHand` reads the
          // reason the withdrawal never writes, so this branch clears only
          // what the withdrawal itself put there — R-BR's own scope.
          dbPatch.off_job_at = null;
          dbPatch.off_job_reason = null;
        }
      }
      const { data, error } = await supabase
        .from('project_parties')
        .update(dbPatch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new Error(asBidError(error));
      return data as ProjectParty;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: partyBidKeys.list(input.projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      // r21 major-1 / minor-5 (R-BS) — THIS DOOR MOVES `off_job_at` TOO.
      // Recording "They withdrew" closes the seat and correcting it away from
      // `withdrawn` re-opens it, so every reader of a seat's openness has to
      // be told: the authority root the Call Sheet's `authorityPhrase` reads,
      // and the household keys `useProjectHousehold`'s open-seat filter reads.
      // This was the seventh seat writer and the only one that told neither.
      void queryClient.invalidateQueries({ queryKey: partyAuthorityKeys.all });
      invalidateClientHouseholds(queryClient);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BRING FORWARD (SPEC §5.7, CRM-24, PR-b) — People room CRM · W3/P2
//
// Several people from a closed job onto a live one, in ONE confirm.
//
// WHAT IS WRITTEN ON THE SEAT, and what is not. PR-b's hybrid: the NAME AT THE
// TIME and the TRADE ON THE JOB are snapshots and are written here. Typed
// channels, the contact rule, consent and document expiries are NOT copied —
// they are read live off the card through `studio_contact_id`, which is why
// every pick must carry one. The phone and the email are written because they
// are the channel VALUES the studio's consent record is keyed on
// (`people_directory_seats.consent_status` reads `pp.phone_e164`), not because
// the seat holds an opinion about them: the verdict itself still lives in
// `studio_channel_consent` and travels with the number (R-AY).
//
// NEVER carried: prior pricing, prior project notes, prior `show_to_client`.
// The insert names none of those columns, so `show_to_client` is born at its
// own `false` default (PD-11's opt-in) and no bid column is written at all.
// ═══════════════════════════════════════════════════════════════════════════

export interface BringForwardPick {
  /** The rolodex card the seat is stamped with. Required: the live read of
   *  channels, rule, consent and paper hangs off it. */
  studioContactId: string;
  partyKind: PartyKind;
  /** Name at time (PR-b snapshot). */
  displayName: string;
  /** Trade on the job (PR-b snapshot). */
  trade?: string | null;
  /** The firm card, so the seat's paper word reads the same firm (R-BJ). */
  companyId?: string | null;
  /** Firm name at time. */
  companyName?: string | null;
  /** The number the consent record is keyed on — not a copy of the verdict. */
  phone?: string | null;
  email?: string | null;
}

export interface BringForwardInput {
  projectId: string;
  picks: readonly BringForwardPick[];
}

export interface BringForwardResult {
  added: Array<{ studioContactId: string; seatId: string; name: string }>;
  /** A pick the database refused, with the refusal in words. The rest still
   *  landed: one bad card must not cost the studio the other three. */
  refused: Array<{ studioContactId: string; name: string; reason: string }>;
}

/**
 * SPEC §5.7's terminal act, "Add N to the roster".
 *
 * One seat per pick, inserted in order. Consent is never written: the record
 * is the studio's and is keyed on the number, so Pete Rusk's seat is born
 * reading "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." with no
 * write at all (direction §5.2's Birth rule, F-12).
 */
export function useBringForward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BringForwardInput): Promise<BringForwardResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const result: BringForwardResult = { added: [], refused: [] };
      for (const pick of input.picks) {
        const { data, error } = await supabase
          .from('project_parties')
          .insert({
            project_id: input.projectId,
            party_kind: pick.partyKind,
            display_name: pick.displayName,
            company_name: pick.companyName?.trim() || null,
            company_id: pick.companyId || null,
            trade: pick.trade?.trim() || null,
            phone: pick.phone?.trim() || null,
            email: pick.email?.trim() || null,
            studio_contact_id: pick.studioContactId,
          })
          .select('id')
          .single();
        if (error) {
          result.refused.push({
            studioContactId: pick.studioContactId,
            name: pick.displayName,
            reason:
              typeof error === 'object' && error !== null && 'message' in error
                ? String((error as { message?: unknown }).message ?? '')
                : String(error),
          });
          continue;
        }
        result.added.push({
          studioContactId: pick.studioContactId,
          seatId: String((data as { id: string }).id),
          name: pick.displayName,
        });
      }
      return result;
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
      void queryClient.invalidateQueries({ queryKey: partyBidKeys.list(input.projectId) });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      invalidateClientHouseholds(queryClient);
    },
  });
}
