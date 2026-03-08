import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Blockquote } from './Blockquote'

describe('Blockquote', () => {
  it('renders children correctly', () => {
    render(<Blockquote>This is a quote</Blockquote>)
    expect(screen.getByText('This is a quote')).toBeInTheDocument()
  })

  it('applies variant styles', () => {
    const { container } = render(
      <Blockquote variant="primary">Primary quote</Blockquote>
    )
    const blockquote = container.querySelector('blockquote')
    expect(blockquote).toHaveClass('border-primary')
  })

  it('applies size styles', () => {
    const { container } = render(
      <Blockquote size="lg">Large quote</Blockquote>
    )
    const blockquote = container.querySelector('blockquote')
    expect(blockquote).toHaveClass('text-lg')
  })

  it('renders with citation attribute', () => {
    const { container } = render(
      <Blockquote cite="Steve Jobs">Innovation quote</Blockquote>
    )
    const blockquote = container.querySelector('blockquote')
    expect(blockquote).toHaveAttribute('cite', 'Steve Jobs')
  })

  it('shows citation when showCite is true', () => {
    render(
      <Blockquote cite="Steve Jobs" showCite>
        Innovation quote
      </Blockquote>
    )
    expect(screen.getByText(/— Steve Jobs/)).toBeInTheDocument()
  })

  it('does not show citation when showCite is false', () => {
    render(
      <Blockquote cite="Steve Jobs">
        Innovation quote
      </Blockquote>
    )
    expect(screen.queryByText(/— Steve Jobs/)).not.toBeInTheDocument()
  })

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLQuoteElement>()
    render(<Blockquote ref={ref}>Quote with ref</Blockquote>)
    expect(ref.current).toBeInstanceOf(HTMLQuoteElement)
  })

  it('applies custom className', () => {
    const { container } = render(
      <Blockquote className="custom-class">Custom quote</Blockquote>
    )
    const figure = container.querySelector('figure')
    expect(figure).toHaveClass('custom-class')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Blockquote cite="Author" showCite>
        Accessible quote
      </Blockquote>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders all variants correctly', () => {
    const variants = ['default', 'primary', 'success', 'warning', 'error'] as const
    variants.forEach((variant) => {
      const { container } = render(
        <Blockquote variant={variant}>{variant} quote</Blockquote>
      )
      const blockquote = container.querySelector('blockquote')
      expect(blockquote).toBeInTheDocument()
    })
  })

  it('renders all sizes correctly', () => {
    const sizes = ['sm', 'md', 'lg', 'xl'] as const
    sizes.forEach((size) => {
      const { container } = render(
        <Blockquote size={size}>{size} quote</Blockquote>
      )
      const blockquote = container.querySelector('blockquote')
      expect(blockquote).toHaveClass(`text-${size}`)
    })
  })
})
