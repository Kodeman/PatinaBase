import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from './Badge'
import { Star, AlertCircle, CheckCircle2, Info } from 'lucide-react'

const meta = {
  title: 'Feedback/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['solid', 'subtle', 'outline', 'dot'],
      description: 'Badge style variant',
    },
    color: {
      control: 'select',
      options: ['primary', 'success', 'warning', 'error', 'info', 'neutral'],
      description: 'Badge color',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Badge size',
    },
    showDot: {
      control: 'boolean',
      description: 'Show dot indicator (for dot variant)',
    },
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Badge',
  },
}

export const Solid: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="solid" color="primary">Primary</Badge>
      <Badge variant="solid" color="success">Success</Badge>
      <Badge variant="solid" color="warning">Warning</Badge>
      <Badge variant="solid" color="error">Error</Badge>
      <Badge variant="solid" color="info">Info</Badge>
      <Badge variant="solid" color="neutral">Neutral</Badge>
    </div>
  ),
}

export const Subtle: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="subtle" color="primary">Primary</Badge>
      <Badge variant="subtle" color="success">Success</Badge>
      <Badge variant="subtle" color="warning">Warning</Badge>
      <Badge variant="subtle" color="error">Error</Badge>
      <Badge variant="subtle" color="info">Info</Badge>
      <Badge variant="subtle" color="neutral">Neutral</Badge>
    </div>
  ),
}

export const Outline: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="outline" color="primary">Primary</Badge>
      <Badge variant="outline" color="success">Success</Badge>
      <Badge variant="outline" color="warning">Warning</Badge>
      <Badge variant="outline" color="error">Error</Badge>
      <Badge variant="outline" color="info">Info</Badge>
      <Badge variant="outline" color="neutral">Neutral</Badge>
    </div>
  ),
}

export const DotIndicator: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="dot" color="primary" showDot>Online</Badge>
      <Badge variant="dot" color="success" showDot>Active</Badge>
      <Badge variant="dot" color="warning" showDot>Away</Badge>
      <Badge variant="dot" color="error" showDot>Offline</Badge>
      <Badge variant="dot" color="info" showDot>Live</Badge>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="solid" color="primary" icon={<Star className="h-3 w-3" />}>
        Featured
      </Badge>
      <Badge variant="subtle" color="success" icon={<CheckCircle2 className="h-3 w-3" />}>
        Verified
      </Badge>
      <Badge variant="outline" color="warning" icon={<AlertCircle className="h-3 w-3" />}>
        Warning
      </Badge>
      <Badge variant="solid" color="info" icon={<Info className="h-3 w-3" />}>
        Info
      </Badge>
    </div>
  ),
}

export const StatusBadges: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center">
        <span className="text-sm text-muted-foreground w-20">User Status:</span>
        <Badge variant="dot" color="success" showDot>Active</Badge>
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-sm text-muted-foreground w-20">Order:</span>
        <Badge variant="subtle" color="info">Processing</Badge>
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-sm text-muted-foreground w-20">Payment:</span>
        <Badge variant="solid" color="success">Paid</Badge>
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-sm text-muted-foreground w-20">Build:</span>
        <Badge variant="outline" color="error">Failed</Badge>
      </div>
    </div>
  ),
}

export const TagBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="subtle" color="neutral">React</Badge>
      <Badge variant="subtle" color="neutral">TypeScript</Badge>
      <Badge variant="subtle" color="neutral">Tailwind</Badge>
      <Badge variant="subtle" color="neutral">Accessibility</Badge>
      <Badge variant="subtle" color="neutral">Design System</Badge>
    </div>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-3">Solid</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="solid" color="primary">Primary</Badge>
          <Badge variant="solid" color="success">Success</Badge>
          <Badge variant="solid" color="warning">Warning</Badge>
          <Badge variant="solid" color="error">Error</Badge>
          <Badge variant="solid" color="info">Info</Badge>
          <Badge variant="solid" color="neutral">Neutral</Badge>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-3">Subtle</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="subtle" color="primary">Primary</Badge>
          <Badge variant="subtle" color="success">Success</Badge>
          <Badge variant="subtle" color="warning">Warning</Badge>
          <Badge variant="subtle" color="error">Error</Badge>
          <Badge variant="subtle" color="info">Info</Badge>
          <Badge variant="subtle" color="neutral">Neutral</Badge>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-3">Outline</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" color="primary">Primary</Badge>
          <Badge variant="outline" color="success">Success</Badge>
          <Badge variant="outline" color="warning">Warning</Badge>
          <Badge variant="outline" color="error">Error</Badge>
          <Badge variant="outline" color="info">Info</Badge>
          <Badge variant="outline" color="neutral">Neutral</Badge>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-3">Dot</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="dot" color="primary" showDot>Primary</Badge>
          <Badge variant="dot" color="success" showDot>Success</Badge>
          <Badge variant="dot" color="warning" showDot>Warning</Badge>
          <Badge variant="dot" color="error" showDot>Error</Badge>
          <Badge variant="dot" color="info" showDot>Info</Badge>
        </div>
      </div>
    </div>
  ),
}
