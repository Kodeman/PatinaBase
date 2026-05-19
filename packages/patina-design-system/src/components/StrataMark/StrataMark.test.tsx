import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StrataMark } from './StrataMark'

describe('StrataMark', () => {
  it('renders an SVG element', () => {
    const { container } = render(<StrataMark />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders three lines (the three-line motif)', () => {
    const { container } = render(<StrataMark />)
    const lines = container.querySelectorAll('line')
    expect(lines).toHaveLength(3)
  })

  it('defaults to size 14', () => {
    const { container } = render(<StrataMark />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '14')
    expect(svg).toHaveAttribute('height', '14')
  })

  it('accepts a custom size', () => {
    const { container } = render(<StrataMark size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('height', '32')
  })

  it('accepts a custom color', () => {
    const { container } = render(<StrataMark color="red" />)
    const lines = container.querySelectorAll('line')
    lines.forEach((line) => {
      expect(line).toHaveAttribute('stroke', 'red')
    })
  })

  it('uses currentColor by default', () => {
    const { container } = render(<StrataMark />)
    const lines = container.querySelectorAll('line')
    lines.forEach((line) => {
      expect(line).toHaveAttribute('stroke', 'currentColor')
    })
  })

  it('applies additional className', () => {
    const { container } = render(<StrataMark className="text-primary" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('text-primary')
  })

  // --- Accessibility ---

  it('is aria-hidden by default (decorative use)', () => {
    const { container } = render(<StrataMark />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('accepts aria-label and becomes role=img when provided', () => {
    render(<StrataMark aria-label="Patina logo" />)
    const svg = screen.getByRole('img', { name: 'Patina logo' })
    expect(svg).toBeInTheDocument()
  })

  it('respects explicit role override', () => {
    const { container } = render(<StrataMark role="presentation" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('role', 'presentation')
  })

  it('has a displayName of StrataMark', () => {
    expect(StrataMark.displayName).toBe('StrataMark')
  })
})
