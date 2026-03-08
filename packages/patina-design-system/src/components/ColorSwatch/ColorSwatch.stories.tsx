import type { Meta, StoryObj } from '@storybook/react'
import { ColorSwatch, ColorSwatchGroup, ColorPalette } from './ColorSwatch'
import * as React from 'react'

const meta: Meta<typeof ColorSwatch> = {
  title: 'Components/ColorSwatch',
  component: ColorSwatch,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof ColorSwatch>

export const Basic: Story = {
  args: {
    color: '#FF5733',
    label: 'Coral',
  },
}

export const Selected: Story = {
  args: {
    color: '#FF5733',
    label: 'Coral',
    selected: true,
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <ColorSwatch color="#FF5733" size="sm" label="Small" />
      <ColorSwatch color="#FF5733" size="md" label="Medium" />
      <ColorSwatch color="#FF5733" size="lg" label="Large" />
      <ColorSwatch color="#FF5733" size="xl" label="Extra Large" />
    </div>
  ),
}

export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <ColorSwatch color="#FF5733" variant="default" label="Default" />
      <ColorSwatch color="#FF5733" variant="rounded" label="Rounded" />
      <ColorSwatch color="#FF5733" variant="square" label="Square" />
    </div>
  ),
}

export const ColorPalettes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <ColorSwatch color="#FF5733" label="Coral" />
      <ColorSwatch color="#33FF57" label="Green" />
      <ColorSwatch color="#3357FF" label="Blue" />
      <ColorSwatch color="#F3FF33" label="Yellow" />
      <ColorSwatch color="#FF33F3" label="Magenta" />
      <ColorSwatch color="#33F3FF" label="Cyan" />
    </div>
  ),
}

export const GroupSelection: StoryObj<typeof ColorSwatchGroup> = {
  render: () => {
    const [selected, setSelected] = React.useState('#FF5733')
    const colors = [
      { value: '#FF5733', label: 'Coral' },
      { value: '#33FF57', label: 'Green' },
      { value: '#3357FF', label: 'Blue' },
      { value: '#F3FF33', label: 'Yellow' },
      { value: '#FF33F3', label: 'Magenta' },
      { value: '#33F3FF', label: 'Cyan' },
    ]

    return (
      <div className="space-y-4">
        <ColorSwatchGroup
          colors={colors}
          value={selected}
          onChange={setSelected as any}
        />
        <p className="text-sm text-muted-foreground">Selected: {selected}</p>
      </div>
    )
  },
}

export const MultipleSelection: StoryObj<typeof ColorSwatchGroup> = {
  render: () => {
    const [selected, setSelected] = React.useState<string[]>(['#FF5733', '#3357FF'])
    const colors = [
      { value: '#FF5733', label: 'Coral' },
      { value: '#33FF57', label: 'Green' },
      { value: '#3357FF', label: 'Blue' },
      { value: '#F3FF33', label: 'Yellow' },
      { value: '#FF33F3', label: 'Magenta' },
      { value: '#33F3FF', label: 'Cyan' },
    ]

    return (
      <div className="space-y-4">
        <ColorSwatchGroup
          colors={colors}
          value={selected}
          onChange={setSelected as any}
          multiple
        />
        <p className="text-sm text-muted-foreground">
          Selected: {selected.join(', ')}
        </p>
      </div>
    )
  },
}

export const WithLabels: StoryObj<typeof ColorSwatchGroup> = {
  render: () => {
    const colors = [
      { value: '#FF5733', label: 'Coral' },
      { value: '#33FF57', label: 'Green' },
      { value: '#3357FF', label: 'Blue' },
      { value: '#F3FF33', label: 'Yellow' },
    ]

    return <ColorSwatchGroup colors={colors} showLabels size="lg" />
  },
}

export const PaletteExample: StoryObj<typeof ColorPalette> = {
  render: () => {
    const [selected, setSelected] = React.useState('#2563eb')
    const palette = {
      primary: [
        { value: '#3b82f6', label: 'Blue 500' },
        { value: '#2563eb', label: 'Blue 600' },
        { value: '#1d4ed8', label: 'Blue 700' },
      ],
      secondary: [
        { value: '#a855f7', label: 'Purple 500' },
        { value: '#9333ea', label: 'Purple 600' },
        { value: '#7e22ce', label: 'Purple 700' },
      ],
      accent: [
        { value: '#f43f5e', label: 'Rose 500' },
        { value: '#e11d48', label: 'Rose 600' },
        { value: '#be123c', label: 'Rose 700' },
      ],
      neutral: [
        { value: '#6b7280', label: 'Gray 500' },
        { value: '#4b5563', label: 'Gray 600' },
        { value: '#374151', label: 'Gray 700' },
      ],
    }

    return (
      <div className="space-y-4 max-w-md">
        <ColorPalette palette={palette} value={selected} onChange={setSelected} />
        <div className="p-4 rounded-lg border">
          <p className="text-sm font-medium mb-2">Selected Color:</p>
          <div className="flex items-center gap-2">
            <ColorSwatch color={selected} size="lg" />
            <span className="font-mono text-sm">{selected}</span>
          </div>
        </div>
      </div>
    )
  },
}

export const RoundedVariantPalette: StoryObj<typeof ColorSwatchGroup> = {
  render: () => {
    const colors = [
      { value: '#ef4444', label: 'Red' },
      { value: '#f97316', label: 'Orange' },
      { value: '#f59e0b', label: 'Amber' },
      { value: '#eab308', label: 'Yellow' },
      { value: '#84cc16', label: 'Lime' },
      { value: '#22c55e', label: 'Green' },
      { value: '#10b981', label: 'Emerald' },
      { value: '#14b8a6', label: 'Teal' },
      { value: '#06b6d4', label: 'Cyan' },
      { value: '#0ea5e9', label: 'Sky' },
      { value: '#3b82f6', label: 'Blue' },
      { value: '#6366f1', label: 'Indigo' },
      { value: '#8b5cf6', label: 'Violet' },
      { value: '#a855f7', label: 'Purple' },
      { value: '#d946ef', label: 'Fuchsia' },
      { value: '#ec4899', label: 'Pink' },
    ]

    return (
      <ColorSwatchGroup
        colors={colors}
        variant="rounded"
        size="lg"
        showLabels
        gap={4}
      />
    )
  },
}
