'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'

/**
 * Item shape for the static (read-only) board renderer. Structurally
 * compatible with BoardCanvas's BoardItem, but defined locally so this
 * module stays dependency-free (no @dnd-kit import).
 */
export interface BoardStaticItem {
  id: string | number
  type: string
  position: { x: number; y: number }
  size?: { width: number; height: number }
  zIndex?: number
  rotation?: number
  data?: any
  locked?: boolean
}

export interface BoardStaticProps {
  /**
   * Items to render, positioned in logical canvas coordinates.
   */
  items: BoardStaticItem[]
  /**
   * Logical canvas width the item coordinates are expressed in.
   * @default 1200
   */
  canvasWidth?: number
  /**
   * Logical canvas height.
   * @default 800
   */
  canvasHeight?: number
  /**
   * Canvas background color.
   * @default '#FAF8F5'
   */
  backgroundColor?: string
  /**
   * Render an item's content. Falls back to a simple type label.
   */
  renderItem?: (item: BoardStaticItem) => React.ReactNode
  className?: string
}

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

/**
 * BoardStatic — dependency-free, read-only mood-board renderer.
 *
 * Renders the board at its logical size and scales it down (or up) with a
 * CSS transform so it always fits the container's width. Used for client
 * proposal rendering, board thumbnails, and activated-project snapshots
 * where no editing interactivity is needed.
 *
 * @example
 * ```tsx
 * <BoardStatic
 *   items={items}
 *   canvasWidth={board.canvas_width}
 *   canvasHeight={board.canvas_height}
 *   backgroundColor={board.background_color}
 *   renderItem={(item) => <BoardItemContent item={item} />}
 * />
 * ```
 */
export const BoardStatic = React.forwardRef<HTMLDivElement, BoardStaticProps>(
  (
    {
      items = [],
      canvasWidth = 1200,
      canvasHeight = 800,
      backgroundColor = '#FAF8F5',
      renderItem,
      className,
    },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const [scale, setScale] = React.useState(1)

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref]
    )

    useIsomorphicLayoutEffect(() => {
      const el = containerRef.current
      if (!el) return

      const measure = () => {
        const width = el.clientWidth
        if (width > 0) setScale(width / canvasWidth)
      }

      // Initial measure (layout effect → before paint on the client).
      measure()

      // SSR / very old browsers: keep the initial measurement only.
      if (typeof ResizeObserver === 'undefined') return

      const observer = new ResizeObserver(measure)
      observer.observe(el)
      return () => observer.disconnect()
    }, [canvasWidth])

    return (
      <div
        ref={setRefs}
        className={cn('relative w-full overflow-hidden', className)}
        style={{ height: canvasHeight * scale }}
      >
        <div
          className="relative"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              className="absolute"
              style={{
                left: item.position.x,
                top: item.position.y,
                width: item.size?.width,
                height: item.size?.height,
                zIndex: item.zIndex ?? 0,
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
              }}
            >
              {renderItem?.(item) || (
                <div className="bg-white rounded-lg shadow-md p-4">
                  <p className="font-medium">{item.type}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }
)

BoardStatic.displayName = 'BoardStatic'
