"use client";

/**
 * US-21 T-52 — the group heading (S3, D6, Q9; SPEC §2.6; CONTRACT §3.6).
 *
 * A heading inside a room: the shower over its six components. It is Inter 14
 * w500 with a 1px `--sheet-rule-strong` rule under it, and it carries no qty,
 * no unit, no money, no stamp and no acts (00751: a group has none of its
 * own). Its members print `↳` and sit 24px in, as a labor line does.
 *
 * `layoutLineGroups` is the one place both lenses decide the order: a group
 * prints where its first member falls, with every member gathered under it.
 * A labor line rides with its piece. A group from another room never prints
 * here, so a line placed in this room but grouped in its first room reads as
 * a plain line.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface LineGroupHeading {
  id: string;
  name: string;
}

export type LineGroupEntry<T> =
  | { kind: "heading"; group: LineGroupHeading }
  | { kind: "line"; item: T; member: boolean };

/** The mark a member (or labor) line starts with (SPEC §2.6). */
export const GROUP_MEMBER_MARK = "↳";

/**
 * Lays `items` (already in the lens's order, labor after its piece) out under
 * their headings. `groups` are the groups that print in this place.
 */
export function layoutLineGroups<T>(
  items: readonly T[],
  groups: readonly LineGroupHeading[],
  read: {
    groupId: (item: T) => string | null | undefined;
    labor: (item: T) => boolean;
  },
): LineGroupEntry<T>[] {
  const known = new Map(groups.map((g) => [g.id, g]));
  // A block is a line and the labor lines that follow it.
  const blocks: Array<{ group: LineGroupHeading | null; items: T[] }> = [];
  for (const item of items) {
    const last = blocks[blocks.length - 1];
    if (read.labor(item) && last) {
      last.items.push(item);
      continue;
    }
    blocks.push({
      group: known.get(read.groupId(item) ?? "") ?? null,
      items: [item],
    });
  }
  const entries: LineGroupEntry<T>[] = [];
  const printed = new Set<string>();
  for (const block of blocks) {
    if (!block.group) {
      for (const item of block.items)
        entries.push({ kind: "line", item, member: false });
      continue;
    }
    const { group } = block;
    if (printed.has(group.id)) continue;
    printed.add(group.id);
    entries.push({ kind: "heading", group });
    for (const member of blocks) {
      if (member.group?.id !== group.id) continue;
      for (const item of member.items)
        entries.push({ kind: "line", item, member: true });
    }
  }
  return entries;
}

/** The name cell's inset: 24px for a member or a labor line, 48px for both. */
export function memberInset(member: boolean, labor: boolean): string {
  if (member && labor) return "pl-12";
  return member || labor ? "pl-6" : "";
}

const HEADING_TEXT =
  "font-sans text-[14px] font-medium leading-[1.4] text-[var(--sheet-ink)]";
const HEADING_RULE = "border-b border-[var(--sheet-rule-strong)]";

export interface LineGroupRowProps {
  group: LineGroupHeading;
  /** `table`: a `<tr>` across `columns`; `list`: an `<li>` (the 390 cards, the Spec list). */
  variant: "table" | "list";
  columns?: number;
}

/** The heading: the group's name and nothing else. */
export function LineGroupRow({
  group,
  variant,
  columns = 1,
}: LineGroupRowProps) {
  if (variant === "list") {
    return (
      <li
        data-line-group={group.id}
        className={cn("flex min-h-[40px] items-center px-2", HEADING_RULE)}
      >
        <span className={HEADING_TEXT}>{group.name}</span>
      </li>
    );
  }
  return (
    <tr data-line-group={group.id} className={cn("h-[40px]", HEADING_RULE)}>
      <th
        scope="rowgroup"
        colSpan={columns}
        className={cn("px-2 text-left", HEADING_TEXT)}
      >
        {group.name}
      </th>
    </tr>
  );
}

export interface LineGroupDraftRowProps {
  /** The line Tab was pressed on; it goes under the heading once named. */
  lineLabel: string;
  columns: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/**
 * Tab on a line with no group above it: a heading row to name, above the line.
 * Enter (or leaving it with words in it) makes the group; Esc, or leaving it
 * blank, puts things back as they were.
 */
export function LineGroupDraftRow({
  lineLabel,
  columns,
  onCommit,
  onCancel,
}: LineGroupDraftRowProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function settle(commit: boolean) {
    if (settled.current) return;
    settled.current = true;
    const trimmed = name.trim();
    if (commit && trimmed) onCommit(trimmed);
    else onCancel();
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      settle(true);
    } else if (event.key === "Escape") {
      // Esc names nothing; it must not also leave the sheet.
      event.preventDefault();
      event.stopPropagation();
      settle(false);
    }
  }

  return (
    <tr data-line-group-draft="" className={cn("h-[40px]", HEADING_RULE)}>
      <th scope="rowgroup" colSpan={columns} className="px-0 text-left">
        <input
          ref={inputRef}
          aria-label={`Name the group for ${lineLabel}`}
          placeholder="Name the group"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => settle(true)}
          className={cn(
            "h-[40px] w-full bg-transparent px-2 outline-none placeholder:text-[var(--sheet-ink-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay-ink)]",
            HEADING_TEXT,
          )}
        />
      </th>
    </tr>
  );
}
