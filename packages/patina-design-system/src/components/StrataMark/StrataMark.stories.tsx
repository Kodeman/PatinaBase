import type { Meta, StoryObj } from '@storybook/react'
import { StrataMark } from './StrataMark'

const meta: Meta<typeof StrataMark> = {
  title: 'Components/StrataMark',
  component: StrataMark,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'number',
      description: 'Size of the icon in pixels',
      defaultValue: 14,
    },
    color: {
      control: 'color',
      description: 'CSS color value (defaults to currentColor)',
    },
    className: {
      control: 'text',
      description: 'Additional CSS class names',
    },
  },
}

export default meta
type Story = StoryObj<typeof StrataMark>

/**
 * Default size (14 px) inheriting the parent text color via `currentColor`.
 */
export const Default: Story = {
  args: {
    size: 14,
  },
}

/**
 * Larger render for inspecting the three-line motif at a comfortable size.
 */
export const Large: Story = {
  args: {
    size: 48,
  },
}

/**
 * Custom brand color applied directly via the `color` prop.
 */
export const BrandColor: Story = {
  args: {
    size: 32,
    color: 'oklch(0.618 0.0778 65.5444)',
  },
}

/**
 * Muted tone — typical sidebar / navigation context.
 */
export const MutedTone: Story = {
  args: {
    size: 24,
    color: 'oklch(0.5391 0.0387 71.1655)',
  },
}

/**
 * Inheriting color via Tailwind CSS class — the preferred pattern.
 */
export const ViaClassName: Story = {
  args: {
    size: 24,
    className: 'text-primary',
  },
}

/**
 * Size scale — all standard sizes side by side.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <StrataMark size={10} />
      <StrataMark size={14} />
      <StrataMark size={18} />
      <StrataMark size={24} />
      <StrataMark size={32} />
      <StrataMark size={48} />
    </div>
  ),
}

/**
 * Color palette — demonstrating the icon against help-system accent colors.
 */
export const HelpSystemPalette: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <StrataMark size={24} color="oklch(0.9450 0.0080 85.0000)" />
      <StrataMark size={24} color="oklch(0.5200 0.0450 60.0000)" />
      <StrataMark size={24} color="oklch(0.7100 0.0420 145.0000)" />
      <StrataMark size={24} color="oklch(0.6800 0.0520 240.0000)" />
      <StrataMark size={24} color="oklch(0.6500 0.1100 35.0000)" />
      <StrataMark size={24} color="oklch(0.8200 0.1500 90.0000)" />
    </div>
  ),
}

/**
 * Accessible usage — providing aria-label makes the icon announced by screen readers.
 */
export const Accessible: Story = {
  args: {
    size: 24,
    'aria-label': 'Patina logo',
  },
}
