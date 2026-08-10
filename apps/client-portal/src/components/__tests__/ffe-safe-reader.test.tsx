import { render, screen } from '@testing-library/react';
import { FFEStatus } from '../ffe-status';
import { FFEPipelinePanel } from '../project/FFEPipelinePanel';
import { useClientSelections } from '@/hooks/use-commercial-client';

jest.mock('@/hooks/use-commercial-client', () => ({ useClientSelections: jest.fn() }));
jest.mock('next/image', () => (props: any) => <img {...props} />);
const selections = useClientSelections as jest.Mock;

describe('legacy FF&E client surfaces', () => {
  beforeEach(() => selections.mockReturnValue({ isLoading: false, data: { origin: 'legacy', selections: [{ id: 'safe-1', name: 'Safe chair', roomName: 'Living room', status: 'ordered', imageUrl: null }] } }));
  it('renders status only from the curated selections projection', () => { render(<FFEStatus projectId="project-1" />); expect(screen.getByText('Safe chair')).toBeInTheDocument(); });
  it('renders the pipeline only from the curated selections projection', () => { render(<FFEPipelinePanel projectId="project-1" />); expect(screen.getByText('Safe chair')).toBeInTheDocument(); });
});
