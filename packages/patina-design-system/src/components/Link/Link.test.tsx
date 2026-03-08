import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Link } from './Link'

describe('Link', () => {
  it('renders children correctly', () => {
    render(<Link href="/test">Click me</Link>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('applies href attribute', () => {
    render(<Link href="/about">About</Link>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/about')
  })

  it('applies variant styles', () => {
    render(<Link variant="subtle" href="/test">Subtle Link</Link>)
    const link = screen.getByRole('link')
    expect(link).toHaveClass('text-foreground')
  })

  it('applies size styles', () => {
    render(<Link size="lg" href="/test">Large Link</Link>)
    const link = screen.getByRole('link')
    expect(link).toHaveClass('text-lg')
  })

  it('sets target and rel for external links with isExternal', () => {
    render(<Link href="https://example.com" isExternal>External</Link>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('auto-detects external links by URL', () => {
    render(<Link href="https://example.com">Auto External</Link>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('does not set external attributes for internal links', () => {
    render(<Link href="/internal">Internal</Link>)
    const link = screen.getByRole('link')
    expect(link).not.toHaveAttribute('target', '_blank')
  })

  it('shows external icon when showExternalIcon is true', () => {
    const { container } = render(
      <Link href="https://example.com" showExternalIcon>
        External with icon
      </Link>
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('does not show external icon for internal links', () => {
    const { container } = render(
      <Link href="/internal" showExternalIcon>
        Internal link
      </Link>
    )
    const svg = container.querySelector('svg')
    expect(svg).not.toBeInTheDocument()
  })

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLAnchorElement>()
    render(<Link ref={ref} href="/test">Link with ref</Link>)
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement)
  })

  it('applies custom className', () => {
    render(<Link className="custom-class" href="/test">Custom Link</Link>)
    const link = screen.getByRole('link')
    expect(link).toHaveClass('custom-class')
  })

  it('allows custom target and rel attributes', () => {
    render(
      <Link href="/test" target="_self" rel="nofollow">
        Custom attributes
      </Link>
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_self')
    expect(link).toHaveAttribute('rel', 'nofollow')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Link href="/test">Accessible link</Link>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders all variants correctly', () => {
    const variants = ['default', 'subtle', 'ghost', 'underline', 'unstyled'] as const
    variants.forEach((variant) => {
      render(<Link variant={variant} href="/test">{variant} link</Link>)
      const link = screen.getByText(`${variant} link`)
      expect(link).toBeInTheDocument()
    })
  })

  it('renders all sizes correctly', () => {
    const sizes = ['sm', 'md', 'lg'] as const
    sizes.forEach((size) => {
      render(<Link size={size} href="/test">{size} link</Link>)
      const link = screen.getByRole('link', { name: `${size} link` })
      expect(link).toHaveClass(`text-${size}`)
    })
  })

  it('supports http:// URLs as external', () => {
    render(<Link href="http://example.com">HTTP Link</Link>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
