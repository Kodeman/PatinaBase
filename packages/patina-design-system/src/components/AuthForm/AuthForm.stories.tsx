import type { Meta, StoryObj } from '@storybook/react'
import { AuthForm } from './AuthForm'
import { Link } from '../Link'

const meta = {
  title: 'Components/AuthForm',
  component: AuthForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AuthForm>

export default meta
type Story = StoryObj<typeof meta>

export const SignIn: Story = {
  args: {
    title: 'Sign In',
    description: 'Welcome back to Patina',
    fields: [
      {
        name: 'email',
        label: 'Email Address',
        type: 'email',
        placeholder: 'you@example.com',
        required: true,
        autoComplete: 'email',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
        required: true,
        autoComplete: 'current-password',
      },
    ],
    submitText: 'Sign In',
    onSubmit: (data) => console.log('Sign in:', data),
    footer: (
      <div className="space-y-3 text-center text-sm">
        <Link href="/auth/forgot-password" className="text-primary hover:underline">
          Forgot your password?
        </Link>
        <p className="text-muted-foreground">
          Don't have an account?{' '}
          <Link href="/auth/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    ),
  },
}

export const SignUp: Story = {
  args: {
    title: 'Create Account',
    description: 'Join Patina today',
    fields: [
      {
        name: 'name',
        label: 'Full Name',
        type: 'text',
        placeholder: 'John Doe',
        required: true,
        autoComplete: 'name',
      },
      {
        name: 'email',
        label: 'Email Address',
        type: 'email',
        placeholder: 'you@example.com',
        required: true,
        autoComplete: 'email',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Create a password',
        required: true,
        autoComplete: 'new-password',
      },
      {
        name: 'confirmPassword',
        label: 'Confirm Password',
        type: 'password',
        placeholder: 'Confirm your password',
        required: true,
        autoComplete: 'new-password',
      },
    ],
    submitText: 'Create Account',
    onSubmit: (data) => console.log('Sign up:', data),
    footer: (
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/auth/signin" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    ),
  },
}

export const ForgotPassword: Story = {
  args: {
    title: 'Reset Password',
    description: 'Enter your email to receive a reset link',
    fields: [
      {
        name: 'email',
        label: 'Email Address',
        type: 'email',
        placeholder: 'you@example.com',
        required: true,
        autoComplete: 'email',
      },
    ],
    submitText: 'Send Reset Link',
    onSubmit: (data) => console.log('Reset password:', data),
    footer: (
      <p className="text-center text-sm text-muted-foreground">
        Remember your password?{' '}
        <Link href="/auth/signin" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    ),
  },
}

export const WithError: Story = {
  args: {
    ...SignIn.args,
    error: 'Invalid email or password. Please try again.',
  },
}

export const Loading: Story = {
  args: {
    ...SignIn.args,
    isLoading: true,
  },
}

export const WithSuccess: Story = {
  args: {
    ...ForgotPassword.args,
    success: 'Password reset link sent to your email!',
  },
}
