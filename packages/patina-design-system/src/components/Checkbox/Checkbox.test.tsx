import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('renders correctly', () => {
    const { container } = render(<Checkbox />)
    const checkbox = container.querySelector('button[role="checkbox"]')
    expect(checkbox).toBeInTheDocument()
  })

  it('is unchecked by default', () => {
    const { container } = render(<Checkbox />)
    const checkbox = container.querySelector('button[role="checkbox"]')
    expect(checkbox).toHaveAttribute('data-state', 'unchecked')
  })

  it('can be checked', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    const { container } = render(<Checkbox onCheckedChange={handleChange} />)
    const checkbox = container.querySelector('button[role="checkbox"]') as HTMLElement

    await user.click(checkbox)

    expect(handleChange).toHaveBeenCalledWith(true)
  })

  it('handles controlled checked state', () => {
    const { container, rerender } = render(<Checkbox checked={false} />)
    const checkbox = container.querySelector('button[role="checkbox"]')

    expect(checkbox).toHaveAttribute('data-state', 'unchecked')

    rerender(<Checkbox checked={true} />)
    expect(checkbox).toHaveAttribute('data-state', 'checked')
  })

  it('handles indeterminate state', () => {
    const { container } = render(<Checkbox checked="indeterminate" />)
    const checkbox = container.querySelector('button[role="checkbox"]')
    expect(checkbox).toHaveAttribute('data-state', 'indeterminate')
  })

  it('applies size variants', () => {
    const { container: smContainer } = render(<Checkbox size="sm" />)
    const { container: mdContainer } = render(<Checkbox size="md" />)
    const { container: lgContainer } = render(<Checkbox size="lg" />)

    expect(smContainer.querySelector('button')).toHaveClass('h-4 w-4')
    expect(mdContainer.querySelector('button')).toHaveClass('h-5 w-5')
    expect(lgContainer.querySelector('button')).toHaveClass('h-6 w-6')
  })

  it('is disabled when disabled prop is set', () => {
    const { container } = render(<Checkbox disabled />)
    const checkbox = container.querySelector('button[role="checkbox"]')
    expect(checkbox).toBeDisabled()
  })

  it('does not trigger onChange when disabled', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    const { container } = render(<Checkbox disabled onCheckedChange={handleChange} />)
    const checkbox = container.querySelector('button[role="checkbox"]') as HTMLElement

    await user.click(checkbox)

    expect(handleChange).not.toHaveBeenCalled()
  })

  it('applies custom className', () => {
    const { container } = render(<Checkbox className="custom-class" />)
    const checkbox = container.querySelector('button[role="checkbox"]')
    expect(checkbox).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Checkbox ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })

  it('can be used with label', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    const { container } = render(
      <div>
        <Checkbox id="terms" onCheckedChange={handleChange} />
        <label htmlFor="terms">Accept terms</label>
      </div>
    )

    const label = screen.getByText('Accept terms')
    await user.click(label)

    expect(handleChange).toHaveBeenCalledWith(true)
  })

  it('toggles between checked and unchecked', async () => {
    const user = userEvent.setup()
    const { container } = render(<Checkbox />)
    const checkbox = container.querySelector('button[role="checkbox"]') as HTMLElement

    expect(checkbox).toHaveAttribute('data-state', 'unchecked')

    await user.click(checkbox)
    expect(checkbox).toHaveAttribute('data-state', 'checked')

    await user.click(checkbox)
    expect(checkbox).toHaveAttribute('data-state', 'unchecked')
  })

  it('shows check icon when checked', () => {
    const { container } = render(<Checkbox checked={true} />)
    const icon = container.querySelector('svg')
    expect(icon).toBeInTheDocument()
  })

  it('shows minus icon when indeterminate', () => {
    const { container } = render(<Checkbox checked="indeterminate" />)
    const icon = container.querySelector('svg')
    expect(icon).toBeInTheDocument()
  })

  it('has proper ARIA attributes', () => {
    const { container } = render(<Checkbox aria-label="Accept terms" />)
    const checkbox = container.querySelector('button[role="checkbox"]')
    expect(checkbox).toHaveAttribute('aria-label', 'Accept terms')
  })

  it('supports required attribute', () => {
    const { container } = render(<Checkbox required />)
    const checkbox = container.querySelector('button[role="checkbox"]')
    expect(checkbox).toHaveAttribute('required')
  })
})
