import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it('renders with default props', () => {
    const { container } = render(<ProgressBar value={50} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('displays correct value', () => {
    const { container } = render(<ProgressBar value={75} max={100} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toHaveAttribute('aria-valuenow', '75')
    expect(progressBar).toHaveAttribute('aria-valuemax', '100')
  })

  it('shows percentage label when showLabel is true', () => {
    render(<ProgressBar value={60} showLabel />)
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('60 / 100')).toBeInTheDocument()
  })

  it('does not show label when showLabel is false', () => {
    render(<ProgressBar value={60} showLabel={false} />)
    expect(screen.queryByText('60%')).not.toBeInTheDocument()
  })

  it('handles custom max value', () => {
    render(<ProgressBar value={50} max={200} showLabel />)
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('50 / 200')).toBeInTheDocument()
  })

  it('clamps value to 100%', () => {
    render(<ProgressBar value={150} max={100} showLabel />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('supports different sizes', () => {
    const { container, rerender } = render(<ProgressBar value={50} size="sm" />)
    let progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toHaveClass('h-1')

    rerender(<ProgressBar value={50} size="lg" />)
    progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toHaveClass('h-3')
  })

  it('supports different variants', () => {
    const { container, rerender } = render(<ProgressBar value={50} variant="success" />)
    let progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeInTheDocument()

    rerender(<ProgressBar value={50} variant="error" />)
    progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('handles indeterminate state', () => {
    const { container } = render(<ProgressBar indeterminate />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeInTheDocument()
    // Indeterminate should not have a value
    expect(progressBar).not.toHaveAttribute('aria-valuenow')
  })

  it('does not show label in indeterminate state', () => {
    render(<ProgressBar indeterminate showLabel />)
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })

  it('handles zero value', () => {
    render(<ProgressBar value={0} showLabel />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('handles full completion', () => {
    render(<ProgressBar value={100} showLabel />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
