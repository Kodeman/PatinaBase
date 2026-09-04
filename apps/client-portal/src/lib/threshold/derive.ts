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
import { computeInvoiceRollup, visibleInvoices } from '@/app/budget/rollup';
import { journeyStageIndexForStatus } from '@/components/commercial/journey-stepper';
import type { ClientProjectSelections, ClientSelection } from '@/lib/commercial-documents';

import { byPlanOrder, type KeyMark, type KeyRoom, type MarkKind } from './plan-key';
import { houseOverageLine, roomVarianceLine } from './standing';

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
  /** When the client answered it. Optional: older callers do not send it. */
  answeredAt?: string | null;
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
  /** The published plan's own planned total — Σ its lines' targets. */
  plannedTotalCents?: number | null;
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
  /** What the working budget planned for this room, or null when it has no target. */
  targetCents: number | null;
  /** Σ clientLineTotalCents of the band's pieces — the same figure as `totalCents`. */
  agreedCents: number;
  /** "about eleven hundred past its target", or null when there is nothing to say. */
  varianceLine: string | null;
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
  /** The plan's own total where it has one, else Σ of the rooms' targets. */
  plannedCents: number | null;
  /**
   * The live authorized total where the plan has been read, else Σ of what the
   * bands have agreed. A house that has agreed money has a figure to stand at
   * whether or not a budget was ever published against it.
   */
  agreedCents: number | null;
  /**
   * Σ balance across EVERY open invoice, or null when none is open — not the
   * letterbox's one figure. The Making sums all of them and so does /budget;
   * a page that owed less than the budget page said would be a disagreement
   * the client has no way to resolve.
   */
  owedCents: number | null;
  /** How many invoices that total is spread across. */
  owedInvoiceCount: number;
  /** The soonest day the house owes on, off the first open invoice. */
  owedDueDate: string | null;
  /**
   * How many of those open invoices actually carry a due date — the count the
   * owed row's "first due" reads. Three open invoices of which one is dated
   * has one day to name, not a first of three.
   */
  owedDatedCount: number;
  heldCents: number | null;
  awaitingCents: number;
  /** "The dining room stands about forty-nine hundred past its target." */
  overageLine: string | null;
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

/** What became of the thing, in the word the line beneath it prints. */
export type PreviouslyState = 'answered' | 'standing' | 'sent' | 'signed';

export interface PreviouslyEntry {
  id: string;
  kind: 'note' | 'instrument';
  label: string;
  date: Date | null;
  state: PreviouslyState;
}

export interface ThresholdModel {
  marks: ThresholdMark[];
  /** Marks the key actually draws. `keySentence` takes THIS, not marks.length. */
  drawnMarkCount: number;
  bands: RoomBandModel[];
  road: RoadPieceModel[];
  ledger: HouseLedgerModel;
  letterbox: InvoiceModel | null;
  note: NoteModel | null;
  previously: PreviouslyEntry[];
  /** Phase approvals carry no room, so they always stand on the Doorstep. */
  doorstepAsks: ThresholdApproval[];
  /** Unit ids that moved since `previousReadAt`. Empty on a first reading. */
  changed: Set<string>;
  groundFloor: boolean;
  /** True while the rooms have not come back. Never a ground floor. */
  pending: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date off the database, as a Date the page can format.
 *
 * The split matters and is the house convention (making-spine.tsx's
 * parseSpineDate): a `YYYY-MM-DD` column is a CALENDAR DAY with no zone — an
 * invoice due on the fifteenth is due on the fifteenth wherever the client is
 * standing — so it is read as local midnight. `new Date('2026-06-19')` would
 * read UTC midnight instead, and every client west of Greenwich would be told
 * the day before. A full timestamptz is a real instant and keeps its zone; the
 * page then formats it on the client's own wall clock.
 */
export function parseSourceDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = DATE_ONLY.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMoment(value: string | null | undefined): number | null {
  return parseSourceDate(value)?.getTime() ?? null;
}

/** Soonest due first; an invoice with no due date waits at the back. */
function byDueDate(a: Invoice, b: Invoice): number {
  const left = parseMoment(a.due_date) ?? Number.POSITIVE_INFINITY;
  const right = parseMoment(b.due_date) ?? Number.POSITIVE_INFINITY;
  return left - right;
}

/**
 * Total over every note state, though only 'retired' notes reach Previously
 * today: a note that was answered says so, one that was simply taken down
 * reads as sent, and nothing falls through to a blank.
 */
function noteState(note: ThresholdNote): PreviouslyState {
  if (note.state === 'standing') return 'standing';
  if (note.state === 'answered' || note.answeredAt) return 'answered';
  return 'sent';
}

/** A figure the surface can print: a real number, above zero. */
function positive(cents: number | null | undefined): number | null {
  return typeof cents === 'number' && Number.isFinite(cents) && cents > 0 ? cents : null;
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
  const given = input.rooms;
  const pending = given === null || given === undefined;
  const rooms = pending ? [] : [...given].sort(byPlanOrder);

  // Origin discipline, verbatim from The Making: only a confirmed commercial
  // origin renders the selection-derived regions. Anything else is silence.
  const selections =
    input.selections?.origin === 'commercial' ? input.selections.selections : [];

  const roomIds = new Set(rooms.map((room) => room.id));
  // `changed` is EMPTY on a first reading, by rule. There is no mark to
  // measure against, so a first visit shows no ticks at all — the whole page
  // is new, and ticking every unit would say nothing. The ticks begin on the
  // second visit, which is the first one that can have a "since".
  const previousReadAt = parseMoment(input.previousReadAt);
  const changed = new Set<string>();
  const movedSinceMoment = (moment: number | null): boolean =>
    previousReadAt !== null && moment !== null && moment > previousReadAt;
  const movedSince = (value: string | null | undefined): boolean =>
    movedSinceMoment(parseMoment(value));

  // ── the doors ──────────────────────────────────────────────────────────────
  // A proposal knows nothing about rooms; its selections do. The door hangs on
  // the room holding the most of what the paper is worth, and on the Doorstep
  // when none of it lands in a room at all.
  // Only rooms the key actually draws can hold a door. A selection filed under
  // an archived or filtered-out room would otherwise elect a room that has no
  // rect, no band and no anchor — a door announced in the sentence that the
  // client cannot find anywhere on the page.
  const totalsByProposalRoom = new Map<string, Map<string, number>>();
  for (const selection of selections) {
    const proposalId = selection.instrument?.proposalId;
    if (!proposalId || !selection.roomId || !roomIds.has(selection.roomId)) continue;
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
    const anchor = roomId ? 'door' : 'doorstep';
    // The mark's OWN anchor, so since-yesterday lights the section the ask is
    // actually in — a doorstep proposal must not dim the doorstep and light a
    // door that does not hold it.
    if (movedSince(proposal.sentAt) || movedSince(proposal.updatedAt)) changed.add(anchor);
    return {
      id: `door:${proposal.id}`,
      kind: 'door' as MarkKind,
      roomId,
      label: proposal.title,
      anchor,
      proposalId: proposal.id,
      amountCents: proposal.totalAmountCents || 0,
    };
  });

  // ── the walls ──────────────────────────────────────────────────────────────
  // Detection verbatim from The Making's AcceptanceGate: a trade line the sub
  // has called substantially complete, with an instrument behind it to accept.
  //
  // The room falls away on the same terms as a door's: a wall can only hang in
  // a room the drawing actually draws. A trade line filed under an archived
  // room — or ANY room at all on the ground floor, where no room is drawn —
  // stands on the Doorstep instead. Without this it would render nowhere while
  // the standing sentence went on counting it, which is the one failure the
  // page must never have: an ask the client is told about and cannot find.
  const wallMarks: ThresholdMark[] = selections.flatMap((selection) => {
    const proposalId = selection.instrument?.proposalId ?? null;
    if (
      selection.kind !== 'trade' ||
      selection.tradeJourney !== 'substantially_complete' ||
      !proposalId
    ) {
      return [];
    }
    const roomId =
      selection.roomId && roomIds.has(selection.roomId) ? selection.roomId : null;
    const anchor = roomId ? 'wall' : 'doorstep';
    if (movedSince(input.selectionUpdatedAt?.[selection.id])) changed.add(anchor);
    return [
      {
        id: `wall:${selection.id}`,
        kind: 'wall' as MarkKind,
        roomId,
        label: selection.name,
        anchor,
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
    const agreedCents = pieces.reduce(
      (sum, piece) => sum + (piece.clientLineTotalCents || 0),
      0,
    );
    const targetCents =
      typeof room.targetCents === 'number' && Number.isFinite(room.targetCents)
        ? room.targetCents
        : null;
    return {
      roomId: room.id,
      name: room.name,
      anchor: `room-${room.id}`,
      totalCents: agreedCents,
      targetCents,
      agreedCents,
      varianceLine: roomVarianceLine(targetCents, agreedCents),
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

  // A piece that moved ticks the road it is on as well as the room it is bound
  // for; a roomless piece has only the road.
  if (road.some((piece) => movedSince(input.selectionUpdatedAt?.[piece.selectionId]))) {
    changed.add('road');
  }

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
  // One held figure per INSTRUMENT. Wall marks are per selection, so two trade
  // lines under one trade scope would otherwise report the draw twice.
  const heldInstruments = new Set(
    wallMarks
      .map((mark) => mark.proposalId)
      .filter((proposalId): proposalId is string => proposalId !== null),
  );
  const roomTargetTotal =
    targets.length > 0 ? targets.reduce((sum, cents) => sum + cents, 0) : null;
  const planTotal = positive(input.plannedTotalCents);
  const liveAuthorized = positive(input.liveAuthorizedTotalCents);
  const bandsAgreed = bands.reduce((sum, band) => sum + band.agreedCents, 0);

  const ledger: HouseLedgerModel = {
    plannedCents: planTotal ?? roomTargetTotal,
    agreedCents: liveAuthorized ?? (bandsAgreed > 0 ? bandsAgreed : null),
    owedCents:
      openInvoices.length > 0 ? computeInvoiceRollup(openInvoices).outstandingCents : null,
    owedInvoiceCount: openInvoices.length,
    owedDueDate: openInvoices[0]?.due_date ?? null,
    owedDatedCount: openInvoices.filter((invoice) => !!invoice.due_date).length,
    heldCents: heldDraws
      ? [...heldInstruments].reduce((sum, proposalId) => sum + (heldDraws[proposalId] ?? 0), 0)
      : null,
    awaitingCents: input.proposals.signatureGates.reduce(
      (sum, proposal) => sum + (proposal.totalAmountCents || 0),
      0,
    ),
    overageLine: houseOverageLine(bands),
  };

  // ── the note, and what came before it ──────────────────────────────────────
  // An 'answered' note is deliberately in neither place: it is no longer
  // standing on her page, and it is not history either — she answered it, so
  // the answer is the thing that carries on. Only 'retired' moves to Previously.
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
          state: noteState(candidate),
        };
      }),
    ...input.proposals.instrumentReceipts.map((receipt) => {
      const moment = parseMoment(receipt.date);
      return {
        id: receipt.id,
        kind: 'instrument' as const,
        label: receipt.label,
        date: moment === null ? null : new Date(moment),
        state: 'signed' as const,
      };
    }),
  ].sort((a, b) => {
    const left = a.date?.getTime() ?? Number.NEGATIVE_INFINITY;
    const right = b.date?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (left !== right) return right - left;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  if (previously.some((entry) => movedSinceMoment(entry.date?.getTime() ?? null))) {
    changed.add('previously');
  }

  return {
    marks,
    drawnMarkCount: marks.filter((mark) => mark.roomId !== null && roomIds.has(mark.roomId)).length,
    bands,
    road,
    ledger,
    letterbox,
    note,
    previously,
    doorstepAsks: input.approvals ?? [],
    changed,
    groundFloor: !pending && rooms.length === 0,
    pending,
  };
}
