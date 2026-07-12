'use client';

import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';

/** Spread onto a dedicated grip handle — never onto the whole card — so the
 * per-card ⋯ action menu (see card-action-menu.tsx) stays a normal button
 * PointerSensor doesn't intercept. Mirrors sortable-block.tsx's grip-handle
 * isolation (email-builder), which keeps its Duplicate/Delete buttons
 * listener-free for the same reason. */
export interface DragHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

// Generic drag-and-drop kanban shell shared by the Designers and Makers
// boards (/mission-control/pipelines, WP-2.2). Column layout follows the
// designer-portal ClientKanbanBoard template (overflow-x-auto row of
// min-w-80 columns); the actual drag mechanics follow the email-builder's
// DndContext/useDroppable/useDraggable pattern
// (communications/email-builder/{email-template-builder,builder-canvas}.tsx)
// rather than its sortable-within-column variant, since cards only need to
// move BETWEEN columns here, never reorder within one.
//
// Mission Control's flat/hairline visual language (no shadows on content —
// see approval-card.tsx) governs the column and card chrome; card CONTENT is
// supplied by the caller via renderCard, since Designer and Maker cards show
// unrelated fields.

export interface PipelineColumnDef {
  id: string;
  label: string;
  sublabel?: string;
}

interface PipelineDndBoardProps<T> {
  columns: PipelineColumnDef[];
  items: T[];
  getId: (item: T) => string;
  getStage: (item: T) => string;
  onMove: (itemId: string, toStage: string) => void;
  renderCard: (item: T, opts: { dragging: boolean; dragHandleProps: DragHandleProps }) => ReactNode;
}

export function PipelineDndBoard<T>({
  columns,
  items,
  getId,
  getStage,
  onMove,
  renderCard,
}: PipelineDndBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byStage = new Map<string, T[]>();
  for (const col of columns) byStage.set(col.id, []);
  for (const item of items) {
    const stage = getStage(item);
    if (!byStage.has(stage)) byStage.set(stage, []); // defensive: unrecognized stage still renders somewhere
    byStage.get(stage)!.push(item);
  }

  const activeItem = activeId ? items.find((i) => getId(i) === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const toStage = String(over.id);
    const item = items.find((i) => getId(i) === itemId);
    if (!item) return;
    if (getStage(item) === toStage) return;
    onMove(itemId, toStage);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4" data-testid="pipeline-board">
        {columns.map((col) => (
          <PipelineColumn
            key={col.id}
            id={col.id}
            label={col.label}
            sublabel={col.sublabel}
            count={byStage.get(col.id)?.length ?? 0}
          >
            {(byStage.get(col.id) ?? []).map((item) => (
              <PipelineDraggableCard key={getId(item)} id={getId(item)} renderCard={renderCard} item={item} dragging={activeId === getId(item)} />
            ))}
          </PipelineColumn>
        ))}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="w-72 opacity-90">
            {renderCard(activeItem, {
              dragging: true,
              dragHandleProps: { attributes: {} as DraggableAttributes, listeners: undefined },
            })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function PipelineColumn({
  id,
  label,
  sublabel,
  count,
  children,
}: {
  id: string;
  label: string;
  sublabel?: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="min-w-80 flex-1 md:min-w-[280px]" data-testid={`pipeline-column-${id}`}>
      <div className="mb-3 flex items-baseline justify-between border-b border-[var(--border-default)] pb-2">
        <div>
          <h3
            className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-meta)' }}
          >
            {label}
          </h3>
          {sublabel && (
            <p
              className="mt-0.5 text-[0.62rem] italic text-[var(--text-subtle)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {sublabel}
            </p>
          )}
        </div>
        <span
          className="tabular-nums text-[0.68rem] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          {count}
        </span>
      </div>

      <div
        ref={setNodeRef}
        data-testid={`pipeline-dropzone-${id}`}
        className={`flex min-h-[100px] flex-col gap-2 rounded-sm p-1 transition-colors ${
          isOver ? 'bg-[var(--bg-hover)]' : ''
        }`}
      >
        {count === 0 && (
          <p className="py-6 text-center text-[0.7rem] italic text-[var(--text-subtle)]">Empty</p>
        )}
        {children}
      </div>
    </div>
  );
}

function PipelineDraggableCard<T>({
  id,
  item,
  dragging,
  renderCard,
}: {
  id: string;
  item: T;
  dragging: boolean;
  renderCard: (item: T, opts: { dragging: boolean; dragHandleProps: DragHandleProps }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div ref={setNodeRef} data-testid={`pipeline-card-${id}`} className={isDragging ? 'opacity-30' : ''}>
      {renderCard(item, { dragging, dragHandleProps: { attributes, listeners } })}
    </div>
  );
}
