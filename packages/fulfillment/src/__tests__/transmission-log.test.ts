import { describe, it, expect } from 'vitest';
import {
  toTransmissionLogLine,
  toTransmissionLog,
  shortRef,
  fmtShipDate,
  type TransmissionLogEvent,
} from '../transmission-log';

// Deterministic zone so the date/time segments don't depend on the CI host.
const TZ = { timeZone: 'UTC' };

function ev(partial: Partial<TransmissionLogEvent>): TransmissionLogEvent {
  return {
    id: 1,
    event_type: 'po.transmitted',
    actor: 'operator@patina.cloud',
    refs: {},
    payload: null,
    created_at: '2026-07-16T15:58:00Z',
    ...partial,
  };
}

describe('shortRef / fmtShipDate', () => {
  it('shortRef takes the uppercase 4-char tail, ignoring punctuation', () => {
    expect(shortRef('dryrun_1784290204099')).toBe('4099');
    expect(shortRef('re_8f3a')).toBe('8F3A');
  });
  it('fmtShipDate renders a bare date as MON D', () => {
    expect(fmtShipDate('2026-08-22')).toBe('AUG 22');
  });
});

describe('toTransmissionLogLine', () => {
  it('po.transmitted / email → SENT · EMAIL · … · MSG <tail>', () => {
    const line = toTransmissionLogLine(
      ev({ event_type: 'po.transmitted', refs: { method: 'email', ref: 're_9c8F3A' } }),
      TZ,
    )!;
    expect(line.keyword).toBe('SENT');
    expect(line.tone).toBe('normal');
    expect(line.detail).toBe('EMAIL · JUL 16 · 15:58 · MSG 8F3A');
  });

  it('po.transmitted / portal → SENT · PORTAL · … · REF <UPPER>', () => {
    const line = toTransmissionLogLine(
      ev({ event_type: 'po.transmitted', refs: { method: 'portal', ref: 'rb-portal-88213' } }),
      TZ,
    )!;
    expect(line.detail).toBe('PORTAL · JUL 16 · 15:58 · REF RB-PORTAL-88213');
  });

  it('po.transmitted / csv → SENT · CSV · … · REF <UPPER>', () => {
    const line = toTransmissionLogLine(
      ev({ event_type: 'po.transmitted', refs: { method: 'csv', ref: 'batch-2026-07-17.csv' } }),
      TZ,
    )!;
    expect(line.keyword).toBe('SENT');
    expect(line.detail.startsWith('CSV · JUL 16 · 15:58 · REF BATCH-2026-07-17.CSV')).toBe(true);
  });

  it('po.acknowledged → ACK · METHOD · … · REF … · SHIPS <MON D>', () => {
    const line = toTransmissionLogLine(
      ev({
        id: 2,
        event_type: 'po.acknowledged',
        created_at: '2026-07-17T09:12:00Z',
        refs: { method: 'phone', ref: 'DW-2214', committed_ship: '2026-08-22' },
      }),
      TZ,
    )!;
    expect(line.keyword).toBe('ACK');
    expect(line.detail).toBe('PHONE · JUL 17 · 09:12 · REF DW-2214 · SHIPS AUG 22');
  });

  it('notification.drafted → NOTE · <TRANSITION> · DRAFT NOTE READY — SEND WITH N', () => {
    const line = toTransmissionLogLine(
      ev({ id: 3, event_type: 'notification.drafted', refs: { transition: 'eta_change' } }),
      TZ,
    )!;
    expect(line.keyword).toBe('NOTE');
    expect(line.detail).toBe('ETA CHANGE · DRAFT NOTE READY — SEND WITH N');
  });

  it('returns null for an event the log does not surface', () => {
    expect(toTransmissionLogLine(ev({ event_type: 'ledger.posted' }), TZ)).toBeNull();
  });
});

describe('toTransmissionLog', () => {
  it('sorts ascending by id, drops unsurfaced events (append-only, chronological)', () => {
    const events: TransmissionLogEvent[] = [
      ev({ id: 3, event_type: 'notification.drafted', refs: { transition: 'eta_change' } }),
      ev({ id: 1, event_type: 'po.transmitted', refs: { method: 'email', ref: 're_aaaa' } }),
      ev({ id: 2, event_type: 'ledger.posted' }), // dropped
      ev({ id: 4, event_type: 'po.acknowledged', refs: { method: 'phone' } }),
    ];
    const log = toTransmissionLog(events, TZ);
    expect(log.map((l) => l.keyword)).toEqual(['SENT', 'NOTE', 'ACK']);
    expect(log.map((l) => l.id)).toEqual([1, 3, 4]);
  });

  it('a correction (a second SENT) appends as another line — never edits the first', () => {
    const events: TransmissionLogEvent[] = [
      ev({ id: 1, event_type: 'po.transmitted', refs: { method: 'email', ref: 're_first' } }),
      ev({ id: 5, event_type: 'po.transmitted', refs: { method: 'email', ref: 're_resend' } }),
    ];
    const log = toTransmissionLog(events, TZ);
    expect(log).toHaveLength(2);
    expect(log[0].detail).toContain('MSG IRST');
    expect(log[1].detail).toContain('MSG SEND');
  });
});
