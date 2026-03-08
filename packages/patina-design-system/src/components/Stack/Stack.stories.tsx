import type { Meta, StoryObj } from '@storybook/react'
import { Stack, VStack, HStack } from './Stack'

const meta = {
  title: 'Layout/Stack',
  component: Stack,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Stack>

export default meta
type Story = StoryObj<typeof meta>

const DemoBox = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-4 bg-primary text-primary-foreground rounded ${className}`}>{children}</div>
)

export const Vertical: Story = {
  render: () => (
    <VStack spacing="md">
      <DemoBox>Item 1</DemoBox>
      <DemoBox>Item 2</DemoBox>
      <DemoBox>Item 3</DemoBox>
    </VStack>
  ),
}

export const Horizontal: Story = {
  render: () => (
    <HStack spacing="md">
      <DemoBox>Item 1</DemoBox>
      <DemoBox>Item 2</DemoBox>
      <DemoBox>Item 3</DemoBox>
    </HStack>
  ),
}

export const DifferentSpacing: Story = {
  render: () => (
    <VStack spacing="xl">
      <HStack spacing="xs">
        <DemoBox>XS</DemoBox>
        <DemoBox>Spacing</DemoBox>
      </HStack>
      <HStack spacing="sm">
        <DemoBox>SM</DemoBox>
        <DemoBox>Spacing</DemoBox>
      </HStack>
      <HStack spacing="md">
        <DemoBox>MD</DemoBox>
        <DemoBox>Spacing</DemoBox>
      </HStack>
      <HStack spacing="lg">
        <DemoBox>LG</DemoBox>
        <DemoBox>Spacing</DemoBox>
      </HStack>
    </VStack>
  ),
}

export const Alignment: Story = {
  render: () => (
    <VStack spacing="md" className="w-full max-w-md">
      <HStack spacing="sm" align="start" className="h-20 w-full bg-gray-100 p-2 rounded">
        <DemoBox className="h-8">Start</DemoBox>
        <DemoBox className="h-12">Aligned</DemoBox>
        <DemoBox className="h-16">Items</DemoBox>
      </HStack>
      <HStack spacing="sm" align="center" className="h-20 w-full bg-gray-100 p-2 rounded">
        <DemoBox className="h-8">Center</DemoBox>
        <DemoBox className="h-12">Aligned</DemoBox>
        <DemoBox className="h-16">Items</DemoBox>
      </HStack>
      <HStack spacing="sm" align="end" className="h-20 w-full bg-gray-100 p-2 rounded">
        <DemoBox className="h-8">End</DemoBox>
        <DemoBox className="h-12">Aligned</DemoBox>
        <DemoBox className="h-16">Items</DemoBox>
      </HStack>
    </VStack>
  ),
}

export const Justification: Story = {
  render: () => (
    <VStack spacing="md" className="w-full max-w-md">
      <HStack spacing="sm" justify="start" className="w-full bg-gray-100 p-2 rounded">
        <DemoBox>Start</DemoBox>
        <DemoBox>Justified</DemoBox>
      </HStack>
      <HStack spacing="sm" justify="center" className="w-full bg-gray-100 p-2 rounded">
        <DemoBox>Center</DemoBox>
        <DemoBox>Justified</DemoBox>
      </HStack>
      <HStack spacing="sm" justify="end" className="w-full bg-gray-100 p-2 rounded">
        <DemoBox>End</DemoBox>
        <DemoBox>Justified</DemoBox>
      </HStack>
      <HStack spacing="sm" justify="between" className="w-full bg-gray-100 p-2 rounded">
        <DemoBox>Space</DemoBox>
        <DemoBox>Between</DemoBox>
      </HStack>
    </VStack>
  ),
}
