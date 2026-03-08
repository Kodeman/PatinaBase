import type { Meta, StoryObj } from '@storybook/react'
import { FileText, Inbox, Search, ShoppingBag, Users, FolderOpen } from 'lucide-react'
import { Button } from '../Button'
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from './EmptyState'

const meta = {
  title: 'Components/Feedback/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'No results found',
    description: 'Try adjusting your search or filter to find what you are looking for.',
  },
  render: (args) => (
    <div className="w-[500px]">
      <EmptyState {...args} />
    </div>
  ),
}

export const WithIcon: Story = {
  render: () => (
    <div className="w-[500px]">
      <EmptyState
        icon={<Search className="h-12 w-12" />}
        title="No search results"
        description="We couldn't find any results matching your search criteria."
      />
    </div>
  ),
}

export const WithAction: Story = {
  render: () => (
    <div className="w-[500px]">
      <EmptyState
        icon={<FileText className="h-12 w-12" />}
        title="No documents"
        description="Get started by creating your first document."
        action={<Button>Create Document</Button>}
      />
    </div>
  ),
}

export const WithMultipleActions: Story = {
  render: () => (
    <div className="w-[500px]">
      <EmptyState
        icon={<FolderOpen className="h-12 w-12" />}
        title="No projects yet"
        description="Create your first project or import an existing one."
        action={<Button>New Project</Button>}
        secondaryAction={<Button variant="outline">Import Project</Button>}
      />
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="space-y-8">
      <div className="border rounded-lg">
        <EmptyState
          size="sm"
          icon={<Inbox className="h-8 w-8" />}
          title="Small size"
          description="Compact empty state for smaller spaces."
        />
      </div>
      <div className="border rounded-lg">
        <EmptyState
          size="md"
          icon={<Inbox className="h-10 w-10" />}
          title="Medium size (default)"
          description="Standard empty state size for most use cases."
        />
      </div>
      <div className="border rounded-lg">
        <EmptyState
          size="lg"
          icon={<Inbox className="h-12 w-12" />}
          title="Large size"
          description="Spacious empty state for full-page displays."
        />
      </div>
    </div>
  ),
}

export const EmptyInbox: Story = {
  render: () => (
    <div className="w-[600px] border rounded-lg">
      <EmptyState
        size="lg"
        icon={<Inbox className="h-16 w-16" />}
        title="Your inbox is empty"
        description="When you receive messages, they will appear here."
      />
    </div>
  ),
}

export const NoProducts: Story = {
  render: () => (
    <div className="w-[600px] border rounded-lg">
      <EmptyState
        icon={<ShoppingBag className="h-14 w-14" />}
        title="No products in your cart"
        description="Looks like you haven't added any products to your cart yet."
        action={<Button>Continue Shopping</Button>}
      />
    </div>
  ),
}

export const NoTeamMembers: Story = {
  render: () => (
    <div className="w-[600px] border rounded-lg">
      <EmptyState
        icon={<Users className="h-14 w-14" />}
        title="No team members"
        description="Get started by inviting your team members to collaborate."
        action={<Button>Invite Team Members</Button>}
        secondaryAction={<Button variant="outline">Learn More</Button>}
      />
    </div>
  ),
}

export const CustomContent: Story = {
  render: () => (
    <div className="w-[600px] border rounded-lg">
      <EmptyState size="lg">
        <EmptyStateIcon>
          <div className="rounded-full bg-muted p-4">
            <Search className="h-12 w-12" />
          </div>
        </EmptyStateIcon>
        <EmptyStateTitle>No results found</EmptyStateTitle>
        <EmptyStateDescription>
          <div className="space-y-2">
            <p>We couldn't find what you're looking for.</p>
            <p className="font-medium">Try:</p>
            <ul className="text-left inline-block">
              <li>• Using different keywords</li>
              <li>• Checking your spelling</li>
              <li>• Using more general terms</li>
            </ul>
          </div>
        </EmptyStateDescription>
        <EmptyStateActions>
          <Button>Clear Filters</Button>
          <Button variant="outline">Reset Search</Button>
        </EmptyStateActions>
      </EmptyState>
    </div>
  ),
}

export const ErrorState: Story = {
  render: () => (
    <div className="w-[600px] border rounded-lg border-destructive">
      <EmptyState
        icon={
          <div className="rounded-full bg-destructive/10 p-4">
            <FileText className="h-12 w-12 text-destructive" />
          </div>
        }
        title="Failed to load content"
        description="There was an error loading your content. Please try again."
        action={<Button>Retry</Button>}
        secondaryAction={<Button variant="outline">Contact Support</Button>}
      />
    </div>
  ),
}

export const ComingSoon: Story = {
  render: () => (
    <div className="w-[600px] border rounded-lg">
      <EmptyState
        size="lg"
        icon={
          <div className="text-6xl mb-2">🚀</div>
        }
        title="Coming Soon"
        description="This feature is currently under development. Stay tuned for updates!"
        action={<Button variant="outline">Notify Me</Button>}
      />
    </div>
  ),
}

export const NoNotifications: Story = {
  render: () => (
    <div className="w-[400px] border rounded-lg">
      <EmptyState
        size="sm"
        icon={<Inbox className="h-10 w-10" />}
        title="All caught up!"
        description="You have no new notifications."
      />
    </div>
  ),
}
