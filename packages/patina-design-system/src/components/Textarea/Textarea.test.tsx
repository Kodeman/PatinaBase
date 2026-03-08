import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('renders correctly', () => {
    render(<Textarea placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  it('applies variant classes', () => {
    const { container } = render(<Textarea variant="filled" />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toHaveClass('bg-muted')
  })

  it('applies size classes', () => {
    const { container } = render(<Textarea size="lg" />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toHaveClass('text-base')
  })

  it('applies resize classes', () => {
    const { container } = render(<Textarea resize="horizontal" />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toHaveClass('resize-x')
  })

  it('applies state classes', () => {
    const { container } = render(<Textarea state="error" />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toHaveClass('border-destructive')
  })

  it('shows character counter when enabled', () => {
    render(<Textarea showCount maxLength={100} defaultValue="test" />)
    expect(screen.getByText('4/100')).toBeInTheDocument()
  })

  it('updates character counter on input', async () => {
    const user = userEvent.setup()
    render(<Textarea showCount maxLength={100} data-testid="textarea" />)

    const textarea = screen.getByTestId('textarea')
    await user.type(textarea, 'hello world')

    expect(screen.getByText('11/100')).toBeInTheDocument()
  })

  it('handles auto-resize', async () => {
    const user = userEvent.setup()
    const { container } = render(<Textarea autoResize data-testid="textarea" />)

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    const initialHeight = textarea.style.height

    await user.type(textarea, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5')

    // Height should be set (not empty)
    expect(textarea.style.height).toBeTruthy()
  })

  it('disables resize when autoResize is enabled', () => {
    const { container } = render(<Textarea autoResize />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toHaveClass('resize-none')
  })

  it('is disabled when disabled prop is set', () => {
    const { container } = render(<Textarea disabled />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toBeDisabled()
  })

  it('is readonly when readonly prop is set', () => {
    const { container } = render(<Textarea readOnly />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toHaveAttribute('readonly')
  })

  it('respects maxLength attribute', () => {
    const { container } = render(<Textarea maxLength={500} />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toHaveAttribute('maxLength', '500')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Textarea ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })

  it('handles onChange event', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(<Textarea onChange={handleChange} data-testid="textarea" />)

    const textarea = screen.getByTestId('textarea')
    await user.type(textarea, 'test')

    expect(handleChange).toHaveBeenCalled()
  })

  it('applies custom className', () => {
    const { container } = render(<Textarea className="custom-class" />)
    const textarea = container.querySelector('textarea')
    expect(textarea).toHaveClass('custom-class')
  })

  it('applies wrapperClassName when showCount is enabled', () => {
    const { container } = render(
      <Textarea showCount maxLength={10} wrapperClassName="custom-wrapper" />
    )
    const wrapper = container.querySelector('.custom-wrapper')
    expect(wrapper).toBeInTheDocument()
  })

  it('handles controlled value', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Textarea value="initial" onChange={() => {}} />)

    expect(screen.getByDisplayValue('initial')).toBeInTheDocument()

    rerender(<Textarea value="updated" onChange={() => {}} />)
    expect(screen.getByDisplayValue('updated')).toBeInTheDocument()
  })

  it('combines showCount and autoResize', async () => {
    const user = userEvent.setup()
    render(<Textarea autoResize showCount maxLength={100} data-testid="textarea" />)

    const textarea = screen.getByTestId('textarea')
    await user.type(textarea, 'test')

    expect(screen.getByText('4/100')).toBeInTheDocument()
    expect(textarea).toHaveClass('resize-none')
  })
})
