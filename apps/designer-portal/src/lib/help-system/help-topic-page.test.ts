/**
 * Topic-page model (help-desk Wave 1) — pins the prefix→topic resolution the
 * `/help/topic/[prefix]` page titles itself with, and the sub-section labels
 * that stand in for raw keys.
 */
import { HELP_TOPICS } from './help-topics';
import { prefixSectionLabel, topicForPrefix } from './help-topic-page';

describe('topicForPrefix', () => {
  it('resolves an exact topic prefix to its shelf', () => {
    expect(topicForPrefix('designer-portal/document/guide')?.label).toBe('Getting started');
    expect(topicForPrefix('designer-portal/document/desk')?.label).toBe('The Desk & the Studio');
    expect(topicForPrefix('designer-portal/document/orders')?.label).toBe('Ledgers & money');
    expect(topicForPrefix('client-portal')?.label).toBe('For your clients');
  });

  it('resolves a descendant deep link to the owning shelf', () => {
    expect(topicForPrefix('designer-portal/document/guide/what-is-the-desk')?.label).toBe(
      'Getting started',
    );
    expect(topicForPrefix('designer-portal/document/library/piece')?.label).toBe('Rooms');
    expect(topicForPrefix('client-portal/invoices/pay')?.label).toBe('For your clients');
  });

  it('matches on segment boundaries, never bare startsWith', () => {
    expect(topicForPrefix('designer-portal/document/margin')?.label).toBe('Your documents');
    expect(topicForPrefix('designer-portal/document/margin-note')?.label).not.toBe(
      'Your documents',
    );
  });

  it('returns null for prefixes no shelf claims (legacy deep links)', () => {
    expect(topicForPrefix('designer-portal/pipeline')).toBeNull();
    expect(topicForPrefix('designer-portal/aesthete/overview')).toBeNull();
    expect(topicForPrefix('admin-portal/settings')).toBeNull();
  });

  it('every FIRST prefix (the index tile target) round-trips to its own topic', () => {
    for (const topic of HELP_TOPICS) {
      expect(topicForPrefix(topic.prefixes[0])?.label).toBe(topic.label);
    }
  });
});

describe('prefixSectionLabel', () => {
  it('title-cases the last segment, kebab split', () => {
    expect(prefixSectionLabel('designer-portal/document/desk')).toBe('Desk');
    expect(prefixSectionLabel('designer-portal/document/the-post')).toBe('The Post');
    expect(prefixSectionLabel('designer-portal/document/command-bar')).toBe('Command Bar');
    expect(prefixSectionLabel('client-portal')).toBe('Client Portal');
  });

  it('never echoes the raw key and never returns empty', () => {
    for (const topic of HELP_TOPICS) {
      for (const prefix of topic.prefixes) {
        const label = prefixSectionLabel(prefix);
        expect(label.trim().length).toBeGreaterThan(0);
        expect(label).not.toContain('/');
      }
    }
    expect(prefixSectionLabel('')).toBe('Articles');
  });
});
