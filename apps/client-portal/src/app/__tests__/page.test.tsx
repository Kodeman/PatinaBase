import { render, screen } from '@testing-library/react';

import HomePage from '../page';
import {
  resolveActiveHouse,
  resolveHouseForInstrument,
} from '@/lib/data/active-project';
import { fetchClientProjectView, fetchClientProjects } from '@/lib/data/projects';

/* ── The front door ─────────────────────────────────────────────────────────
   `/` is a protected route: middleware owns the signed-out redirect and the
   portal-role gate, so everything this page has to decide is which house to
   open — and, when there is none it can open, to say so without a 404.
   ────────────────────────────────────────────────────────────────────────── */

jest.mock('@/lib/data/projects', () => ({
  fetchClientProjects: jest.fn(),
  fetchClientProjectView: jest.fn(),
}));

jest.mock('@/lib/data/active-project', () => ({
  resolveActiveHouse: jest.fn(),
  resolveHouseForInstrument: jest.fn(),
}));

jest.mock('@/components/threshold/threshold', () => ({
  Threshold: ({
    projectId,
    otherHouses,
    viewSource,
  }: {
    projectId: string;
    otherHouses?: { id: string; name: string }[];
    viewSource?: string;
  }) => (
    <div
      data-testid="surface"
      data-project-id={projectId}
      data-view-source={viewSource}
      data-other-houses={(otherHouses ?? []).map((house) => house.id).join(',')}
    />
  ),
}));

jest.mock('@/components/projects/ProjectsEmptyState', () => ({
  ProjectsEmptyState: () => <div data-testid="empty-state" />,
}));

const mockProjects = fetchClientProjects as jest.Mock;
const mockProjectView = fetchClientProjectView as jest.Mock;
const mockActiveHouse = resolveActiveHouse as jest.Mock;
const mockInstrumentHouse = resolveHouseForInstrument as jest.Mock;

const listItem = (id: string, name: string) => ({
  id,
  name,
  progressPercentage: 0,
  status: 'active',
  approvalsPending: 0,
  nonStage2ApprovalsPending: 0,
  unreadMessages: 0,
});

const view = (id: string) => ({
  project: { id, name: id },
  milestones: [],
});

describe('the front door', () => {
  beforeEach(() => {
    mockInstrumentHouse.mockResolvedValue(null);
  });

  it('opens the house the active-house rule chose', async () => {
    mockProjects.mockResolvedValue([listItem('p1', 'The Vale Residence')]);
    mockActiveHouse.mockResolvedValue('p1');
    mockProjectView.mockResolvedValue(view('p1'));

    render(await HomePage());

    expect(mockActiveHouse).toHaveBeenCalledWith(['p1']);
    expect(mockProjectView).toHaveBeenCalledWith('p1');
    expect(screen.getByTestId('surface')).toHaveAttribute('data-project-id', 'p1');
  });

  it('names the client as having landed, not as having opened this house', async () => {
    mockProjects.mockResolvedValue([listItem('p1', 'The Vale Residence')]);
    mockActiveHouse.mockResolvedValue('p1');
    mockProjectView.mockResolvedValue(view('p1'));

    render(await HomePage());

    expect(screen.getByTestId('surface')).toHaveAttribute(
      'data-view-source',
      'front-door',
    );
  });

  it('never puts the house she is standing in inside its own mat', async () => {
    mockProjects.mockResolvedValue([
      listItem('p1', 'The Vale Residence'),
      listItem('p2', 'The Linden house'),
      listItem('p3', 'The Ash cottage'),
    ]);
    mockActiveHouse.mockResolvedValue('p2');
    mockProjectView.mockResolvedValue(view('p2'));

    render(await HomePage());

    expect(screen.getByTestId('surface')).toHaveAttribute(
      'data-other-houses',
      'p1,p3',
    );
  });

  it('shows the empty state, not a house, when the client has none', async () => {
    mockProjects.mockResolvedValue([]);
    mockActiveHouse.mockResolvedValue(null);

    render(await HomePage());

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('surface')).not.toBeInTheDocument();
    expect(mockProjectView).not.toHaveBeenCalled();
  });

  it('opens the next house rather than stranding a client who has houses', async () => {
    // The chrome drops the header on `/` because the LIST says she has a
    // house. An empty state here would leave her with no navigation and tell
    // her she has no projects — the stranding trap, through another door.
    mockProjects.mockResolvedValue([
      listItem('p1', 'The Vale Residence'),
      listItem('p2', 'The Linden house'),
    ]);
    mockActiveHouse.mockResolvedValue('p1');
    mockProjectView.mockImplementation(async (id: string) => (id === 'p2' ? view('p2') : null));

    render(await HomePage());

    expect(mockProjectView).toHaveBeenCalledWith('p1');
    expect(mockProjectView).toHaveBeenCalledWith('p2');
    expect(screen.getByTestId('surface')).toHaveAttribute('data-project-id', 'p2');
  });

  // `/invoices/<id>` and `/proposals/<id>` fold here carrying the instrument
  // they were sent about. The active house is the wrong answer for a client
  // with two: the money and the signature would land in another house's room.
  it('opens the house the instrument on the address belongs to', async () => {
    mockProjects.mockResolvedValue([
      listItem('p1', 'The Vale Residence'),
      listItem('p2', 'The Linden house'),
    ]);
    mockActiveHouse.mockResolvedValue('p1');
    mockInstrumentHouse.mockResolvedValue('p2');
    mockProjectView.mockImplementation(async (id: string) => view(id));

    render(await HomePage({ searchParams: Promise.resolve({ invoice: 'inv-9' }) }));

    expect(mockInstrumentHouse).toHaveBeenCalledWith(['p1', 'p2'], {
      invoiceId: 'inv-9',
      proposalId: undefined,
    });
    expect(mockActiveHouse).not.toHaveBeenCalled();
    expect(screen.getByTestId('surface')).toHaveAttribute('data-project-id', 'p2');
  });

  it('falls back to the active house when the address names no instrument', async () => {
    mockProjects.mockResolvedValue([listItem('p1', 'The Vale Residence')]);
    mockActiveHouse.mockResolvedValue('p1');
    mockProjectView.mockImplementation(async (id: string) => view(id));

    render(await HomePage());

    expect(mockActiveHouse).toHaveBeenCalledWith(['p1']);
    expect(screen.getByTestId('surface')).toHaveAttribute('data-project-id', 'p1');
  });

  it('answers with the empty state, never a 404, when no house will open', async () => {
    // The list named it and the detail read cannot open it — a deletion
    // mid-request, or RLS skew between the two selects. A 404 belongs at
    // `/projects/<id>`; the front door has something else to say.
    mockProjects.mockResolvedValue([listItem('p1', 'The Vale Residence')]);
    mockActiveHouse.mockResolvedValue('p1');
    mockProjectView.mockResolvedValue(null);

    render(await HomePage());

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('surface')).not.toBeInTheDocument();
  });
});
