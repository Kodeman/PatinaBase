import type { Meta, StoryObj } from '@storybook/react'
import { BoardStatic, BoardStaticItem } from './BoardStatic'

const meta: Meta<typeof BoardStatic> = {
  title: 'Designer Portal/BoardStatic',
  component: BoardStatic,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BoardStatic>

const mockItems: BoardStaticItem[] = [
  {
    id: '1',
    type: 'product',
    position: { x: 100, y: 100 },
    size: { width: 240, height: 240 },
    zIndex: 1,
    data: { name: 'Sofa', price: 999 },
  },
  {
    id: '2',
    type: 'product',
    position: { x: 420, y: 160 },
    size: { width: 240, height: 240 },
    zIndex: 2,
    rotation: -4,
    data: { name: 'Chair', price: 499 },
  },
  {
    id: '3',
    type: 'note',
    position: { x: 280, y: 460 },
    size: { width: 280, height: 120 },
    zIndex: 3,
    rotation: 2,
    data: { text: 'Warm walnut + boucle pairing for the reading corner.' },
  },
]

export const Default: Story = {
  args: {
    items: mockItems,
  },
}

export const ScaledToContainer: Story = {
  render: () => (
    <div className="p-8 space-y-8">
      <div className="w-[800px] border rounded-lg overflow-hidden">
        <BoardStatic items={mockItems} />
      </div>
      <div className="w-[360px] border rounded-lg overflow-hidden">
        <BoardStatic items={mockItems} />
      </div>
    </div>
  ),
}

export const CustomRenderer: Story = {
  args: {
    items: mockItems,
    backgroundColor: '#F2EEE8',
    renderItem: (item) => (
      <div className="h-full w-full bg-white rounded-lg shadow-lg p-4 border-2 border-gray-200">
        <h3 className="font-bold">{item.data?.name ?? item.type}</h3>
        {item.data?.price && <p className="text-sm text-gray-600">${item.data.price}</p>}
        {item.data?.text && <p className="text-sm text-gray-600">{item.data.text}</p>}
      </div>
    ),
  },
}
