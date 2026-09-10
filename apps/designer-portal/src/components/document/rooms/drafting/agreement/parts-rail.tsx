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
import { DESIGN_BUILD_COPY } from "@patina/types";
import type { AgreementPart } from "@patina/types";
import { Input } from "@/components/ui/controls";
import { AddPartMenu } from "./add-part-menu";
import { addPartOptions, createsAuthority, partKindLabel } from "./part-kinds";
import { Button } from "@/components/ui/controls";
import { AuthorityChip } from "./schedules/authority-chip";

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
  /**
   * `agreement-parts && agreement-library`. Off, the footer is Wave 1's blank
   * `+ Add a part` menu and a schedule row chips only what Wave 1 chipped.
   * On, the footer opens the Library and every schedule row wears its R9
   * standing.
   */
  libraryOn?: boolean;
  /** Wave 2 footer — opens `add-part-sheet.tsx`, the Library picker (M2). */
  onOpenLibrary?: () => void;
  /** Wave 2 footer — opens `template-picker-sheet.tsx`. */
  onOpenTemplatePicker?: () => void;
  /** Wave 2 footer — `save-as-template-action.tsx`, which the composer mounts
   *  because only it knows the studio and the acting member's role (R3). */
  saveAsTemplate?: React.ReactNode;
  /**
   * Keeps ONE part in the studio's Library — the act the Library's own PARTS
   * shelf promises ("Compose an agreement, and what you write there can be
   * kept here") and that nothing in the room performed. The composer owns it
   * because only it knows the studio (R32) and the acting member's role (R3);
   * absent, the row menu offers Wave 1's four acts and nothing more.
   */
  onKeepInLibrary?: (part: AgreementPart) => void;
  /** Part ids already kept this session, so the act is offered once. */
  keptPartIds?: ReadonlySet<string>;
  /**
   * R39 — `design-build`, resolved by the composer. On, a row hidden from the
   * client says so; off, the rail is Wave 2's rail exactly, because the act
   * that can hide a part does not exist there either.
   */
  visibilityOn?: boolean;
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
  libraryOn = false,
  onOpenLibrary,
  onOpenTemplatePicker,
  saveAsTemplate,
  onKeepInLibrary,
  keptPartIds,
  visibilityOn = false,
}: PartsRailProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /**
   * The rail lists the paper. Build sheet PART 13's eleventh entry —
   * `patina.licensing_attestation`, kind `attestation` — is the GATE: a
   * studio-level record materialized at compose, never editable here, and
   * never read by the client. It rides in the composition and is saved with
   * it; it is not a page, so it is not a row. Filtering it here rather than
   * dropping it upstream is deliberate: the composer still holds it, and one
   * `upsert_agreement_parts` still writes it back.
   */
  const rows = parts.filter((part) => part.kind !== "attestation");
  const indexIn = (id: string) => parts.findIndex((part) => part.id === id);
  /** Reorder is expressed in the WHOLE composition's indices — the rail's
   *  neighbour is not necessarily the array's neighbour once a hidden row
   *  sits between them. */
  const moveRow = (from: number, to: number) => {
    const moved = rows[from];
    const target = rows[to];
    if (!moved || !target) return;
    onReorder(indexIn(moved.id), indexIn(target.id));
  };

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
          items={rows.map((part) => part.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="border-t border-[var(--doc-ink-border)]">
            {rows.map((part, index) => (
              <PartRow
                key={part.id}
                part={part}
                index={index}
                total={rows.length}
                selected={part.id === selectedId}
                blocked={blockedIds.has(part.id)}
                readOnly={readOnly}
                libraryOn={libraryOn}
                onSelect={onSelect}
                onMove={moveRow}
                onRename={onRename}
                onRemove={onRemove}
                onKeepInLibrary={onKeepInLibrary}
                kept={keptPartIds?.has(part.id) === true}
                visibilityOn={visibilityOn}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {rows.length === 0 && (
        <p className="text-[12px] italic text-[var(--text-muted)]">
          This agreement has no parts yet.
        </p>
      )}

      {!readOnly &&
        (libraryOn ? (
          <div className="space-y-1">
            <Button variant="ghost" size="sm" onClick={onOpenLibrary}>
              + Add a part
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenTemplatePicker}>
              Start from a template…
            </Button>
            {saveAsTemplate}
          </div>
        ) : (
          <AddPartMenu options={addPartOptions(parts)} onAdd={onAdd} />
        ))}
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
  libraryOn,
  onSelect,
  onMove,
  onRename,
  onRemove,
  onKeepInLibrary,
  kept,
  visibilityOn,
}: {
  part: AgreementPart;
  index: number;
  total: number;
  selected: boolean;
  blocked: boolean;
  readOnly: boolean;
  libraryOn: boolean;
  onSelect: (id: string) => void;
  /** Both indices are the RAIL's, not the composition's — the rail owns the
   *  translation, because a hidden gate row can sit between two visible
   *  neighbours. */
  onMove: (fromIndex: number, toIndex: number) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onKeepInLibrary?: (part: AgreementPart) => void;
  kept: boolean;
  visibilityOn: boolean;
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
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--ink-subtle)]">
              {partKindLabel(part.kind, part.variant)}
              {/* Wave 1 chipped only what created authority in Wave 1 (DR5:
                  `flat` and `per_phase` did not, and their editors said so).
                  Wave 2 gives every schedule part its R9 standing, including
                  `record only` — the chip and the editor still agree,
                  because in Wave 2 the fee schedules project. */}
              {libraryOn && part.kind === "schedule" ? (
                <>
                  {" · "}
                  <AuthorityChip
                    variant={part.variant}
                    className="text-[10.5px] tracking-[0.1em]"
                  />
                </>
              ) : createsAuthority(part.variant) && !libraryOn ? (
                " · creates authority"
              ) : (
                ""
              )}
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
            {visibilityOn && part.clientVisible === false && (
              <span
                data-client-visible="false"
                className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-subtle)]"
              >
                {DESIGN_BUILD_COPY.hiddenFromClient}
              </span>
            )}
            {blocked && (
              <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-subtle)]">
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
              className="px-2 font-mono text-[13px] text-[var(--ink-subtle)]"
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
                  onClick={() => act(() => onMove(index, index - 1))}
                >
                  Move up
                </RowMenuItem>
                <RowMenuItem
                  disabled={index === total - 1}
                  onClick={() => act(() => onMove(index, index + 1))}
                >
                  Move down
                </RowMenuItem>
                {onKeepInLibrary && (
                  <RowMenuItem
                    disabled={kept}
                    onClick={() => act(() => onKeepInLibrary(part))}
                  >
                    {kept ? "Kept in the Library" : "Keep in the Library"}
                  </RowMenuItem>
                )}
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
