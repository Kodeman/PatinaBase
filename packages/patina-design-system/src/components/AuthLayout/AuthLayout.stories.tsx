import type { Meta, StoryObj } from '@storybook/react'
import { AuthLayout } from './AuthLayout'
import { AuthForm } from '../AuthForm'
import { Link } from '../Link'

const meta = {
  title: 'Components/AuthLayout',
  component: AuthLayout,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AuthLayout>

export default meta
type Story = StoryObj<typeof meta>

const signInFields = [
  {
    name: 'email',
    label: 'Email Address',
    type: 'email' as const,
    placeholder: 'you@example.com',
    required: true,
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password' as const,
    placeholder: 'Enter your password',
    required: true,
  },
]

export const Default: Story = {
  args: {
    title: 'Welcome Back',
    description: 'Sign in to your account to continue',
    children: (
      <AuthForm
        title=""
        fields={signInFields}
        submitText="Sign In"
        onSubmit={(data) => console.log(data)}
        showLogo={false}
      />
    ),
  },
}

export const WithGradientBackground: Story = {
  args: {
    ...Default.args,
    backgroundPattern: 'gradient',
  },
}

export const WithGridBackground: Story = {
  args: {
    ...Default.args,
    backgroundPattern: 'grid',
  },
}

export const WithDotsBackground: Story = {
  args: {
    ...Default.args,
    backgroundPattern: 'dots',
  },
}

export const WithFooter: Story = {
  args: {
    ...Default.args,
    footer: (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    ),
  },
}

export const LargeWidth: Story = {
  args: {
    ...Default.args,
    maxWidth: 'lg',
  },
}

export const SmallWidth: Story = {
  args: {
    ...Default.args,
    maxWidth: 'sm',
  },
}

export const NoBackground: Story = {
  args: {
    ...Default.args,
    backgroundPattern: 'none',
  },
}

export const CustomLogo: Story = {
  args: {
    ...Default.args,
    showDefaultLogo: false,
    logo: (
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
        <span className="text-2xl font-bold text-primary">P</span>
      </div>
    ),
  },
}
