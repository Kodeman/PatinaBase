import {
  deriveTable,
  deriveTableComposition,
  tableCompositionKey,
} from '../table-derivation';
import type { SectionKey } from '../desk-derivation';

const ALL_SECTIONS: SectionKey[] = [
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
  'care',
];

describe('deriveTable — section × proposal status', () => {
  it('sets the Intake table for the two intake sections', () => {
    expect(deriveTable({ activeSection: 'brief' })).toEqual({ table: 'intake' });
    expect(deriveTable({ activeSection: 'discovery' })).toEqual({ table: 'intake' });
  });

  it('sets the Speccing table for the Direction, whatever the proposal says', () => {
    for (const status of ['draft', 'sent', 'viewed', 'accepted', null, undefined]) {
      expect(deriveTable({ activeSection: 'direction', proposalStatus: status })).toEqual({
        table: 'speccing',
      });
    }
  });

  it('keeps a proposal on the Speccing table while it is still a draft', () => {
    expect(deriveTable({ activeSection: 'proposal', proposalStatus: 'draft' })).toEqual({
      table: 'speccing',
    });
  });

  it('sets the Finalize table once the proposal is in the client’s hands', () => {
    for (const status of ['sent', 'viewed']) {
      expect(deriveTable({ activeSection: 'proposal', proposalStatus: status })).toEqual({
        table: 'finalize',
      });
    }
  });

  it('holds the Finalize table through the terminal proposal states', () => {
    // The seal itself moves the document, not the table: R6 redirects an
    // activated proposal's id to the project. Until it does, the agreement's
    // own instruments are still what the paper has to print.
    for (const status of ['accepted', 'declined', 'expired']) {
      expect(deriveTable({ activeSection: 'proposal', proposalStatus: status })).toEqual({
        table: 'finalize',
      });
    }
  });

  it('never moves the table off the section on an unread proposal', () => {
    // The row said 'proposal', which the view derives from a non-draft status;
    // an unanswered read must not compose a draft table that then turns.
    for (const status of [null, undefined]) {
      expect(deriveTable({ activeSection: 'proposal', proposalStatus: status })).toEqual({
        table: 'finalize',
      });
    }
  });

  it('sets the Delivery table in its procurement setting for project and care', () => {
    expect(deriveTable({ activeSection: 'project' })).toEqual({
      table: 'delivery',
      setting: 'procurement',
    });
    expect(deriveTable({ activeSection: 'care' })).toEqual({
      table: 'delivery',
      setting: 'procurement',
    });
  });

  it('sets the install setting on the install section', () => {
    expect(deriveTable({ activeSection: 'install' })).toEqual({
      table: 'delivery',
      setting: 'install',
    });
  });

  it('answers every section, and names a setting only on Delivery', () => {
    for (const section of ALL_SECTIONS) {
      const selection = deriveTable({ activeSection: section });
      expect(selection.table).toBeDefined();
      if (selection.table === 'delivery') {
        expect(selection.setting).toBeDefined();
      } else {
        expect(selection.setting).toBeUndefined();
      }
    }
  });
});

describe('the composition identity', () => {
  it('carries the section beside the table', () => {
    expect(deriveTableComposition({ activeSection: 'discovery' })).toEqual({
      table: 'intake',
      section: 'discovery',
    });
  });

  it('separates two sections that share one table', () => {
    const brief = tableCompositionKey(deriveTableComposition({ activeSection: 'brief' }));
    const discovery = tableCompositionKey(
      deriveTableComposition({ activeSection: 'discovery' }),
    );
    expect(brief).not.toEqual(discovery);
  });

  it('is stable for the same inputs', () => {
    const once = tableCompositionKey(
      deriveTableComposition({ activeSection: 'proposal', proposalStatus: 'sent' }),
    );
    const twice = tableCompositionKey(
      deriveTableComposition({ activeSection: 'proposal', proposalStatus: 'viewed' }),
    );
    expect(once).toEqual(twice);
  });

  it('separates the Delivery table’s two settings', () => {
    expect(
      tableCompositionKey(deriveTableComposition({ activeSection: 'project' })),
    ).not.toEqual(
      tableCompositionKey(deriveTableComposition({ activeSection: 'install' })),
    );
  });
});
