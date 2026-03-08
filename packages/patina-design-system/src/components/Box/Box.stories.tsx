import type { Meta, StoryObj } from '@storybook/react'
import { Box } from './Box'

const meta = {
  title: 'Layout/Box',
  component: Box,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    as: {
      control: 'select',
      options: ['div', 'section', 'article', 'aside', 'main', 'nav', 'header', 'footer'],
      description: 'The HTML element to render as',
    },
    asChild: {
      control: 'boolean',
      description: 'Use Radix Slot for composition',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
  },
} satisfies Meta<typeof Box>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default Box rendered as a div
 */
export const Default: Story = {
  args: {
    children: 'This is a Box component',
    className: 'p-4 bg-gray-100 rounded',
  },
}

/**
 * Box with different styling
 */
export const Styled: Story = {
  args: {
    children: 'Styled Box with Tailwind classes',
    className: 'p-6 bg-primary text-primary-foreground rounded-lg shadow-md',
  },
}

/**
 * Box rendered as different HTML elements
 */
export const DifferentElements: Story = {
  render: () => (
    <div className="space-y-4">
      <Box as="div" className="p-4 bg-blue-100 rounded">
        Rendered as div (default)
      </Box>
      <Box as="section" className="p-4 bg-green-100 rounded">
        Rendered as section
      </Box>
      <Box as="article" className="p-4 bg-purple-100 rounded">
        Rendered as article
      </Box>
      <Box as="aside" className="p-4 bg-yellow-100 rounded">
        Rendered as aside
      </Box>
    </div>
  ),
}

/**
 * Box with asChild for composition
 */
export const AsChild: Story = {
  render: () => (
    <Box asChild className="p-4 bg-accent text-accent-foreground rounded hover:bg-accent/80 transition-colors">
      <a href="#" onClick={(e) => e.preventDefault()}>
        Box composed with anchor tag
      </a>
    </Box>
  ),
}

/**
 * Nested boxes for layout
 */
export const Nested: Story = {
  render: () => (
    <Box className="p-6 bg-gray-100 rounded-lg">
      <Box className="mb-4 p-4 bg-white rounded shadow">
        <h3 className="text-lg font-semibold mb-2">Header</h3>
        <p>This is a nested box structure</p>
      </Box>
      <Box className="p-4 bg-white rounded shadow">
        <h3 className="text-lg font-semibold mb-2">Content</h3>
        <p>Boxes can be nested to create complex layouts</p>
      </Box>
    </Box>
  ),
}

/**
 * Box with flexbox layout
 */
export const FlexLayout: Story = {
  render: () => (
    <Box className="flex gap-4 p-4 bg-gray-100 rounded">
      <Box className="flex-1 p-4 bg-white rounded shadow">Item 1</Box>
      <Box className="flex-1 p-4 bg-white rounded shadow">Item 2</Box>
      <Box className="flex-1 p-4 bg-white rounded shadow">Item 3</Box>
    </Box>
  ),
}

/**
 * Box with grid layout
 */
export const GridLayout: Story = {
  render: () => (
    <Box className="grid grid-cols-3 gap-4 p-4 bg-gray-100 rounded">
      <Box className="p-4 bg-white rounded shadow">Grid 1</Box>
      <Box className="p-4 bg-white rounded shadow">Grid 2</Box>
      <Box className="p-4 bg-white rounded shadow">Grid 3</Box>
      <Box className="p-4 bg-white rounded shadow">Grid 4</Box>
      <Box className="p-4 bg-white rounded shadow">Grid 5</Box>
      <Box className="p-4 bg-white rounded shadow">Grid 6</Box>
    </Box>
  ),
}
