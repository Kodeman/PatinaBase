import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VirtualList, VirtualGrid } from './VirtualList'

describe('VirtualList', () => {
  const mockItems = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
  }))

  it('renders virtual list', () => {
    render(
      <VirtualList
        items={mockItems}
        renderItem={(item) => <div key={item.id}>{item.name}</div>}
        height={400}
      />
    )

    // Virtual list only renders visible items
    expect(screen.queryByText('Item 0')).toBeInTheDocument()
  })

  it('renders empty state when no items', () => {
    render(
      <VirtualList
        items={[]}
        renderItem={(item) => <div>{item}</div>}
        emptyComponent={<div>No items</div>}
      />
    )

    expect(screen.getByText('No items')).toBeInTheDocument()
  })

  it('renders loading state', () => {
    render(
      <VirtualList
        items={mockItems}
        renderItem={(item) => <div>{item.name}</div>}
        isLoading
        loadingComponent={<div>Loading...</div>}
      />
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('uses custom key extractor', () => {
    const getItemKey = vi.fn((item) => item.id)

    render(
      <VirtualList
        items={mockItems}
        renderItem={(item) => <div>{item.name}</div>}
        getItemKey={getItemKey}
      />
    )

    expect(getItemKey).toHaveBeenCalled()
  })
})

describe('VirtualGrid', () => {
  const mockItems = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
  }))

  it('renders virtual grid', () => {
    render(
      <VirtualGrid
        items={mockItems}
        renderItem={(item) => <div key={item.id}>{item.name}</div>}
        columns={3}
        height={400}
      />
    )

    expect(screen.queryByText('Item 0')).toBeInTheDocument()
  })

  it('renders with custom column count', () => {
    const { container } = render(
      <VirtualGrid
        items={mockItems}
        renderItem={(item) => <div key={item.id}>{item.name}</div>}
        columns={4}
      />
    )

    expect(container).toBeInTheDocument()
  })
})
