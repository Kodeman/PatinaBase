import type { Meta, StoryObj } from '@storybook/react'
import { FormError } from './FormError'

const meta = {
  title: 'Forms/FormError',
  component: FormError,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['error', 'success', 'info'],
    },
  },
} satisfies Meta<typeof FormError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'This field is required',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <FormError variant="error">Please enter a valid email address</FormError>
      <FormError variant="success">Email is valid and available</FormError>
      <FormError variant="info">This field is optional</FormError>
    </div>
  ),
}

export const WithoutIcon: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <FormError showIcon={false}>Error without icon</FormError>
      <FormError variant="success" showIcon={false}>
        Success without icon
      </FormError>
      <FormError variant="info" showIcon={false}>
        Info without icon
      </FormError>
    </div>
  ),
}

export const ErrorMessages: Story = {
  render: () => (
    <div className="space-y-3 w-96">
      <FormError>This field is required</FormError>
      <FormError>Please enter a valid email address</FormError>
      <FormError>Password must be at least 8 characters</FormError>
      <FormError>Passwords do not match</FormError>
      <FormError>Username is already taken</FormError>
    </div>
  ),
}

export const SuccessMessages: Story = {
  render: () => (
    <div className="space-y-3 w-96">
      <FormError variant="success">Email is valid</FormError>
      <FormError variant="success">Username is available</FormError>
      <FormError variant="success">Password meets all requirements</FormError>
      <FormError variant="success">Profile saved successfully</FormError>
    </div>
  ),
}

export const InfoMessages: Story = {
  render: () => (
    <div className="space-y-3 w-96">
      <FormError variant="info">This field is optional</FormError>
      <FormError variant="info">Password must contain at least one number</FormError>
      <FormError variant="info">You can change this later in settings</FormError>
    </div>
  ),
}

export const LongMessages: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <FormError>
        Password must be at least 8 characters long and contain at least one uppercase letter,
        one lowercase letter, one number, and one special character.
      </FormError>
      <FormError variant="success">
        Your email has been verified successfully. You can now access all features of your
        account.
      </FormError>
      <FormError variant="info">
        For security reasons, we recommend using a password manager to generate and store
        strong, unique passwords for all your accounts.
      </FormError>
    </div>
  ),
}

export const WithForm: Story = {
  render: () => (
    <form className="space-y-6 w-96">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          className="w-full px-3 py-2 border border-destructive rounded-md"
          defaultValue="invalid"
        />
        <FormError>Please enter a valid email address</FormError>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Username</label>
        <input
          type="text"
          className="w-full px-3 py-2 border border-green-500 rounded-md"
          defaultValue="johndoe"
        />
        <FormError variant="success">Username is available</FormError>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Bio <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea className="w-full px-3 py-2 border border-input rounded-md" rows={3} />
        <FormError variant="info">Tell us a bit about yourself</FormError>
      </div>
    </form>
  ),
}

export const MultipleErrors: Story = {
  render: () => (
    <div className="space-y-6 w-96">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Password</label>
        <input
          type="password"
          className="w-full px-3 py-2 border border-destructive rounded-md"
        />
        <div className="space-y-1">
          <FormError>Password is required</FormError>
          <FormError>Password must be at least 8 characters</FormError>
          <FormError>Password must contain at least one number</FormError>
        </div>
      </div>
    </div>
  ),
}

export const ConditionalRendering: Story = {
  render: () => {
    const [showError, setShowError] = React.useState(false)

    return (
      <div className="space-y-4 w-96">
        <button
          onClick={() => setShowError(!showError)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
        >
          Toggle Error
        </button>
        <FormError>{showError && 'This is a conditional error message'}</FormError>
      </div>
    )
  },
}
