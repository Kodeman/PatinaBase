import type { Meta, StoryObj } from '@storybook/react'
import { Slider } from './Slider'
import { useState } from 'react'

const meta = {
  title: 'Form/Slider',
  component: Slider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    defaultValue: [50],
    min: 0,
    max: 100,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export const WithValue: Story = {
  args: {
    defaultValue: [50],
    min: 0,
    max: 100,
    showValue: true,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export const Range: Story = {
  args: {
    defaultValue: [25, 75],
    min: 0,
    max: 100,
    showValue: true,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export const WithStep: Story = {
  args: {
    defaultValue: [50],
    min: 0,
    max: 100,
    step: 10,
    showValue: true,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export const WithMarks: Story = {
  args: {
    defaultValue: [50],
    min: 0,
    max: 100,
    marks: [
      { value: 0, label: '0%' },
      { value: 50, label: '50%' },
      { value: 100, label: '100%' },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export const WithCustomFormatter: Story = {
  args: {
    defaultValue: [1000],
    min: 0,
    max: 10000,
    step: 100,
    showValue: true,
    formatValue: (val) => `$${val.toLocaleString()}`,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export const Sizes: Story = {
  render: () => (
    <div className="space-y-8 w-80">
      <div>
        <p className="text-sm mb-2">Small</p>
        <Slider defaultValue={[50]} size="sm" />
      </div>
      <div>
        <p className="text-sm mb-2">Medium</p>
        <Slider defaultValue={[50]} size="md" />
      </div>
      <div>
        <p className="text-sm mb-2">Large</p>
        <Slider defaultValue={[50]} size="lg" />
      </div>
    </div>
  ),
}

export const Disabled: Story = {
  args: {
    defaultValue: [50],
    min: 0,
    max: 100,
    disabled: true,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState([50])
    return (
      <div className="w-80 space-y-4">
        <Slider
          value={value}
          onValueChange={setValue}
          min={0}
          max={100}
          showValue
        />
        <div className="flex gap-2">
          <button
            onClick={() => setValue([0])}
            className="px-3 py-1 text-sm rounded bg-secondary"
          >
            Min
          </button>
          <button
            onClick={() => setValue([50])}
            className="px-3 py-1 text-sm rounded bg-secondary"
          >
            Middle
          </button>
          <button
            onClick={() => setValue([100])}
            className="px-3 py-1 text-sm rounded bg-secondary"
          >
            Max
          </button>
        </div>
      </div>
    )
  },
}

export const VolumeControl: Story = {
  render: () => {
    const [volume, setVolume] = useState([70])
    return (
      <div className="w-80 p-6 border rounded-lg">
        <div className="flex items-center gap-4">
          <span className="text-2xl">🔊</span>
          <div className="flex-1">
            <Slider
              value={volume}
              onValueChange={setVolume}
              min={0}
              max={100}
            />
          </div>
          <span className="text-sm font-mono w-12 text-right">
            {volume[0]}%
          </span>
        </div>
      </div>
    )
  },
}

export const PriceRange: Story = {
  render: () => {
    const [range, setRange] = useState([25, 75])
    return (
      <div className="w-80 p-6 border rounded-lg space-y-4">
        <h3 className="font-semibold">Price Range</h3>
        <Slider
          value={range}
          onValueChange={setRange}
          min={0}
          max={1000}
          step={10}
        />
        <div className="flex justify-between text-sm">
          <span>${range[0]}</span>
          <span>${range[1]}</span>
        </div>
      </div>
    )
  },
}
