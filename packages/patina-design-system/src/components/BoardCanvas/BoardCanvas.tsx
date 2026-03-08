'use client'

import * as React from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
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
  type: 'product' | 'section' | 'note'
  position: { x: number; y: number }
  size?: { width: number; height: number }
  data: any
  locked?: boolean
}

export interface BoardSection {
  id: string
  name: string
  color?: string
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
   * Zoom level (0.1 to 3)
   * @default 1
   */
  zoom?: number
  /**
   * Enable zoom controls
   * @default true
   */
  enableZoom?: boolean
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
    const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null)
    const [isDragging, setIsDragging] = React.useState(false)

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8,
        },
      }),
      useSensor(KeyboardSensor)
    )

    const handleDragStart = (event: DragStartEvent) => {
      setActiveId(event.active.id)
      setIsDragging(true)
    }

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, delta } = event

      if (!delta) {
        setActiveId(null)
        setIsDragging(false)
        return
      }

      const itemIndex = items.findIndex((item) => item.id === active.id)
      if (itemIndex === -1) {
        setActiveId(null)
        setIsDragging(false)
        return
      }

      const item = items[itemIndex]
      if (item.locked) {
        setActiveId(null)
        setIsDragging(false)
        return
      }

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
      setActiveId(null)
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

    const activeItem = items.find((item) => item.id === activeId)

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
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundColor,
                ...gridBackground,
              }}
            >
              {/* Sections */}
              {sections.map((section) => (
                <div
                  key={section.id}
                  className="absolute border-2 border-dashed rounded-lg p-4"
                  style={{
                    borderColor: section.color || '#94a3b8',
                  }}
                >
                  <div
                    className="text-sm font-medium px-2 py-1 rounded"
                    style={{
                      backgroundColor: section.color || '#94a3b8',
                      color: 'white',
                    }}
                  >
                    {section.name}
                  </div>
                </div>
              ))}

              {/* Items */}
              {items.map((item) => (
                <BoardCanvasItem
                  key={item.id}
                  item={item}
                  onClick={() => onItemClick?.(item)}
                  onDelete={() => handleDeleteItem(item.id)}
                  renderItem={renderItem}
                />
              ))}
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
              {activeItem ? (
                <div className="opacity-50">
                  {renderItem?.(activeItem) || (
                    <div className="bg-white rounded-lg shadow-lg p-4">
                      {activeItem.type}
                    </div>
                  )}
                </div>
              ) : null}
            </DragOverlay>
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
  onClick?: () => void
  onDelete?: () => void
  renderItem?: (item: BoardItem) => React.ReactNode
}

const BoardCanvasItem: React.FC<BoardCanvasItemProps> = ({
  item,
  onClick,
  onDelete,
  renderItem,
}) => {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <div
      className={cn(
        'absolute cursor-move transition-shadow',
        isHovered && 'ring-2 ring-primary',
        item.locked && 'cursor-not-allowed opacity-60'
      )}
      style={{
        left: item.position.x,
        top: item.position.y,
        width: item.size?.width,
        height: item.size?.height,
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {renderItem?.(item) || (
        <div className="bg-white rounded-lg shadow-md p-4">
          <p className="font-medium">{item.type}</p>
        </div>
      )}

      {/* Delete Button */}
      {isHovered && !item.locked && onDelete && (
        <button
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
