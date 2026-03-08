import type { Meta, StoryObj } from '@storybook/react'
import { Toast, ToastAction } from './Toast'
import { Toaster } from './Toaster'
import { useToast } from './useToast'
import { Button } from '../Button'

const meta = {
  title: 'Feedback/Toast',
  component: Toast,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Toast>

export default meta
type Story = StoryObj<typeof meta>

function ToastDemo() {
  const { toast } = useToast()

  return (
    <div className="space-y-4">
      <Button
        onClick={() => {
          toast({
            title: 'Scheduled: Catch up',
            description: 'Friday, February 10, 2023 at 5:57 PM',
          })
        }}
      >
        Show Toast
      </Button>
      <Toaster />
    </div>
  )
}

export const Default: Story = {
  render: () => <ToastDemo />,
}

function ToastVariantsDemo() {
  const { toast } = useToast()

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={() => {
          toast({
            variant: 'default',
            title: 'Default Toast',
            description: 'This is a default toast notification.',
          })
        }}
      >
        Default
      </Button>
      <Button
        onClick={() => {
          toast({
            variant: 'info',
            title: 'Info',
            description: 'This is an informational message.',
          })
        }}
      >
        Info
      </Button>
      <Button
        onClick={() => {
          toast({
            variant: 'success',
            title: 'Success!',
            description: 'Your changes have been saved.',
          })
        }}
      >
        Success
      </Button>
      <Button
        onClick={() => {
          toast({
            variant: 'warning',
            title: 'Warning',
            description: 'Please review your input.',
          })
        }}
      >
        Warning
      </Button>
      <Button
        onClick={() => {
          toast({
            variant: 'error',
            title: 'Error',
            description: 'There was a problem with your request.',
          })
        }}
      >
        Error
      </Button>
      <Toaster />
    </div>
  )
}

export const Variants: Story = {
  render: () => <ToastVariantsDemo />,
}

function ToastWithActionDemo() {
  const { toast } = useToast()

  return (
    <div>
      <Button
        onClick={() => {
          toast({
            title: 'Undo',
            description: 'File moved to trash.',
            action: (
              <ToastAction altText="Undo action" onClick={() => console.log('Undo')}>
                Undo
              </ToastAction>
            ),
          })
        }}
      >
        Show with Action
      </Button>
      <Toaster />
    </div>
  )
}

export const WithAction: Story = {
  render: () => <ToastWithActionDemo />,
}

function SimpleToastDemo() {
  const { toast } = useToast()

  return (
    <div>
      <Button
        onClick={() => {
          toast({
            description: 'Your message has been sent.',
          })
        }}
      >
        Simple Message
      </Button>
      <Toaster />
    </div>
  )
}

export const Simple: Story = {
  render: () => <SimpleToastDemo />,
}

function ToastQueueDemo() {
  const { toast } = useToast()

  const showMultiple = () => {
    toast({
      variant: 'info',
      title: 'Toast 1',
      description: 'This is the first toast',
    })
    setTimeout(() => {
      toast({
        variant: 'success',
        title: 'Toast 2',
        description: 'This is the second toast',
      })
    }, 500)
    setTimeout(() => {
      toast({
        variant: 'warning',
        title: 'Toast 3',
        description: 'This is the third toast',
      })
    }, 1000)
  }

  return (
    <div>
      <Button onClick={showMultiple}>Show Multiple Toasts</Button>
      <Toaster />
    </div>
  )
}

export const Queue: Story = {
  render: () => <ToastQueueDemo />,
}
