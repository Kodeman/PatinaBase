import type { Meta, StoryObj } from '@storybook/react'
import { Avatar } from '../Avatar'
import { AvatarGroup } from './AvatarGroup'

const meta: Meta<typeof AvatarGroup> = {
  title: 'Data Display/AvatarGroup',
  component: AvatarGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof AvatarGroup>

export const Default: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=John"
        name="John Doe"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jane"
        name="Jane Smith"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=Bob"
        name="Bob Johnson"
      />
    </AvatarGroup>
  ),
}

export const WithMax: Story = {
  render: () => (
    <AvatarGroup max={3}>
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=1"
        name="User 1"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=2"
        name="User 2"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=3"
        name="User 3"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=4"
        name="User 4"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=5"
        name="User 5"
      />
    </AvatarGroup>
  ),
}

export const ManyUsers: Story = {
  render: () => (
    <AvatarGroup max={4}>
      {Array.from({ length: 10 }, (_, i) => (
        <Avatar
          key={i}
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`}
          name={`User ${i + 1}`}
        />
      ))}
    </AvatarGroup>
  ),
}

export const TightSpacing: Story = {
  render: () => (
    <AvatarGroup spacing="tight">
      <Avatar name="John Doe" />
      <Avatar name="Jane Smith" />
      <Avatar name="Bob Johnson" />
      <Avatar name="Alice Williams" />
    </AvatarGroup>
  ),
}

export const LooseSpacing: Story = {
  render: () => (
    <AvatarGroup spacing="loose">
      <Avatar name="John Doe" />
      <Avatar name="Jane Smith" />
      <Avatar name="Bob Johnson" />
      <Avatar name="Alice Williams" />
    </AvatarGroup>
  ),
}

export const SmallSize: Story = {
  render: () => (
    <AvatarGroup size="sm" max={3}>
      <Avatar name="John Doe" />
      <Avatar name="Jane Smith" />
      <Avatar name="Bob Johnson" />
      <Avatar name="Alice Williams" />
      <Avatar name="Charlie Brown" />
    </AvatarGroup>
  ),
}

export const LargeSize: Story = {
  render: () => (
    <AvatarGroup size="lg" max={3}>
      <Avatar name="John Doe" />
      <Avatar name="Jane Smith" />
      <Avatar name="Bob Johnson" />
      <Avatar name="Alice Williams" />
    </AvatarGroup>
  ),
}

export const SquareShape: Story = {
  render: () => (
    <AvatarGroup shape="square" max={3}>
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=square1"
        name="User 1"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=square2"
        name="User 2"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=square3"
        name="User 3"
      />
      <Avatar
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=square4"
        name="User 4"
      />
    </AvatarGroup>
  ),
}

export const WithStatus: Story = {
  render: () => (
    <AvatarGroup max={4}>
      <Avatar name="John Doe" status="online" />
      <Avatar name="Jane Smith" status="busy" />
      <Avatar name="Bob Johnson" status="away" />
      <Avatar name="Alice Williams" status="offline" />
      <Avatar name="Charlie Brown" status="online" />
    </AvatarGroup>
  ),
}
