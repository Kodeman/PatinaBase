import type { Meta, StoryObj } from '@storybook/react'
import { Icon, CustomIcon } from './Icon'

const meta: Meta<typeof Icon> = {
  title: 'Components/Icon',
  component: Icon,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: 'text',
      description: 'Name of the lucide-react icon',
    },
    size: {
      control: 'number',
      description: 'Size of the icon',
    },
    color: {
      control: 'color',
      description: 'Color of the icon',
    },
    strokeWidth: {
      control: 'number',
      description: 'Stroke width of the icon',
    },
  },
}

export default meta
type Story = StoryObj<typeof Icon>

export const Default: Story = {
  args: {
    name: 'Heart',
    size: 24,
    strokeWidth: 2,
  },
}

export const Large: Story = {
  args: {
    name: 'Star',
    size: 48,
    strokeWidth: 2,
  },
}

export const Colored: Story = {
  args: {
    name: 'Heart',
    size: 32,
    color: '#ef4444',
    strokeWidth: 2,
  },
}

export const ThickStroke: Story = {
  args: {
    name: 'Circle',
    size: 32,
    strokeWidth: 4,
  },
}

export const CommonIcons: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <Icon name="Home" size={24} />
      <Icon name="User" size={24} />
      <Icon name="Settings" size={24} />
      <Icon name="Search" size={24} />
      <Icon name="ShoppingCart" size={24} />
      <Icon name="Heart" size={24} />
      <Icon name="Star" size={24} />
      <Icon name="Bell" size={24} />
      <Icon name="Mail" size={24} />
      <Icon name="Calendar" size={24} />
      <Icon name="Image" size={24} />
      <Icon name="Upload" size={24} />
      <Icon name="Download" size={24} />
      <Icon name="Edit" size={24} />
      <Icon name="Trash2" size={24} />
      <Icon name="Check" size={24} />
      <Icon name="X" size={24} />
      <Icon name="ChevronRight" size={24} />
      <Icon name="ChevronDown" size={24} />
      <Icon name="Menu" size={24} />
    </div>
  ),
}

export const DesignerIcons: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <Icon name="Palette" size={24} />
      <Icon name="Paintbrush" size={24} />
      <Icon name="Layers" size={24} />
      <Icon name="Layout" size={24} />
      <Icon name="Grid3x3" size={24} />
      <Icon name="Maximize2" size={24} />
      <Icon name="Move" size={24} />
      <Icon name="Copy" size={24} />
      <Icon name="Eye" size={24} />
      <Icon name="EyeOff" size={24} />
      <Icon name="Ruler" size={24} />
      <Icon name="Droplet" size={24} />
    </div>
  ),
}

export const CustomSVGIcon: StoryObj<typeof CustomIcon> = {
  render: () => (
    <div className="flex gap-4">
      <CustomIcon size={32}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" />
      </CustomIcon>

      <CustomIcon size={32} className="text-blue-500">
        <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
        <path d="M8 12l2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
      </CustomIcon>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <Icon name="Heart" size={16} />
      <Icon name="Heart" size={24} />
      <Icon name="Heart" size={32} />
      <Icon name="Heart" size={48} />
      <Icon name="Heart" size={64} />
    </div>
  ),
}
