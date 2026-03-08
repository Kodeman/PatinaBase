import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Container } from './Container'

describe('Container', () => {
  it('renders children correctly', () => {
    render(<Container>Test content</Container>)
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('applies default size variant', () => {
    const { container } = render(<Container>Content</Container>)
    expect(container.firstChild).toHaveClass('max-w-screen-xl')
  })

  it('applies custom size variant', () => {
    const { container } = render(<Container size="md">Content</Container>)
    expect(container.firstChild).toHaveClass('max-w-screen-md')
  })

  it('applies centering by default', () => {
    const { container } = render(<Container>Content</Container>)
    expect(container.firstChild).toHaveClass('mx-auto')
  })

  it('can disable centering', () => {
    const { container } = render(<Container centered={false}>Content</Container>)
    expect(container.firstChild).not.toHaveClass('mx-auto')
  })

  it('renders as different element when "as" prop is provided', () => {
    const { container } = render(<Container as="section">Content</Container>)
    expect(container.firstChild?.nodeName).toBe('SECTION')
  })

  it('applies custom className', () => {
    const { container } = render(<Container className="custom-class">Content</Container>)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Container ref={ref}>Content</Container>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Container>Accessible content</Container>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
