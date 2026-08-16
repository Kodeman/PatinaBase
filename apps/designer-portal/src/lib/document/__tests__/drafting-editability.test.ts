/**
 * The Drafting Room's editability rule, and the client's-copy shelf (W4a).
 *
 * The rule is the Room's; this spec pins it so the Finalize table's Offer
 * facets cannot drift into granting an edit the Room evicts you for.
 */

import { draftingEditability } from '../drafting-editability';
import { shelvesFor } from '../shelves';

describe('draftingEditability — the Room’s own rule, addressable', () => {
  it('lets a legacy DRAFT be edited, and nothing else', () => {
    expect(
      draftingEditability({
        documentKind: 'legacy',
        status: 'draft',
        commercialState: null,
      }),
    ).toBe('editable');
    for (const status of ['sent', 'viewed', 'revised', 'expired', 'declined', 'accepted']) {
      expect(
        draftingEditability({ documentKind: 'legacy', status, commercialState: null }),
      ).toBe('issued');
    }
  });

  it('reads an unknown document_kind as legacy, exactly as the Room does', () => {
    expect(
      draftingEditability({
        documentKind: null,
        status: 'draft',
        commercialState: null,
      }),
    ).toBe('editable');
  });

  it('gates a design-services agreement on commercial_state, treating a missing one as draft', () => {
    expect(
      draftingEditability({
        documentKind: 'design_services',
        status: 'sent',
        commercialState: null,
      }),
    ).toBe('editable');
    expect(
      draftingEditability({
        documentKind: 'service_addendum',
        status: 'draft',
        commercialState: 'sent',
      }),
    ).toBe('issued');
  });

  it('never opens a furnishings authorization', () => {
    expect(
      draftingEditability({
        documentKind: 'furnishings_authorization',
        status: 'draft',
        commercialState: 'draft',
      }),
    ).toBe('readonly');
  });

  it('means a proposal on the Finalize table is never editable — it is out of the studio’s hands', () => {
    // The Finalize table is `active_section='proposal'` with a non-draft
    // status (table-derivation.ts), so this is the whole of that table.
    for (const status of ['sent', 'viewed', 'revised', 'expired', 'declined']) {
      expect(
        draftingEditability({ documentKind: 'legacy', status, commercialState: null }),
      ).not.toBe('editable');
    }
  });
});

describe('shelvesFor — the client’s copy', () => {
  it('never offers a project document a shelf that belongs to a proposal', () => {
    const keys = shelvesFor({ callSheetEnabled: true }).map((s) => s.key);
    expect(keys).toEqual(['planroom', 'specbook', 'moodboards', 'callsheet', 'knowledge']);
    // …not even when the flag that would raise it is on.
    expect(
      shelvesFor({ callSheetEnabled: true, clientCopyEnabled: true }).map((s) => s.key),
    ).not.toContain('clientcopy');
  });

  it('gives a proposal document its one shelf and none of the project’s', () => {
    const shelves = shelvesFor({
      subject: 'proposal',
      callSheetEnabled: false,
      clientCopyEnabled: true,
    });
    expect(shelves.map((s) => s.key)).toEqual(['clientcopy']);
    expect(shelves[0]).toMatchObject({
      kind: 'leaf',
      title: 'The client’s copy',
    });
  });

  it('offers a proposal document nothing at all off the Finalize table', () => {
    expect(shelvesFor({ subject: 'proposal', callSheetEnabled: true })).toEqual([]);
  });

  it('keeps the call-sheet gate where it was', () => {
    expect(shelvesFor({ callSheetEnabled: false }).map((s) => s.key)).toEqual([
      'planroom',
      'specbook',
      'moodboards',
      'knowledge',
    ]);
  });
});
