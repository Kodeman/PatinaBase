import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MilestoneCard } from './MilestoneCard';

// Mock IntersectionObserver
let observerCallback: (entries: { isIntersecting: boolean; target: Element }[]) => void;

beforeEach(() => {
  const mockIntersectionObserver = jest.fn((callback) => {
    observerCallback = callback;
    return {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    };
  });
  window.IntersectionObserver = mockIntersectionObserver as unknown as typeof IntersectionObserver;
});

describe('MilestoneCard', () => {
  const mockMilestone = {
    id: '1',
    title: 'Design Approval',
    description: 'Initial design concepts approved',
    date: '2025-01-15',
    status: 'completed',
  };

  it('should render milestone content', () => {
    render(<MilestoneCard milestone={mockMilestone} />);

    expect(screen.getByText(mockMilestone.title)).toBeInTheDocument();
    expect(screen.getByText(mockMilestone.description)).toBeInTheDocument();
    expect(screen.getByText(mockMilestone.status)).toBeInTheDocument();
  });

  it('should render formatted date', () => {
    render(<MilestoneCard milestone={mockMilestone} />);

    // Date should be formatted (timezone may shift by a day)
    const dateElement = screen.getByText(/Jan \d{1,2}, 2025/);
    expect(dateElement).toBeInTheDocument();
  });

  it('should become visible when in viewport', async () => {
    const { container } = render(<MilestoneCard milestone={mockMilestone} />);

    // Trigger intersection observer callback
    act(() => {
      observerCallback([{ isIntersecting: true, target: container.firstChild as Element }]);
    });

    await waitFor(() => {
      // Check that visible class is applied (contains 'Visible' in the class name)
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('Visible');
    });
  });
});

describe('MilestoneCard expansion', () => {
  const mockMilestone = {
    id: '1',
    title: 'Design Approval',
    description: 'Initial design concepts approved',
    date: '2025-01-15',
    status: 'completed',
    details: 'Additional milestone details including deliverables and requirements.',
  };

  it('should show expand button when details exist', () => {
    render(<MilestoneCard milestone={mockMilestone} />);

    const expandButton = screen.getByRole('button', { name: /expand details/i });
    expect(expandButton).toBeInTheDocument();
  });

  it('should not show expand button when no details', () => {
    const milestoneWithoutDetails = { ...mockMilestone, details: undefined };
    render(<MilestoneCard milestone={milestoneWithoutDetails} />);

    expect(screen.queryByRole('button', { name: /expand/i })).not.toBeInTheDocument();
  });

  it('should toggle expanded state when clicking expand button', async () => {
    render(<MilestoneCard milestone={mockMilestone} />);

    const expandButton = screen.getByRole('button', { name: /expand details/i });

    // Initially collapsed
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(expandButton);
    expect(expandButton).toHaveAttribute('aria-expanded', 'true');

    // Click to collapse
    fireEvent.click(expandButton);
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('should show details content when expanded', () => {
    render(<MilestoneCard milestone={mockMilestone} />);

    const expandButton = screen.getByRole('button', { name: /expand details/i });

    // Click to expand
    fireEvent.click(expandButton);

    // Details text should be in the document
    expect(screen.getByText(mockMilestone.details)).toBeInTheDocument();
  });
});
