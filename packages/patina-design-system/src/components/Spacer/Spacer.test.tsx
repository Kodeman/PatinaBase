import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Spacer } from './Spacer'

describe('Spacer', () => {
  it('renders correctly', () => {
    const { container } = render(<Spacer />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders as div by default', () => {
    const { container } = render(<Spacer />)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('renders as different element when "as" prop is provided', () => {
    const { container } = render(<Spacer as="span" />)
    expect(container.firstChild?.nodeName).toBe('SPAN')
  })

  it('has aria-hidden attribute', () => {
    const { container } = render(<Spacer />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies vertical spacing by default', () => {
    const { container } = render(<Spacer size="md" />)
    const element = container.firstChild as HTMLElement
    expect(element.style.height).toBe('1rem')
    expect(element).toHaveClass('block')
  })

  it('applies horizontal spacing when axis is horizontal', () => {
    const { container } = render(<Spacer axis="horizontal" size="md" />)
    const element = container.firstChild as HTMLElement
    expect(element.style.width).toBe('1rem')
    expect(element).toHaveClass('inline-block')
  })

  it('applies correct size for xs', () => {
    const { container } = render(<Spacer size="xs" />)
    const element = container.firstChild as HTMLElement
    expect(element.style.height).toBe('0.25rem')
  })

  it('applies correct size for sm', () => {
    const { container } = render(<Spacer size="sm" />)
    const element = container.firstChild as HTMLElement
    expect(element.style.height).toBe('0.5rem')
  })

  it('applies correct size for md', () => {
    const { container } = render(<Spacer size="md" />)
    const element = container.firstChild as HTMLElement
    expect(element.style.height).toBe('1rem')
  })

  it('applies correct size for lg', () => {
    const { container } = render(<Spacer size="lg" />)
    const element = container.firstChild as HTMLElement
    expect(element.style.height).toBe('1.5rem')
  })

  it('applies correct size for xl', () => {
    const { container } = render(<Spacer size="xl" />)
    const element = container.firstChild as HTMLElement
    expect(element.style.height).toBe('2rem')
  })

  it('applies correct size for 2xl', () => {
    const { container } = render(<Spacer size="2xl" />)
    const element = container.firstChild as HTMLElement
    expect(element.style.height).toBe('3rem')
  })

  it('applies flexShrink: 0', () => {
    const { container } = render(<Spacer />)
    const element = container.firstChild as HTMLElement
    expect(element.style.flexShrink).toBe('0')
  })

  it('applies custom className', () => {
    const { container } = render(<Spacer className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Spacer ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('supports HTML attributes', () => {
    render(<Spacer data-testid="test-spacer" />)
    const spacer = screen.getByTestId('test-spacer')
    expect(spacer).toBeInTheDocument()
  })

  it('merges custom styles with component styles', () => {
    const { container } = render(
      <Spacer size="lg" style={{ backgroundColor: 'red' }} />
    )
    const element = container.firstChild as HTMLElement
    expect(element.style.height).toBe('1.5rem')
    expect(element.style.backgroundColor).toBe('red')
    expect(element.style.flexShrink).toBe('0')
  })

  it('works in vertical layout', () => {
    const { container } = render(
      <div>
        <div>Item 1</div>
        <Spacer size="lg" />
        <div>Item 2</div>
      </div>
    )
    const spacer = container.querySelector('div > div:nth-child(2)') as HTMLElement
    expect(spacer.style.height).toBe('1.5rem')
  })

  it('works in horizontal layout', () => {
    const { container } = render(
      <div style={{ display: 'flex' }}>
        <div>Item 1</div>
        <Spacer axis="horizontal" size="lg" />
        <div>Item 2</div>
      </div>
    )
    const spacer = container.querySelector('div > div:nth-child(2)') as HTMLElement
    expect(spacer.style.width).toBe('1.5rem')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Spacer size="lg" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
