import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormError } from './FormError'

describe('FormError', () => {
  it('renders error message', () => {
    render(<FormError>This is an error</FormError>)
    expect(screen.getByText('This is an error')).toBeInTheDocument()
  })

  it('does not render when children is null', () => {
    const { container } = render(<FormError>{null}</FormError>)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when children is undefined', () => {
    const { container } = render(<FormError>{undefined}</FormError>)
    expect(container.firstChild).toBeNull()
  })

  it('renders with error variant by default', () => {
    const { container } = render(<FormError>Error message</FormError>)
    const paragraph = container.querySelector('p')
    expect(paragraph).toHaveClass('text-destructive')
  })

  it('renders with success variant', () => {
    const { container } = render(<FormError variant="success">Success message</FormError>)
    const paragraph = container.querySelector('p')
    expect(paragraph).toHaveClass('text-green-600')
  })

  it('renders with info variant', () => {
    const { container } = render(<FormError variant="info">Info message</FormError>)
    const paragraph = container.querySelector('p')
    expect(paragraph).toHaveClass('text-muted-foreground')
  })

  it('shows icon by default', () => {
    const { container } = render(<FormError>Error with icon</FormError>)
    const icon = container.querySelector('svg')
    expect(icon).toBeInTheDocument()
  })

  it('hides icon when showIcon is false', () => {
    const { container } = render(<FormError showIcon={false}>Error without icon</FormError>)
    const icon = container.querySelector('svg')
    expect(icon).not.toBeInTheDocument()
  })

  it('shows different icons for different variants', () => {
    const { container: errorContainer } = render(
      <FormError variant="error">Error</FormError>
    )
    const { container: successContainer } = render(
      <FormError variant="success">Success</FormError>
    )
    const { container: infoContainer } = render(
      <FormError variant="info">Info</FormError>
    )

    expect(errorContainer.querySelector('svg')).toBeInTheDocument()
    expect(successContainer.querySelector('svg')).toBeInTheDocument()
    expect(infoContainer.querySelector('svg')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <FormError className="custom-class">Error</FormError>
    )
    const paragraph = container.querySelector('p')
    expect(paragraph).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLParagraphElement>()
    render(<FormError ref={ref}>Error</FormError>)
    expect(ref.current).toBeInstanceOf(HTMLParagraphElement)
  })

  it('renders with animation classes', () => {
    const { container } = render(<FormError>Error</FormError>)
    const paragraph = container.querySelector('p')
    expect(paragraph).toHaveClass('animate-in')
    expect(paragraph).toHaveClass('fade-in-0')
    expect(paragraph).toHaveClass('slide-in-from-top-1')
  })

  it('forwards additional props', () => {
    render(<FormError data-testid="error-message">Error</FormError>)
    expect(screen.getByTestId('error-message')).toBeInTheDocument()
  })

  it('sets aria-hidden on icon', () => {
    const { container } = render(<FormError>Error</FormError>)
    const icon = container.querySelector('svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('handles long error messages', () => {
    const longMessage = 'This is a very long error message that should wrap correctly and maintain proper spacing with the icon'
    render(<FormError>{longMessage}</FormError>)
    expect(screen.getByText(longMessage)).toBeInTheDocument()
  })
})
