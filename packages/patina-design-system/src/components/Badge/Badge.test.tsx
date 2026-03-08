import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'
import { Star } from 'lucide-react'

describe('Badge', () => {
  it('renders with text content', () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('renders with default variant and color', () => {
    const { container } = render(<Badge>Default</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('bg-primary')
  })

  it('renders solid variant colors', () => {
    const { rerender, container } = render(<Badge variant="solid" color="success">Success</Badge>)
    expect(container.querySelector('span')).toHaveClass('bg-green-600')

    rerender(<Badge variant="solid" color="warning">Warning</Badge>)
    expect(container.querySelector('span')).toHaveClass('bg-yellow-600')

    rerender(<Badge variant="solid" color="error">Error</Badge>)
    expect(container.querySelector('span')).toHaveClass('bg-red-600')

    rerender(<Badge variant="solid" color="info">Info</Badge>)
    expect(container.querySelector('span')).toHaveClass('bg-blue-600')
  })

  it('renders subtle variant colors', () => {
    const { container } = render(<Badge variant="subtle" color="success">Subtle</Badge>)
    expect(container.querySelector('span')).toHaveClass('bg-green-100')
  })

  it('renders outline variant with border', () => {
    const { container } = render(<Badge variant="outline" color="primary">Outline</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('border')
    expect(badge).toHaveClass('border-primary')
  })

  it('renders different sizes', () => {
    const { rerender, container } = render(<Badge size="sm">Small</Badge>)
    expect(container.querySelector('span')).toHaveClass('text-xs')

    rerender(<Badge size="md">Medium</Badge>)
    expect(container.querySelector('span')).toHaveClass('text-sm')

    rerender(<Badge size="lg">Large</Badge>)
    expect(container.querySelector('span')).toHaveClass('text-base')
  })

  it('renders with icon', () => {
    render(<Badge icon={<Star data-testid="star-icon" />}>Featured</Badge>)
    expect(screen.getByTestId('star-icon')).toBeInTheDocument()
  })

  it('renders dot indicator when showDot is true and variant is dot', () => {
    const { container } = render(
      <Badge variant="dot" showDot color="success">
        Live
      </Badge>
    )
    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveClass('bg-green-600')
  })

  it('does not render dot when showDot is false', () => {
    const { container } = render(
      <Badge variant="dot" showDot={false}>
        No Dot
      </Badge>
    )
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Badge className="custom-class">Custom</Badge>)
    expect(container.querySelector('span')).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Badge ref={ref}>Ref Test</Badge>)
    expect(ref).toHaveBeenCalled()
  })

  it('passes through additional props', () => {
    render(<Badge data-testid="custom-badge" aria-label="Custom label">Test</Badge>)
    const badge = screen.getByTestId('custom-badge')
    expect(badge).toHaveAttribute('aria-label', 'Custom label')
  })
})
