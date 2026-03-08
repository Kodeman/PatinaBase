import type { Meta, StoryObj } from '@storybook/react'
import { Flex } from './Flex'

const meta: Meta<typeof Flex> = {
  title: 'Layout/Flex',
  component: Flex,
  tags: ['autodocs'],
  argTypes: {
    direction: {
      control: 'select',
      options: ['row', 'column', 'row-reverse', 'column-reverse'],
    },
    wrap: {
      control: 'select',
      options: [true, false, 'reverse'],
    },
    gap: {
      control: 'select',
      options: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'],
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end', 'stretch', 'baseline'],
    },
    justify: {
      control: 'select',
      options: ['start', 'center', 'end', 'between', 'around', 'evenly'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Flex>

const Box = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-primary text-primary-foreground px-4 py-2 rounded ${className}`}>
    {children}
  </div>
)

export const Default: Story = {
  args: {
    children: (
      <>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </>
    ),
  },
}

export const Column: Story = {
  args: {
    direction: 'column',
    children: (
      <>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </>
    ),
  },
}

export const CenterAligned: Story = {
  args: {
    align: 'center',
    justify: 'center',
    className: 'h-64 border border-dashed border-gray-300',
    children: <Box>Centered</Box>,
  },
}

export const SpaceBetween: Story = {
  args: {
    justify: 'between',
    align: 'center',
    className: 'border border-dashed border-gray-300 p-4',
    children: (
      <>
        <Box>Left</Box>
        <Box>Right</Box>
      </>
    ),
  },
}

export const Wrapping: Story = {
  args: {
    wrap: true,
    gap: 'md',
    className: 'max-w-md',
    children: (
      <>
        <Box>Tag 1</Box>
        <Box>Tag 2</Box>
        <Box>Tag 3</Box>
        <Box>Tag 4</Box>
        <Box>Tag 5</Box>
        <Box>Tag 6</Box>
        <Box>Tag 7</Box>
        <Box>Tag 8</Box>
      </>
    ),
  },
}

export const SmallGap: Story = {
  args: {
    gap: 'sm',
    children: (
      <>
        <Box>A</Box>
        <Box>B</Box>
        <Box>C</Box>
      </>
    ),
  },
}

export const LargeGap: Story = {
  args: {
    gap: 'xl',
    children: (
      <>
        <Box>A</Box>
        <Box>B</Box>
        <Box>C</Box>
      </>
    ),
  },
}

export const Baseline: Story = {
  args: {
    align: 'baseline',
    gap: 'md',
    children: (
      <>
        <div className="text-4xl">Big</div>
        <div className="text-base">Normal</div>
        <div className="text-sm">Small</div>
      </>
    ),
  },
}

export const Stretch: Story = {
  args: {
    align: 'stretch',
    gap: 'md',
    className: 'h-32',
    children: (
      <>
        <Box className="flex-1">Stretch 1</Box>
        <Box className="flex-1">Stretch 2</Box>
        <Box className="flex-1">Stretch 3</Box>
      </>
    ),
  },
}

export const NavBar: Story = {
  render: () => (
    <Flex justify="between" align="center" className="border-b p-4">
      <Flex align="center" gap="lg">
        <div className="font-bold text-xl">Logo</div>
        <Flex gap="md">
          <a href="#" className="hover:text-primary">Home</a>
          <a href="#" className="hover:text-primary">Products</a>
          <a href="#" className="hover:text-primary">About</a>
        </Flex>
      </Flex>
      <Flex gap="sm">
        <button className="px-3 py-1 border rounded hover:bg-accent">Sign In</button>
        <button className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90">
          Sign Up
        </button>
      </Flex>
    </Flex>
  ),
}

export const CardFooter: Story = {
  render: () => (
    <div className="max-w-md border rounded-lg">
      <div className="p-6">
        <h3 className="text-lg font-semibold">Card Title</h3>
        <p className="text-muted-foreground mt-2">Card content goes here.</p>
      </div>
      <Flex justify="end" gap="sm" className="border-t p-4">
        <button className="px-3 py-1 border rounded hover:bg-accent">Cancel</button>
        <button className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90">
          Confirm
        </button>
      </Flex>
    </div>
  ),
}

export const FormRow: Story = {
  render: () => (
    <Flex gap="md" align="end">
      <div className="flex-1">
        <label className="block text-sm font-medium mb-1">First Name</label>
        <input type="text" className="w-full px-3 py-2 border rounded" />
      </div>
      <div className="flex-1">
        <label className="block text-sm font-medium mb-1">Last Name</label>
        <input type="text" className="w-full px-3 py-2 border rounded" />
      </div>
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
        Submit
      </button>
    </Flex>
  ),
}

export const ResponsiveStack: Story = {
  render: () => (
    <Flex direction="column" gap="md" className="md:flex-row">
      <Box className="flex-1">Item 1</Box>
      <Box className="flex-1">Item 2</Box>
      <Box className="flex-1">Item 3</Box>
    </Flex>
  ),
}
