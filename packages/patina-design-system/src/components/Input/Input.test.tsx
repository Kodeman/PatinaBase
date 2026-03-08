import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input'
import { Mail } from 'lucide-react'

describe('Input', () => {
  it('renders correctly', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  it('accepts different types', () => {
    const { rerender } = render(<Input type="email" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'email')

    rerender(<Input type="number" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'number')
  })

  it('applies variant classes', () => {
    const { container } = render(<Input variant="filled" />)
    const input = container.querySelector('input')
    expect(input).toHaveClass('bg-muted')
  })

  it('applies size classes', () => {
    const { container } = render(<Input size="lg" />)
    const input = container.querySelector('input')
    expect(input).toHaveClass('h-12')
  })

  it('applies state classes', () => {
    const { container } = render(<Input state="error" />)
    const input = container.querySelector('input')
    expect(input).toHaveClass('border-destructive')
  })

  it('renders with left icon', () => {
    const { container } = render(
      <Input leftIcon={<Mail data-testid="mail-icon" />} />
    )
    expect(screen.getByTestId('mail-icon')).toBeInTheDocument()
    const input = container.querySelector('input')
    expect(input).toHaveClass('pl-10')
  })

  it('renders with right icon', () => {
    const { container } = render(
      <Input rightIcon={<Mail data-testid="mail-icon" />} />
    )
    expect(screen.getByTestId('mail-icon')).toBeInTheDocument()
    const input = container.querySelector('input')
    expect(input).toHaveClass('pr-10')
  })

  it('shows search icon for search type', () => {
    render(<Input type="search" />)
    const searchIcon = document.querySelector('svg')
    expect(searchIcon).toBeInTheDocument()
  })

  it('handles password visibility toggle', async () => {
    const user = userEvent.setup()
    const { container } = render(<Input type="password" defaultValue="secret" />)
    const input = container.querySelector('input') as HTMLInputElement

    expect(input).toHaveAttribute('type', 'password')

    const toggleButton = screen.getByLabelText('Show password')
    await user.click(toggleButton)

    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument()
  })

  it('shows clear button when clearable and has value', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(<Input clearable onClear={onClear} defaultValue="test" />)

    const clearButton = screen.getByLabelText('Clear input')
    expect(clearButton).toBeInTheDocument()

    await user.click(clearButton)
    expect(onClear).toHaveBeenCalled()
  })

  it('does not show clear button when empty', () => {
    render(<Input clearable />)
    expect(screen.queryByLabelText('Clear input')).not.toBeInTheDocument()
  })

  it('shows character counter when enabled', () => {
    render(<Input showCount maxLength={10} defaultValue="test" />)
    expect(screen.getByText('4/10')).toBeInTheDocument()
  })

  it('updates character counter on input', async () => {
    const user = userEvent.setup()
    render(<Input showCount maxLength={10} data-testid="input" />)

    const input = screen.getByTestId('input')
    await user.type(input, 'hello')

    expect(screen.getByText('5/10')).toBeInTheDocument()
  })

  it('is disabled when disabled prop is set', () => {
    const { container } = render(<Input disabled />)
    const input = container.querySelector('input')
    expect(input).toBeDisabled()
  })

  it('is readonly when readonly prop is set', () => {
    const { container } = render(<Input readOnly />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('readonly')
  })

  it('respects maxLength attribute', () => {
    const { container } = render(<Input maxLength={5} />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('maxLength', '5')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Input ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })

  it('handles onChange event', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(<Input onChange={handleChange} data-testid="input" />)

    const input = screen.getByTestId('input')
    await user.type(input, 'test')

    expect(handleChange).toHaveBeenCalled()
  })

  it('combines password toggle and clear button', async () => {
    const user = userEvent.setup()
    render(<Input type="password" clearable defaultValue="secret" />)

    expect(screen.getByLabelText('Show password')).toBeInTheDocument()
    expect(screen.getByLabelText('Clear input')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Input className="custom-class" />)
    const input = container.querySelector('input')
    expect(input).toHaveClass('custom-class')
  })

  it('applies wrapperClassName when icons are present', () => {
    const { container } = render(
      <Input leftIcon={<Mail />} wrapperClassName="custom-wrapper" />
    )
    const wrapper = container.querySelector('.custom-wrapper')
    expect(wrapper).toBeInTheDocument()
  })
})
