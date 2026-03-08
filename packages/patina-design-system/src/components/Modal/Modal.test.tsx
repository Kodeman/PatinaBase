import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from './Modal'

describe('Modal', () => {
  it('renders trigger and opens modal', async () => {
    const user = userEvent.setup()

    render(
      <Modal>
        <ModalTrigger>Open Modal</ModalTrigger>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Test Modal</ModalTitle>
            <ModalDescription>This is a test modal</ModalDescription>
          </ModalHeader>
        </ModalContent>
      </Modal>
    )

    const trigger = screen.getByText('Open Modal')
    await user.click(trigger)

    expect(screen.getByText('Test Modal')).toBeInTheDocument()
    expect(screen.getByText('This is a test modal')).toBeInTheDocument()
  })

  it('renders different sizes', async () => {
    const user = userEvent.setup()

    const { rerender } = render(
      <Modal defaultOpen>
        <ModalContent size="sm">
          <ModalTitle>Small Modal</ModalTitle>
        </ModalContent>
      </Modal>
    )

    expect(screen.getByText('Small Modal')).toBeInTheDocument()

    rerender(
      <Modal defaultOpen>
        <ModalContent size="lg">
          <ModalTitle>Large Modal</ModalTitle>
        </ModalContent>
      </Modal>
    )

    expect(screen.getByText('Large Modal')).toBeInTheDocument()
  })
})
