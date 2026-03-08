import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from './Switch'

describe('Switch', () => {
  it('renders correctly', () => {
    render(<Switch />)
    const switchElement = screen.getByRole('switch')
    expect(switchElement).toBeInTheDocument()
  })

  it('renders with label', () => {
    render(<Switch label="Enable notifications" />)
    expect(screen.getByText('Enable notifications')).toBeInTheDocument()
  })

  it('renders with label and description', () => {
    render(
      <Switch
        label="Enable notifications"
        description="Receive updates via email"
      />
    )
    expect(screen.getByText('Enable notifications')).toBeInTheDocument()
    expect(screen.getByText('Receive updates via email')).toBeInTheDocument()
  })

  it('handles checked state', () => {
    render(<Switch checked />)
    const switchElement = screen.getByRole('switch')
    expect(switchElement).toHaveAttribute('data-state', 'checked')
  })

  it('handles unchecked state', () => {
    render(<Switch checked={false} />)
    const switchElement = screen.getByRole('switch')
    expect(switchElement).toHaveAttribute('data-state', 'unchecked')
  })

  it('calls onCheckedChange when clicked', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Switch onCheckedChange={handleChange} />)

    const switchElement = screen.getByRole('switch')
    await user.click(switchElement)

    expect(handleChange).toHaveBeenCalledWith(true)
  })

  it('respects disabled state', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Switch disabled onCheckedChange={handleChange} />)

    const switchElement = screen.getByRole('switch')
    await user.click(switchElement)

    expect(handleChange).not.toHaveBeenCalled()
    expect(switchElement).toBeDisabled()
  })

  it('applies size variants', () => {
    const { rerender } = render(<Switch size="sm" />)
    let switchElement = screen.getByRole('switch')
    expect(switchElement).toHaveClass('h-5', 'w-9')

    rerender(<Switch size="md" />)
    switchElement = screen.getByRole('switch')
    expect(switchElement).toHaveClass('h-6', 'w-11')

    rerender(<Switch size="lg" />)
    switchElement = screen.getByRole('switch')
    expect(switchElement).toHaveClass('h-7', 'w-14')
  })

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Switch onCheckedChange={handleChange} />)

    const switchElement = screen.getByRole('switch')
    switchElement.focus()
    expect(switchElement).toHaveFocus()

    await user.keyboard(' ')
    expect(handleChange).toHaveBeenCalled()
  })

  it('renders label on the left when labelPosition is left', () => {
    const { container } = render(
      <Switch label="Enable notifications" labelPosition="left" />
    )
    const wrapper = container.firstChild as HTMLElement
    const label = screen.getByText('Enable notifications')
    const switchElement = screen.getByRole('switch')

    // Label should come before switch in DOM
    expect(wrapper.children[0]).toContain(label)
    expect(wrapper.children[1]).toBe(switchElement)
  })
})
