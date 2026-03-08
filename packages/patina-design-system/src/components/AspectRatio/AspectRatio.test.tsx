import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { AspectRatio } from './AspectRatio'

describe('AspectRatio', () => {
  it('renders children correctly', () => {
    render(
      <AspectRatio>
        <div>Content</div>
      </AspectRatio>
    )
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders as div by default', () => {
    const { container } = render(<AspectRatio>Content</AspectRatio>)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('renders as different element when "as" prop is provided', () => {
    const { container } = render(<AspectRatio as="section">Content</AspectRatio>)
    expect(container.firstChild?.nodeName).toBe('SECTION')
  })

  it('applies relative and full width classes', () => {
    const { container } = render(<AspectRatio>Content</AspectRatio>)
    expect(container.firstChild).toHaveClass('relative', 'w-full')
  })

  it('applies default 16:9 aspect ratio', () => {
    const { container } = render(<AspectRatio>Content</AspectRatio>)
    const element = container.firstChild as HTMLElement
    // 16:9 = 56.25%
    expect(element.style.paddingBottom).toBe('56.25%')
  })

  it('applies custom aspect ratio', () => {
    const { container } = render(<AspectRatio ratio={4 / 3}>Content</AspectRatio>)
    const element = container.firstChild as HTMLElement
    // 4:3 = 75%
    expect(element.style.paddingBottom).toBe('75%')
  })

  it('applies 1:1 aspect ratio correctly', () => {
    const { container } = render(<AspectRatio ratio={1}>Content</AspectRatio>)
    const element = container.firstChild as HTMLElement
    // 1:1 = 100%
    expect(element.style.paddingBottom).toBe('100%')
  })

  it('applies 21:9 aspect ratio correctly', () => {
    const { container } = render(<AspectRatio ratio={21 / 9}>Content</AspectRatio>)
    const element = container.firstChild as HTMLElement
    // 21:9 ≈ 42.857%
    expect(parseFloat(element.style.paddingBottom)).toBeCloseTo(42.857, 2)
  })

  it('wraps children in absolute positioned div', () => {
    const { container } = render(
      <AspectRatio>
        <img src="test.jpg" alt="Test" />
      </AspectRatio>
    )
    const innerDiv = container.querySelector('.absolute.inset-0')
    expect(innerDiv).toBeInTheDocument()
    expect(innerDiv?.querySelector('img')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<AspectRatio className="custom-class">Content</AspectRatio>)
    expect(container.firstChild).toHaveClass('custom-class')
    expect(container.firstChild).toHaveClass('relative', 'w-full')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<AspectRatio ref={ref}>Content</AspectRatio>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('supports HTML attributes', () => {
    render(
      <AspectRatio data-testid="test-ratio" aria-label="Video container">
        Content
      </AspectRatio>
    )
    const ratio = screen.getByTestId('test-ratio')
    expect(ratio).toHaveAttribute('aria-label', 'Video container')
  })

  it('merges custom styles with component styles', () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9} style={{ backgroundColor: 'red' }}>
        Content
      </AspectRatio>
    )
    const element = container.firstChild as HTMLElement
    expect(element.style.paddingBottom).toBe('56.25%')
    expect(element.style.backgroundColor).toBe('red')
  })

  it('works with image children', () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9}>
        <img src="test.jpg" alt="Test" className="object-cover" />
      </AspectRatio>
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'test.jpg')
    expect(img).toHaveClass('object-cover')
  })

  it('works with iframe children', () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9}>
        <iframe src="https://example.com" title="Example" />
      </AspectRatio>
    )
    const iframe = container.querySelector('iframe')
    expect(iframe).toHaveAttribute('src', 'https://example.com')
  })

  it('works with video children', () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9}>
        <video src="video.mp4" controls />
      </AspectRatio>
    )
    const video = container.querySelector('video')
    expect(video).toHaveAttribute('src', 'video.mp4')
  })

  it('maintains aspect ratio with different ratios', () => {
    const ratios = [
      { ratio: 16 / 9, expected: 56.25 },
      { ratio: 4 / 3, expected: 75 },
      { ratio: 1, expected: 100 },
      { ratio: 2, expected: 50 },
      { ratio: 3 / 2, expected: 66.666 },
    ]

    ratios.forEach(({ ratio, expected }) => {
      const { container } = render(<AspectRatio ratio={ratio}>Content</AspectRatio>)
      const element = container.firstChild as HTMLElement
      expect(parseFloat(element.style.paddingBottom)).toBeCloseTo(expected, 2)
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9}>
        <img src="test.jpg" alt="Test image" />
      </AspectRatio>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
