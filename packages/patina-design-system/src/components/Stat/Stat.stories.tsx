import type { Meta, StoryObj } from '@storybook/react'
import { Stat, StatGroup } from './Stat'

const meta: Meta<typeof Stat> = {
  title: 'Data Display/Stat',
  component: Stat,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Display statistics and metrics with optional trends.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Stat>

export const Default: Story = {
  args: {
    label: 'Total Revenue',
    value: '$45,231',
  },
}

export const WithTrend: Story = {
  args: {
    label: 'Total Revenue',
    value: '$45,231',
    trend: { value: 12.5, isPositive: true },
    description: 'vs last month',
  },
}

export const NegativeTrend: Story = {
  args: {
    label: 'Bounce Rate',
    value: '23.5%',
    trend: { value: 5.2, isPositive: false },
    description: 'vs last month',
  },
}

export const WithIcon: Story = {
  args: {
    label: 'Active Users',
    value: '2,547',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
}

export const Variants: Story = {
  render: () => (
    <StatGroup>
      <Stat variant="default" label="Default" value="1,234" />
      <Stat variant="outline" label="Outline" value="5,678" />
      <Stat variant="filled" label="Filled" value="9,012" />
    </StatGroup>
  ),
}

export const Dashboard: Story = {
  render: () => (
    <StatGroup>
      <Stat
        label="Total Revenue"
        value="$45,231"
        trend={{ value: 20.1, isPositive: true }}
        description="+19% from last month"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />
      <Stat
        label="Subscriptions"
        value="+2,350"
        trend={{ value: 180.1, isPositive: true }}
        description="+180.1% from last month"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
      />
      <Stat
        label="Sales"
        value="+12,234"
        trend={{ value: 19, isPositive: true }}
        description="+19% from last month"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        }
      />
      <Stat
        label="Active Now"
        value="+573"
        trend={{ value: 201, isPositive: true }}
        description="+201 since last hour"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        }
      />
    </StatGroup>
  ),
}
