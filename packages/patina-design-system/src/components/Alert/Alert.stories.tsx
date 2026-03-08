import type { Meta, StoryObj } from '@storybook/react'
import { Alert, AlertTitle, AlertDescription } from './Alert'
import { Terminal } from 'lucide-react'

const meta = {
  title: 'Feedback/Alert',
  component: Alert,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['info', 'success', 'warning', 'error'],
      description: 'Visual style variant',
    },
    closable: {
      control: 'boolean',
      description: 'Whether the alert can be dismissed',
    },
    title: {
      control: 'text',
      description: 'Alert title',
    },
    description: {
      control: 'text',
      description: 'Alert description',
    },
  },
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

export const Info: Story = {
  args: {
    variant: 'info',
    title: 'Heads up!',
    description: 'You can add components to your app using the cli.',
  },
}

export const Success: Story = {
  args: {
    variant: 'success',
    title: 'Success!',
    description: 'Your changes have been saved successfully.',
  },
}

export const Warning: Story = {
  args: {
    variant: 'warning',
    title: 'Warning',
    description: 'This action cannot be undone. Please proceed with caution.',
  },
}

export const Error: Story = {
  args: {
    variant: 'error',
    title: 'Error',
    description: 'There was a problem processing your request. Please try again.',
  },
}

export const Closable: Story = {
  args: {
    variant: 'info',
    title: 'Dismissible Alert',
    description: 'Click the close button to dismiss this alert.',
    closable: true,
  },
}

export const WithCustomIcon: Story = {
  render: () => (
    <Alert variant="info" icon={<Terminal className="h-4 w-4" />}>
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add custom icons to override the default variant icons.
      </AlertDescription>
    </Alert>
  ),
}

export const ComposedChildren: Story = {
  render: () => (
    <Alert variant="warning">
      <AlertTitle>Are you absolutely sure?</AlertTitle>
      <AlertDescription>
        This action cannot be undone. This will permanently delete your account
        and remove your data from our servers.
      </AlertDescription>
    </Alert>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <Alert variant="info" title="Information" description="This is an informational alert." />
      <Alert variant="success" title="Success" description="Operation completed successfully." />
      <Alert variant="warning" title="Warning" description="Please review before proceeding." />
      <Alert variant="error" title="Error" description="An error has occurred." />
    </div>
  ),
}

export const WithoutIcon: Story = {
  render: () => (
    <Alert variant="info" icon={null}>
      <AlertTitle>No Icon</AlertTitle>
      <AlertDescription>This alert has no icon displayed.</AlertDescription>
    </Alert>
  ),
}
