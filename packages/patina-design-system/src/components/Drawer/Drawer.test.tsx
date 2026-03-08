import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './Drawer'

describe('Drawer', () => {
  it('renders trigger button', () => {
    render(
      <Drawer>
        <DrawerTrigger>Open Drawer</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer Title</DrawerTitle>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>
    )

    expect(screen.getByText('Open Drawer')).toBeInTheDocument()
  })

  it('opens drawer when trigger is clicked', async () => {
    const user = userEvent.setup()

    render(
      <Drawer>
        <DrawerTrigger>Open Drawer</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer Title</DrawerTitle>
            <DrawerDescription>Drawer description</DrawerDescription>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>
    )

    await user.click(screen.getByText('Open Drawer'))
    expect(screen.getByText('Drawer Title')).toBeInTheDocument()
    expect(screen.getByText('Drawer description')).toBeInTheDocument()
  })

  it('closes drawer when close button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <Drawer>
        <DrawerTrigger>Open Drawer</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer Title</DrawerTitle>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>
    )

    await user.click(screen.getByText('Open Drawer'))
    expect(screen.getByText('Drawer Title')).toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: /close/i })
    await user.click(closeButton)

    await vi.waitFor(() => {
      expect(screen.queryByText('Drawer Title')).not.toBeInTheDocument()
    })
  })

  it('supports different sides', async () => {
    const user = userEvent.setup()

    const { rerender } = render(
      <Drawer>
        <DrawerTrigger>Open Drawer</DrawerTrigger>
        <DrawerContent side="left">
          <DrawerTitle>Left Drawer</DrawerTitle>
        </DrawerContent>
      </Drawer>
    )

    await user.click(screen.getByText('Open Drawer'))
    expect(screen.getByText('Left Drawer')).toBeInTheDocument()

    rerender(
      <Drawer>
        <DrawerTrigger>Open Drawer</DrawerTrigger>
        <DrawerContent side="right">
          <DrawerTitle>Right Drawer</DrawerTitle>
        </DrawerContent>
      </Drawer>
    )
  })

  it('renders footer content', async () => {
    const user = userEvent.setup()

    render(
      <Drawer>
        <DrawerTrigger>Open Drawer</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer Title</DrawerTitle>
          </DrawerHeader>
          <DrawerFooter>
            <button>Cancel</button>
            <button>Save</button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )

    await user.click(screen.getByText('Open Drawer'))
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
  })
})
