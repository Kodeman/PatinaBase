/**
 * US-19 FR7 F7-11 (R2, D14) — a placeholder is not a party. Under one-voice
 * the page hands the Spine `householdDisplayName(row.client_name) || null`;
 * with no name the client court's chip falls to the court's own word
 * (`Ball: Client`), never `the client` and never the placeholder. A real
 * household name is unchanged.
 */
import { render, screen } from '@testing-library/react';
import type { CoordinationItem } from '@patina/supabase';
import { OpenItemRow } from '../open-item-row';
import { householdDisplayName } from '@/lib/document/act-names';

const item = {
  id: 'item-1',
  coordination_kind: 'selection',
  title: 'Choose the dining fabric',
  status: 'open',
  due_date: null,
  blocks_kind: null,
} as unknown as CoordinationItem;

function renderRow(clientName: string | null | undefined) {
  render(
    <OpenItemRow
      item={item}
      tasks={[]}
      onOpen={() => {}}
      court={{ court: 'client', party: null, clientName }}
    />,
  );
}

describe('OpenItemRow — the client court chip (F7-11)', () => {
  it.each([null, '', undefined])('no name (%p) reads Ball: Client', (name) => {
    renderRow(name);
    expect(screen.getByText(/^Ball:/)).toHaveTextContent('Ball: Client');
  });

  it.each(['Client User', 'Client'])(
    'the page\'s one-voice value for placeholder %p reads Ball: Client',
    (raw) => {
      renderRow(householdDisplayName(raw) || null);
      expect(screen.getByText(/^Ball:/)).toHaveTextContent('Ball: Client');
      expect(screen.queryByText(/Client User/)).toBeNull();
    },
  );

  it('a real household name reads that name', () => {
    renderRow(householdDisplayName('Mei Tanaka') || null);
    expect(screen.getByText(/^Ball:/)).toHaveTextContent('Ball: Mei Tanaka');
  });
});
