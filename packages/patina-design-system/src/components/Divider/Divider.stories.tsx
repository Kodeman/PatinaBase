import type { Meta, StoryObj } from '@storybook/react'
import { Divider } from './Divider'

const meta: Meta<typeof Divider> = {
  title: 'Layout/Divider',
  component: Divider,
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
    variant: {
      control: 'select',
      options: ['solid', 'dashed', 'dotted'],
    },
    thickness: {
      control: 'select',
      options: ['thin', 'medium', 'thick'],
    },
    spacing: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Divider>

export const Default: Story = {
  args: {},
}

export const Dashed: Story = {
  args: {
    variant: 'dashed',
  },
}

export const Dotted: Story = {
  args: {
    variant: 'dotted',
  },
}

export const Medium: Story = {
  args: {
    thickness: 'medium',
  },
}

export const Thick: Story = {
  args: {
    thickness: 'thick',
  },
}

export const WithSpacing: Story = {
  render: () => (
    <div>
      <p>Content above</p>
      <Divider spacing="md" />
      <p>Content below</p>
    </div>
  ),
}

export const WithLabel: Story = {
  args: {
    label: 'OR',
  },
}

export const WithLabelLeft: Story = {
  args: {
    label: 'Start',
    labelPosition: 'left',
  },
}

export const WithLabelRight: Story = {
  args: {
    label: 'End',
    labelPosition: 'right',
  },
}

export const Vertical: Story = {
  render: () => (
    <div className="flex h-32 items-center gap-4">
      <div>Left content</div>
      <Divider orientation="vertical" />
      <div>Right content</div>
    </div>
  ),
}

export const VerticalDashed: Story = {
  render: () => (
    <div className="flex h-32 items-center gap-4">
      <div>Left content</div>
      <Divider orientation="vertical" variant="dashed" />
      <div>Right content</div>
    </div>
  ),
}

export const VerticalThick: Story = {
  render: () => (
    <div className="flex h-32 items-center gap-4">
      <div>Left content</div>
      <Divider orientation="vertical" thickness="thick" />
      <div>Right content</div>
    </div>
  ),
}

export const InCard: Story = {
  render: () => (
    <div className="max-w-md border rounded-lg p-6">
      <h3 className="text-lg font-semibold">Card Title</h3>
      <p className="text-sm text-muted-foreground mt-1">Subtitle or description</p>
      <Divider spacing="md" />
      <p className="text-sm">
        Main content of the card goes here. This could be a description,
        details, or any other information.
      </p>
      <Divider spacing="md" />
      <div className="flex justify-end gap-2">
        <button className="px-3 py-1 border rounded hover:bg-accent">Cancel</button>
        <button className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90">
          Confirm
        </button>
      </div>
    </div>
  ),
}

export const Section: Story = {
  render: () => (
    <div className="max-w-2xl">
      <section>
        <h2 className="text-2xl font-bold">Section 1</h2>
        <p className="mt-2">This is the first section content.</p>
      </section>
      <Divider spacing="lg" thickness="medium" />
      <section>
        <h2 className="text-2xl font-bold">Section 2</h2>
        <p className="mt-2">This is the second section content.</p>
      </section>
      <Divider spacing="lg" thickness="medium" />
      <section>
        <h2 className="text-2xl font-bold">Section 3</h2>
        <p className="mt-2">This is the third section content.</p>
      </section>
    </div>
  ),
}

export const LoginForm: Story = {
  render: () => (
    <div className="max-w-sm border rounded-lg p-6">
      <h2 className="text-xl font-bold mb-4">Sign In</h2>
      <button className="w-full px-4 py-2 border rounded hover:bg-accent mb-2">
        Continue with Google
      </button>
      <button className="w-full px-4 py-2 border rounded hover:bg-accent">
        Continue with GitHub
      </button>
      <Divider label="OR" spacing="md" />
      <div className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          className="w-full px-3 py-2 border rounded"
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full px-3 py-2 border rounded"
        />
        <button className="w-full px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
          Sign In
        </button>
      </div>
    </div>
  ),
}
