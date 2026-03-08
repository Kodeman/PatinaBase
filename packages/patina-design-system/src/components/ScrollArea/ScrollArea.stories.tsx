import type { Meta, StoryObj } from '@storybook/react'
import { ScrollArea } from './ScrollArea'

const meta: Meta<typeof ScrollArea> = {
  title: 'Components/ScrollArea',
  component: ScrollArea,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ScrollArea>

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-72 w-96 rounded-md border border-border p-4">
      <div className="space-y-4">
        {Array.from({ length: 50 }).map((_, i) => (
          <p key={i} className="text-sm">
            This is line {i + 1} of scrollable content. The ScrollArea component provides
            custom-styled scrollbars that match the Patina design system.
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const VerticalScroll: Story = {
  render: () => (
    <ScrollArea size="lg" orientation="vertical" className="w-96 border border-border rounded-md p-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold mb-4">Product List</h3>
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="p-3 bg-muted rounded-md">
            <h4 className="font-medium">Product {i + 1}</h4>
            <p className="text-sm text-muted-foreground">
              Description for product {i + 1}
            </p>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const HorizontalScroll: Story = {
  render: () => (
    <ScrollArea orientation="horizontal" className="w-96 border border-border rounded-md p-4">
      <div className="flex gap-4 w-max">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="w-48 h-32 bg-muted rounded-md flex items-center justify-center"
          >
            <p className="font-medium">Card {i + 1}</p>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const BothDirections: Story = {
  render: () => (
    <ScrollArea orientation="both" size="lg" className="border border-border rounded-md p-4">
      <div className="w-[800px]">
        {Array.from({ length: 30 }).map((_, i) => (
          <p key={i} className="text-sm whitespace-nowrap">
            This is line {i + 1} with very long content that extends beyond the visible area horizontally and vertically
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const MinimalVariant: Story = {
  render: () => (
    <ScrollArea
      size="md"
      orientation="vertical"
      scrollbarVariant="minimal"
      className="h-64 w-96 border border-border rounded-md p-4"
    >
      <div className="space-y-2">
        <h3 className="text-lg font-semibold mb-4">Minimal Scrollbar</h3>
        {Array.from({ length: 25 }).map((_, i) => (
          <p key={i} className="text-sm">
            Line {i + 1}: This uses a minimal scrollbar variant that's more subtle.
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const SmallSize: Story = {
  render: () => (
    <ScrollArea size="sm" className="border border-border rounded-md p-4">
      <div className="space-y-2">
        {Array.from({ length: 20 }).map((_, i) => (
          <p key={i} className="text-sm">
            Short content line {i + 1}
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const FullHeight: Story = {
  render: () => (
    <div className="h-96 border border-border rounded-md">
      <ScrollArea size="full" className="p-4">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Full Height Example</h2>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="p-4 bg-card rounded-md border border-border">
              <h4 className="font-medium">Section {i + 1}</h4>
              <p className="text-sm text-muted-foreground">
                Content that fills the full height of its container.
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  ),
}

export const InProductEditor: Story = {
  name: 'Product Editor Use Case',
  render: () => (
    <div className="w-full max-w-2xl mx-auto border border-border rounded-lg">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold">Product Details</h3>
      </div>
      <ScrollArea size="lg" className="p-4">
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium">Product Name</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 border border-border rounded-md"
              placeholder="Enter product name"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="w-full mt-1 px-3 py-2 border border-border rounded-md"
              rows={4}
              placeholder="Enter product description"
            />
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}>
              <label className="text-sm font-medium">Field {i + 1}</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 border border-border rounded-md"
                placeholder={`Enter value for field ${i + 1}`}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  ),
}
