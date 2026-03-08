import type { Meta, StoryObj } from '@storybook/react'
import { Spinner } from './Spinner'

const meta = {
  title: 'Feedback/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['circular', 'dots', 'bars'],
      description: 'Spinner visual variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      description: 'Spinner size',
    },
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'white', 'current'],
      description: 'Spinner color',
    },
    speed: {
      control: 'select',
      options: ['slow', 'normal', 'fast'],
      description: 'Animation speed',
    },
    label: {
      control: 'text',
      description: 'Accessibility label',
    },
  },
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'circular',
  },
}

export const Circular: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner variant="circular" size="sm" />
      <Spinner variant="circular" size="md" />
      <Spinner variant="circular" size="lg" />
      <Spinner variant="circular" size="xl" />
    </div>
  ),
}

export const Dots: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner variant="dots" size="sm" />
      <Spinner variant="dots" size="md" />
      <Spinner variant="dots" size="lg" />
      <Spinner variant="dots" size="xl" />
    </div>
  ),
}

export const Bars: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner variant="bars" size="sm" />
      <Spinner variant="bars" size="md" />
      <Spinner variant="bars" size="lg" />
      <Spinner variant="bars" size="xl" />
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="sm" />
        <span className="text-xs text-muted-foreground">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-xs text-muted-foreground">Medium</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" />
        <span className="text-xs text-muted-foreground">Large</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="xl" />
        <span className="text-xs text-muted-foreground">XL</span>
      </div>
    </div>
  ),
}

export const Colors: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <Spinner color="primary" />
        <span className="text-xs text-muted-foreground">Primary</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner color="secondary" />
        <span className="text-xs text-muted-foreground">Secondary</span>
      </div>
      <div className="flex flex-col items-center gap-2 bg-gray-800 p-4 rounded">
        <Spinner color="white" />
        <span className="text-xs text-white">White</span>
      </div>
    </div>
  ),
}

export const Speeds: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <Spinner speed="slow" />
        <span className="text-xs text-muted-foreground">Slow</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner speed="normal" />
        <span className="text-xs text-muted-foreground">Normal</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner speed="fast" />
        <span className="text-xs text-muted-foreground">Fast</span>
      </div>
    </div>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium mb-4">Circular</h3>
        <div className="flex items-center gap-4">
          <Spinner variant="circular" size="sm" />
          <Spinner variant="circular" size="md" />
          <Spinner variant="circular" size="lg" />
          <Spinner variant="circular" size="xl" />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-4">Dots</h3>
        <div className="flex items-center gap-4">
          <Spinner variant="dots" size="sm" />
          <Spinner variant="dots" size="md" />
          <Spinner variant="dots" size="lg" />
          <Spinner variant="dots" size="xl" />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-4">Bars</h3>
        <div className="flex items-center gap-4">
          <Spinner variant="bars" size="sm" />
          <Spinner variant="bars" size="md" />
          <Spinner variant="bars" size="lg" />
          <Spinner variant="bars" size="xl" />
        </div>
      </div>
    </div>
  ),
}

export const InButton: Story = {
  render: () => (
    <div className="flex gap-3">
      <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md">
        <Spinner size="sm" color="white" />
        Loading...
      </button>
      <button className="inline-flex items-center gap-2 px-4 py-2 border border-input rounded-md" disabled>
        <Spinner variant="dots" size="sm" />
        Processing
      </button>
    </div>
  ),
}

export const FullPageLoading: Story = {
  render: () => (
    <div className="flex items-center justify-center h-64 bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="xl" />
        <p className="text-sm text-muted-foreground">Loading your content...</p>
      </div>
    </div>
  ),
}
