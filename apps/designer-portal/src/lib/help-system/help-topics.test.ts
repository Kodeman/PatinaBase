/**
 * Help topics (help-desk Wave 0) — pins the shelf shape, the prefix routing
 * in topicLabelFor, and the no-raw-key-ever guarantee.
 */
import { FEATURED_SURFACE_KEYS, HELP_TOPICS, topicLabelFor } from './help-topics';

// The surface-key shape law (kept local — see document-surface-keys.ts for
// why nothing here imports the @patina/help-system barrel). Prefixes may be
// single-segment (e.g. 'client-portal'), hence the trailing `*` not `+`.
const PREFIX_REGEX = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;

describe('HELP_TOPICS shape', () => {
  it('ships the 8 desk-era shelves, in reading order', () => {
    expect(HELP_TOPICS.map((t) => t.label)).toEqual([
      'Getting started',
      'The Desk & the Studio',
      'Your documents',
      'Rooms',
      'Ledgers & money',
      'Ideas & vocabulary',
      'How do I…',
      'For your clients',
    ]);
  });

  it('every topic has a non-empty description and at least one well-formed prefix', () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.description.trim().length).toBeGreaterThan(0);
      expect(topic.prefixes.length).toBeGreaterThan(0);
      for (const prefix of topic.prefixes) {
        expect(prefix).toMatch(PREFIX_REGEX);
      }
    }
  });

  it('no prefix is claimed by two topics', () => {
    const all = HELP_TOPICS.flatMap((t) => t.prefixes);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('topicLabelFor', () => {
  it('maps an exact prefix to its shelf', () => {
    expect(topicLabelFor('designer-portal/document/guide')).toBe('Getting started');
    expect(topicLabelFor('designer-portal/document/orders')).toBe('Ledgers & money');
    expect(topicLabelFor('client-portal')).toBe('For your clients');
  });

  it('maps a descendant key to its shelf', () => {
    expect(topicLabelFor('designer-portal/document/guide/what-is-the-desk')).toBe('Getting started');
    expect(topicLabelFor('designer-portal/document/orders/receiving')).toBe('Ledgers & money');
    expect(topicLabelFor('designer-portal/document/desk/field')).toBe('The Desk & the Studio');
    expect(topicLabelFor('designer-portal/document/library/piece')).toBe('Rooms');
    expect(topicLabelFor('client-portal/proposals/detail/sign')).toBe('For your clients');
  });

  it('matches on segment boundaries, never bare startsWith', () => {
    // 'margin-note' must not be swallowed by the 'margin' prefix.
    expect(topicLabelFor('designer-portal/document/margin')).toBe('Your documents');
    expect(topicLabelFor('designer-portal/document/margin-note')).not.toBe('Your documents');
  });

  it('humanizes unclaimed keys — portal segment stripped, title-cased', () => {
    expect(topicLabelFor('designer-portal/settings/notifications')).toBe(
      'Settings Notifications',
    );
    expect(topicLabelFor('designer-portal/document/margin-note')).toBe('Document Margin Note');
  });

  it('NEVER returns a raw key as-is', () => {
    const unclaimed = [
      'designer-portal/document/margin-note',
      'designer-portal/aesthete/overview',
      'admin-portal/audit/column/actor',
      'mystery-portal',
      'designer-portal',
      '',
    ];
    for (const key of unclaimed) {
      const label = topicLabelFor(key);
      expect(label).not.toBe(key);
      expect(label).not.toContain('/');
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it('every featured key files under a real shelf (never humanized)', () => {
    const shelves = new Set(HELP_TOPICS.map((t) => t.label));
    expect(FEATURED_SURFACE_KEYS).toHaveLength(5);
    for (const key of FEATURED_SURFACE_KEYS) {
      expect(shelves.has(topicLabelFor(key))).toBe(true);
    }
  });
});
