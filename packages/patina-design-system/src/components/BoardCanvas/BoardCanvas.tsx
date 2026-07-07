'use client'

import * as React from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  useDraggable,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  UniqueIdentifier,
} from '@dnd-kit/core'
import { cn } from '../../utils/cn'
import { Icon } from '../Icon'
import { Button } from '../Button'

export interface BoardItem {
  id: UniqueIdentifier
  /**
   * Item kind. Common values: 'product' | 'capture' | 'image' | 'palette'
   * | 'note' | 'room_scan' | 'section' — but consumers may use any string.
   */
  type: string
  position: { x: number; y: number }
  size?: { width: number; height: number }
  /**
   * Stacking order on the canvas. Higher renders on top.
   * @default 0
   */
  zIndex?: number
  /**
   * Rotation in degrees, applied around the item center.
   * @default 0
   */
  rotation?: number
  data: any
  locked?: boolean
}

export interface BoardSection {
  id: string
  name: string
  color?: string
  /**
   * Logical-coordinate band this section occupies on the canvas. When present,
   * the canvas draws a labeled dashed region behind the items; when absent the
   * section is not drawn (it is a data-only grouping the caller lays out via an
   * Arrange pass). The board editor computes bounds live from the positions of
   * the items assigned to the section, so bands track their items in freeform.
   */
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface BoardCanvasProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Items on the board
   */
  items: BoardItem[]
  /**
   * Room sections
   */
  sections?: BoardSection[]
  /**
   * Layout mode
   * @default 'freeform'
   */
  layout?: 'grid' | 'freeform'
  /**
   * Grid size for snap-to-grid
   * @default 20
   */
  gridSize?: number
  /**
   * Show grid
   * @default true
   */
  showGrid?: boolean
  /**
   * Zoom level (0.1 to 3). Controlled: local zoom state re-syncs whenever
   * this prop changes (the built-in controls adjust it locally between
   * prop updates).
   * @default 1
   */
  zoom?: number
  /**
   * Enable zoom controls
   * @default true
   */
  enableZoom?: boolean
  /**
   * Disable all dragging/deleting (view-only canvas)
   * @default false
   */
  readOnly?: boolean
  /**
   * Callback when items are moved
   */
  onItemsChange?: (items: BoardItem[]) => void
  /**
   * Callback when item is clicked
   */
  onItemClick?: (item: BoardItem) => void
  /**
   * Callback when item is deleted
   */
  onItemDelete?: (itemId: UniqueIdentifier) => void
  /**
   * Render custom item
   */
  renderItem?: (item: BoardItem) => React.ReactNode
  /**
   * Background color
   */
  backgroundColor?: string
  /**
   * Canvas dimensions
   */
  width?: number
  height?: number
}

/**
 * BoardCanvas component for drag-and-drop proposal builder
 * Supports both grid and freeform layouts with zoom controls
 *
 * @example
 * ```tsx
 * <BoardCanvas
 *   items={items}
 *   layout="freeform"
 *   onItemsChange={setItems}
 *   renderItem={(item) => <ProductCard {...item.data} />}
 * />
 * ```
 */
export const BoardCanvas = React.forwardRef<HTMLDivElement, BoardCanvasProps>(
  (
    {
      items = [],
      sections = [],
      layout = 'freeform',
      gridSize = 20,
      showGrid = true,
      zoom = 1,
      enableZoom = true,
      readOnly = false,
      onItemsChange,
      onItemClick,
      onItemDelete,
      renderItem,
      backgroundColor = '#ffffff',
      width = 1200,
      height = 800,
      className,
      ...props
    },
    ref
  ) => {
    const [localZoom, setLocalZoom] = React.useState(zoom)
    const [isDragging, setIsDragging] = React.useState(false)

    // Controlled zoom: re-sync local state whenever the prop changes.
    React.useEffect(() => {
      setLocalZoom(Math.min(Math.max(zoom, 0.1), 3))
    }, [zoom])

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8,
        },
      }),
      useSensor(KeyboardSensor)
    )

    const handleDragStart = (event: DragStartEvent) => {
      setIsDragging(true)

      // Bring the active item to the front (max z + 1) so it stacks above
      // everything else both during and after the drag.
      const itemIndex = items.findIndex((item) => item.id === event.active.id)
      if (itemIndex === -1) return

      const item = items[itemIndex]
      if (item.locked) return

      const maxOtherZ = items.reduce(
        (max, other) => (other.id === item.id ? max : Math.max(max, other.zIndex ?? 0)),
        0
      )

      if (items.length > 1 && (item.zIndex ?? 0) <= maxOtherZ) {
        const updatedItems = [...items]
        updatedItems[itemIndex] = { ...item, zIndex: maxOtherZ + 1 }
        onItemsChange?.(updatedItems)
      }
    }

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, delta } = event
      setIsDragging(false)

      if (!delta) return

      const itemIndex = items.findIndex((item) => item.id === active.id)
      if (itemIndex === -1) return

      const item = items[itemIndex]
      if (item.locked) return

      // dnd-kit reports the pointer delta in screen pixels; the canvas is
      // scaled, so convert back to logical canvas coordinates.
      const scaledDelta = {
        x: delta.x / localZoom,
        y: delta.y / localZoom,
      }

      let newX = item.position.x + scaledDelta.x
      let newY = item.position.y + scaledDelta.y

      // Snap to grid if enabled
      if (layout === 'grid') {
        newX = Math.round(newX / gridSize) * gridSize
        newY = Math.round(newY / gridSize) * gridSize
      }

      const updatedItems = [...items]
      updatedItems[itemIndex] = {
        ...item,
        position: { x: newX, y: newY },
      }

      onItemsChange?.(updatedItems)
    }

    const handleDragCancel = () => {
      setIsDragging(false)
    }

    const handleZoomIn = () => {
      setLocalZoom((prev) => Math.min(prev + 0.1, 3))
    }

    const handleZoomOut = () => {
      setLocalZoom((prev) => Math.max(prev - 0.1, 0.1))
    }

    const handleResetZoom = () => {
      setLocalZoom(1)
    }

    const handleDeleteItem = (itemId: UniqueIdentifier) => {
      onItemDelete?.(itemId)
    }

    const gridBackground = showGrid && layout === 'grid'
      ? {
          backgroundImage: `
            linear-gradient(to right, #e5e7eb 1px, transparent 1px),
            linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
          `,
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }
      : {}

    return (
      <div
        ref={ref}
        className={cn('relative overflow-hidden border rounded-lg', className)}
        {...props}
      >
        {/* Zoom Controls */}
        {enableZoom && (
          <div className="absolute top-4 right-4 z-10 flex gap-2 bg-white rounded-lg shadow-md p-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleZoomOut}
              disabled={localZoom <= 0.1}
              aria-label="Zoom out"
            >
              <Icon name="ZoomOut" size={18} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResetZoom}
              className="min-w-[60px]"
            >
              {Math.round(localZoom * 100)}%
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleZoomIn}
              disabled={localZoom >= 3}
              aria-label="Zoom in"
            >
              <Icon name="ZoomIn" size={18} />
            </Button>
          </div>
        )}

        {/* Canvas */}
        <div
          className="relative"
          style={{
            width,
            height,
            transform: `scale(${localZoom})`,
            transformOrigin: 'top left',
            transition: isDragging ? 'none' : 'transform 0.2s',
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundColor,
                ...gridBackground,
              }}
            >
              {/* Sections — drawn only when the caller supplies bounds; the
                  band sits behind the items (rendered first, no positive z). */}
              {sections.map((section) =>
                section.bounds ? (
                  <div
                    key={section.id}
                    className="absolute rounded-lg border-2 border-dashed"
                    style={{
                      left: section.bounds.x,
                      top: section.bounds.y,
                      width: section.bounds.width,
                      height: section.bounds.height,
                      borderColor: section.color || '#94a3b8',
                    }}
                  >
                    <div
                      className="absolute -top-3 left-2 rounded px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: section.color || '#94a3b8',
                        color: 'white',
                      }}
                    >
                      {section.name}
                    </div>
                  </div>
                ) : null,
              )}

              {/* Items */}
              {items.map((item) => (
                <BoardCanvasItem
                  key={item.id}
                  item={item}
                  zoom={localZoom}
                  readOnly={readOnly}
                  onClick={() => onItemClick?.(item)}
                  onDelete={readOnly ? undefined : () => handleDeleteItem(item.id)}
                  renderItem={renderItem}
                />
              ))}
            </div>
          </DndContext>
        </div>
      </div>
    )
  }
)

BoardCanvas.displayName = 'BoardCanvas'

/**
 * Internal component for rendering board items
 */
interface BoardCanvasItemProps {
  item: BoardItem
  zoom: number
  readOnly?: boolean
  onClick?: () => void
  onDelete?: () => void
  renderItem?: (item: BoardItem) => React.ReactNode
}

const BoardCanvasItem: React.FC<BoardCanvasItemProps> = ({
  item,
  zoom,
  readOnly = false,
  onClick,
  onDelete,
  renderItem,
}) => {
  const [isHovered, setIsHovered] = React.useState(false)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: item.locked || readOnly,
  })

  // dnd-kit's live transform is in screen pixels; the canvas is scaled, so
  // divide by the zoom factor to keep the item under the pointer. Rotation
  // composes after the translation so the item pivots in its moved frame.
  const dragTranslate = transform
    ? `translate3d(${transform.x / zoom}px, ${transform.y / zoom}px, 0)`
    : ''
  const rotate = item.rotation ? `rotate(${item.rotation}deg)` : ''
  const composedTransform = [dragTranslate, rotate].filter(Boolean).join(' ') || undefined

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'absolute',
        !readOnly && !item.locked && 'cursor-move',
        !isDragging && 'transition-shadow',
        isHovered && !readOnly && 'ring-2 ring-primary',
        isDragging && 'shadow-lg opacity-90',
        item.locked && 'cursor-not-allowed opacity-60'
      )}
      style={{
        left: item.position.x,
        top: item.position.y,
        width: item.size?.width,
        height: item.size?.height,
        // Floor at 0: a negative z would stack behind the opaque canvas
        // background div and make the item invisible.
        zIndex: Math.max(0, item.zIndex ?? 0),
        transform: composedTransform,
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...listeners}
      {...attributes}
    >
      {renderItem?.(item) || (
        <div className="bg-white rounded-lg shadow-md p-4">
          <p className="font-medium">{item.type}</p>
        </div>
      )}

      {/* Delete Button */}
      {isHovered && !item.locked && !readOnly && onDelete && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
          aria-label="Delete item"
        >
          <Icon name="X" size={14} />
        </button>
      )}

      {/* Lock Indicator */}
      {item.locked && (
        <div className="absolute top-2 right-2 text-gray-400">
          <Icon name="Lock" size={16} />
        </div>
      )}
    </div>
  )
}
