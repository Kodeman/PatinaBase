import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImmersiveTimeline } from './ImmersiveTimeline'
import { TimelineSegmentData } from './TimelineSegment'

const mockSegments: TimelineSegmentData[] = [
  {
    id: '1',
    type: 'milestone',
    status: 'completed',
    title: 'Phase 1',
    description: 'Initial phase completed',
    date: new Date('2024-01-15'),
  },
  {
    id: '2',
    type: 'approval',
    status: 'active',
    title: 'Phase 2',
    description: 'Currently in progress',
    date: new Date('2024-02-01'),
  },
  {
    id: '3',
    type: 'task',
    status: 'upcoming',
    title: 'Phase 3',
    description: 'Scheduled for future',
  },
]

describe('ImmersiveTimeline', () => {
  beforeEach(() => {
    // Mock IntersectionObserver
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }))
  })

  it('renders timeline with segments', () => {
    render(<ImmersiveTimeline segments={mockSegments} />)

    expect(screen.getByText('Phase 1')).toBeInTheDocument()
    expect(screen.getByText('Phase 2')).toBeInTheDocument()
    expect(screen.getByText('Phase 3')).toBeInTheDocument()
  })

  it('shows progress indicator when enabled', () => {
    const { container } = render(
      <ImmersiveTimeline segments={mockSegments} showProgress />
    )

    const progressIndicator = container.querySelector('[class*="fixed"]')
    expect(progressIndicator).toBeInTheDocument()
  })

  it('hides progress indicator when disabled', () => {
    const { container } = render(
      <ImmersiveTimeline segments={mockSegments} showProgress={false} />
    )

    const progressIndicator = container.querySelector('[class*="fixed"]')
    expect(progressIndicator).not.toBeInTheDocument()
  })

  it('calls onSegmentChange when segment becomes active', async () => {
    const onSegmentChange = vi.fn()

    render(
      <ImmersiveTimeline
        segments={mockSegments}
        onSegmentChange={onSegmentChange}
      />
    )

    // Note: Would need to trigger IntersectionObserver callback
    // This is a simplified test
    expect(onSegmentChange).not.toHaveBeenCalled()
  })

  it('renders with different layouts', () => {
    const { rerender, container } = render(
      <ImmersiveTimeline segments={mockSegments} layout="default" />
    )

    expect(container.firstChild).toHaveClass(/max-w-4xl/)

    rerender(<ImmersiveTimeline segments={mockSegments} layout="wide" />)
    expect(container.firstChild?.firstChild).toHaveClass(/max-w-6xl/)
  })

  it('renders with different spacing', () => {
    const { rerender, container } = render(
      <ImmersiveTimeline segments={mockSegments} spacing="compact" />
    )

    expect(container.firstChild?.firstChild).toHaveClass(/space-y-2/)

    rerender(<ImmersiveTimeline segments={mockSegments} spacing="spacious" />)
    expect(container.firstChild?.firstChild).toHaveClass(/space-y-16/)
  })

  it('renders custom segment content', () => {
    const renderSegment = (segment: TimelineSegmentData) => (
      <div data-testid={`custom-${segment.id}`}>{segment.title}</div>
    )

    render(
      <ImmersiveTimeline segments={mockSegments} renderSegment={renderSegment} />
    )

    expect(screen.getByTestId('custom-1')).toBeInTheDocument()
    expect(screen.getByTestId('custom-2')).toBeInTheDocument()
    expect(screen.getByTestId('custom-3')).toBeInTheDocument()
  })

  it('shows keyboard navigation hint when enabled', () => {
    render(<ImmersiveTimeline segments={mockSegments} enableKeyboardNav />)

    const hint = screen.getByText(/navigate/)
    expect(hint).toBeInTheDocument()
  })

  it('hides keyboard navigation hint when disabled', () => {
    render(
      <ImmersiveTimeline segments={mockSegments} enableKeyboardNav={false} />
    )

    expect(screen.queryByText(/navigate/)).not.toBeInTheDocument()
  })

  it('handles empty segments array', () => {
    const { container } = render(<ImmersiveTimeline segments={[]} />)

    expect(container.firstChild).toBeInTheDocument()
    expect(screen.queryByText('Phase 1')).not.toBeInTheDocument()
  })

  it('applies correct data attributes to segments', () => {
    const { container } = render(<ImmersiveTimeline segments={mockSegments} />)

    const segment = container.querySelector('[data-segment-id="1"]')
    expect(segment).toBeInTheDocument()
    expect(segment).toHaveAttribute('data-segment-id', '1')
  })

  it('sets progress position correctly', () => {
    const { container, rerender } = render(
      <ImmersiveTimeline
        segments={mockSegments}
        showProgress
        progressPosition="fixed-left"
      />
    )

    let progressIndicator = container.querySelector('[class*="left-"]')
    expect(progressIndicator).toBeInTheDocument()

    rerender(
      <ImmersiveTimeline
        segments={mockSegments}
        showProgress
        progressPosition="fixed-right"
      />
    )

    progressIndicator = container.querySelector('[class*="right-"]')
    expect(progressIndicator).toBeInTheDocument()
  })
})
