import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PinInput } from './PinInput'

describe('PinInput', () => {
  it('renders correct number of inputs', () => {
    render(<PinInput length={4} />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(4)
  })

  it('renders with custom length', () => {
    render(<PinInput length={6} />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)
  })

  it('auto-focuses first input when autoFocus is true', () => {
    render(<PinInput length={4} autoFocus />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveFocus()
  })

  it('moves to next input after entering a digit', async () => {
    const user = userEvent.setup()
    render(<PinInput length={4} type="number" />)
    const inputs = screen.getAllByRole('textbox')

    await user.type(inputs[0], '1')
    expect(inputs[1]).toHaveFocus()
  })

  it('calls onChange when value changes', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<PinInput length={4} onChange={handleChange} />)
    const inputs = screen.getAllByRole('textbox')

    await user.type(inputs[0], '1')
    expect(handleChange).toHaveBeenCalledWith('1')
  })

  it('calls onComplete when all fields are filled', async () => {
    const user = userEvent.setup()
    const handleComplete = vi.fn()
    render(<PinInput length={4} type="number" onComplete={handleComplete} />)
    const inputs = screen.getAllByRole('textbox')

    await user.type(inputs[0], '1')
    await user.type(inputs[1], '2')
    await user.type(inputs[2], '3')
    await user.type(inputs[3], '4')

    expect(handleComplete).toHaveBeenCalledWith('1234')
  })

  it('handles backspace navigation', async () => {
    const user = userEvent.setup()
    render(<PinInput length={4} type="number" />)
    const inputs = screen.getAllByRole('textbox')

    await user.type(inputs[0], '1')
    expect(inputs[1]).toHaveFocus()

    await user.keyboard('{Backspace}')
    expect(inputs[0]).toHaveFocus()
  })

  it('handles paste with allowPaste enabled', async () => {
    const user = userEvent.setup()
    const handleComplete = vi.fn()
    render(<PinInput length={4} type="number" onComplete={handleComplete} allowPaste />)
    const inputs = screen.getAllByRole('textbox')

    inputs[0].focus()
    await user.paste('1234')

    expect(handleComplete).toHaveBeenCalledWith('1234')
  })

  it('filters non-numeric input when type is number', async () => {
    const user = userEvent.setup()
    render(<PinInput length={4} type="number" />)
    const inputs = screen.getAllByRole('textbox')

    await user.type(inputs[0], 'a')
    expect(inputs[0]).toHaveValue('')
  })

  it('accepts text input when type is text', async () => {
    const user = userEvent.setup()
    render(<PinInput length={4} type="text" />)
    const inputs = screen.getAllByRole('textbox')

    await user.type(inputs[0], 'A')
    expect(inputs[0]).toHaveValue('A')
  })

  it('masks input when mask is true', () => {
    render(<PinInput length={4} mask />)
    const inputs = screen.getAllByRole('textbox')
    inputs.forEach((input) => {
      expect(input).toHaveAttribute('type', 'password')
    })
  })

  it('respects disabled state', async () => {
    const user = userEvent.setup()
    render(<PinInput length={4} disabled />)
    const inputs = screen.getAllByRole('textbox')

    await user.type(inputs[0], '1')
    expect(inputs[0]).toBeDisabled()
    expect(inputs[0]).toHaveValue('')
  })

  it('supports arrow key navigation', async () => {
    const user = userEvent.setup()
    render(<PinInput length={4} />)
    const inputs = screen.getAllByRole('textbox')

    inputs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(inputs[1]).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(inputs[0]).toHaveFocus()
  })

  it('applies variant styles', () => {
    const { rerender } = render(<PinInput length={4} variant="outline" />)
    let inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveClass('border-input')

    rerender(<PinInput length={4} variant="filled" />)
    inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveClass('bg-muted')
  })

  it('applies size variants', () => {
    const { rerender } = render(<PinInput length={4} size="sm" />)
    let inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveClass('h-10', 'w-10')

    rerender(<PinInput length={4} size="md" />)
    inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveClass('h-12', 'w-12')

    rerender(<PinInput length={4} size="lg" />)
    inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveClass('h-14', 'w-14')
  })

  it('applies error state', () => {
    render(<PinInput length={4} state="error" />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveClass('border-destructive')
  })
})
