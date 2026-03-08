import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Center } from './Center'

describe('Center', () => {
  it('renders children correctly', () => {
    render(<Center>Centered content</Center>)
    expect(screen.getByText('Centered content')).toBeInTheDocument()
  })

  it('renders as div by default', () => {
    const { container } = render(<Center>Content</Center>)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('renders as different element when "as" prop is provided', () => {
    const { container } = render(<Center as="section">Content</Center>)
    expect(container.firstChild?.nodeName).toBe('SECTION')
  })

  it('applies flex centering classes by default', () => {
    const { container } = render(<Center>Content</Center>)
    expect(container.firstChild).toHaveClass('flex', 'items-center', 'justify-center')
  })

  it('applies inline-flex when inline is true', () => {
    const { container } = render(<Center inline>Content</Center>)
    expect(container.firstChild).toHaveClass('inline-flex', 'items-center', 'justify-center')
  })

  it('applies custom className', () => {
    const { container } = render(<Center className="custom-class">Content</Center>)
    expect(container.firstChild).toHaveClass('custom-class')
    expect(container.firstChild).toHaveClass('flex', 'items-center', 'justify-center')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Center ref={ref}>Content</Center>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('supports HTML attributes', () => {
    render(
      <Center data-testid="test-center" aria-label="Centered container">
        Content
      </Center>
    )
    const center = screen.getByTestId('test-center')
    expect(center).toHaveAttribute('aria-label', 'Centered container')
  })

  it('centers content properly with height constraint', () => {
    const { container } = render(
      <Center className="h-screen">
        <div>Vertically centered</div>
      </Center>
    )
    expect(container.firstChild).toHaveClass('h-screen')
    expect(container.firstChild).toHaveClass('items-center')
    expect(screen.getByText('Vertically centered')).toBeInTheDocument()
  })

  it('works with inline content', () => {
    const { container } = render(
      <div>
        Text before <Center inline className="w-20 h-20">Icon</Center> text after
      </div>
    )
    const center = container.querySelector('.inline-flex')
    expect(center).toBeInTheDocument()
    expect(center).toHaveClass('w-20', 'h-20')
  })

  it('supports style prop', () => {
    const { container } = render(
      <Center style={{ backgroundColor: 'red', width: '100px', height: '100px' }}>
        Content
      </Center>
    )
    const element = container.firstChild as HTMLElement
    expect(element.style.backgroundColor).toBe('red')
    expect(element.style.width).toBe('100px')
    expect(element.style.height).toBe('100px')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Center>
        <button>Centered Button</button>
      </Center>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations with inline', async () => {
    const { container } = render(
      <Center inline>
        <span>Centered Span</span>
      </Center>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
