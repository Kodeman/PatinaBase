import type { Meta, StoryObj } from '@storybook/react'
import { Input } from './Input'
import { Mail, Lock, Search as SearchIcon, Phone } from 'lucide-react'

const meta = {
  title: 'Forms/Input',
  component: Input,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['outline', 'filled', 'flushed'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    state: {
      control: 'select',
      options: ['default', 'error', 'success'],
    },
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'url', 'search'],
    },
  },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input variant="outline" placeholder="Outline variant" />
      <Input variant="filled" placeholder="Filled variant" />
      <Input variant="flushed" placeholder="Flushed variant" />
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input size="sm" placeholder="Small input" />
      <Input size="md" placeholder="Medium input" />
      <Input size="lg" placeholder="Large input" />
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input state="default" placeholder="Default state" />
      <Input state="error" placeholder="Error state" value="invalid@email" />
      <Input state="success" placeholder="Success state" value="valid@email.com" />
    </div>
  ),
}

export const Types: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input type="text" placeholder="Text input" />
      <Input type="email" placeholder="Email input" />
      <Input type="password" placeholder="Password input" defaultValue="secret" />
      <Input type="number" placeholder="Number input" />
      <Input type="tel" placeholder="Phone number" />
      <Input type="url" placeholder="Website URL" />
      <Input type="search" placeholder="Search..." />
    </div>
  ),
}

export const WithLeftIcon: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input leftIcon={<Mail className="h-4 w-4" />} placeholder="Email" type="email" />
      <Input leftIcon={<Lock className="h-4 w-4" />} placeholder="Password" type="password" />
      <Input leftIcon={<Phone className="h-4 w-4" />} placeholder="Phone" type="tel" />
    </div>
  ),
}

export const WithRightIcon: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input rightIcon={<SearchIcon className="h-4 w-4" />} placeholder="Search..." />
    </div>
  ),
}

export const PasswordWithToggle: Story = {
  render: () => (
    <div className="w-80">
      <Input type="password" placeholder="Enter password" defaultValue="mysecretpassword" />
    </div>
  ),
}

export const ClearableInput: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input clearable placeholder="Clearable input" defaultValue="Clear me" />
      <Input
        clearable
        leftIcon={<Mail className="h-4 w-4" />}
        placeholder="Email"
        defaultValue="user@example.com"
      />
      <Input clearable type="search" placeholder="Search..." defaultValue="search term" />
    </div>
  ),
}

export const WithCharacterCounter: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input showCount maxLength={50} placeholder="Enter text (max 50 chars)" />
      <Input
        showCount
        maxLength={100}
        placeholder="Bio"
        defaultValue="This is my bio"
      />
    </div>
  ),
}

export const SearchInput: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input type="search" placeholder="Search..." />
      <Input type="search" placeholder="Search..." clearable defaultValue="search query" />
      <Input
        type="search"
        variant="filled"
        placeholder="Search..."
        clearable
        defaultValue="filled search"
      />
    </div>
  ),
}

export const DisabledAndReadOnly: Story = {
  render: () => (
    <div className="space-y-4 w-80">
      <Input disabled placeholder="Disabled input" />
      <Input disabled value="Disabled with value" />
      <Input readOnly value="Read-only input" />
    </div>
  ),
}

export const ComplexExample: Story = {
  render: () => (
    <div className="space-y-6 w-96">
      <div>
        <label className="block text-sm font-medium mb-2">Email</label>
        <Input
          type="email"
          leftIcon={<Mail className="h-4 w-4" />}
          placeholder="Enter your email"
          clearable
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Password</label>
        <Input
          type="password"
          leftIcon={<Lock className="h-4 w-4" />}
          placeholder="Enter your password"
          clearable
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Bio (max 200 characters)</label>
        <Input
          placeholder="Tell us about yourself"
          showCount
          maxLength={200}
          variant="filled"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Search</label>
        <Input type="search" placeholder="Search products..." clearable size="lg" />
      </div>
    </div>
  ),
}

export const AllFeaturesCombined: Story = {
  render: () => (
    <div className="w-96">
      <Input
        type="password"
        leftIcon={<Lock className="h-4 w-4" />}
        placeholder="Password with all features"
        clearable
        showCount
        maxLength={20}
        defaultValue="secret"
      />
    </div>
  ),
}
