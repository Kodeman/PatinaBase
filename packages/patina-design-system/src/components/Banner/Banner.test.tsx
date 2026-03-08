import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Banner, BannerTitle, BannerDescription } from './Banner'

describe('Banner', () => {
  it('renders with title and description', () => {
    render(<Banner title="Test Title" description="Test description" />)

    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('renders with children', () => {
    render(
      <Banner>
        <BannerTitle>Custom Title</BannerTitle>
        <BannerDescription>Custom description</BannerDescription>
      </Banner>
    )

    expect(screen.getByText('Custom Title')).toBeInTheDocument()
    expect(screen.getByText('Custom description')).toBeInTheDocument()
  })

  it('applies correct variant styles', () => {
    const { container, rerender } = render(
      <Banner variant="success" title="Success" />
    )
    let banner = container.querySelector('[role="region"]')
    expect(banner).toHaveClass('bg-green-50')

    rerender(<Banner variant="error" title="Error" />)
    banner = container.querySelector('[role="region"]')
    expect(banner).toHaveClass('bg-red-50')
  })

  it('shows close button when closable', () => {
    render(<Banner title="Test" closable />)

    const closeButton = screen.getByRole('button', { name: /close banner/i })
    expect(closeButton).toBeInTheDocument()
  })

  it('does not show close button by default', () => {
    render(<Banner title="Test" />)

    const closeButton = screen.queryByRole('button', { name: /close banner/i })
    expect(closeButton).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()

    render(<Banner title="Test" closable onClose={handleClose} />)

    const closeButton = screen.getByRole('button', { name: /close banner/i })
    await user.click(closeButton)

    expect(handleClose).toHaveBeenCalled()
  })

  it('hides banner when closed', async () => {
    const user = userEvent.setup()

    render(<Banner title="Test Banner" closable />)

    expect(screen.getByText('Test Banner')).toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: /close banner/i })
    await user.click(closeButton)

    expect(screen.queryByText('Test Banner')).not.toBeInTheDocument()
  })

  it('renders action element', () => {
    render(
      <Banner
        title="Test"
        action={<button>Learn More</button>}
      />
    )

    expect(screen.getByText('Learn More')).toBeInTheDocument()
  })

  it('supports different positions', () => {
    const { container, rerender } = render(
      <Banner title="Test" position="top" />
    )
    let banner = container.querySelector('[role="region"]')
    expect(banner).toHaveClass('fixed', 'top-0')

    rerender(<Banner title="Test" position="bottom" />)
    banner = container.querySelector('[role="region"]')
    expect(banner).toHaveClass('fixed', 'bottom-0')

    rerender(<Banner title="Test" position="static" />)
    banner = container.querySelector('[role="region"]')
    expect(banner).toHaveClass('relative')
  })

  it('has correct ARIA attributes', () => {
    const { container } = render(<Banner title="Test" />)
    const banner = container.querySelector('[role="region"]')
    expect(banner).toHaveAttribute('aria-live', 'polite')
  })

  it('renders default icon for each variant', () => {
    const { container, rerender } = render(<Banner variant="info" title="Info" />)
    expect(container.querySelector('svg')).toBeInTheDocument()

    rerender(<Banner variant="success" title="Success" />)
    expect(container.querySelector('svg')).toBeInTheDocument()

    rerender(<Banner variant="warning" title="Warning" />)
    expect(container.querySelector('svg')).toBeInTheDocument()

    rerender(<Banner variant="error" title="Error" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('supports custom icon', () => {
    const CustomIcon = () => <span data-testid="custom-icon">⭐</span>
    render(<Banner title="Test" icon={<CustomIcon />} />)

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })
})
