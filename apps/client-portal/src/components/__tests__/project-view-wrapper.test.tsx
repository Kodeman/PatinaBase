import { render, screen } from '@testing-library/react';
import { ProjectViewWrapper } from '../project-view-wrapper';
import { useAuth } from '@/hooks/use-auth';
import { useClientSelections } from '@/hooks/use-commercial-client';

jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-commercial-client', () => ({ useClientSelections: jest.fn() }));
jest.mock('@/hooks/use-project-phase-realtime', () => ({ useProjectPhaseRealtime: jest.fn() }));
jest.mock('@/lib/analytics/events', () => ({ clientEvents: { projectView: jest.fn() } }));
jest.mock('@/lib/websocket', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="ws-provider">{children}</div>,
}));
jest.mock('@/components/timeline/enhanced-timeline', () => ({
  AuthoritativeEnhancedTimeline: () => <div data-testid="timeline" />,
}));
jest.mock('@/components/project-overview', () => ({ ProjectOverview: () => <div data-testid="project-overview" /> }));
jest.mock('@/components/project-scope-details', () => ({
  ProjectScopeDetails: () => <div data-testid="project-scope-details" />,
}));
jest.mock('@/components/budget-overview', () => ({ BudgetOverview: () => <div data-testid="budget-overview" /> }));
jest.mock('@/components/project-invoices-summary', () => ({
  ProjectInvoicesSummary: () => <div data-testid="project-invoices-summary" />,
}));
jest.mock('@/components/ffe-status', () => ({ FFEStatus: () => <div data-testid="ffe-status" /> }));
jest.mock('@/components/strata-mark', () => ({ StrataMark: () => <div data-testid="strata-mark" /> }));
jest.mock('@/components/project/ProjectActivityFeed', () => ({
  ProjectActivityFeed: () => <div data-testid="project-activity-feed" />,
}));
jest.mock('@/components/project/ProjectTeamPanel', () => ({
  ProjectTeamPanel: () => <div data-testid="project-team-panel" />,
}));
jest.mock('@/components/project/ProjectDocumentsPanel', () => ({
  ProjectDocumentsPanel: () => <div data-testid="project-documents-panel" />,
}));
jest.mock('@/components/project/FFEPipelinePanel', () => ({
  FFEPipelinePanel: () => <div data-testid="ffe-pipeline-panel" />,
}));
jest.mock('@/components/project-commercial-summary', () => ({
  ProjectCommercialSummary: () => <div data-testid="project-commercial-summary" />,
}));
jest.mock('@/components/commercial/awaiting-signature-cards', () => ({
  AwaitingSignatureCards: () => <div data-testid="awaiting-signature-cards" />,
}));
jest.mock('@/components/commercial/client-plan-grid', () => ({
  ClientPlanGrid: () => <div data-testid="client-plan-grid" />,
}));
jest.mock('@/components/commercial/client-selections', () => ({
  ClientSelections: () => <div data-testid="client-selections" />,
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseClientSelections = useClientSelections as jest.Mock;

describe('ProjectViewWrapper', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ session: null, user: { id: 'client-1' } });
  });

  it('mounts today’s legacy tree — BudgetOverview, FFEStatus, and the FF&E pipeline panel — byte-identical when origin is legacy', () => {
    mockUseClientSelections.mockReturnValue({ data: { origin: 'legacy', selections: [] } });
    render(
      <ProjectViewWrapper projectId="project-1" project={{}} milestones={[]} showOverview />,
    );

    expect(screen.getByTestId('project-overview')).toBeInTheDocument();
    expect(screen.getByTestId('project-commercial-summary')).toBeInTheDocument();
    expect(screen.getByTestId('project-scope-details')).toBeInTheDocument();
    expect(screen.getByTestId('budget-overview')).toBeInTheDocument();
    expect(screen.getByTestId('project-invoices-summary')).toBeInTheDocument();
    expect(screen.getByTestId('ffe-status')).toBeInTheDocument();
    expect(screen.getByTestId('ffe-pipeline-panel')).toBeInTheDocument();

    expect(screen.queryByTestId('awaiting-signature-cards')).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-plan-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-selections')).not.toBeInTheDocument();
  });

  it('keeps the legacy tree while the origin is still loading (fail closed, no flash into the new UI)', () => {
    mockUseClientSelections.mockReturnValue({ data: undefined });
    render(
      <ProjectViewWrapper projectId="project-1" project={{}} milestones={[]} showOverview />,
    );

    expect(screen.getByTestId('budget-overview')).toBeInTheDocument();
    expect(screen.getByTestId('ffe-status')).toBeInTheDocument();
    expect(screen.queryByTestId('client-selections')).not.toBeInTheDocument();
  });

  it('swaps in the commercial rail — awaiting signatures, the plan grid, and selections — in place of BudgetOverview/FFEStatus/pipeline when origin is commercial', () => {
    mockUseClientSelections.mockReturnValue({ data: { origin: 'commercial', selections: [] } });
    render(
      <ProjectViewWrapper projectId="project-1" project={{}} milestones={[]} showOverview />,
    );

    expect(screen.getByTestId('awaiting-signature-cards')).toBeInTheDocument();
    expect(screen.getByTestId('client-plan-grid')).toBeInTheDocument();
    expect(screen.getByTestId('client-selections')).toBeInTheDocument();

    expect(screen.queryByTestId('budget-overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ffe-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ffe-pipeline-panel')).not.toBeInTheDocument();

    // Kept on both branches per spec.
    expect(screen.getByTestId('project-commercial-summary')).toBeInTheDocument();
    expect(screen.getByTestId('project-invoices-summary')).toBeInTheDocument();
  });

  it('renders nothing from either overview tree when showOverview is false', () => {
    mockUseClientSelections.mockReturnValue({ data: { origin: 'commercial', selections: [] } });
    render(<ProjectViewWrapper projectId="project-1" project={{}} milestones={[]} />);

    expect(screen.queryByTestId('project-overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-selections')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-overview')).not.toBeInTheDocument();
    // The timeline mounts unconditionally, outside showOverview.
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
  });
});
