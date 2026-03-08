import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from './Switch'
import { useState } from 'react'

const meta = {
  title: 'Form/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    labelPosition: {
      control: 'select',
      options: ['left', 'right'],
    },
    disabled: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}

export const WithLabel: Story = {
  args: {
    label: 'Enable notifications',
  },
}

export const WithLabelAndDescription: Story = {
  args: {
    label: 'Enable notifications',
    description: 'Receive updates via email',
  },
}

export const LabelLeft: Story = {
  args: {
    label: 'Enable notifications',
    description: 'Receive updates via email',
    labelPosition: 'left',
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4">
      <Switch size="sm" label="Small" />
      <Switch size="md" label="Medium" />
      <Switch size="lg" label="Large" />
    </div>
  ),
}

export const Checked: Story = {
  args: {
    checked: true,
    label: 'Already enabled',
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    label: 'Disabled switch',
  },
}

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    checked: true,
    label: 'Disabled and checked',
  },
}

export const Controlled: Story = {
  render: () => {
    const [checked, setChecked] = useState(false)
    return (
      <div className="space-y-4">
        <Switch
          checked={checked}
          onCheckedChange={setChecked}
          label="Controlled switch"
          description={`Status: ${checked ? 'On' : 'Off'}`}
        />
        <button
          onClick={() => setChecked(!checked)}
          className="px-4 py-2 rounded bg-primary text-primary-foreground"
        >
          Toggle from outside
        </button>
      </div>
    )
  },
}

export const FormExample: Story = {
  render: () => (
    <form className="space-y-4 max-w-md p-6 border rounded-lg">
      <h3 className="text-lg font-semibold">Notification Preferences</h3>
      <Switch
        id="email"
        label="Email notifications"
        description="Receive notifications via email"
      />
      <Switch
        id="push"
        label="Push notifications"
        description="Receive push notifications on your devices"
      />
      <Switch
        id="sms"
        label="SMS notifications"
        description="Receive text message notifications"
      />
      <Switch
        id="marketing"
        label="Marketing emails"
        description="Receive promotional content and updates"
        defaultChecked
      />
    </form>
  ),
}
