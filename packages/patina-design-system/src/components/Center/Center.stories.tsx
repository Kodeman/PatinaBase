import type { Meta, StoryObj } from '@storybook/react'
import { Center } from './Center'

const meta: Meta<typeof Center> = {
  title: 'Layout/Center',
  component: Center,
  tags: ['autodocs'],
  argTypes: {
    inline: {
      control: 'boolean',
    },
  },
}

export default meta
type Story = StoryObj<typeof Center>

export const Default: Story = {
  args: {
    className: 'h-64 border border-dashed border-gray-300 rounded-md',
    children: (
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-md">
        Centered Content
      </div>
    ),
  },
}

export const FullScreen: Story = {
  args: {
    className: 'h-screen',
    children: (
      <div className="max-w-md p-8 bg-card border rounded-lg shadow-lg text-center">
        <h2 className="text-2xl font-bold mb-4">Welcome</h2>
        <p className="text-muted-foreground">
          This content is centered both horizontally and vertically on the screen.
        </p>
      </div>
    ),
  },
}

export const Inline: Story = {
  args: {
    inline: true,
    className: 'w-20 h-20 border border-dashed border-gray-300 rounded-md',
    children: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
  },
}

export const WithSpinner: Story = {
  args: {
    className: 'h-64 border border-dashed border-gray-300 rounded-md',
    children: (
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    ),
  },
}

export const MultipleElements: Story = {
  args: {
    className: 'h-64 border border-dashed border-gray-300 rounded-md',
    children: (
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-primary rounded-full" />
        <h3 className="text-xl font-semibold">Loading...</h3>
        <p className="text-muted-foreground">Please wait</p>
      </div>
    ),
  },
}

export const InCard: Story = {
  render: () => (
    <div className="max-w-md border rounded-lg shadow-sm">
      <Center className="h-48 bg-muted">
        <div className="text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-4 text-muted-foreground"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p className="text-muted-foreground">No image available</p>
        </div>
      </Center>
      <div className="p-4">
        <h3 className="font-semibold">Card Title</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Card description goes here
        </p>
      </div>
    </div>
  ),
}

export const ErrorState: Story = {
  args: {
    className: 'h-96',
    children: (
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-4">
          We encountered an error while loading this content.
        </p>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
          Try Again
        </button>
      </div>
    ),
  },
}

export const EmptyState: Story = {
  args: {
    className: 'h-96',
    children: (
      <div className="text-center max-w-md">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto mb-4 text-muted-foreground/50"
        >
          <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
          <path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z" />
          <path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8" />
        </svg>
        <h2 className="text-lg font-semibold mb-2">No documents yet</h2>
        <p className="text-muted-foreground mb-4">
          Get started by creating your first document.
        </p>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
          Create Document
        </button>
      </div>
    ),
  },
}
