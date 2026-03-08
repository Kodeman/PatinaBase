import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Text } from './Text'

describe('Text', () => {
  it('renders children correctly', () => {
    render(<Text>Test text</Text>)
    expect(screen.getByText('Test text')).toBeInTheDocument()
  })

  it('renders as p by default', () => {
    const { container } = render(<Text>Text</Text>)
    expect(container.firstChild?.nodeName).toBe('P')
  })

  it('renders as span when specified', () => {
    const { container } = render(<Text as="span">Text</Text>)
    expect(container.firstChild?.nodeName).toBe('SPAN')
  })

  it('renders as div when specified', () => {
    const { container } = render(<Text as="div">Text</Text>)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('applies body variant by default', () => {
    const { container } = render(<Text>Text</Text>)
    expect(container.firstChild).toHaveClass('leading-relaxed')
  })

  it('applies caption variant correctly', () => {
    const { container } = render(<Text variant="caption">Text</Text>)
    expect(container.firstChild).toHaveClass('text-muted-foreground')
  })

  it('applies overline variant correctly', () => {
    const { container } = render(<Text variant="overline">Text</Text>)
    expect(container.firstChild).toHaveClass(
      'uppercase',
      'tracking-wider',
      'text-muted-foreground'
    )
  })

  it('applies label variant correctly', () => {
    const { container } = render(<Text variant="label">Text</Text>)
    expect(container.firstChild).toHaveClass('font-medium')
  })

  it('applies default size (md)', () => {
    const { container } = render(<Text>Text</Text>)
    expect(container.firstChild).toHaveClass('text-base')
  })

  it('applies custom size correctly', () => {
    const { container } = render(<Text size="lg">Text</Text>)
    expect(container.firstChild).toHaveClass('text-lg')
  })

  it('applies normal weight by default', () => {
    const { container } = render(<Text>Text</Text>)
    expect(container.firstChild).toHaveClass('font-normal')
  })

  it('applies custom weight correctly', () => {
    const { container } = render(<Text weight="bold">Text</Text>)
    expect(container.firstChild).toHaveClass('font-bold')
  })

  it('applies left align by default', () => {
    const { container } = render(<Text>Text</Text>)
    expect(container.firstChild).toHaveClass('text-left')
  })

  it('applies custom align correctly', () => {
    const { container } = render(<Text align="center">Text</Text>)
    expect(container.firstChild).toHaveClass('text-center')
  })

  it('does not truncate by default', () => {
    const { container } = render(<Text>Text</Text>)
    expect(container.firstChild).not.toHaveClass('truncate')
  })

  it('applies truncate when specified', () => {
    const { container } = render(<Text truncate>Text</Text>)
    expect(container.firstChild).toHaveClass('truncate')
  })

  it('applies line clamp styles when lineClamp is specified', () => {
    const { container } = render(<Text lineClamp={3}>Text</Text>)
    const element = container.firstChild as HTMLElement
    expect(element.style.display).toBe('-webkit-box')
    expect(element.style.WebkitLineClamp).toBe('3')
    expect(element.style.WebkitBoxOrient).toBe('vertical')
    expect(element.style.overflow).toBe('hidden')
  })

  it('applies different line clamp values correctly', () => {
    const clampValues = [1, 2, 3, 4, 5, 6] as const
    clampValues.forEach((clamp) => {
      const { container } = render(<Text lineClamp={clamp}>Text</Text>)
      const element = container.firstChild as HTMLElement
      expect(element.style.WebkitLineClamp).toBe(String(clamp))
    })
  })

  it('applies custom className', () => {
    const { container } = render(<Text className="custom-class">Text</Text>)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Text ref={ref}>Text</Text>)
    expect(ref.current).toBeInstanceOf(HTMLParagraphElement)
  })

  it('supports HTML attributes', () => {
    render(
      <Text data-testid="test-text" id="text-id">
        Text
      </Text>
    )
    const text = screen.getByTestId('test-text')
    expect(text).toHaveAttribute('id', 'text-id')
  })

  it('uses asChild to compose with child element', () => {
    const { container } = render(
      <Text asChild>
        <a href="/test">Link</a>
      </Text>
    )
    const link = container.querySelector('a')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/test')
  })

  it('merges classNames correctly when using asChild', () => {
    const { container } = render(
      <Text asChild className="text-class" variant="caption">
        <a href="/test" className="link-class">
          Link
        </a>
      </Text>
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('text-class')
    expect(link).toHaveClass('link-class')
    expect(link).toHaveClass('text-muted-foreground')
  })

  it('combines multiple variants correctly', () => {
    const { container } = render(
      <Text variant="caption" size="sm" weight="medium" align="center">
        Text
      </Text>
    )
    expect(container.firstChild).toHaveClass(
      'text-muted-foreground',
      'text-sm',
      'font-medium',
      'text-center'
    )
  })

  it('merges custom styles with line clamp styles', () => {
    const { container } = render(
      <Text lineClamp={2} style={{ color: 'red' }}>
        Text
      </Text>
    )
    const element = container.firstChild as HTMLElement
    expect(element.style.WebkitLineClamp).toBe('2')
    expect(element.style.color).toBe('red')
  })

  it('supports all size values', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const
    const sizeClasses = {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
    }

    sizes.forEach((size) => {
      const { container } = render(<Text size={size}>Text</Text>)
      expect(container.firstChild).toHaveClass(sizeClasses[size])
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Text>Accessible text content</Text>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations with all variants', async () => {
    const { container } = render(
      <div>
        <Text variant="body">Body text</Text>
        <Text variant="caption">Caption text</Text>
        <Text variant="overline">Overline text</Text>
        <Text variant="label">Label text</Text>
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
