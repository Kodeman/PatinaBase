import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from './Checkbox'
import { Label } from '../Label'
import { useState } from 'react'

const meta = {
  title: 'Forms/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}

export const Checked: Story = {
  args: {
    checked: true,
  },
}

export const Indeterminate: Story = {
  args: {
    checked: 'indeterminate',
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    checked: true,
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <Checkbox size="sm" id="small" defaultChecked />
        <Label htmlFor="small">Small</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox size="md" id="medium" defaultChecked />
        <Label htmlFor="medium">Medium</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox size="lg" id="large" defaultChecked />
        <Label htmlFor="large">Large</Label>
      </div>
    </div>
  ),
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms" className="cursor-pointer">
        Accept terms and conditions
      </Label>
    </div>
  ),
}

export const WithLabelAndDescription: Story = {
  render: () => (
    <div className="flex items-start space-x-2">
      <Checkbox id="marketing" className="mt-1" />
      <div className="grid gap-1.5 leading-none">
        <Label htmlFor="marketing" className="cursor-pointer">
          Marketing emails
        </Label>
        <p className="text-sm text-muted-foreground">
          Receive emails about new products, features, and more.
        </p>
      </div>
    </div>
  ),
}

export const CheckboxGroup: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Select your interests</h3>
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox id="design" defaultChecked />
          <Label htmlFor="design" className="cursor-pointer">
            Design
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="development" defaultChecked />
          <Label htmlFor="development" className="cursor-pointer">
            Development
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="marketing" />
          <Label htmlFor="marketing" className="cursor-pointer">
            Marketing
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="sales" />
          <Label htmlFor="sales" className="cursor-pointer">
            Sales
          </Label>
        </div>
      </div>
    </div>
  ),
}

export const IndeterminateExample: Story = {
  render: () => {
    const [checkedItems, setCheckedItems] = useState({
      item1: false,
      item2: true,
      item3: false,
    })

    const allChecked = Object.values(checkedItems).every(Boolean)
    const someChecked = Object.values(checkedItems).some(Boolean)
    const indeterminate = someChecked && !allChecked

    const handleParentChange = (checked: boolean | 'indeterminate') => {
      const newValue = checked === true
      setCheckedItems({
        item1: newValue,
        item2: newValue,
        item3: newValue,
      })
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="parent"
            checked={allChecked ? true : indeterminate ? 'indeterminate' : false}
            onCheckedChange={handleParentChange}
          />
          <Label htmlFor="parent" className="cursor-pointer font-medium">
            Select All
          </Label>
        </div>
        <div className="ml-6 space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="item1"
              checked={checkedItems.item1}
              onCheckedChange={(checked) =>
                setCheckedItems({ ...checkedItems, item1: checked as boolean })
              }
            />
            <Label htmlFor="item1" className="cursor-pointer">
              Item 1
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="item2"
              checked={checkedItems.item2}
              onCheckedChange={(checked) =>
                setCheckedItems({ ...checkedItems, item2: checked as boolean })
              }
            />
            <Label htmlFor="item2" className="cursor-pointer">
              Item 2
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="item3"
              checked={checkedItems.item3}
              onCheckedChange={(checked) =>
                setCheckedItems({ ...checkedItems, item3: checked as boolean })
              }
            />
            <Label htmlFor="item3" className="cursor-pointer">
              Item 3
            </Label>
          </div>
        </div>
      </div>
    )
  },
}

export const ControlledExample: Story = {
  render: () => {
    const [checked, setChecked] = useState(false)

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="controlled"
            checked={checked}
            onCheckedChange={(value) => setChecked(value as boolean)}
          />
          <Label htmlFor="controlled" className="cursor-pointer">
            Controlled checkbox
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Checked state: {checked ? 'true' : 'false'}
        </p>
        <button
          onClick={() => setChecked(!checked)}
          className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md"
        >
          Toggle
        </button>
      </div>
    )
  },
}

export const FormExample: Story = {
  render: () => (
    <form className="space-y-6 w-96">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Notification Settings</h3>

        <div className="flex items-start space-x-2">
          <Checkbox id="email-notifications" className="mt-1" />
          <div className="grid gap-1.5 leading-none">
            <Label htmlFor="email-notifications" className="cursor-pointer">
              Email notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive email notifications for important updates
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <Checkbox id="sms-notifications" className="mt-1" />
          <div className="grid gap-1.5 leading-none">
            <Label htmlFor="sms-notifications" className="cursor-pointer">
              SMS notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive text messages for urgent alerts
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <Checkbox id="push-notifications" className="mt-1" defaultChecked />
          <div className="grid gap-1.5 leading-none">
            <Label htmlFor="push-notifications" className="cursor-pointer">
              Push notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive push notifications on your device
            </p>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md"
      >
        Save preferences
      </button>
    </form>
  ),
}
