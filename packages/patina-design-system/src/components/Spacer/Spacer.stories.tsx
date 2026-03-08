import type { Meta, StoryObj } from '@storybook/react'
import { Spacer } from './Spacer'

const meta: Meta<typeof Spacer> = {
  title: 'Layout/Spacer',
  component: Spacer,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'],
    },
    axis: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Spacer>

export const Default: Story = {
  render: () => (
    <div>
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded inline-block">
        First Element
      </div>
      <Spacer />
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded inline-block">
        Second Element
      </div>
    </div>
  ),
}

export const Vertical: Story = {
  render: () => (
    <div>
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        First Paragraph
      </div>
      <Spacer size="lg" />
      <div className="bg-secondary text-secondary-foreground px-4 py-2 rounded w-fit">
        Second Paragraph
      </div>
    </div>
  ),
}

export const Horizontal: Story = {
  render: () => (
    <div className="flex items-center">
      <button className="px-4 py-2 border rounded hover:bg-accent">Cancel</button>
      <Spacer axis="horizontal" size="md" />
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
        Submit
      </button>
    </div>
  ),
}

export const ExtraSmall: Story = {
  render: () => (
    <div>
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        First
      </div>
      <Spacer size="xs" />
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        Second
      </div>
    </div>
  ),
}

export const Small: Story = {
  render: () => (
    <div>
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        First
      </div>
      <Spacer size="sm" />
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        Second
      </div>
    </div>
  ),
}

export const Medium: Story = {
  render: () => (
    <div>
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        First
      </div>
      <Spacer size="md" />
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        Second
      </div>
    </div>
  ),
}

export const Large: Story = {
  render: () => (
    <div>
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        First
      </div>
      <Spacer size="lg" />
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        Second
      </div>
    </div>
  ),
}

export const ExtraLarge: Story = {
  render: () => (
    <div>
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        First
      </div>
      <Spacer size="xl" />
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        Second
      </div>
    </div>
  ),
}

export const ExtraExtraLarge: Story = {
  render: () => (
    <div>
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        First
      </div>
      <Spacer size="2xl" />
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">
        Second
      </div>
    </div>
  ),
}

export const InForm: Story = {
  render: () => (
    <div className="max-w-md border rounded-lg p-6">
      <h2 className="text-xl font-bold">Contact Form</h2>
      <Spacer size="lg" />
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input type="text" className="w-full px-3 py-2 border rounded" />
      </div>
      <Spacer size="md" />
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" className="w-full px-3 py-2 border rounded" />
      </div>
      <Spacer size="md" />
      <div>
        <label className="block text-sm font-medium mb-1">Message</label>
        <textarea className="w-full px-3 py-2 border rounded" rows={4} />
      </div>
      <Spacer size="lg" />
      <button className="w-full px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
        Send Message
      </button>
    </div>
  ),
}

export const BetweenSections: Story = {
  render: () => (
    <div className="max-w-2xl">
      <section>
        <h2 className="text-2xl font-bold">Section 1</h2>
        <p className="mt-2 text-muted-foreground">
          This is the first section with some content.
        </p>
      </section>
      <Spacer size="2xl" />
      <section>
        <h2 className="text-2xl font-bold">Section 2</h2>
        <p className="mt-2 text-muted-foreground">
          This is the second section with some content.
        </p>
      </section>
      <Spacer size="2xl" />
      <section>
        <h2 className="text-2xl font-bold">Section 3</h2>
        <p className="mt-2 text-muted-foreground">
          This is the third section with some content.
        </p>
      </section>
    </div>
  ),
}

export const ButtonGroup: Story = {
  render: () => (
    <div className="flex items-center">
      <button className="px-4 py-2 border rounded-l hover:bg-accent">First</button>
      <Spacer axis="horizontal" size="xs" />
      <button className="px-4 py-2 border hover:bg-accent">Second</button>
      <Spacer axis="horizontal" size="xs" />
      <button className="px-4 py-2 border rounded-r hover:bg-accent">Third</button>
    </div>
  ),
}

export const Comparison: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold mb-4">No Spacer (tight spacing)</h3>
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">Item 1</div>
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">Item 2</div>
      </div>
      <div>
        <h3 className="font-semibold mb-4">With Small Spacer</h3>
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">Item 1</div>
        <Spacer size="sm" />
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">Item 2</div>
      </div>
      <div>
        <h3 className="font-semibold mb-4">With Large Spacer</h3>
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">Item 1</div>
        <Spacer size="xl" />
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded w-fit">Item 2</div>
      </div>
    </div>
  ),
}
