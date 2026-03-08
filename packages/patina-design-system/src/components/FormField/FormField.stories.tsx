import type { Meta, StoryObj } from '@storybook/react'
import { FormField } from './FormField'
import { Input } from '../Input'
import { Textarea } from '../Textarea'
import { Checkbox } from '../Checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../Select'

const meta = {
  title: 'Forms/FormField',
  component: FormField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FormField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: 'Email Address',
    htmlFor: 'email',
    children: <Input id="email" type="email" placeholder="Enter your email" />,
  },
}

export const WithDescription: Story = {
  args: {
    label: 'Email Address',
    description: "We'll never share your email with anyone else.",
    htmlFor: 'email',
    children: <Input id="email" type="email" placeholder="Enter your email" />,
  },
}

export const Required: Story = {
  args: {
    label: 'Password',
    required: true,
    htmlFor: 'password',
    children: <Input id="password" type="password" placeholder="Enter your password" />,
  },
}

export const Optional: Story = {
  args: {
    label: 'Phone Number',
    optional: true,
    htmlFor: 'phone',
    children: <Input id="phone" type="tel" placeholder="Enter your phone number" />,
  },
}

export const WithError: Story = {
  args: {
    label: 'Email Address',
    error: 'Please enter a valid email address',
    required: true,
    htmlFor: 'email',
    children: (
      <Input
        id="email"
        type="email"
        placeholder="Enter your email"
        state="error"
        defaultValue="invalid"
      />
    ),
  },
}

export const WithSuccess: Story = {
  args: {
    label: 'Username',
    success: 'Username is available!',
    htmlFor: 'username',
    children: (
      <Input
        id="username"
        type="text"
        placeholder="Choose a username"
        state="success"
        defaultValue="johndoe"
      />
    ),
  },
}

export const WithInfo: Story = {
  args: {
    label: 'API Key',
    info: 'You can generate a new API key in your account settings',
    optional: true,
    htmlFor: 'api-key',
    children: <Input id="api-key" type="text" placeholder="Enter your API key" />,
  },
}

export const VerticalLayout: Story = {
  render: () => (
    <div className="space-y-6 w-96">
      <FormField
        label="Full Name"
        description="Enter your first and last name"
        required
        htmlFor="name"
      >
        <Input id="name" placeholder="John Doe" />
      </FormField>

      <FormField
        label="Email"
        description="We'll use this for account recovery"
        required
        htmlFor="email"
      >
        <Input id="email" type="email" placeholder="john@example.com" />
      </FormField>

      <FormField label="Phone" optional htmlFor="phone">
        <Input id="phone" type="tel" placeholder="+1 (555) 000-0000" />
      </FormField>
    </div>
  ),
}

export const HorizontalLayout: Story = {
  render: () => (
    <div className="space-y-6 w-[600px]">
      <FormField
        label="Full Name"
        orientation="horizontal"
        required
        htmlFor="name"
      >
        <Input id="name" placeholder="John Doe" />
      </FormField>

      <FormField
        label="Email"
        orientation="horizontal"
        required
        htmlFor="email"
      >
        <Input id="email" type="email" placeholder="john@example.com" />
      </FormField>

      <FormField
        label="Bio"
        orientation="horizontal"
        optional
        htmlFor="bio"
      >
        <Textarea id="bio" placeholder="Tell us about yourself" rows={3} />
      </FormField>
    </div>
  ),
}

export const WithTextarea: Story = {
  render: () => (
    <div className="w-[500px]">
      <FormField
        label="Product Description"
        description="Provide a detailed description of your product"
        required
        htmlFor="description"
      >
        <Textarea
          id="description"
          placeholder="Describe your product..."
          showCount
          maxLength={500}
          rows={5}
        />
      </FormField>
    </div>
  ),
}

export const WithSelect: Story = {
  render: () => (
    <div className="w-96">
      <FormField
        label="Country"
        description="Select your country of residence"
        required
        htmlFor="country"
      >
        <Select>
          <SelectTrigger id="country">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="us">United States</SelectItem>
            <SelectItem value="uk">United Kingdom</SelectItem>
            <SelectItem value="ca">Canada</SelectItem>
            <SelectItem value="au">Australia</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
    </div>
  ),
}

export const WithCheckbox: Story = {
  render: () => (
    <div className="w-96">
      <FormField
        error="You must accept the terms and conditions"
        htmlFor="terms"
      >
        <div className="flex items-start space-x-2">
          <Checkbox id="terms" />
          <label
            htmlFor="terms"
            className="text-sm leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            I agree to the{' '}
            <a href="#" className="text-primary underline">
              terms and conditions
            </a>
          </label>
        </div>
      </FormField>
    </div>
  ),
}

export const CompleteForm: Story = {
  render: () => (
    <form className="space-y-6 w-[500px]">
      <FormField
        label="Full Name"
        description="Enter your legal name as it appears on your ID"
        required
        htmlFor="fullName"
      >
        <Input id="fullName" placeholder="John Doe" />
      </FormField>

      <FormField
        label="Email Address"
        error="Please enter a valid email address"
        required
        htmlFor="email"
      >
        <Input
          id="email"
          type="email"
          placeholder="john@example.com"
          state="error"
          defaultValue="invalid"
        />
      </FormField>

      <FormField
        label="Username"
        success="Username is available!"
        required
        htmlFor="username"
      >
        <Input
          id="username"
          placeholder="johndoe"
          state="success"
          defaultValue="johndoe"
        />
      </FormField>

      <FormField
        label="Phone Number"
        info="We'll only use this for account recovery"
        optional
        htmlFor="phone"
      >
        <Input id="phone" type="tel" placeholder="+1 (555) 000-0000" />
      </FormField>

      <FormField
        label="Bio"
        description="Tell us a bit about yourself (max 200 characters)"
        optional
        htmlFor="bio"
      >
        <Textarea
          id="bio"
          placeholder="I'm a designer who loves..."
          showCount
          maxLength={200}
          rows={4}
        />
      </FormField>

      <FormField htmlFor="terms">
        <div className="flex items-start space-x-2">
          <Checkbox id="terms" />
          <label
            htmlFor="terms"
            className="text-sm leading-none cursor-pointer"
          >
            I agree to the terms and conditions
          </label>
        </div>
      </FormField>

      <button
        type="submit"
        className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        Submit
      </button>
    </form>
  ),
}
