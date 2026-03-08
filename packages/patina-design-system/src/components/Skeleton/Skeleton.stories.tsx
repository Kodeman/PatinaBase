import type { Meta, StoryObj } from '@storybook/react'
import { Skeleton, SkeletonAvatar, SkeletonText, SkeletonCard } from './Skeleton'

const meta = {
  title: 'Feedback/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['text', 'circular', 'rectangular'],
      description: 'Skeleton shape variant',
    },
    animation: {
      control: 'select',
      options: ['pulse', 'wave', 'none'],
      description: 'Animation type',
    },
    width: {
      control: 'text',
      description: 'Width (number in px or string)',
    },
    height: {
      control: 'text',
      description: 'Height (number in px or string)',
    },
    show: {
      control: 'boolean',
      description: 'Whether to show skeleton',
    },
  },
} satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'text',
  },
}

export const Text: Story = {
  render: () => (
    <div className="space-y-2 max-w-md">
      <Skeleton variant="text" />
      <Skeleton variant="text" />
      <Skeleton variant="text" width="80%" />
    </div>
  ),
}

export const Circular: Story = {
  render: () => (
    <div className="flex gap-4">
      <Skeleton variant="circular" width={40} height={40} />
      <Skeleton variant="circular" width={60} height={60} />
      <Skeleton variant="circular" width={80} height={80} />
    </div>
  ),
}

export const Rectangular: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <Skeleton variant="rectangular" height={100} />
      <Skeleton variant="rectangular" height={150} />
      <Skeleton variant="rectangular" height={200} />
    </div>
  ),
}

export const Animations: Story = {
  render: () => (
    <div className="space-y-6 max-w-md">
      <div>
        <h3 className="text-sm font-medium mb-2">Pulse (default)</h3>
        <Skeleton animation="pulse" height={60} />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Wave</h3>
        <Skeleton animation="wave" height={60} />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">None</h3>
        <Skeleton animation="none" height={60} />
      </div>
    </div>
  ),
}

export const PreConfiguredComponents: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Avatar</h3>
        <div className="flex gap-2">
          <SkeletonAvatar />
          <SkeletonAvatar />
          <SkeletonAvatar />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Text Lines</h3>
        <div className="space-y-2 max-w-md">
          <SkeletonText />
          <SkeletonText />
          <SkeletonText width="60%" />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Card</h3>
        <SkeletonCard />
      </div>
    </div>
  ),
}

export const UserCard: Story = {
  render: () => (
    <div className="max-w-sm border rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-4">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  ),
}

export const ProductList: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton variant="rectangular" height={200} />
          <Skeleton variant="text" />
          <Skeleton variant="text" width="60%" />
        </div>
      ))}
    </div>
  ),
}

export const BlogPost: Story = {
  render: () => (
    <div className="max-w-2xl space-y-4">
      <Skeleton variant="rectangular" height={300} />
      <div className="space-y-2">
        <Skeleton variant="text" width="40%" className="h-8" />
        <div className="flex items-center gap-3">
          <SkeletonAvatar />
          <Skeleton variant="text" width="30%" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="90%" />
      </div>
    </div>
  ),
}

export const CommentList: Story = {
  render: () => (
    <div className="space-y-4 max-w-2xl">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <SkeletonAvatar />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="30%" />
            <Skeleton variant="text" />
            <Skeleton variant="text" width="80%" />
          </div>
        </div>
      ))}
    </div>
  ),
}

export const TableRows: Story = {
  render: () => (
    <div className="space-y-3 max-w-4xl">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <SkeletonAvatar />
          <Skeleton variant="text" className="flex-1" />
          <Skeleton variant="text" width={100} />
          <Skeleton variant="text" width={80} />
        </div>
      ))}
    </div>
  ),
}

export const ConditionalLoading: Story = {
  render: () => {
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
      const timer = setTimeout(() => setLoading(false), 3000)
      return () => clearTimeout(timer)
    }, [])

    return (
      <div className="max-w-md">
        <Skeleton show={loading} height={200} />
        {!loading && (
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Content Loaded!</h3>
            <p className="text-muted-foreground">
              This content appears after the skeleton finishes loading.
            </p>
          </div>
        )}
      </div>
    )
  },
}
