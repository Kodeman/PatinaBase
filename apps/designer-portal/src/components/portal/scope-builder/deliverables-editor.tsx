'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, IconButton } from '@/components/ui/controls';
import { useBufferedAutosave } from '@/hooks/use-buffered-autosave';
import {
  usePhaseDeliverables,
  useAddDeliverable,
  useUpdateDeliverable,
  useToggleDeliverableCompleted,
  useReorderDeliverables,
  useDeleteDeliverable,
  type PhaseDeliverable,
} from '@patina/supabase';
import {
  DragDropContext,
  SortableList,
  useSortableItem,
  reorderItems,
} from '@patina/design-system';
import type { DragEndEvent } from '@dnd-kit/core';

interface DeliverablesEditorProps {
  proposalId: string;
  phaseId: string;
}

interface DeliverableRowProps {
  deliverable: PhaseDeliverable;
  phaseId: string;
  onLabelChange: (label: string) => void;
  onLabelBlur: () => void;
  onRequiredChange: (isRequired: boolean) => void;
  onToggleCompleted: () => void;
  onDelete: () => void;
}

function DeliverableRow({
  deliverable,
  phaseId: _phaseId,
  onLabelChange,
  onLabelBlur,
  onRequiredChange,
  onToggleCompleted,
  onDelete,
}: DeliverableRowProps) {
  const sortable = useSortableItem({ id: deliverable.id });
  const [labelLocal, setLabelLocal] = useState(deliverable.label);

  // Re-sync when the server updates land back in props.
  useEffect(() => {
    setLabelLocal(deliverable.label);
  }, [deliverable.label]);

  const isCompleted = deliverable.completed_at !== null;

  return (
    <div
      ref={sortable.setNodeRef}
      style={sortable.style}
      className="group flex items-center gap-3 border-b py-2.5"
    >
      {/* Drag handle */}
      <button
        type="button"
        {...sortable.attributes}
        {...sortable.listeners}
        className="cursor-grab text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] active:cursor-grabbing group-hover:opacity-100"
        aria-label="Drag to reorder"
      >
        <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="3" r="1.2" />
          <circle cx="9" cy="3" r="1.2" />
          <circle cx="3" cy="7" r="1.2" />
          <circle cx="9" cy="7" r="1.2" />
          <circle cx="3" cy="11" r="1.2" />
          <circle cx="9" cy="11" r="1.2" />
        </svg>
      </button>

      {/* Completed checkbox */}
      <button
        type="button"
        onClick={onToggleCompleted}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border border-[var(--border-default)] hover:border-[var(--accent-primary)]"
        aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
        style={{
          backgroundColor: isCompleted ? 'var(--accent-primary)' : 'transparent',
          borderColor: isCompleted ? 'var(--accent-primary)' : undefined,
        }}
      >
        {isCompleted && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 5l2 2 4-4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Label input */}
      <input
        type="text"
        value={labelLocal}
        onChange={(e) => {
          setLabelLocal(e.target.value);
          onLabelChange(e.target.value);
        }}
        onBlur={onLabelBlur}
        className="flex-1 border-b border-transparent bg-transparent font-body text-[0.88rem] outline-none focus:border-[var(--accent-primary)]"
        style={{
          color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: isCompleted ? 'line-through' : undefined,
        }}
      />

      {/* Required toggle */}
      <label
        className="flex shrink-0 cursor-pointer items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-[var(--text-muted)]"
        title="Required deliverables block the deliverables_complete gate."
      >
        <input
          type="checkbox"
          checked={deliverable.is_required}
          onChange={(e) => onRequiredChange(e.target.checked)}
          className="h-3 w-3"
        />
        Required
      </label>

      {/* Delete */}
      <IconButton
        label="Delete deliverable"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      >
        x
      </IconButton>
    </div>
  );
}

export function DeliverablesEditor({
  proposalId,
  phaseId,
}: DeliverablesEditorProps) {
  const { data: deliverables = [], isLoading } = usePhaseDeliverables(phaseId);
  const addDeliverable = useAddDeliverable();
  const updateDeliverable = useUpdateDeliverable();
  const toggleCompleted = useToggleDeliverableCompleted();
  const reorderDeliverables = useReorderDeliverables();
  const deleteDeliverable = useDeleteDeliverable();

  const deliverableAutosave = useBufferedAutosave<
    string,
    Partial<PhaseDeliverable>
  >({
    proposalId,
    delay: 600,
    save: useCallback(
      async (deliverableId, updates) => {
        await updateDeliverable.mutateAsync({
          deliverableId,
          phaseId,
          updates,
        });
      },
      [phaseId, updateDeliverable],
    ),
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const reordered = reorderItems(deliverables, active.id, over.id);
      const orderedIds = reordered.map((d: PhaseDeliverable) => d.id);
      reorderDeliverables.mutate({ phaseId, orderedIds });
    },
    [deliverables, reorderDeliverables, phaseId]
  );

  function handleAdd() {
    addDeliverable.mutate({ phaseId, label: 'New deliverable', isRequired: true });
  }

  if (isLoading) {
    return (
      <div className="py-4 text-center font-body text-[0.78rem] text-[var(--text-muted)]">
        Loading deliverables...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="type-meta-small">Deliverables</span>
        <span className="font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
          {deliverables.filter((d: PhaseDeliverable) => d.completed_at !== null).length}
          /{deliverables.length} complete
        </span>
      </div>

      <div className="min-h-4" aria-live="polite">
        {(deliverableAutosave.state === 'dirty' ||
          deliverableAutosave.state === 'saving') && (
          <p role="status" className="type-meta-small text-[var(--text-muted)]">
            Saving deliverables…
          </p>
        )}
        {deliverableAutosave.state === 'saved' && (
          <p role="status" className="type-meta-small text-[var(--color-sage)]">
            Deliverables saved
          </p>
        )}
        {deliverableAutosave.state === 'error' && (
          <p role="alert" className="type-meta-small text-[var(--color-terracotta)]">
            {deliverableAutosave.error ?? 'Could not save the deliverable.'}
          </p>
        )}
      </div>

      {deliverables.length > 0 && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <SortableList items={deliverables.map((d: PhaseDeliverable) => d.id)}>
            {deliverables.map((d: PhaseDeliverable) => (
              <DeliverableRow
                key={d.id}
                deliverable={d}
                phaseId={phaseId}
                onLabelChange={(label) =>
                  deliverableAutosave.queue(d.id, { label })
                }
                onLabelBlur={() => void deliverableAutosave.flush(d.id)}
                onRequiredChange={(isRequired) =>
                  updateDeliverable.mutate({
                    deliverableId: d.id,
                    phaseId,
                    updates: { is_required: isRequired },
                  })
                }
                onToggleCompleted={() =>
                  toggleCompleted.mutate({
                    deliverableId: d.id,
                    phaseId,
                    completed: d.completed_at === null,
                  })
                }
                onDelete={() =>
                  deleteDeliverable.mutate({ deliverableId: d.id, phaseId })
                }
              />
            ))}
          </SortableList>
        </DragDropContext>
      )}

      {deliverables.length === 0 && (
        <p className="py-3 font-body text-[0.78rem] text-[var(--text-muted)]">
          No deliverables defined for this phase.
        </p>
      )}

      <div className="mt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAdd}
          disabled={addDeliverable.isPending}
        >
          + Add deliverable
        </Button>
      </div>
    </div>
  );
}
