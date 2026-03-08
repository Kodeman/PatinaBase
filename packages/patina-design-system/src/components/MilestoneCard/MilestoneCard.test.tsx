import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MilestoneCard } from './MilestoneCard'
import { Calendar } from 'lucide-react'

describe('MilestoneCard', () => {
  it('renders with title', () => {
    render(<MilestoneCard title="Test Milestone" />)
    expect(screen.getByText('Test Milestone')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <MilestoneCard
        title="Test Milestone"
        description="This is a test description"
      />
    )
    expect(screen.getByText('This is a test description')).toBeInTheDocument()
  })

  it('displays date when provided', () => {
    const date = new Date('2024-10-15')
    render(<MilestoneCard title="Test Milestone" date={date} />)
    expect(screen.getByText('October 15, 2024')).toBeInTheDocument()
  })

  it('applies correct status styling', () => {
    const { container } = render(
      <MilestoneCard title="Test" status="completed" />
    )
    const card = container.querySelector('div')
    expect(card).toHaveClass('border-green-200')
  })

  it('renders icon when provided', () => {
    render(
      <MilestoneCard
        title="Test"
        icon={<Calendar data-testid="calendar-icon" />}
      />
    )
    expect(screen.getByTestId('calendar-icon')).toBeInTheDocument()
  })

  it('shows completion percentage', () => {
    render(<MilestoneCard title="Test" completionPercentage={75} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('displays metrics when provided', () => {
    const metrics = [
      { label: 'Days', value: '5' },
      { label: 'Items', value: '10' },
    ]
    render(<MilestoneCard title="Test" metrics={metrics} />)
    expect(screen.getByText('Days')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Items')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('renders progress photos', () => {
    const photos = [
      { id: '1', url: '/photo1.jpg', alt: 'Photo 1' },
      { id: '2', url: '/photo2.jpg', alt: 'Photo 2' },
    ]
    render(<MilestoneCard title="Test" progressPhotos={photos} />)
    expect(screen.getByAltText('Photo 1')).toBeInTheDocument()
    expect(screen.getByAltText('Photo 2')).toBeInTheDocument()
  })

  it('displays designer note', () => {
    const note = {
      author: 'Sarah Johnson',
      message: 'Great progress!',
      timestamp: new Date('2024-10-15'),
    }
    render(<MilestoneCard title="Test" designerNote={note} />)
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument()
    expect(screen.getByText('Great progress!')).toBeInTheDocument()
  })

  it('renders primary action button', () => {
    const handleClick = vi.fn()
    render(
      <MilestoneCard
        title="Test"
        primaryAction={{
          label: 'Approve',
          onClick: handleClick,
        }}
      />
    )
    const button = screen.getByText('Approve')
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders secondary action buttons', () => {
    const handleClick1 = vi.fn()
    const handleClick2 = vi.fn()
    render(
      <MilestoneCard
        title="Test"
        secondaryActions={[
          { label: 'Action 1', onClick: handleClick1 },
          { label: 'Action 2', onClick: handleClick2 },
        ]}
      />
    )
    expect(screen.getByText('Action 1')).toBeInTheDocument()
    expect(screen.getByText('Action 2')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <MilestoneCard title="Test" className="custom-class" />
    )
    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })

  it('renders in compact size', () => {
    const { container } = render(
      <MilestoneCard title="Test" size="compact" />
    )
    const card = container.querySelector('.p-4')
    expect(card).toBeInTheDocument()
  })

  it('renders in hero size', () => {
    const { container } = render(
      <MilestoneCard title="Test" size="hero" />
    )
    const card = container.querySelector('.p-8')
    expect(card).toBeInTheDocument()
  })

  it('applies floating elevation', () => {
    const { container } = render(
      <MilestoneCard title="Test" elevation="floating" />
    )
    const card = container.querySelector('div')
    expect(card).toHaveClass('shadow-lg')
    expect(card).toHaveClass('hover:shadow-xl')
  })

  it('shows status badge with text', () => {
    render(<MilestoneCard title="Test" status="active" statusText="In Progress" />)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('limits photo display to 4 images', () => {
    const photos = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`,
      url: `/photo${i}.jpg`,
      alt: `Photo ${i}`,
    }))
    render(<MilestoneCard title="Test" progressPhotos={photos} />)
    const images = screen.getAllByRole('img')
    // Should show 4 photos plus the avatar if designer note is present
    expect(images.length).toBeLessThanOrEqual(4)
  })

  it('shows overflow count for extra photos', () => {
    const photos = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`,
      url: `/photo${i}.jpg`,
      alt: `Photo ${i}`,
    }))
    render(<MilestoneCard title="Test" progressPhotos={photos} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders custom children content', () => {
    render(
      <MilestoneCard title="Test">
        <div>Custom content</div>
      </MilestoneCard>
    )
    expect(screen.getByText('Custom content')).toBeInTheDocument()
  })
})
