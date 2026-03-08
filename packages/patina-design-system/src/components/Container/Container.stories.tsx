import type { Meta, StoryObj } from '@storybook/react'
import { Container } from './Container'

const meta = {
  title: 'Layout/Container',
  component: Container,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', '2xl', 'full'],
      description: 'Maximum width of the container',
    },
    centered: {
      control: 'boolean',
      description: 'Center the container horizontally',
    },
    as: {
      control: 'select',
      options: ['div', 'section', 'main', 'article'],
      description: 'The HTML element to render as',
    },
  },
} satisfies Meta<typeof Container>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default container with max-width and centering
 */
export const Default: Story = {
  args: {
    children: (
      <div className="bg-gray-100 p-8 rounded">
        <h2 className="text-2xl font-bold mb-4">Default Container</h2>
        <p>This container has a max-width of 1280px (xl) and is centered by default.</p>
      </div>
    ),
  },
}

/**
 * Different container sizes
 */
export const Sizes: Story = {
  render: () => (
    <div className="space-y-8 p-4">
      <Container size="sm" className="bg-blue-100 p-6 rounded">
        <h3 className="font-semibold">Small Container (640px)</h3>
        <p>Ideal for narrow content like blog posts</p>
      </Container>
      <Container size="md" className="bg-green-100 p-6 rounded">
        <h3 className="font-semibold">Medium Container (768px)</h3>
        <p>Good for forms and focused content</p>
      </Container>
      <Container size="lg" className="bg-yellow-100 p-6 rounded">
        <h3 className="font-semibold">Large Container (1024px)</h3>
        <p>Suitable for most page layouts</p>
      </Container>
      <Container size="xl" className="bg-purple-100 p-6 rounded">
        <h3 className="font-semibold">Extra Large Container (1280px)</h3>
        <p>Default size, good for dashboard layouts</p>
      </Container>
      <Container size="2xl" className="bg-pink-100 p-6 rounded">
        <h3 className="font-semibold">2XL Container (1536px)</h3>
        <p>For wide displays and data-heavy interfaces</p>
      </Container>
    </div>
  ),
}

/**
 * Full width container
 */
export const FullWidth: Story = {
  args: {
    size: 'full',
    children: (
      <div className="bg-primary text-primary-foreground p-8 rounded">
        <h2 className="text-2xl font-bold mb-4">Full Width Container</h2>
        <p>This container spans the full width of its parent.</p>
      </div>
    ),
  },
}

/**
 * Non-centered container
 */
export const NotCentered: Story = {
  args: {
    size: 'md',
    centered: false,
    children: (
      <div className="bg-gray-100 p-8 rounded">
        <h2 className="text-2xl font-bold mb-4">Not Centered</h2>
        <p>This container is not horizontally centered.</p>
      </div>
    ),
  },
}

/**
 * Container as different semantic elements
 */
export const SemanticElements: Story = {
  render: () => (
    <div className="space-y-8 p-4">
      <Container as="header" className="bg-blue-100 p-6 rounded">
        <h1 className="text-2xl font-bold">Header Container</h1>
      </Container>
      <Container as="main" className="bg-green-100 p-6 rounded">
        <h2 className="text-xl font-semibold mb-2">Main Content Container</h2>
        <p>This is the main content area.</p>
      </Container>
      <Container as="footer" className="bg-gray-100 p-6 rounded">
        <p className="text-sm">Footer Container</p>
      </Container>
    </div>
  ),
}
