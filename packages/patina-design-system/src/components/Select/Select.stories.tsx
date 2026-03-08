import type { Meta, StoryObj } from '@storybook/react'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectGroup, SelectLabel } from './Select'
import { useState } from 'react'

const meta = {
  title: 'Form/Select',
  component: Select,
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
  },
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

const fruits = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'orange', label: 'Orange' },
  { value: 'mango', label: 'Mango' },
  { value: 'grape', label: 'Grape' },
]

export const Default: Story = {
  args: {
    placeholder: 'Select a fruit',
    options: fruits,
  },
}

export const WithDefaultValue: Story = {
  args: {
    placeholder: 'Select a fruit',
    options: fruits,
    defaultValue: 'banana',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="space-y-4 w-64">
      <Select placeholder="Outline (default)" options={fruits} variant="outline" />
      <Select placeholder="Filled" options={fruits} variant="filled" />
      <Select placeholder="Flushed" options={fruits} variant="flushed" />
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4 w-64">
      <Select placeholder="Small" options={fruits} size="sm" />
      <Select placeholder="Medium (default)" options={fruits} size="md" />
      <Select placeholder="Large" options={fruits} size="lg" />
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="space-y-4 w-64">
      <Select placeholder="Default state" options={fruits} state="default" />
      <Select placeholder="Error state" options={fruits} state="error" />
      <Select placeholder="Success state" options={fruits} state="success" />
    </div>
  ),
}

export const WithDisabledOptions: Story = {
  args: {
    placeholder: 'Select a fruit',
    options: [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana', disabled: true },
      { value: 'orange', label: 'Orange' },
      { value: 'mango', label: 'Mango', disabled: true },
    ],
  },
}

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <div className="space-y-4">
        <Select
          placeholder="Select a fruit"
          options={fruits}
          value={value}
          onValueChange={setValue}
        />
        <p className="text-sm text-muted-foreground">
          Selected: {value || 'None'}
        </p>
      </div>
    )
  },
}

export const WithGroups: Story = {
  render: () => (
    <div className="w-64">
      <Select placeholder="Select an item">
        <SelectTrigger>
          <span>Select an item</span>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
            <SelectItem value="orange">Orange</SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Vegetables</SelectLabel>
            <SelectItem value="carrot">Carrot</SelectItem>
            <SelectItem value="broccoli">Broccoli</SelectItem>
            <SelectItem value="spinach">Spinach</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
}

export const InForm: Story = {
  render: () => (
    <form className="space-y-4 max-w-md p-6 border rounded-lg">
      <div className="space-y-2">
        <label htmlFor="country" className="text-sm font-medium">
          Country
        </label>
        <Select
          placeholder="Select your country"
          options={[
            { value: 'us', label: 'United States' },
            { value: 'uk', label: 'United Kingdom' },
            { value: 'ca', label: 'Canada' },
            { value: 'au', label: 'Australia' },
          ]}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="language" className="text-sm font-medium">
          Language
        </label>
        <Select
          placeholder="Select your language"
          options={[
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Spanish' },
            { value: 'fr', label: 'French' },
            { value: 'de', label: 'German' },
          ]}
        />
      </div>
    </form>
  ),
}
