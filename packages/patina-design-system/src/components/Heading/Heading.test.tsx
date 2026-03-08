import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Heading } from './Heading'

describe('Heading', () => {
  it('renders children correctly', () => {
    render(<Heading>Test Heading</Heading>)
    expect(screen.getByText('Test Heading')).toBeInTheDocument()
  })

  it('renders as h2 by default', () => {
    const { container } = render(<Heading>Heading</Heading>)
    expect(container.firstChild?.nodeName).toBe('H2')
  })

  it('renders as h1 when specified', () => {
    const { container } = render(<Heading as="h1">Heading</Heading>)
    expect(container.firstChild?.nodeName).toBe('H1')
  })

  it('renders as h3 when specified', () => {
    const { container } = render(<Heading as="h3">Heading</Heading>)
    expect(container.firstChild?.nodeName).toBe('H3')
  })

  it('applies default h2 size when size is not specified', () => {
    const { container } = render(<Heading>Heading</Heading>)
    expect(container.firstChild).toHaveClass('text-3xl')
  })

  it('applies default h1 size when as="h1" and size is not specified', () => {
    const { container } = render(<Heading as="h1">Heading</Heading>)
    expect(container.firstChild).toHaveClass('text-4xl')
  })

  it('applies custom size when specified', () => {
    const { container } = render(<Heading size="6xl">Heading</Heading>)
    expect(container.firstChild).toHaveClass('text-6xl')
  })

  it('applies headline variant by default', () => {
    const { container } = render(<Heading>Heading</Heading>)
    expect(container.firstChild).toHaveClass('font-bold')
  })

  it('applies display variant correctly', () => {
    const { container } = render(<Heading variant="display">Heading</Heading>)
    expect(container.firstChild).toHaveClass('font-extrabold')
  })

  it('applies title variant correctly', () => {
    const { container } = render(<Heading variant="title">Heading</Heading>)
    expect(container.firstChild).toHaveClass('font-semibold')
  })

  it('applies subtitle variant correctly', () => {
    const { container } = render(<Heading variant="subtitle">Heading</Heading>)
    expect(container.firstChild).toHaveClass('font-medium')
  })

  it('applies weight override', () => {
    const { container } = render(<Heading weight="extrabold">Heading</Heading>)
    expect(container.firstChild).toHaveClass('font-extrabold')
  })

  it('applies left align by default', () => {
    const { container } = render(<Heading>Heading</Heading>)
    expect(container.firstChild).toHaveClass('text-left')
  })

  it('applies center align correctly', () => {
    const { container } = render(<Heading align="center">Heading</Heading>)
    expect(container.firstChild).toHaveClass('text-center')
  })

  it('applies right align correctly', () => {
    const { container } = render(<Heading align="right">Heading</Heading>)
    expect(container.firstChild).toHaveClass('text-right')
  })

  it('applies tracking-tight class', () => {
    const { container } = render(<Heading>Heading</Heading>)
    expect(container.firstChild).toHaveClass('tracking-tight')
  })

  it('applies custom className', () => {
    const { container } = render(<Heading className="custom-class">Heading</Heading>)
    expect(container.firstChild).toHaveClass('custom-class')
    expect(container.firstChild).toHaveClass('font-bold')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Heading ref={ref}>Heading</Heading>)
    expect(ref.current).toBeInstanceOf(HTMLHeadingElement)
  })

  it('supports HTML attributes', () => {
    render(
      <Heading data-testid="test-heading" id="main-title">
        Heading
      </Heading>
    )
    const heading = screen.getByTestId('test-heading')
    expect(heading).toHaveAttribute('id', 'main-title')
  })

  it('combines multiple variants correctly', () => {
    const { container } = render(
      <Heading as="h1" variant="display" size="6xl" align="center" weight="black">
        Heading
      </Heading>
    )
    expect(container.firstChild?.nodeName).toBe('H1')
    expect(container.firstChild).toHaveClass('text-6xl', 'font-black', 'text-center')
  })

  it('applies all heading levels with default sizes', () => {
    const levels = [
      { as: 'h1' as const, expectedSize: 'text-4xl' },
      { as: 'h2' as const, expectedSize: 'text-3xl' },
      { as: 'h3' as const, expectedSize: 'text-2xl' },
      { as: 'h4' as const, expectedSize: 'text-xl' },
      { as: 'h5' as const, expectedSize: 'text-lg' },
      { as: 'h6' as const, expectedSize: 'text-md' },
    ]

    levels.forEach(({ as, expectedSize }) => {
      const { container } = render(<Heading as={as}>Heading</Heading>)
      expect(container.firstChild).toHaveClass(expectedSize)
    })
  })

  it('supports all size values', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'] as const
    const sizeClasses = {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-md',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
      '5xl': 'text-5xl',
      '6xl': 'text-6xl',
      '7xl': 'text-7xl',
      '8xl': 'text-8xl',
      '9xl': 'text-9xl',
    }

    sizes.forEach((size) => {
      const { container } = render(<Heading size={size}>Heading</Heading>)
      expect(container.firstChild).toHaveClass(sizeClasses[size])
    })
  })

  it('supports all weight values', () => {
    const weights = ['normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'] as const
    const weightClasses = {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
      extrabold: 'font-extrabold',
      black: 'font-black',
    }

    weights.forEach((weight) => {
      const { container } = render(<Heading weight={weight}>Heading</Heading>)
      expect(container.firstChild).toHaveClass(weightClasses[weight])
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Heading as="h1" variant="display">
        Page Title
      </Heading>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations with all variants', async () => {
    const { container } = render(
      <div>
        <Heading as="h1">Heading 1</Heading>
        <Heading as="h2">Heading 2</Heading>
        <Heading as="h3">Heading 3</Heading>
        <Heading as="h4">Heading 4</Heading>
        <Heading as="h5">Heading 5</Heading>
        <Heading as="h6">Heading 6</Heading>
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
