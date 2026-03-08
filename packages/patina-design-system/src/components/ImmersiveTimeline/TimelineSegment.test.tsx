import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimelineSegment, TimelineSegmentData } from './TimelineSegment'

const mockSegment: TimelineSegmentData = {
  id: '1',
  type: 'milestone',
  status: 'completed',
  title: 'Test Milestone',
  description: 'Test description',
  date: new Date('2024-01-15'),
}

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

describe('TimelineSegment', () => {
  it('renders segment title and description', () => {
    render(<TimelineSegment segment={mockSegment} />)

    expect(screen.getByText('Test Milestone')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('renders date when provided', () => {
    render(<TimelineSegment segment={mockSegment} />)

    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
  })

  it('renders type badge', () => {
    render(<TimelineSegment segment={mockSegment} />)

    expect(screen.getByText('milestone')).toBeInTheDocument()
  })

  it('renders completed status correctly', () => {
    const { container } = render(<TimelineSegment segment={mockSegment} />)

    const marker = container.querySelector('svg')
    expect(marker).toBeInTheDocument()
  })

  it('renders active status correctly', () => {
    const activeSegment = { ...mockSegment, status: 'active' as const }
    render(<TimelineSegment segment={activeSegment} />)

    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('renders upcoming status correctly', () => {
    const upcomingSegment = { ...mockSegment, status: 'upcoming' as const }
    const { container } = render(<TimelineSegment segment={upcomingSegment} />)

    expect(container.firstChild).toHaveClass(/opacity-60/)
  })

  it('renders blocked status correctly', () => {
    const blockedSegment = { ...mockSegment, status: 'blocked' as const }
    const { container } = render(<TimelineSegment segment={blockedSegment} />)

    expect(container.firstChild).toHaveClass(/opacity-40/)
    expect(container.firstChild).toHaveClass(/cursor-not-allowed/)
  })

  it('handles different segment sizes', () => {
    const { container, rerender } = render(
      <TimelineSegment segment={mockSegment} size="compact" />
    )

    expect(container.firstChild).toHaveClass(/py-4/)

    rerender(<TimelineSegment segment={mockSegment} size="hero" />)
    expect(container.firstChild).toHaveClass(/py-16/)
  })

  it('shows expand/collapse button when expandable', async () => {
    const user = userEvent.setup()
    render(<TimelineSegment segment={mockSegment} expandable />)

    const expandButton = screen.getByRole('button', { name: /show more/i })
    expect(expandButton).toBeInTheDocument()

    await user.click(expandButton)
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument()
  })

  it('calls onExpand when expanded', async () => {
    const user = userEvent.setup()
    const onExpand = vi.fn()

    render(
      <TimelineSegment segment={mockSegment} expandable onExpand={onExpand} />
    )

    const expandButton = screen.getByRole('button', { name: /show more/i })
    await user.click(expandButton)

    expect(onExpand).toHaveBeenCalledWith('1')
  })

  it('renders custom icon when provided', () => {
    const customIcon = <span data-testid="custom-icon">★</span>
    const segmentWithIcon = { ...mockSegment, icon: customIcon }

    render(<TimelineSegment segment={segmentWithIcon} />)

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  it('renders children when provided', () => {
    render(
      <TimelineSegment segment={mockSegment}>
        <div data-testid="custom-content">Custom Content</div>
      </TimelineSegment>
    )

    expect(screen.getByTestId('custom-content')).toBeInTheDocument()
  })

  it('hides children when collapsed and expandable', () => {
    const { container } = render(
      <TimelineSegment segment={mockSegment} expandable>
        <div>Content to hide</div>
      </TimelineSegment>
    )

    const contentWrapper = container.querySelector('.max-h-0')
    expect(contentWrapper).toBeInTheDocument()
  })

  it('renders different segment types with correct badges', () => {
    const types: Array<'milestone' | 'task' | 'approval' | 'update'> = [
      'milestone',
      'task',
      'approval',
      'update',
    ]

    types.forEach((type) => {
      const { rerender } = render(
        <TimelineSegment segment={{ ...mockSegment, type }} />
      )

      expect(screen.getByText(type)).toBeInTheDocument()
      rerender(<div />)
    })
  })
})
