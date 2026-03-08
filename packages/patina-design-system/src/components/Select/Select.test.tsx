import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'

describe('Select', () => {
  const options = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'orange', label: 'Orange' },
  ]

  it('renders with placeholder', () => {
    render(<Select placeholder="Select a fruit" options={options} />)
    expect(screen.getByText('Select a fruit')).toBeInTheDocument()
  })

  it('opens dropdown when clicked', async () => {
    const user = userEvent.setup()
    render(<Select placeholder="Select a fruit" options={options} />)

    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    expect(screen.getByText('Apple')).toBeVisible()
    expect(screen.getByText('Banana')).toBeVisible()
    expect(screen.getByText('Orange')).toBeVisible()
  })

  it('selects an option', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(
      <Select
        placeholder="Select a fruit"
        options={options}
        onValueChange={handleChange}
      />
    )

    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    const appleOption = screen.getByText('Apple')
    await user.click(appleOption)

    expect(handleChange).toHaveBeenCalledWith('apple')
  })

  it('renders with default value', () => {
    render(
      <Select
        placeholder="Select a fruit"
        options={options}
        defaultValue="banana"
      />
    )
    expect(screen.getByText('Banana')).toBeInTheDocument()
  })

  it('respects disabled options', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    const optionsWithDisabled = [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana', disabled: true },
    ]

    render(
      <Select
        placeholder="Select a fruit"
        options={optionsWithDisabled}
        onValueChange={handleChange}
      />
    )

    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    const bananaOption = screen.getByText('Banana')
    expect(bananaOption).toHaveAttribute('data-disabled', '')
  })

  it('applies variant styles', () => {
    const { rerender } = render(
      <Select placeholder="Select" options={options} variant="outline" />
    )
    let trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('border-input')

    rerender(<Select placeholder="Select" options={options} variant="filled" />)
    trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('bg-muted')

    rerender(<Select placeholder="Select" options={options} variant="flushed" />)
    trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('border-b-2')
  })

  it('applies size variants', () => {
    const { rerender } = render(
      <Select placeholder="Select" options={options} size="sm" />
    )
    let trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('h-8')

    rerender(<Select placeholder="Select" options={options} size="md" />)
    trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('h-10')

    rerender(<Select placeholder="Select" options={options} size="lg" />)
    trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('h-12')
  })

  it('applies error state', () => {
    render(
      <Select placeholder="Select" options={options} state="error" />
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('border-destructive')
  })

  it('applies success state', () => {
    render(
      <Select placeholder="Select" options={options} state="success" />
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('border-green-500')
  })

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<Select placeholder="Select a fruit" options={options} />)

    const trigger = screen.getByRole('combobox')
    trigger.focus()

    await user.keyboard('{Enter}')
    expect(screen.getByText('Apple')).toBeVisible()

    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
  })
})
