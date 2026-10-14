import type { Meta, StoryObj } from '@storybook/react'
import * as LucideIcons from 'lucide-react'
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
    icon: LucideIcons.Heart,
    size: 24,
    strokeWidth: 2,
  },
}

export const Large: Story = {
  args: {
    icon: LucideIcons.Star,
    size: 48,
    strokeWidth: 2,
  },
}

export const Colored: Story = {
  args: {
    icon: LucideIcons.Heart,
    size: 32,
    color: '#ef4444',
    strokeWidth: 2,
  },
}

export const ThickStroke: Story = {
  args: {
    icon: LucideIcons.Circle,
    size: 32,
    strokeWidth: 4,
  },
}

export const CommonIcons: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <Icon icon={LucideIcons.Home} size={24} />
      <Icon icon={LucideIcons.User} size={24} />
      <Icon icon={LucideIcons.Settings} size={24} />
      <Icon icon={LucideIcons.Search} size={24} />
      <Icon icon={LucideIcons.ShoppingCart} size={24} />
      <Icon icon={LucideIcons.Heart} size={24} />
      <Icon icon={LucideIcons.Star} size={24} />
      <Icon icon={LucideIcons.Bell} size={24} />
      <Icon icon={LucideIcons.Mail} size={24} />
      <Icon icon={LucideIcons.Calendar} size={24} />
      <Icon icon={LucideIcons.Image} size={24} />
      <Icon icon={LucideIcons.Upload} size={24} />
      <Icon icon={LucideIcons.Download} size={24} />
      <Icon icon={LucideIcons.Edit} size={24} />
      <Icon icon={LucideIcons.Trash2} size={24} />
      <Icon icon={LucideIcons.Check} size={24} />
      <Icon icon={LucideIcons.X} size={24} />
      <Icon icon={LucideIcons.ChevronRight} size={24} />
      <Icon icon={LucideIcons.ChevronDown} size={24} />
      <Icon icon={LucideIcons.Menu} size={24} />
    </div>
  ),
}

export const DesignerIcons: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <Icon icon={LucideIcons.Palette} size={24} />
      <Icon icon={LucideIcons.Paintbrush} size={24} />
      <Icon icon={LucideIcons.Layers} size={24} />
      <Icon icon={LucideIcons.Layout} size={24} />
      <Icon icon={LucideIcons.Grid3x3} size={24} />
      <Icon icon={LucideIcons.Maximize2} size={24} />
      <Icon icon={LucideIcons.Move} size={24} />
      <Icon icon={LucideIcons.Copy} size={24} />
      <Icon icon={LucideIcons.Eye} size={24} />
      <Icon icon={LucideIcons.EyeOff} size={24} />
      <Icon icon={LucideIcons.Ruler} size={24} />
      <Icon icon={LucideIcons.Droplet} size={24} />
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
      <Icon icon={LucideIcons.Heart} size={16} />
      <Icon icon={LucideIcons.Heart} size={24} />
      <Icon icon={LucideIcons.Heart} size={32} />
      <Icon icon={LucideIcons.Heart} size={48} />
      <Icon icon={LucideIcons.Heart} size={64} />
    </div>
  ),
}
