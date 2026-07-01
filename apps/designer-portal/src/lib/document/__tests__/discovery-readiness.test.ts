import {
  deriveDiscoveryReadiness,
  deriveBlockDone,
  capturedRooms,
  capturedLifestyle,
  ESSENTIAL_KEYS,
  type DiscoveryFacts,
} from '../discovery-readiness';

const EMPTY: DiscoveryFacts = {
  project_type: null,
  rooms: [],
  budget_max_cents: null,
  target_date: null,
  hard_date: null,
  style_tag_ids: [],
  style_keywords: [],
  lifestyle: [],
  keep_items: [],
  avoid_items: [],
  decision_makers: [],
  room_scan_id: null,
  site_notes: null,
};

/** The five essentials filled (nothing deepening). */
const FIVE: DiscoveryFacts = {
  ...EMPTY,
  project_type: 'full_room',
  rooms: [{ name: 'Living' }, { name: 'Dining' }],
  budget_max_cents: 8_000_000,
  target_date: '2026-11-27',
  style_keywords: ['warm minimal'],
  lifestyle: [{ room: 'Living', who: '2 adults', how: 'movie nights' }],
};

describe('deriveBlockDone — each essential gate', () => {
  it('scope needs BOTH a project type and ≥1 room', () => {
    expect(deriveBlockDone({ ...EMPTY, project_type: 'full_room' }).scope).toBe(false);
    expect(deriveBlockDone({ ...EMPTY, rooms: [{ name: 'A' }] }).scope).toBe(false);
    expect(
      deriveBlockDone({ ...EMPTY, project_type: 'full_room', rooms: [{ name: 'A' }] }).scope
    ).toBe(true);
  });

  it('budget needs a max', () => {
    expect(deriveBlockDone({ ...EMPTY, budget_max_cents: null }).budget).toBe(false);
    expect(deriveBlockDone({ ...EMPTY, budget_max_cents: 0 }).budget).toBe(true);
    expect(deriveBlockDone({ ...EMPTY, budget_max_cents: 8_000_000 }).budget).toBe(true);
  });

  it('timeline accepts target OR hard date', () => {
    expect(deriveBlockDone({ ...EMPTY, target_date: '2026-11-27' }).timeline).toBe(true);
    expect(deriveBlockDone({ ...EMPTY, hard_date: '2026-12-14' }).timeline).toBe(true);
    expect(deriveBlockDone(EMPTY).timeline).toBe(false);
  });

  it('style accepts a tag OR a keyword', () => {
    expect(deriveBlockDone({ ...EMPTY, style_tag_ids: ['s1'] }).style).toBe(true);
    expect(deriveBlockDone({ ...EMPTY, style_keywords: ['warm'] }).style).toBe(true);
    expect(deriveBlockDone(EMPTY).style).toBe(false);
  });

  it('lifestyle needs ≥1 row WITH content (who or how) — F5', () => {
    expect(
      deriveBlockDone({ ...EMPTY, lifestyle: [{ room: 'Living', who: '2 adults' }] }).lifestyle
    ).toBe(true);
    expect(
      deriveBlockDone({ ...EMPTY, lifestyle: [{ room: 'Living', how: 'movie nights' }] }).lifestyle
    ).toBe(true);
    // A room selection alone (or a fully empty row) says nothing about how they live.
    expect(deriveBlockDone({ ...EMPTY, lifestyle: [{ room: 'Living' }] }).lifestyle).toBe(false);
    expect(deriveBlockDone({ ...EMPTY, lifestyle: [{}] }).lifestyle).toBe(false);
    expect(deriveBlockDone(EMPTY).lifestyle).toBe(false);
  });

  it('F5 — empty rows never satisfy scope or lifestyle', () => {
    // Three "+ Add a room" clicks with no names is NOT "3 rooms".
    const emptyRows = {
      ...EMPTY,
      project_type: 'full_room',
      rooms: [{}, {}, {}],
      lifestyle: [{}, {}, {}],
    };
    const done = deriveBlockDone(emptyRows);
    expect(done.scope).toBe(false);
    expect(done.lifestyle).toBe(false);
    // Whitespace-only names don't count either.
    expect(
      deriveBlockDone({ ...emptyRows, rooms: [{ name: '   ' }] }).scope
    ).toBe(false);
    // One real row among empties is enough.
    expect(
      deriveBlockDone({ ...emptyRows, rooms: [{}, { name: 'Living' }] }).scope
    ).toBe(true);
  });

  it('capturedRooms / capturedLifestyle count only content-bearing rows', () => {
    expect(capturedRooms([{}, { name: 'Living' }, { name: ' ' }])).toHaveLength(1);
    expect(capturedRooms([])).toHaveLength(0);
    expect(
      capturedLifestyle([{ room: 'Household' }, { room: 'Living', who: 'kids' }, {}])
    ).toHaveLength(1);
  });

  it('deepening: keep/avoid, deciders, site & scan', () => {
    expect(deriveBlockDone({ ...EMPTY, keep_items: [{ label: 'credenza' }] }).keep_avoid).toBe(true);
    expect(deriveBlockDone({ ...EMPTY, avoid_items: [{ label: 'glass' }] }).keep_avoid).toBe(true);
    expect(deriveBlockDone({ ...EMPTY, decision_makers: [{ name: 'Maya' }] }).deciders).toBe(true);
    expect(deriveBlockDone({ ...EMPTY, room_scan_id: 'scan-1' }).site_scan).toBe(true);
    expect(deriveBlockDone({ ...EMPTY, site_notes: "9'2\" ceilings" }).site_scan).toBe(true);
  });
});

describe('deriveDiscoveryReadiness', () => {
  it('empty → 0/5, not ready, no fill', () => {
    const r = deriveDiscoveryReadiness(EMPTY);
    expect(r.essentialsDone).toBe(0);
    expect(r.ready).toBe(false);
    expect(r.fill).toEqual([0, 0, 0]);
  });

  it('four essentials → not ready, CTA disabled', () => {
    const four = { ...FIVE, lifestyle: [] }; // drop lifestyle
    const r = deriveDiscoveryReadiness(four);
    expect(r.essentialsDone).toBe(4);
    expect(r.ready).toBe(false);
    expect(r.fill[0]).toBeCloseTo(4 / 5);
    expect(r.fill[2]).toBe(0);
  });

  it('five essentials → ready, CTA enabled, line 1 full', () => {
    const r = deriveDiscoveryReadiness(FIVE);
    expect(r.essentialsDone).toBe(ESSENTIAL_KEYS.length);
    expect(r.ready).toBe(true);
    expect(r.fill[0]).toBe(1);
    expect(r.fill[2]).toBe(1);
  });

  it('depth (line 2) counts all eight blocks', () => {
    const all = {
      ...FIVE,
      keep_items: [{ label: 'credenza' }],
      decision_makers: [{ name: 'Maya' }],
      room_scan_id: 'scan-1',
    };
    expect(deriveDiscoveryReadiness(all).fill[1]).toBe(1);
    expect(deriveDiscoveryReadiness(FIVE).fill[1]).toBeCloseTo(5 / 8);
  });
});
