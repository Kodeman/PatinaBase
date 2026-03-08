'use client'

import * as React from 'react'
import {
  DndContext,
  DndContextProps,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  UniqueIdentifier,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface DragDropContextProps extends Partial<DndContextProps> {
  children: React.ReactNode
  onDragStart?: (event: DragStartEvent) => void
  onDragEnd?: (event: DragEndEvent) => void
  onDragOver?: (event: DragOverEvent) => void
}

/**
 * DragDropContext wrapper for @dnd-kit
 * Provides sensors and collision detection
 */
export const DragDropContext: React.FC<DragDropContextProps> = ({
  children,
  onDragStart,
  onDragEnd,
  onDragOver,
  ...props
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      {...props}
    >
      {children}
    </DndContext>
  )
}

export interface SortableListProps {
  children: React.ReactNode
  items: UniqueIdentifier[]
  strategy?: 'vertical' | 'horizontal' | 'grid'
}

/**
 * SortableList wrapper component
 */
export const SortableList: React.FC<SortableListProps> = ({
  children,
  items,
  strategy = 'vertical',
}) => {
  const strategyMap = {
    vertical: verticalListSortingStrategy,
    horizontal: horizontalListSortingStrategy,
    grid: rectSortingStrategy,
  }

  return (
    <SortableContext items={items} strategy={strategyMap[strategy]}>
      {children}
    </SortableContext>
  )
}

export interface UseSortableItemProps {
  id: UniqueIdentifier
  disabled?: boolean
}

export interface SortableItemRenderProps {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setNodeRef: ReturnType<typeof useSortable>['setNodeRef']
  transform: ReturnType<typeof useSortable>['transform']
  transition: ReturnType<typeof useSortable>['transition']
  isDragging: boolean
  style: React.CSSProperties
}

/**
 * Hook for sortable items
 */
export const useSortableItem = ({
  id,
  disabled = false,
}: UseSortableItemProps): SortableItemRenderProps => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return {
    attributes,
    listeners: disabled ? {} : listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    style,
  }
}

/**
 * Helper function to handle array reordering after drag
 */
export const reorderItems = <T,>(
  items: T[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  getId: (item: T) => UniqueIdentifier = (item: any) => item.id
): T[] => {
  const oldIndex = items.findIndex((item) => getId(item) === activeId)
  const newIndex = items.findIndex((item) => getId(item) === overId)

  if (oldIndex === -1 || newIndex === -1) {
    return items
  }

  return arrayMove(items, oldIndex, newIndex)
}

/**
 * Hook for managing sortable list state
 */
export interface UseSortableListOptions<T> {
  initialItems: T[]
  getId?: (item: T) => UniqueIdentifier
  onReorder?: (items: T[]) => void
}

export const useSortableList = <T,>({
  initialItems,
  getId = (item: any) => item.id,
  onReorder,
}: UseSortableListOptions<T>) => {
  const [items, setItems] = React.useState(initialItems)
  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null)

  React.useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const newItems = reorderItems(items, active.id, over.id, getId)
      setItems(newItems)
      onReorder?.(newItems)
    }

    setActiveId(null)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  return {
    items,
    activeId,
    setItems,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  }
}

/**
 * Draggable item component
 */
export interface DraggableItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> {
  id: UniqueIdentifier
  children: React.ReactNode
  disabled?: boolean
  handle?: boolean
}

export const DraggableItem = React.forwardRef<HTMLDivElement, DraggableItemProps>(
  ({ id, children, disabled = false, handle = false, className, ...props }, ref) => {
    const { attributes, listeners, setNodeRef, style } = useSortableItem({ id, disabled })

    const handleProps = handle ? {} : listeners

    return (
      <div
        ref={(node) => {
          setNodeRef(node)
          if (typeof ref === 'function') {
            ref(node)
          } else if (ref) {
            ref.current = node
          }
        }}
        style={style}
        className={className}
        {...attributes}
        {...handleProps}
        {...props}
      >
        {children}
      </div>
    )
  }
)

DraggableItem.displayName = 'DraggableItem'

/**
 * Drag handle component for use with handle prop
 */
export interface DragHandleProps extends React.HTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode
}

export const DragHandle = React.forwardRef<HTMLButtonElement, DragHandleProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={className}
        {...props}
      >
        {children || (
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        )}
      </button>
    )
  }
)

DragHandle.displayName = 'DragHandle'
