import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Alert, AlertTitle, AlertDescription } from './Alert'

describe('Alert', () => {
  it('renders alert with title and description', () => {
    render(
      <Alert title="Test Title" description="Test Description" variant="info" />
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('renders children when provided', () => {
    render(
      <Alert variant="success">
        <AlertTitle>Custom Title</AlertTitle>
        <AlertDescription>Custom Description</AlertDescription>
      </Alert>
    )
    expect(screen.getByText('Custom Title')).toBeInTheDocument()
    expect(screen.getByText('Custom Description')).toBeInTheDocument()
  })

  it('renders correct variant styles', () => {
    const { rerender, container } = render(<Alert variant="info" />)
    expect(container.querySelector('[role="alert"]')).toHaveClass('bg-blue-50')

    rerender(<Alert variant="success" />)
    expect(container.querySelector('[role="alert"]')).toHaveClass('bg-green-50')

    rerender(<Alert variant="warning" />)
    expect(container.querySelector('[role="alert"]')).toHaveClass('bg-yellow-50')

    rerender(<Alert variant="error" />)
    expect(container.querySelector('[role="alert"]')).toHaveClass('bg-red-50')
  })

  it('renders default variant icon', () => {
    const { container } = render(<Alert variant="success" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders custom icon when provided', () => {
    render(
      <Alert icon={<span data-testid="custom-icon">!</span>} variant="info" />
    )
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  it('shows close button when closable', () => {
    render(<Alert closable variant="info" />)
    expect(screen.getByRole('button', { name: /close alert/i })).toBeInTheDocument()
  })

  it('calls onClose and hides alert when close button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<Alert closable onClose={onClose} title="Test Alert" />)

    const closeButton = screen.getByRole('button', { name: /close alert/i })
    await user.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Test Alert')).not.toBeInTheDocument()
  })

  it('has proper role attribute', () => {
    render(<Alert variant="info" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Alert className="custom-class" variant="info" />)
    expect(container.querySelector('[role="alert"]')).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Alert ref={ref} variant="info" />)
    expect(ref).toHaveBeenCalled()
  })
})
