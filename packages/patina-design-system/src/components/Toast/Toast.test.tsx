import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast, ToastTitle, ToastDescription, ToastProvider, ToastViewport } from './Toast'

describe('Toast', () => {
  it('renders toast with title and description', () => {
    render(
      <ToastProvider>
        <Toast open={true}>
          <ToastTitle>Test Title</ToastTitle>
          <ToastDescription>Test Description</ToastDescription>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    )

    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('renders different variants', () => {
    const { rerender } = render(
      <ToastProvider>
        <Toast variant="info" open={true}>
          <ToastTitle>Info</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    )

    expect(screen.getByText('Info')).toBeInTheDocument()

    rerender(
      <ToastProvider>
        <Toast variant="success" open={true}>
          <ToastTitle>Success</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    )

    expect(screen.getByText('Success')).toBeInTheDocument()
  })

  it('calls onOpenChange when duration expires', async () => {
    const onOpenChange = vi.fn()

    render(
      <ToastProvider duration={100}>
        <Toast open={true} onOpenChange={onOpenChange}>
          <ToastTitle>Auto Close</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    )

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), {
      timeout: 200,
    })
  })
})

describe('ToastTitle', () => {
  it('renders title text', () => {
    render(
      <ToastProvider>
        <Toast open={true}>
          <ToastTitle>My Title</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    )

    expect(screen.getByText('My Title')).toBeInTheDocument()
  })
})

describe('ToastDescription', () => {
  it('renders description text', () => {
    render(
      <ToastProvider>
        <Toast open={true}>
          <ToastDescription>My Description</ToastDescription>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    )

    expect(screen.getByText('My Description')).toBeInTheDocument()
  })
})
