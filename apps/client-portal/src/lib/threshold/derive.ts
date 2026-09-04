/* ── The threshold model ────────────────────────────────────────────────────
   The ONE join of rooms, selections, proposals, invoices, notes and the
   client's last reading mark. Everything the page draws — the marks on the
   key, the room bands, the road, the house ledger, the letterbox, the note,
   Previously, and what moved since she last looked — is decided here, once,
   in a pure function that never touches React, the network or the clock.

   Two rules of the surface are load-bearing in this file:

   · Absence is silence. A payload that is not commercial in origin, or that
     has not arrived, yields empty bands and no marks — never an error and
     never a placeholder. The house simply has nothing to say yet.
   · The ground floor is a settled fact, not a loading state. `groundFloor`
     is true only once the rooms have come back and there are none; while
     they are still coming, `pending` is true and the house holds its
     place. ─────────────────────────────────────────────────────────────── */

import type { Invoice } from '@patina/supabase';
import type { FFEStageKey } from '@patina/types';
import { invoiceBalanceCents } from '@patina/shared';

// The client Budget rollup owns which invoices count at all (drafts are
// pre-issue, voids are cancelled). Imported rather than restated so the
// threshold and /budget can never disagree about what is open; the module
// lives under app/budget and stays there.
import { visibleInvoices } from '@/app/budget/rollup';
import { journeyStageIndexForStatus } from '@/components/commercial/journey-stepper';
import type { ClientProjectSelections, ClientSelection } from '@/lib/commercial-documents';

import type { KeyMark, KeyRoom, MarkKind } from './plan-key';

/** A piece is still on the road until it has reached the house. */
const DELIVERED_STOP = journeyStageIndexForStatus('delivered');

const OPEN_INVOICE_STATUSES = new Set<Invoice['status']>(['sent', 'partially_paid']);

// ── input ────────────────────────────────────────────────────────────────────

/** A room, plus whatever the working budget has planned for it. */
export interface ThresholdRoom extends KeyRoom {
  targetCents?: number | null;
}

/** A document sent and waiting for the client's name. */
export interface ThresholdProposal {
  id: string;
  title: string;
  totalAmountCents: number;
  sentAt: string | null;
  updatedAt: string | null;
}

/** Something already signed or executed — history, not an ask. */
export interface ThresholdReceipt {
  id: string;
  label: string;
  date: string | null;
}

export type ThresholdNoteState = 'standing' | 'answered' | 'retired';

export interface ThresholdNoteEnclosure {
  kind: 'proposal' | 'trade_scope' | 'invoice';
  id: string;
}

export interface ThresholdNote {
  id: string;
  body: string;
  state: ThresholdNoteState;
  sentAt: string | null;
  retiredAt: string | null;
  enclosures: ThresholdNoteEnclosure[];
}

/** A phase approval. It carries no room, so it always stands on the Doorstep. */
export interface ThresholdApproval {
  id: string;
  title: string;
  phaseId: string | null;
}

export interface ThresholdInput {
  /** Null or undefined while the rooms are still coming back. */
  rooms: ThresholdRoom[] | null | undefined;
  selections: ClientProjectSelections | null | undefined;
  proposals: {
    signatureGates: ThresholdProposal[];
    instrumentReceipts: ThresholdReceipt[];
  };
  invoices: Invoice[];
  approvals: ThresholdApproval[];
  notes: ThresholdNote[];
  /** When the client last read this page, from `mark_project_read`. */
  previousReadAt: string | null;
  today: Date;
  /** The live authorized total, when the client plan has been read. */
  liveAuthorizedTotalCents?: number | null;
  /** Draw cents held behind each trade instrument, keyed by proposal id. */
  heldDrawCentsByProposalId?: Record<string, number> | null;
  /** When each selection last moved, keyed by selection id, where known. */
  selectionUpdatedAt?: Record<string, string> | null;
}

// ── model ────────────────────────────────────────────────────────────────────

/**
 * A mark on the key, with the facts the key's list and the house ledger need
 * behind it. Widens `KeyMark`, so it hands straight to `planKeyGeometry`.
 */
export interface ThresholdMark extends KeyMark {
  id: string;
  proposalId: string | null;
  amountCents: number;
}

export interface RoomBandModel {
  roomId: string;
  name: string;
  anchor: string;
  totalCents: number;
  pieces: ClientSelection[];
  marks: ThresholdMark[];
}

export interface RoadPieceModel {
  selectionId: string;
  name: string;
  roomId: string | null;
  roomName: string;
  logisticsStatus: FFEStageKey;
  stageIndex: number;
}

export interface HouseLedgerModel {
  /** Σ of the rooms' targets, or null when no room carries one. */
  plannedCents: number | null;
  agreedCents: number | null;
  /** The soonest-due open invoice's balance, or null when nothing is due. */
  owedCents: number | null;
  heldCents: number | null;
  awaitingCents: number;
}

export interface InvoiceModel {
  id: string;
  number: string | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string | null;
}

export interface NoteModel {
  id: string;
  body: string;
  sentAt: string | null;
  enclosures: ThresholdNoteEnclosure[];
}

export interface PreviouslyEntry {
  id: string;
  kind: 'note' | 'instrument';
  label: string;
  date: Date | null;
}

export interface ThresholdModel {
  marks: ThresholdMark[];
  bands: RoomBandModel[];
  road: RoadPieceModel[];
  ledger: HouseLedgerModel;
  letterbox: InvoiceModel | null;
  note: NoteModel | null;
  previously: PreviouslyEntry[];
  /** Unit ids that moved since `previousReadAt`. Empty on a first reading. */
  changed: Set<string>;
  groundFloor: boolean;
  /** True while the rooms have not come back. Never a ground floor. */
  pending: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseMoment(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function byPlanOrder(a: ThresholdRoom, b: ThresholdRoom): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Soonest due first; an invoice with no due date waits at the back. */
function byDueDate(a: Invoice, b: Invoice): number {
  const left = parseMoment(a.due_date) ?? Number.POSITIVE_INFINITY;
  const right = parseMoment(b.due_date) ?? Number.POSITIVE_INFINITY;
  return left - right;
}

function toInvoiceModel(invoice: Invoice): InvoiceModel {
  return {
    id: invoice.id,
    number: invoice.invoice_number,
    totalCents: invoice.total_cents || 0,
    paidCents: invoice.amount_paid_cents || 0,
    balanceCents: invoiceBalanceCents(invoice),
    dueDate: invoice.due_date,
  };
}

// ── the join ─────────────────────────────────────────────────────────────────

export function deriveThreshold(input: ThresholdInput): ThresholdModel {
  const pending = input.rooms === null || input.rooms === undefined;
  const rooms = pending ? [] : [...(input.rooms as ThresholdRoom[])].sort(byPlanOrder);

  // Origin discipline, verbatim from The Making: only a confirmed commercial
  // origin renders the selection-derived regions. Anything else is silence.
  const selections =
    input.selections?.origin === 'commercial' ? input.selections.selections : [];

  const roomIds = new Set(rooms.map((room) => room.id));
  const previousReadAt = parseMoment(input.previousReadAt);
  const changed = new Set<string>();
  const movedSince = (value: string | null | undefined): boolean => {
    if (previousReadAt === null) return false;
    const moment = parseMoment(value);
    return moment !== null && moment > previousReadAt;
  };

  // ── the doors ──────────────────────────────────────────────────────────────
  // A proposal knows nothing about rooms; its selections do. The door hangs on
  // the room holding the most of what the paper is worth, and on the Doorstep
  // when none of it lands in a room at all.
  const totalsByProposalRoom = new Map<string, Map<string, number>>();
  for (const selection of selections) {
    const proposalId = selection.instrument?.proposalId;
    if (!proposalId || !selection.roomId) continue;
    const byRoom = totalsByProposalRoom.get(proposalId) ?? new Map<string, number>();
    byRoom.set(
      selection.roomId,
      (byRoom.get(selection.roomId) ?? 0) + (selection.clientLineTotalCents || 0),
    );
    totalsByProposalRoom.set(proposalId, byRoom);
  }

  const roomRank = new Map(rooms.map((room, index) => [room.id, index]));
  const heaviestRoom = (proposalId: string): string | null => {
    const byRoom = totalsByProposalRoom.get(proposalId);
    if (!byRoom || byRoom.size === 0) return null;
    let winner: string | null = null;
    let winning = -1;
    for (const [roomId, cents] of byRoom) {
      const rank = roomRank.get(roomId) ?? Number.MAX_SAFE_INTEGER;
      const winnerRank = winner === null ? Number.MAX_SAFE_INTEGER : roomRank.get(winner) ?? Number.MAX_SAFE_INTEGER;
      if (cents > winning || (cents === winning && rank < winnerRank)) {
        winner = roomId;
        winning = cents;
      }
    }
    return winner;
  };

  const doorMarks: ThresholdMark[] = input.proposals.signatureGates.map((proposal) => {
    const roomId = heaviestRoom(proposal.id);
    if (movedSince(proposal.sentAt) || movedSince(proposal.updatedAt)) changed.add('door');
    return {
      id: `door:${proposal.id}`,
      kind: 'door' as MarkKind,
      roomId,
      label: proposal.title,
      anchor: roomId ? 'door' : 'doorstep',
      proposalId: proposal.id,
      amountCents: proposal.totalAmountCents || 0,
    };
  });

  // ── the walls ──────────────────────────────────────────────────────────────
  // Detection verbatim from The Making's AcceptanceGate: a trade line the sub
  // has called substantially complete, with an instrument behind it to accept.
  const wallMarks: ThresholdMark[] = selections.flatMap((selection) => {
    const proposalId = selection.instrument?.proposalId ?? null;
    if (
      selection.kind !== 'trade' ||
      selection.tradeJourney !== 'substantially_complete' ||
      !proposalId
    ) {
      return [];
    }
    if (movedSince(input.selectionUpdatedAt?.[selection.id])) changed.add('wall');
    return [
      {
        id: `wall:${selection.id}`,
        kind: 'wall' as MarkKind,
        roomId: selection.roomId,
        label: selection.name,
        anchor: selection.roomId ? 'wall' : 'doorstep',
        proposalId,
        amountCents: selection.clientLineTotalCents || 0,
      },
    ];
  });

  const marks = [...doorMarks, ...wallMarks];

  // ── the bands ──────────────────────────────────────────────────────────────
  const piecesByRoom = new Map<string, ClientSelection[]>();
  for (const selection of selections) {
    if (!selection.roomId || !roomIds.has(selection.roomId)) continue;
    const list = piecesByRoom.get(selection.roomId) ?? [];
    list.push(selection);
    piecesByRoom.set(selection.roomId, list);
    if (movedSince(input.selectionUpdatedAt?.[selection.id])) {
      changed.add(`room-${selection.roomId}`);
    }
  }

  const bands: RoomBandModel[] = rooms.map((room) => {
    const pieces = piecesByRoom.get(room.id) ?? [];
    return {
      roomId: room.id,
      name: room.name,
      anchor: `room-${room.id}`,
      totalCents: pieces.reduce((sum, piece) => sum + (piece.clientLineTotalCents || 0), 0),
      pieces,
      marks: marks.filter((mark) => mark.roomId === room.id),
    };
  });

  // ── the road ───────────────────────────────────────────────────────────────
  const road: RoadPieceModel[] = selections.flatMap((selection) => {
    if (selection.kind !== 'furnishings') return [];
    const stageIndex = journeyStageIndexForStatus(selection.logisticsStatus);
    if (selection.roomId !== null && stageIndex >= DELIVERED_STOP) return [];
    return [
      {
        selectionId: selection.id,
        name: selection.name,
        roomId: selection.roomId,
        roomName: selection.roomName,
        logisticsStatus: selection.logisticsStatus,
        stageIndex,
      },
    ];
  });

  // ── the letterbox and the ledger ───────────────────────────────────────────
  const openInvoices = visibleInvoices(input.invoices ?? [])
    .filter((invoice) => OPEN_INVOICE_STATUSES.has(invoice.status))
    .sort(byDueDate);
  const letterbox = openInvoices.length > 0 ? toInvoiceModel(openInvoices[0]) : null;
  if (openInvoices.length > 0 && movedSince(openInvoices[0].updated_at)) changed.add('letterbox');

  const targets = rooms
    .map((room) => room.targetCents)
    .filter((cents): cents is number => typeof cents === 'number' && Number.isFinite(cents));

  const heldDraws = input.heldDrawCentsByProposalId;
  const ledger: HouseLedgerModel = {
    plannedCents: targets.length > 0 ? targets.reduce((sum, cents) => sum + cents, 0) : null,
    agreedCents:
      typeof input.liveAuthorizedTotalCents === 'number' &&
      Number.isFinite(input.liveAuthorizedTotalCents)
        ? input.liveAuthorizedTotalCents
        : null,
    owedCents: letterbox ? letterbox.balanceCents : null,
    heldCents: heldDraws
      ? wallMarks.reduce(
          (sum, mark) => sum + (mark.proposalId ? heldDraws[mark.proposalId] ?? 0 : 0),
          0,
        )
      : null,
    awaitingCents: input.proposals.signatureGates.reduce(
      (sum, proposal) => sum + (proposal.totalAmountCents || 0),
      0,
    ),
  };

  // ── the note, and what came before it ──────────────────────────────────────
  const notes = input.notes ?? [];
  const standing = notes.find((candidate) => candidate.state === 'standing') ?? null;
  const note: NoteModel | null = standing
    ? {
        id: standing.id,
        body: standing.body,
        sentAt: standing.sentAt,
        enclosures: standing.enclosures ?? [],
      }
    : null;
  if (standing && movedSince(standing.sentAt)) changed.add('note');

  const previously: PreviouslyEntry[] = [
    ...notes
      .filter((candidate) => candidate.state === 'retired')
      .map((candidate) => {
        const moment = parseMoment(candidate.retiredAt ?? candidate.sentAt);
        return {
          id: candidate.id,
          kind: 'note' as const,
          label: candidate.body,
          date: moment === null ? null : new Date(moment),
        };
      }),
    ...input.proposals.instrumentReceipts.map((receipt) => {
      const moment = parseMoment(receipt.date);
      return {
        id: receipt.id,
        kind: 'instrument' as const,
        label: receipt.label,
        date: moment === null ? null : new Date(moment),
      };
    }),
  ].sort((a, b) => {
    const left = a.date?.getTime() ?? Number.NEGATIVE_INFINITY;
    const right = b.date?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (left !== right) return right - left;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    marks,
    bands,
    road,
    ledger,
    letterbox,
    note,
    previously,
    changed,
    groundFloor: !pending && rooms.length === 0,
    pending,
  };
}
