import { render, screen } from '@testing-library/react';
import { ProjectTimeline } from './ProjectTimeline';

// Mock IntersectionObserver
beforeEach(() => {
  const mockIntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
  window.IntersectionObserver = mockIntersectionObserver as unknown as typeof IntersectionObserver;
});

const mockProject = {
  id: '1',
  name: 'Living Room Redesign',
  description: 'Complete interior redesign of main living space',
  milestones: [
    {
      id: '1',
      title: 'Design Approval',
      description: 'Initial design concepts approved',
      date: '2025-01-15',
      status: 'completed',
    },
    {
      id: '2',
      title: 'Material Selection',
      description: 'Fabrics and materials chosen',
      date: '2025-02-01',
      status: 'in-progress',
    },
  ],
};

describe('ProjectTimeline', () => {
  it('should render project name and description in header', () => {
    render(<ProjectTimeline project={mockProject} />);

    expect(screen.getByRole('heading', { name: mockProject.name })).toBeInTheDocument();
    expect(screen.getByText(mockProject.description)).toBeInTheDocument();
  });

  it('should render project overview section', () => {
    render(<ProjectTimeline project={mockProject} />);

    expect(screen.getByRole('heading', { name: 'Project Overview' })).toBeInTheDocument();
    expect(screen.getByText('Total Milestones')).toBeInTheDocument();
    expect(screen.getByText(String(mockProject.milestones.length))).toBeInTheDocument();
  });

  it('should render all milestones', () => {
    render(<ProjectTimeline project={mockProject} />);

    mockProject.milestones.forEach(milestone => {
      expect(screen.getByText(milestone.title)).toBeInTheDocument();
    });
  });

  it('should render timeline section heading', () => {
    render(<ProjectTimeline project={mockProject} />);

    expect(screen.getByRole('heading', { name: 'Project Timeline' })).toBeInTheDocument();
  });

  it('should apply opacity style to header', () => {
    const { container } = render(<ProjectTimeline project={mockProject} />);

    // Find the header by checking for element with style attribute containing opacity
    const header = container.querySelector('[style*="opacity"]');
    expect(header).toBeInTheDocument();
  });
});
