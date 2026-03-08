import type { Meta, StoryObj } from '@storybook/react'
import { Timeline, type TimelineItem } from './Timeline'

const items: TimelineItem[] = [
  {
    id: '1',
    title: 'Order placed',
    description: 'Your order has been confirmed',
    timestamp: '2 hours ago',
    status: 'completed',
  },
  {
    id: '2',
    title: 'Processing',
    description: 'Your order is being prepared',
    timestamp: '1 hour ago',
    status: 'current',
  },
  {
    id: '3',
    title: 'Shipped',
    description: 'Your order is on its way',
    status: 'upcoming',
  },
  {
    id: '4',
    title: 'Delivered',
    description: 'Your order has arrived',
    status: 'upcoming',
  },
]

const meta: Meta<typeof Timeline> = {
  title: 'Data Display/Timeline',
  component: Timeline,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'A timeline component for displaying events in chronological order.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Timeline>

export const Default: Story = {
  args: {
    items,
  },
}

export const Compact: Story = {
  args: {
    items,
    variant: 'compact',
  },
}

export const Comfortable: Story = {
  args: {
    items,
    variant: 'comfortable',
  },
}

export const WithIcons: Story = {
  args: {
    items: [
      {
        id: '1',
        title: 'Created',
        timestamp: '2 days ago',
        status: 'completed',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ),
      },
      {
        id: '2',
        title: 'In Progress',
        timestamp: '1 day ago',
        status: 'current',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
          </svg>
        ),
      },
    ],
  },
}
