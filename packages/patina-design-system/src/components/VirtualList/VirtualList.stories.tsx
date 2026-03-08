import type { Meta, StoryObj } from '@storybook/react'
import { VirtualList, VirtualGrid } from './VirtualList'
import { Card } from '../Card'
import { ProductCard } from '../ProductCard'
import * as React from 'react'

const meta: Meta<typeof VirtualList> = {
  title: 'Components/VirtualList',
  component: VirtualList,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof VirtualList>

const mockItems = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  title: `Item ${i + 1}`,
  description: `Description for item ${i + 1}`,
}))

export const Basic: Story = {
  args: {
    items: mockItems,
    renderItem: (item) => (
      <Card key={item.id} className="p-4 mb-2">
        <h3 className="font-semibold">{item.title}</h3>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </Card>
    ),
    height: 500,
    estimateSize: 100,
  },
}

export const WithGap: Story = {
  args: {
    items: mockItems,
    renderItem: (item) => (
      <Card key={item.id} className="p-4">
        <h3 className="font-semibold">{item.title}</h3>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </Card>
    ),
    height: 500,
    estimateSize: 100,
    gap: 16,
  },
}

export const EmptyState: Story = {
  args: {
    items: [],
    renderItem: (item) => <div>{item}</div>,
    emptyComponent: (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No items to display
      </div>
    ),
  },
}

export const Loading: Story = {
  args: {
    items: mockItems,
    renderItem: (item) => (
      <Card key={item.id} className="p-4">
        <h3 className="font-semibold">{item.title}</h3>
      </Card>
    ),
    isLoading: true,
    loadingComponent: (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading...
      </div>
    ),
  },
}

const mockProducts = Array.from({ length: 100 }, (_, i) => ({
  id: `product-${i}`,
  name: `Product ${i + 1}`,
  brand: 'Design Co',
  price: Math.floor(Math.random() * 50000) + 5000,
  image: `https://picsum.photos/seed/${i}/400/500`,
  rating: Math.floor(Math.random() * 5) + 1,
  reviewCount: Math.floor(Math.random() * 100),
}))

export const ProductList: Story = {
  args: {
    items: mockProducts,
    renderItem: (product) => (
      <ProductCard
        key={product.id}
        variant="list"
        {...product}
        onAddToProposal={() => {}}
      />
    ),
    height: 600,
    estimateSize: 150,
    gap: 8,
  },
}

export const GridLayout: StoryObj<typeof VirtualGrid> = {
  render: () => (
    <VirtualGrid
      items={mockProducts}
      renderItem={(product) => (
        <ProductCard
          key={product.id}
          variant="grid"
          {...product}
          onAddToProposal={() => {}}
        />
      )}
      columns={3}
      height={600}
      estimateSize={400}
      gap={16}
    />
  ),
}

export const InfiniteScroll: Story = {
  render: () => {
    const [items, setItems] = React.useState(
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        title: `Item ${i + 1}`,
        description: `Description for item ${i + 1}`,
      }))
    )
    const [isLoading, setIsLoading] = React.useState(false)

    const loadMore = React.useCallback(() => {
      setIsLoading(true)
      setTimeout(() => {
        setItems((prev) => [
          ...prev,
          ...Array.from({ length: 20 }, (_, i) => ({
            id: prev.length + i,
            title: `Item ${prev.length + i + 1}`,
            description: `Description for item ${prev.length + i + 1}`,
          })),
        ])
        setIsLoading(false)
      }, 1000)
    }, [])

    return (
      <div>
        <VirtualList
          items={items}
          renderItem={(item) => (
            <Card key={item.id} className="p-4 mb-2">
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </Card>
          )}
          height={500}
          estimateSize={100}
          onScroll={(scrollTop) => {
            // Implement infinite scroll logic
          }}
        />
        {isLoading && <div className="text-center p-4">Loading more...</div>}
        <button
          onClick={loadMore}
          className="mt-4 px-4 py-2 bg-primary text-white rounded"
          disabled={isLoading}
        >
          Load More
        </button>
      </div>
    )
  },
}
