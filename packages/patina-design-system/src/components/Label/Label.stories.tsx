import type { Meta, StoryObj } from '@storybook/react'
import { Label } from './Label'
import { Input } from '../Input'
import { Checkbox } from '../Checkbox'

const meta = {
  title: 'Forms/Label',
  component: Label,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Email Address',
  },
}

export const Required: Story = {
  args: {
    children: 'Email Address',
    required: true,
  },
}

export const Optional: Story = {
  args: {
    children: 'Phone Number',
    optional: true,
  },
}

export const WithInput: Story = {
  render: () => (
    <div className="space-y-2 w-80">
      <Label htmlFor="email">Email Address</Label>
      <Input id="email" type="email" placeholder="Enter your email" />
    </div>
  ),
}

export const WithRequiredInput: Story = {
  render: () => (
    <div className="space-y-2 w-80">
      <Label htmlFor="password" required>
        Password
      </Label>
      <Input id="password" type="password" placeholder="Enter your password" />
    </div>
  ),
}

export const WithOptionalInput: Story = {
  render: () => (
    <div className="space-y-2 w-80">
      <Label htmlFor="phone" optional>
        Phone Number
      </Label>
      <Input id="phone" type="tel" placeholder="Enter your phone number" />
    </div>
  ),
}

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms" className="cursor-pointer">
        I agree to the terms and conditions
      </Label>
    </div>
  ),
}

export const MultipleLabels: Story = {
  render: () => (
    <div className="space-y-6 w-80">
      <div className="space-y-2">
        <Label htmlFor="name" required>
          Full Name
        </Label>
        <Input id="name" placeholder="John Doe" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input id="email" type="email" placeholder="john@example.com" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio" optional>
          Bio
        </Label>
        <Input id="bio" placeholder="Tell us about yourself" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="website" optional>
          Website
        </Label>
        <Input id="website" type="url" placeholder="https://example.com" />
      </div>
    </div>
  ),
}

export const CustomStyling: Story = {
  render: () => (
    <div className="space-y-6 w-80">
      <div className="space-y-2">
        <Label htmlFor="large" className="text-base font-bold">
          Large Label
        </Label>
        <Input id="large" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="colored" className="text-primary">
          Colored Label
        </Label>
        <Input id="colored" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="uppercase" className="uppercase tracking-wide">
          Uppercase Label
        </Label>
        <Input id="uppercase" />
      </div>
    </div>
  ),
}
