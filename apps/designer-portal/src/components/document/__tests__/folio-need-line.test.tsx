/**
 * Ruling VI — the Desk folio prints the gate's sentence, not a restatement of
 * the operational need, wherever the folio's need IS a gate.
 */

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { folioShown: jest.fn(), folioSelected: jest.fn() },
}));
jest.mock('../command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('../triage-bar', () => ({ TriageBar: () => null }));

import { folioNeedLine } from '../folder-card';
import type { DeskFolder, NeedLine } from '@/lib/document/desk-derivation';

const need: NeedLine = {
  kind: 'overdue_decision',
  text: '1 decision overdue — oldest due May 6',
  actionLabel: 'Review decisions',
  stamp: { label: 'DECISION DUE', color: 'var(--color-terracotta)' },
  urgent: true,
};

const folder = (overrides: Partial<DeskFolder> = {}): DeskFolder =>
  ({
    row: {
      client_name: 'Marta',
      active_section: 'direction',
      title: 'The Merriweather House',
    },
    need,
    overdue: { isOverdue: true, days: 6 },
    ...overrides,
  }) as DeskFolder;

describe('folioNeedLine', () => {
  it('states the gate: the party, the artifact, and the elapsed time', () => {
    expect(folioNeedLine(folder())).toBe(
      "Marta's Direction approval has waited 6 days.",
    );
  });

  it('falls back to the need’s own line where the folio has no gate', () => {
    expect(
      folioNeedLine(
        folder({
          need: { ...need, kind: 'task_due', text: 'Confirm the install date' },
          overdue: { isOverdue: false, days: 0 },
        }),
      ),
    ).toBe('Confirm the install date');
  });

  it('survives a folder built before the condition rode along', () => {
    expect(folioNeedLine(folder({ overdue: undefined }))).toBe(need.text);
  });
});
