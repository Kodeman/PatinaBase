'use client'

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '../../utils/cn'

export interface VirtualListProps<T> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onScroll'> {
  /**
   * Array of items to render
   */
  items: T[]
  /**
   * Render function for each item
   */
  renderItem: (item: T, index: number) => React.ReactNode
  /**
   * Estimated size of each item in pixels
   * @default 50
   */
  estimateSize?: number
  /**
   * Height of the scrollable container
   * @default 400
   */
  height?: number | string
  /**
   * Overscan count (number of items to render outside viewport)
   * @default 5
   */
  overscan?: number
  /**
   * Gap between items in pixels
   * @default 0
   */
  gap?: number
  /**
   * Callback when scroll position changes
   */
  onScroll?: (scrollTop: number) => void
  /**
   * Key extractor function
   */
  getItemKey?: (item: T, index: number) => string | number
  /**
   * Loading state
   */
  isLoading?: boolean
  /**
   * Loading component
   */
  loadingComponent?: React.ReactNode
  /**
   * Empty state component
   */
  emptyComponent?: React.ReactNode
  /**
   * Horizontal scrolling
   * @default false
   */
  horizontal?: boolean
}

/**
 * VirtualList component for efficient rendering of large lists
 * Uses @tanstack/react-virtual for virtualization
 *
 * @example
 * ```tsx
 * <VirtualList
 *   items={products}
 *   renderItem={(product) => <ProductCard {...product} />}
 *   estimateSize={300}
 *   height={600}
 * />
 * ```
 */
export const VirtualList = <T,>({
  items,
  renderItem,
  estimateSize = 50,
  height = 400,
  overscan = 5,
  gap = 0,
  onScroll,
  getItemKey,
  isLoading = false,
  loadingComponent,
  emptyComponent,
  horizontal = false,
  className,
  ...props
}: VirtualListProps<T>) => {
  const parentRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    horizontal,
    gap,
  })

  React.useEffect(() => {
    const element = parentRef.current
    if (!element || !onScroll) return

    const handleScroll = () => {
      onScroll(horizontal ? element.scrollLeft : element.scrollTop)
    }

    element.addEventListener('scroll', handleScroll)
    return () => element.removeEventListener('scroll', handleScroll)
  }, [onScroll, horizontal])

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  if (isLoading && loadingComponent) {
    return <div className={cn(className)}>{loadingComponent}</div>
  }

  if (!isLoading && items.length === 0 && emptyComponent) {
    return <div className={cn(className)}>{emptyComponent}</div>
  }

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto', className)}
      style={{
        [horizontal ? 'width' : 'height']: typeof height === 'number' ? `${height}px` : height,
      }}
      {...props}
    >
      <div
        style={{
          [horizontal ? 'width' : 'height']: `${totalSize}px`,
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]
          const key = getItemKey ? getItemKey(item, virtualItem.index) : virtualItem.index

          return (
            <div
              key={key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                [horizontal ? 'left' : 'top']: 0,
                [horizontal ? 'top' : 'left']: 0,
                [horizontal ? 'height' : 'width']: '100%',
                transform: horizontal
                  ? `translateX(${virtualItem.start}px)`
                  : `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

VirtualList.displayName = 'VirtualList'

/**
 * VirtualGrid component for virtualized grid layouts
 */
export interface VirtualGridProps<T> extends Omit<VirtualListProps<T>, 'horizontal'> {
  /**
   * Number of columns
   * @default 3
   */
  columns?: number
  /**
   * Width of the container
   * @default '100%'
   */
  width?: number | string
}

export const VirtualGrid = <T,>({
  items,
  renderItem,
  columns = 3,
  width = '100%',
  estimateSize = 200,
  height = 600,
  gap = 16,
  getItemKey,
  ...props
}: VirtualGridProps<T>) => {
  const rowCount = Math.ceil(items.length / columns)

  return (
    <VirtualList<number>
      items={Array.from({ length: rowCount }, (_, rowIndex) => rowIndex)}
      renderItem={(rowIndex: number) => (
        <div
          className="flex gap-4"
          style={{
            gap: `${gap}px`,
          }}
        >
          {Array.from({ length: columns }, (_, colIndex) => {
            const itemIndex = rowIndex * columns + colIndex
            const item = items[itemIndex]
            if (!item) return null

            return (
              <div key={itemIndex} style={{ flex: 1 }}>
                {renderItem(item, itemIndex)}
              </div>
            )
          })}
        </div>
      )}
      estimateSize={estimateSize}
      height={height}
      gap={gap}
      {...props}
    />
  )
}

VirtualGrid.displayName = 'VirtualGrid'

/**
 * Hook for infinite scroll with virtual list
 */
export interface UseInfiniteScrollOptions {
  /**
   * Callback when user scrolls to bottom
   */
  onLoadMore: () => void | Promise<void>
  /**
   * Whether more items are being loaded
   */
  isLoading: boolean
  /**
   * Whether there are more items to load
   */
  hasMore: boolean
  /**
   * Threshold in pixels from bottom to trigger load
   * @default 100
   */
  threshold?: number
}

export const useInfiniteScroll = ({
  onLoadMore,
  isLoading,
  hasMore,
  threshold = 100,
}: UseInfiniteScrollOptions) => {
  const handleScroll = React.useCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      if (isLoading || !hasMore) return

      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      if (distanceFromBottom < threshold) {
        onLoadMore()
      }
    },
    [onLoadMore, isLoading, hasMore, threshold]
  )

  return { handleScroll }
}
