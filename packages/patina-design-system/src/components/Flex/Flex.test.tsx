import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Flex } from './Flex'

describe('Flex', () => {
  it('renders children correctly', () => {
    render(
      <Flex>
        <div>Item 1</div>
        <div>Item 2</div>
      </Flex>
    )
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
  })

  it('renders as div by default', () => {
    const { container } = render(<Flex>Content</Flex>)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('renders as different element when "as" prop is provided', () => {
    const { container } = render(<Flex as="section">Content</Flex>)
    expect(container.firstChild?.nodeName).toBe('SECTION')
  })

  it('applies flex display', () => {
    const { container } = render(<Flex>Content</Flex>)
    expect(container.firstChild).toHaveClass('flex')
  })

  it('applies default direction (row)', () => {
    const { container } = render(<Flex>Content</Flex>)
    expect(container.firstChild).toHaveClass('flex-row')
  })

  it('applies direction correctly', () => {
    const { container } = render(<Flex direction="column">Content</Flex>)
    expect(container.firstChild).toHaveClass('flex-col')
  })

  it('applies wrap correctly', () => {
    const { container } = render(<Flex wrap={true}>Content</Flex>)
    expect(container.firstChild).toHaveClass('flex-wrap')
  })

  it('applies nowrap by default', () => {
    const { container } = render(<Flex>Content</Flex>)
    expect(container.firstChild).toHaveClass('flex-nowrap')
  })

  it('applies wrap-reverse correctly', () => {
    const { container } = render(<Flex wrap="reverse">Content</Flex>)
    expect(container.firstChild).toHaveClass('flex-wrap-reverse')
  })

  it('applies gap correctly', () => {
    const { container } = render(<Flex gap="lg">Content</Flex>)
    expect(container.firstChild).toHaveClass('gap-6')
  })

  it('applies default gap', () => {
    const { container } = render(<Flex>Content</Flex>)
    expect(container.firstChild).toHaveClass('gap-4')
  })

  it('applies align correctly', () => {
    const { container } = render(<Flex align="center">Content</Flex>)
    expect(container.firstChild).toHaveClass('items-center')
  })

  it('applies default align', () => {
    const { container } = render(<Flex>Content</Flex>)
    expect(container.firstChild).toHaveClass('items-stretch')
  })

  it('applies justify correctly', () => {
    const { container } = render(<Flex justify="between">Content</Flex>)
    expect(container.firstChild).toHaveClass('justify-between')
  })

  it('applies default justify', () => {
    const { container } = render(<Flex>Content</Flex>)
    expect(container.firstChild).toHaveClass('justify-start')
  })

  it('applies custom className', () => {
    const { container } = render(<Flex className="custom-class">Content</Flex>)
    expect(container.firstChild).toHaveClass('custom-class')
    expect(container.firstChild).toHaveClass('flex')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Flex ref={ref}>Content</Flex>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('supports HTML attributes', () => {
    render(
      <Flex data-testid="test-flex" aria-label="Test flex">
        Content
      </Flex>
    )
    const flex = screen.getByTestId('test-flex')
    expect(flex).toHaveAttribute('aria-label', 'Test flex')
  })

  it('combines multiple variants correctly', () => {
    const { container } = render(
      <Flex direction="column" align="center" justify="between" gap="xl" wrap={true}>
        Content
      </Flex>
    )
    expect(container.firstChild).toHaveClass('flex')
    expect(container.firstChild).toHaveClass('flex-col')
    expect(container.firstChild).toHaveClass('items-center')
    expect(container.firstChild).toHaveClass('justify-between')
    expect(container.firstChild).toHaveClass('gap-8')
    expect(container.firstChild).toHaveClass('flex-wrap')
  })

  it('uses asChild to compose with child element', () => {
    const { container } = render(
      <Flex asChild>
        <a href="/test">Link</a>
      </Flex>
    )
    const link = container.querySelector('a')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/test')
    expect(link).toHaveClass('flex')
  })

  it('merges classNames correctly when using asChild', () => {
    const { container } = render(
      <Flex asChild className="flex-class" align="center">
        <a href="/test" className="link-class">
          Link
        </a>
      </Flex>
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('flex-class')
    expect(link).toHaveClass('link-class')
    expect(link).toHaveClass('items-center')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Flex align="center" gap="md">
        <button>Button 1</button>
        <button>Button 2</button>
      </Flex>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('supports all direction values', () => {
    const directions = ['row', 'column', 'row-reverse', 'column-reverse'] as const
    const directionClasses = {
      row: 'flex-row',
      column: 'flex-col',
      'row-reverse': 'flex-row-reverse',
      'column-reverse': 'flex-col-reverse',
    }

    directions.forEach((direction) => {
      const { container } = render(<Flex direction={direction}>Content</Flex>)
      expect(container.firstChild).toHaveClass(directionClasses[direction])
    })
  })

  it('supports all align values', () => {
    const aligns = ['start', 'center', 'end', 'stretch', 'baseline'] as const
    const alignClasses = {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
      baseline: 'items-baseline',
    }

    aligns.forEach((align) => {
      const { container } = render(<Flex align={align}>Content</Flex>)
      expect(container.firstChild).toHaveClass(alignClasses[align])
    })
  })

  it('supports all justify values', () => {
    const justifies = ['start', 'center', 'end', 'between', 'around', 'evenly'] as const
    const justifyClasses = {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
      evenly: 'justify-evenly',
    }

    justifies.forEach((justify) => {
      const { container } = render(<Flex justify={justify}>Content</Flex>)
      expect(container.firstChild).toHaveClass(justifyClasses[justify])
    })
  })
})
