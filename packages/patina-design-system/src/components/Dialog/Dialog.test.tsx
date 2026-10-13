import * as React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog'

describe('Dialog', () => {
  it('renders trigger button', () => {
    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByText('Open Dialog')).toBeInTheDocument()
  })

  it('opens dialog when trigger is clicked', async () => {
    const user = userEvent.setup()

    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog description text</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByText('Open Dialog'))
    expect(screen.getByText('Dialog Title')).toBeInTheDocument()
    expect(screen.getByText('Dialog description text')).toBeInTheDocument()
  })

  it('closes dialog when close button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByText('Open Dialog'))
    expect(screen.getByText('Dialog Title')).toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: /close/i })
    await user.click(closeButton)

    // Wait for dialog to close
    await vi.waitFor(() => {
      expect(screen.queryByText('Dialog Title')).not.toBeInTheDocument()
    })
  })

  it('renders footer content', async () => {
    const user = userEvent.setup()

    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <button>Cancel</button>
            <button>Confirm</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByText('Open Dialog'))
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('handles controlled state', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    const ControlledDialog = () => {
      const [open, setOpen] = React.useState(false)

      return (
        <Dialog
          open={open}
          onOpenChange={(isOpen) => {
            setOpen(isOpen)
            onOpenChange(isOpen)
          }}
        >
          <DialogTrigger>Open Dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Controlled Dialog</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )
    }

    render(<ControlledDialog />)

    await user.click(screen.getByText('Open Dialog'))
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.getByText('Controlled Dialog')).toBeInTheDocument()
  })

  it('keeps its default shadow, but a caller passing shadow-none renders without one', () => {
    const { rerender } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Shadowed</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    expect(screen.getByRole('dialog').className.split(/\s+/)).toContain('shadow-lg')

    // The designer portal's board Export dialog passes this (US-28 R5).
    rerender(
      <Dialog open>
        <DialogContent className="max-w-lg shadow-none">
          <DialogTitle>Flat</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    const classes = screen.getByRole('dialog').className.split(/\s+/)
    expect(classes).toContain('shadow-none')
    expect(classes).not.toContain('shadow-lg')
  })
})
