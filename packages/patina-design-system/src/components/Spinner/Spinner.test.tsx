import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('renders circular spinner by default', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders with custom label', () => {
    render(<Spinner label="Processing..." />)
    expect(screen.getByLabelText('Processing...')).toBeInTheDocument()
    expect(screen.getByText('Processing...')).toHaveClass('sr-only')
  })

  it('renders circular variant with SVG', () => {
    const { container } = render(<Spinner variant="circular" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders dots variant', () => {
    const { container } = render(<Spinner variant="dots" />)
    const dots = container.querySelectorAll('.rounded-full')
    expect(dots).toHaveLength(3)
  })

  it('renders bars variant', () => {
    const { container } = render(<Spinner variant="bars" />)
    const bars = container.querySelectorAll('.rounded-sm')
    expect(bars).toHaveLength(3)
  })

  it('applies size variants', () => {
    const { rerender, container } = render(<Spinner size="sm" variant="circular" />)
    expect(container.querySelector('svg')).toHaveClass('h-4', 'w-4')

    rerender(<Spinner size="md" variant="circular" />)
    expect(container.querySelector('svg')).toHaveClass('h-6', 'w-6')

    rerender(<Spinner size="lg" variant="circular" />)
    expect(container.querySelector('svg')).toHaveClass('h-8', 'w-8')

    rerender(<Spinner size="xl" variant="circular" />)
    expect(container.querySelector('svg')).toHaveClass('h-12', 'w-12')
  })

  it('applies color variants', () => {
    const { rerender, container } = render(<Spinner color="primary" />)
    expect(container.querySelector('svg')).toHaveClass('text-primary')

    rerender(<Spinner color="secondary" />)
    expect(container.querySelector('svg')).toHaveClass('text-secondary')

    rerender(<Spinner color="white" />)
    expect(container.querySelector('svg')).toHaveClass('text-white')

    rerender(<Spinner color="current" />)
    expect(container.querySelector('svg')).toHaveClass('text-current')
  })

  it('applies speed variants', () => {
    const { rerender, container } = render(<Spinner speed="slow" />)
    expect(container.querySelector('svg')).toHaveClass('animate-spin-slow')

    rerender(<Spinner speed="normal" />)
    expect(container.querySelector('svg')).toHaveClass('animate-spin')

    rerender(<Spinner speed="fast" />)
    expect(container.querySelector('svg')).toHaveClass('animate-spin-fast')
  })

  it('applies custom className', () => {
    const { container } = render(<Spinner className="custom-class" />)
    expect(container.querySelector('[role="status"]')).toHaveClass('custom-class')
  })

  it('has proper accessibility attributes', () => {
    render(<Spinner label="Loading data" />)
    const spinner = screen.getByRole('status')
    expect(spinner).toHaveAttribute('aria-label', 'Loading data')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Spinner ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })

  it('passes through additional props', () => {
    render(<Spinner data-testid="custom-spinner" />)
    expect(screen.getByTestId('custom-spinner')).toBeInTheDocument()
  })
})
