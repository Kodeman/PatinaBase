"use client";

/**
 * The rail — the agreement's table of contents, and the only place its order
 * is decided.
 *
 * Reorder has two paths on purpose. Pointer and keyboard both run through
 * dnd-kit's sortable sensors (`PointerSensor` + `KeyboardSensor`), which is
 * what the drag handle is for. `Move up` / `Move down` in the row menu are
 * the third path: they are what a jsdom test can drive (dnd-kit's drag is not
 * reliably reproducible there), and they are the fallback for anyone whose
 * pointer or keyboard sensor never engages.
 *
 * Nothing here writes. Every act mutates the composer's local list and marks
 * it dirty; one `upsert_agreement_parts` call saves the whole ordered array.
 */

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AgreementPart } from "@patina/types";
import { Input } from "@/components/ui/controls";
import { AddPartMenu } from "./add-part-menu";
import { addPartOptions, createsAuthority, partKindLabel } from "./part-kinds";

export interface PartsRailProps {
  parts: AgreementPart[];
  selectedId: string | null;
  /** Ids of parts the readiness panel is holding open. */
  blockedIds: Set<string>;
  onSelect: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onAdd: Parameters<typeof AddPartMenu>[0]["onAdd"];
  /** Composition is frozen once the agreement leaves draft (R6). */
  readOnly: boolean;
}

export function PartsRail({
  parts,
  selectedId,
  blockedIds,
  onSelect,
  onReorder,
  onRename,
  onRemove,
  onAdd,
  readOnly,
}: PartsRailProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = parts.findIndex((part) => part.id === active.id);
    const to = parts.findIndex((part) => part.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  };

  return (
    <nav aria-label="Agreement parts" className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={parts.map((part) => part.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="border-t border-[var(--doc-ink-border)]">
            {parts.map((part, index) => (
              <PartRow
                key={part.id}
                part={part}
                index={index}
                total={parts.length}
                selected={part.id === selectedId}
                blocked={blockedIds.has(part.id)}
                readOnly={readOnly}
                onSelect={onSelect}
                onReorder={onReorder}
                onRename={onRename}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {parts.length === 0 && (
        <p className="text-[12px] italic text-[var(--text-muted)]">
          This agreement has no parts yet.
        </p>
      )}

      {!readOnly && (
        <AddPartMenu options={addPartOptions(parts)} onAdd={onAdd} />
      )}
    </nav>
  );
}

function PartRow({
  part,
  index,
  total,
  selected,
  blocked,
  readOnly,
  onSelect,
  onReorder,
  onRename,
  onRemove,
}: {
  part: AgreementPart;
  index: number;
  total: number;
  selected: boolean;
  blocked: boolean;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: part.id, disabled: readOnly });
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(part.title);
  const [menuOpen, setMenuOpen] = useState(false);

  const commitRename = () => {
    setRenaming(false);
    const next = draftTitle.trim();
    if (next && next !== part.title) onRename(part.id, next);
    else setDraftTitle(part.title);
  };

  const act = (run: () => void) => {
    setMenuOpen(false);
    run();
  };

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : undefined,
      }}
      className="border-b border-[var(--doc-ink-border)]"
    >
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          aria-label={`Reorder ${part.title}`}
          disabled={readOnly}
          className="cursor-grab px-1 font-mono text-[12px] text-[var(--text-faint)] disabled:cursor-default"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>

        {renaming ? (
          <Input
            autoFocus
            aria-label={`Rename ${part.title}`}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") {
                setDraftTitle(part.title);
                setRenaming(false);
              }
            }}
            className="flex-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelect(part.id)}
            aria-current={selected ? "true" : undefined}
            className={`flex-1 text-left ${
              selected
                ? "text-[var(--color-charcoal)]"
                : "text-[var(--color-mocha)]"
            }`}
          >
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
              {partKindLabel(part.kind, part.variant)}
              {createsAuthority(part.variant) ? " · creates authority" : ""}
            </span>
            <span className="block text-[13px]">
              {part.title}
              {part.required && (
                <span
                  aria-label="Required"
                  title="Required"
                  className="ml-1.5 text-[var(--color-clay-ink)]"
                >
                  ·
                </span>
              )}
            </span>
            {blocked && (
              <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                needs attention
              </span>
            )}
          </button>
        )}

        {!readOnly && (
          <div className="relative">
            <button
              type="button"
              aria-label={`Part options for ${part.title}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="px-2 font-mono text-[13px] text-[var(--color-aged-oak)]"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-40 border border-[var(--doc-ink-border)] bg-white py-1">
                <RowMenuItem
                  onClick={() =>
                    act(() => {
                      setDraftTitle(part.title);
                      setRenaming(true);
                    })
                  }
                >
                  Rename
                </RowMenuItem>
                <RowMenuItem
                  disabled={index === 0}
                  onClick={() => act(() => onReorder(index, index - 1))}
                >
                  Move up
                </RowMenuItem>
                <RowMenuItem
                  disabled={index === total - 1}
                  onClick={() => act(() => onReorder(index, index + 1))}
                >
                  Move down
                </RowMenuItem>
                {/* R4: every part is removable, including a required one and
                    including Exclusions. Readiness is what refuses a send,
                    not the rail. */}
                <RowMenuItem onClick={() => act(() => onRemove(part.id))}>
                  Remove
                </RowMenuItem>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function RowMenuItem({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-[12px] text-[var(--color-charcoal)] hover:bg-[var(--color-parchment)] disabled:text-[var(--text-faint)]"
    >
      {children}
    </button>
  );
}
