/**
 * The registry's two panel-facing resolvers (onboarding Wave 1, task L1).
 *
 * `resolveIntroBlurb` is the contextual help panel's only source of framing
 * copy, and `shortcutsForSurface` is the only source of the panel's KEYS
 * rows — both read the registry rather than retyping it, so a re-chord or a
 * reworded blurb can never leave the panel lying.
 */
import {
  resolveIntroBlurb,
  shortcutsForSurface,
  HOST_SURFACES,
  ALL_STUDIO_SURFACES,
  DOCUMENT_SCOPED_SURFACES,
} from './registry';

describe('resolveIntroBlurb', () => {
  it('answers on the Desk', () => {
    expect(resolveIntroBlurb('designer-portal/document/desk')).toMatch(/Every live job/);
  });

  it('answers inside a Document', () => {
    expect(resolveIntroBlurb('designer-portal/document/doc')).toMatch(/One client, one paper/);
  });

  it('still frames a sub-page with its ledger (orders/receiving → Orders)', () => {
    expect(resolveIntroBlurb('designer-portal/document/orders/receiving')).toBe(
      ALL_STUDIO_SURFACES.find((s) => s.key === 'orders')!.help!.blurb,
    );
  });

  it('frames a document-scoped page with its own blurb (plans → Plan room)', () => {
    expect(resolveIntroBlurb('designer-portal/document/plans')).toBe(
      DOCUMENT_SCOPED_SURFACES.find((s) => s.key === 'plan-room')!.help!.blurb,
    );
  });

  it('never answers with a verb blurb', () => {
    expect(resolveIntroBlurb('designer-portal/document/desk')).not.toMatch(
      /A name and a note/,
    );
  });

  it('returns null for a key no surface owns', () => {
    expect(resolveIntroBlurb('client-portal/nowhere')).toBeNull();
  });

  it('never mints a doorway for a host surface', () => {
    for (const h of HOST_SURFACES) expect(ALL_STUDIO_SURFACES).not.toContain(h);
    for (const h of HOST_SURFACES) expect(DOCUMENT_SCOPED_SURFACES).not.toContain(h);
  });

  it('host surfaces carry no shortcut and no weight', () => {
    for (const h of HOST_SURFACES) {
      expect(h.kind).toBe('host');
      expect(h.scope).toBe('global');
      expect(h.aliases).toEqual([]);
      expect(h.shortcut).toBeUndefined();
      expect(h.weight).toBeUndefined();
    }
  });
});

describe('shortcutsForSurface', () => {
  it('prints ⌘K first and G·O for Orders', () => {
    const rows = shortcutsForSurface('designer-portal/document/orders');
    expect(rows[0]).toEqual({ label: 'Find anything', keys: ['⌘', 'K'] });
    expect(rows).toContainEqual({ label: 'Orders', keys: ['G', 'O'] });
  });

  it('carries the ledger chord down to a sub-page', () => {
    const rows = shortcutsForSurface('designer-portal/document/orders/receiving');
    expect(rows).toContainEqual({ label: 'Orders', keys: ['G', 'O'] });
  });

  it('prints only the universal row on a surface with no chord', () => {
    expect(shortcutsForSurface('designer-portal/document/desk')).toEqual([
      { label: 'Find anything', keys: ['⌘', 'K'] },
    ]);
  });

  it('prints only the universal row for an unknown key', () => {
    expect(shortcutsForSurface('client-portal/nowhere')).toEqual([
      { label: 'Find anything', keys: ['⌘', 'K'] },
    ]);
  });
});
