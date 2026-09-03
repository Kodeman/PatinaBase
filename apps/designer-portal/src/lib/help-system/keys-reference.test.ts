/**
 * "The keys" reference data (onboarding Wave 1, task L5).
 *
 * The doorway rows are generated from the Studio Surface Registry's own
 * `shortcut` field, never hand-typed — a re-chord must never leave this page
 * lying (proposal §7 rung 2). These tests pin that derivation.
 */
import { buildKeysReference } from './keys-reference';
import { ALL_STUDIO_SURFACES } from '../document/registry';

describe('buildKeysReference', () => {
  const sections = buildKeysReference();

  it('prints ⌘K first, under Anywhere', () => {
    expect(sections[0].heading).toBe('Anywhere');
    expect(sections[0].rows[0].keys).toEqual(['⌘', 'K']);
  });

  it('derives the Orders chord from the registry', () => {
    const rooms = sections.find((s) => s.heading === 'Rooms and books');
    expect(rooms).toBeDefined();
    expect(rooms!.rows).toContainEqual(
      expect.objectContaining({ keys: ['G', 'O'], label: 'Orders' }),
    );
  });

  it('carries every chorded surface the registry declares, and no others', () => {
    const chorded = ALL_STUDIO_SURFACES.filter(
      (s) => s.shortcut && s.shortcut.length === 2 && s.shortcut[0] === 'g',
    );
    const rooms = sections.find((s) => s.heading === 'Rooms and books')!;
    expect(rooms.rows).toHaveLength(chorded.length);
    expect(rooms.rows.map((r) => r.label).sort()).toEqual(
      chorded.map((s) => s.label).sort(),
    );
    for (const row of rooms.rows) {
      expect(row.keys[0]).toBe('G');
      expect(row.keys[1]).toMatch(/^[A-Z]$/);
    }
  });

  it('names the six ⌘/Ctrl+Enter save sites', () => {
    const writing = sections.find((s) => s.heading === 'While writing')!;
    expect(writing.rows).toHaveLength(6);
    for (const row of writing.rows) expect(row.keys).toEqual(['⌘', 'Enter']);
  });

  it('teaches the Board Room set and the walkthrough keys', () => {
    const headings = sections.map((s) => s.heading);
    expect(headings).toEqual([
      'Anywhere',
      'Rooms and books',
      'While writing',
      'The Board Room',
      'The walkthrough',
    ]);
    const board = sections.find((s) => s.heading === 'The Board Room')!;
    expect(board.rows.map((r) => r.label)).toContain('Tidy the board');
  });

  it('never lists the internal Tester Notes key', () => {
    const flat = sections.flatMap((s) => s.rows);
    expect(flat.some((r) => /tester/i.test(r.label))).toBe(false);
    expect(flat.some((r) => r.keys.includes('F'))).toBe(false);
  });

  it('gives every row a where-line', () => {
    for (const section of sections) {
      for (const row of section.rows) {
        expect(row.where.length).toBeGreaterThan(0);
        expect(row.label).not.toMatch(/!/);
      }
    }
  });
});
