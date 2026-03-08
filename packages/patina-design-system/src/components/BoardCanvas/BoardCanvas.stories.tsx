import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { BoardCanvas, BoardItem } from './BoardCanvas'

const meta: Meta<typeof BoardCanvas> = {
  title: 'Designer Portal/BoardCanvas',
  component: BoardCanvas,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BoardCanvas>

const mockItems: BoardItem[] = [
  {
    id: '1',
    type: 'product',
    position: { x: 100, y: 100 },
    size: { width: 200, height: 200 },
    data: { name: 'Sofa', price: 999 },
  },
  {
    id: '2',
    type: 'product',
    position: { x: 350, y: 100 },
    size: { width: 200, height: 200 },
    data: { name: 'Chair', price: 499 },
  },
  {
    id: '3',
    type: 'product',
    position: { x: 100, y: 350 },
    size: { width: 200, height: 200 },
    data: { name: 'Table', price: 799 },
  },
]

export const Default: Story = {
  args: {
    items: mockItems,
    onItemsChange: (items) => console.log('Items changed:', items),
  },
}

export const WithGrid: Story = {
  args: {
    items: mockItems,
    layout: 'grid',
    showGrid: true,
    gridSize: 40,
    onItemsChange: (items) => console.log('Items changed:', items),
  },
}

export const WithSections: Story = {
  args: {
    items: mockItems,
    sections: [
      { id: 'living-room', name: 'Living Room', color: '#3b82f6' },
      { id: 'bedroom', name: 'Bedroom', color: '#8b5cf6' },
    ],
    onItemsChange: (items) => console.log('Items changed:', items),
  },
}

export const Interactive: Story = {
  render: () => {
    const [items, setItems] = useState<BoardItem[]>(mockItems)

    return (
      <div className="p-8">
        <BoardCanvas
          items={items}
          onItemsChange={setItems}
          onItemClick={(item) => console.log('Clicked:', item)}
          onItemDelete={(id) => setItems(items.filter((i) => i.id !== id))}
          renderItem={(item) => (
            <div className="bg-white rounded-lg shadow-lg p-4 border-2 border-gray-200">
              <h3 className="font-bold">{item.data.name}</h3>
              <p className="text-sm text-gray-600">${item.data.price}</p>
            </div>
          )}
        />
      </div>
    )
  },
}
