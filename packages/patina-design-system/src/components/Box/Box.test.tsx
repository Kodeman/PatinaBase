import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Box } from './Box'

describe('Box', () => {
  it('renders children correctly', () => {
    render(<Box>Test content</Box>)
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('renders as div by default', () => {
    const { container } = render(<Box>Content</Box>)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('renders as different element when "as" prop is provided', () => {
    const { container } = render(<Box as="section">Content</Box>)
    expect(container.firstChild?.nodeName).toBe('SECTION')
  })

  it('applies custom className', () => {
    const { container } = render(<Box className="custom-class">Content</Box>)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Box ref={ref}>Content</Box>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('supports HTML attributes', () => {
    render(
      <Box data-testid="test-box" aria-label="Test label">
        Content
      </Box>
    )
    const box = screen.getByTestId('test-box')
    expect(box).toHaveAttribute('aria-label', 'Test label')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Box>Accessible content</Box>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('uses asChild to compose with child element', () => {
    const { container } = render(
      <Box asChild>
        <a href="/test">Link</a>
      </Box>
    )
    const link = container.querySelector('a')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/test')
  })

  it('merges classNames correctly when using asChild', () => {
    const { container } = render(
      <Box asChild className="box-class">
        <a href="/test" className="link-class">
          Link
        </a>
      </Box>
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('box-class')
    expect(link).toHaveClass('link-class')
  })
})
