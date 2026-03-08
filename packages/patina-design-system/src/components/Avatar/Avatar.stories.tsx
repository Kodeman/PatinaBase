import type { Meta, StoryObj } from '@storybook/react'
import { Avatar } from './Avatar'

const meta: Meta<typeof Avatar> = {
  title: 'Data Display/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof Avatar>

export const Default: Story = {
  args: {
    name: 'John Doe',
  },
}

export const WithImage: Story = {
  args: {
    src: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
    alt: 'John Doe',
    name: 'John Doe',
  },
}

export const WithStatus: Story = {
  args: {
    name: 'John Doe',
    status: 'online',
  },
}

export const AllStatuses: Story = {
  render: () => (
    <div className="flex gap-4">
      <Avatar name="Online User" status="online" />
      <Avatar name="Offline User" status="offline" />
      <Avatar name="Busy User" status="busy" />
      <Avatar name="Away User" status="away" />
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar name="XS" size="xs" />
      <Avatar name="SM" size="sm" />
      <Avatar name="MD" size="md" />
      <Avatar name="LG" size="lg" />
      <Avatar name="XL" size="xl" />
      <Avatar name="2XL" size="2xl" />
    </div>
  ),
}

export const Shapes: Story = {
  render: () => (
    <div className="flex gap-4">
      <Avatar name="Circle" shape="circle" />
      <Avatar name="Square" shape="square" />
    </div>
  ),
}

export const SquareWithImage: Story = {
  args: {
    src: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jane',
    alt: 'Jane Doe',
    name: 'Jane Doe',
    shape: 'square',
    size: 'xl',
  },
}

export const LargeWithStatus: Story = {
  args: {
    src: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    alt: 'Alice',
    name: 'Alice',
    size: 'xl',
    status: 'online',
  },
}

export const FallbackInitials: Story = {
  render: () => (
    <div className="flex gap-4">
      <Avatar name="John Doe" />
      <Avatar name="Jane Smith" />
      <Avatar name="Madonna" />
      <Avatar name="Jean-Baptiste Zorg" />
    </div>
  ),
}

export const NoName: Story = {
  args: {},
}

export const ImageLoadingFallback: Story = {
  args: {
    src: 'https://invalid-url.com/avatar.jpg',
    name: 'Fallback User',
  },
}
