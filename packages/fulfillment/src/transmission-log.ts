// @patina/fulfillment — transmission log line formatting (S3, spec §5.3).
//
// The transmission log IS `fulfillment_events` filtered to a PO — there is no
// separate table (R3.5 / Design). This module maps one event row to one
// append-only DM Mono line the composer renders, e.g.
//   SENT · EMAIL · JUL 16 · 10:58 · MSG 8F3A
//   ACK · PHONE · JUL 17 · 09:12 · REF DW-2214 · SHIPS AUG 22
//   NOTE · CLIENT ETA RE-DATED · DRAFT NOTE READY — SEND WITH N
// The keyword renders in sage; a `warn`-tone keyword (variance/exception) in
// terracotta (spec §5.3 / presentation). This module NEVER edits — a correction
// (a re-send) is simply another SENT line, appended in chronological order.

export interface TransmissionLogEvent {
  id: number;
  event_type: string;
  actor: string | null;
  refs: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface TransmissionLogLine {
  id: number;
  /** Leading keyword (SENT | ACK | NOTE | …) — rendered in sage/terracotta. */
  keyword: string;
  tone: 'normal' | 'warn';
  /** Uppercase mono detail segments, already joined by ' · '. */
  detail: string;
  createdAt: string;
}

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

interface FmtOpts {
  /** IANA zone for the date/time render; default is the runtime local zone. */
  timeZone?: string;
}

function partsOf(iso: string, timeZone?: string): Record<string, string> {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** "JUL 16" (uppercased month + day). */
export function fmtLogDate(iso: string, opts: FmtOpts = {}): string {
  const p = partsOf(iso, opts.timeZone);
  if (!p.month) return '';
  return `${p.month.toUpperCase()} ${p.day}`;
}

/** "10:58" (24h). */
export function fmtLogTime(iso: string, opts: FmtOpts = {}): string {
  const p = partsOf(iso, opts.timeZone);
  if (!p.hour) return '';
  // Intl renders 24h "00" for midnight; keep it as-is.
  return `${p.hour}:${p.minute}`;
}

/** A committed-ship date ("2026-08-22") → "AUG 22" for the ACK line. */
export function fmtShipDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value.toUpperCase();
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])}`;
}

/** A message/reference id → a short uppercase tail, e.g. a Resend id → "8F3A". */
export function shortRef(ref: string): string {
  const cleaned = ref.replace(/[^A-Za-z0-9]/g, '');
  const tail = cleaned.slice(-4);
  return tail.toUpperCase();
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Map a fulfillment_events row to its transmission-log line, or null for an
 * event type the log doesn't surface. Method/ref live in the event's `refs`
 * (fulfillment_log_event stores the 8th arg there; `payload` is {before,after}).
 */
export function toTransmissionLogLine(
  e: TransmissionLogEvent,
  opts: FmtOpts = {},
): TransmissionLogLine | null {
  const refs = e.refs ?? {};
  const date = fmtLogDate(e.created_at, opts);
  const time = fmtLogTime(e.created_at, opts);
  const base = { id: e.id, createdAt: e.created_at, tone: 'normal' as const };

  switch (e.event_type) {
    case 'po.transmitted': {
      const method = (str(refs.method) ?? 'email').toUpperCase();
      const ref = str(refs.ref);
      const refSeg =
        method === 'EMAIL'
          ? ref
            ? `MSG ${shortRef(ref)}`
            : 'NO MSG ID'
          : ref
            ? `REF ${ref.toUpperCase()}`
            : 'NO REF';
      return { ...base, keyword: 'SENT', detail: [method, date, time, refSeg].join(' · ') };
    }
    case 'po.acknowledged': {
      const method = (str(refs.method) ?? '').toUpperCase();
      const ref = str(refs.ref);
      const committed = str(refs.committed_ship);
      const segs = [method, date, time].filter(Boolean);
      if (ref) segs.push(`REF ${ref.toUpperCase()}`);
      if (committed) segs.push(`SHIPS ${fmtShipDate(committed)}`);
      return { ...base, keyword: 'ACK', detail: segs.join(' · ') };
    }
    case 'notification.drafted': {
      const transition = str(refs.transition);
      const head = transition
        ? transition.replace(/_/g, ' ').toUpperCase()
        : 'CLIENT NOTE';
      return {
        ...base,
        keyword: 'NOTE',
        detail: [head, 'DRAFT NOTE READY — SEND WITH N'].join(' · '),
      };
    }
    case 'notification.sent': {
      return { ...base, keyword: 'NOTE', detail: ['CLIENT NOTE SENT', date, time].join(' · ') };
    }
    default:
      return null;
  }
}

/** Map + drop the events the log doesn't surface, preserving chronological
 *  (ascending-id) order — the append-only log the composer renders. */
export function toTransmissionLog(
  events: TransmissionLogEvent[],
  opts: FmtOpts = {},
): TransmissionLogLine[] {
  return events
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((e) => toTransmissionLogLine(e, opts))
    .filter((l): l is TransmissionLogLine => l !== null);
}
