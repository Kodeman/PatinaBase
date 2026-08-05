import { render, screen } from '@testing-library/react';
import { WorkOrderSheet } from './work-order-sheet';

const terms = {
  proposalId: 'proposal-1',
  partyId: 'party-1',
  partyDisplayName: 'Atelier Marchand',
  partyCompanyName: 'Atelier Marchand LLC',
  partyTrade: 'drapery',
  clientPriceCents: 680_000,
  currency: 'USD',
  terms: 'Hardware supplied by the studio.',
  progressState: 'engaged' as const,
  engagedAt: null,
  substantialCompletionAt: null,
  acceptedAt: null,
  acceptedSignedName: null,
};

const sections = [
  {
    id: 'section-1',
    projectRoomId: 'room-1',
    roomName: 'Living',
    prose: 'Fabricate and hang pinch-pleat drapery to five windows.',
    allocationCents: 490_000,
    sortOrder: 0,
  },
  {
    id: 'section-2',
    projectRoomId: 'room-2',
    roomName: 'Primary bedroom',
    prose: 'Matching panels to the two south windows.',
    allocationCents: 190_000,
    sortOrder: 1,
  },
];

describe('WorkOrderSheet', () => {
  it('gives the trade the rooms, the prose and the terms', () => {
    render(
      <WorkOrderSheet
        open
        onClose={jest.fn()}
        projectName="Ellsworth Residence"
        scopeNumber={1}
        title="Drapery fabrication & install"
        terms={terms}
        sections={sections}
      />,
    );

    expect(screen.getByText('Work order · Trade scope № 1')).toBeVisible();
    expect(screen.getByText('Drapery fabrication & install')).toBeVisible();
    expect(
      screen.getByText(
        'Ellsworth Residence · Atelier Marchand · Atelier Marchand LLC',
      ),
    ).toBeVisible();
    expect(screen.getByText('Living')).toBeVisible();
    expect(screen.getByText('Primary bedroom')).toBeVisible();
    expect(screen.getByText('Hardware supplied by the studio.')).toBeVisible();
  });

  it('never puts a client price or an allocation in front of the trade', () => {
    const { container } = render(
      <WorkOrderSheet
        open
        onClose={jest.fn()}
        projectName="Ellsworth Residence"
        scopeNumber={1}
        title="Drapery fabrication & install"
        terms={terms}
        sections={sections}
      />,
    );
    expect(container.textContent).not.toContain('6,800');
    expect(container.textContent).not.toContain('4,900');
    expect(container.textContent).not.toContain('$');
  });

  it('says plainly when a scope has no rooms written on it', () => {
    render(
      <WorkOrderSheet
        open
        onClose={jest.fn()}
        projectName="Ellsworth Residence"
        scopeNumber={2}
        title="Tile setting"
        terms={null}
        sections={[]}
      />,
    );
    expect(screen.getByText('No rooms on this scope.')).toBeVisible();
  });

  it('stays closed when it is not open', () => {
    const { container } = render(
      <WorkOrderSheet
        open={false}
        onClose={jest.fn()}
        projectName="Ellsworth Residence"
        scopeNumber={1}
        title="Drapery"
        terms={terms}
        sections={sections}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
