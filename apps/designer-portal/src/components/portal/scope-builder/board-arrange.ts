import type { BoardSection } from '@patina/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers for board sections (00264) + the "Arrange" auto-layout.
//
// Sections are a data-level grouping persisted on proposal_boards.sections; an
// item belongs to a section via `data.section_id`. Nothing here touches the
// canvas or the network — the editor calls these to derive new section arrays,
// new item positions (x/y only — freeform editing keeps working afterward), and
// live section band bounds for the canvas. Kept pure so they unit-test cleanly.
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of a board item Arrange needs. `data.section_id` assigns it. */
export interface ArrangeItem {
  id: string;
  type: string;
  width: number;
  height: number | null;
  data?: { section_id?: string | null } | null;
}

export interface ArrangeOptions {
  canvasWidth: number;
  /** Space between items (px). @default 24 */
  gap?: number;
  /** Canvas edge padding (px). @default 32 */
  pad?: number;
  /** Vertical room reserved above each section's items for its label. @default 40 */
  labelBand?: number;
}

const DEFAULTS = { gap: 24, pad: 32, labelBand: 40 };

/** The section an item belongs to, or null when unassigned. */
export function itemSectionId(item: ArrangeItem): string | null {
  const id = item.data?.section_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Effective height for layout math. Items with an explicit height use it; the
 * rest get a type-based estimate (products are a square image + a label band;
 * images/scans a landscape crop) so rows stack without overlap. Exact values
 * only affect row spacing, not correctness.
 */
function effectiveHeight(item: ArrangeItem): number {
  if (item.height != null) return item.height;
  if (item.type === 'image' || item.type === 'room_scan') return Math.round(item.width * 0.72);
  return Math.round(item.width * 1.15);
}

/**
 * Auto-lay-out items into a tidy wrapping grid, grouped by section when the
 * board has any (each section's items flow in their own band below a reserved
 * label strip, in the sections' order; unassigned items trail last). Returns
 * ONLY new {id, x, y} — callers write those and freeform editing resumes. With
 * no sections it degrades to a single flow of every item.
 */
export function arrangeBoardItems(
  items: ArrangeItem[],
  sections: BoardSection[],
  options: ArrangeOptions,
): Array<{ id: string; x: number; y: number }> {
  const gap = options.gap ?? DEFAULTS.gap;
  const pad = options.pad ?? DEFAULTS.pad;
  const labelBand = options.labelBand ?? DEFAULTS.labelBand;
  const hasSections = sections.length > 0;
  const contentWidth = Math.max(1, options.canvasWidth - pad * 2);

  // Group items in section order; unassigned (or orphaned section_id) trail.
  const groups: ArrangeItem[][] = [];
  if (hasSections) {
    for (const section of sections) {
      groups.push(items.filter((it) => itemSectionId(it) === section.id));
    }
    const known = new Set(sections.map((s) => s.id));
    const orphans = items.filter((it) => {
      const sid = itemSectionId(it);
      return sid === null || !known.has(sid);
    });
    if (orphans.length > 0) groups.push(orphans);
  } else {
    groups.push(items);
  }

  const positions: Array<{ id: string; x: number; y: number }> = [];
  let cursorY = pad;

  groups.forEach((group, groupIndex) => {
    if (group.length === 0) return; // empty section reserves no space
    // Reserve label room above a section's items (not for the no-section flow
    // or the trailing orphan group, which have no band label).
    const isNamedSection = hasSections && groupIndex < sections.length;
    if (isNamedSection) cursorY += labelBand;

    let x = pad;
    let rowHeight = 0;
    for (const item of group) {
      const w = item.width;
      const h = effectiveHeight(item);
      // Wrap when the item would overflow the content width (but always place
      // at least one item per row).
      if (x > pad && x + w > pad + contentWidth) {
        x = pad;
        cursorY += rowHeight + gap;
        rowHeight = 0;
      }
      positions.push({ id: item.id, x, y: cursorY });
      x += w + gap;
      rowHeight = Math.max(rowHeight, h);
    }
    // Advance past the last row, with a wider gap between groups.
    cursorY += rowHeight + gap * (isNamedSection ? 2 : 1);
  });

  return positions;
}

/**
 * Live bounding box (logical coords) of a section's items, padded, for the
 * canvas band. Returns null when the section has no items (no band drawn). Top
 * padding is larger to leave room for the floating label. Reads current item
 * positions so the band tracks its items in freeform, not just after Arrange.
 */
export function sectionBounds(
  items: Array<ArrangeItem & { x: number; y: number }>,
  sectionId: string,
  sidePad = 16,
  topPad = 24,
): { x: number; y: number; width: number; height: number } | null {
  const members = items.filter((it) => itemSectionId(it) === sectionId);
  if (members.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of members) {
    const h = effectiveHeight(it);
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.width);
    maxY = Math.max(maxY, it.y + h);
  }

  const x = Math.max(0, minX - sidePad);
  const y = Math.max(0, minY - topPad);
  return {
    x,
    y,
    width: maxX + sidePad - x,
    height: maxY + sidePad - y,
  };
}

// ─── Section array CRUD (pure) ───────────────────────────────────────────────

/** Prefer a real UUID; fall back to a random token where crypto is absent. */
export function newSectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sec_${Math.random().toString(36).slice(2, 10)}`;
}

export function addSection(sections: BoardSection[], name: string): BoardSection[] {
  const trimmed = name.trim();
  return [...sections, { id: newSectionId(), name: trimmed || `Section ${sections.length + 1}` }];
}

export function renameSection(sections: BoardSection[], id: string, name: string): BoardSection[] {
  const trimmed = name.trim();
  return sections.map((s) => (s.id === id ? { ...s, name: trimmed || s.name } : s));
}

export function deleteSection(sections: BoardSection[], id: string): BoardSection[] {
  // Items keeping a now-orphaned section_id simply arrange as unassigned; no
  // item write is needed here.
  return sections.filter((s) => s.id !== id);
}

/** Move a section one slot toward the front (dir -1) or back (dir +1). */
export function moveSection(sections: BoardSection[], id: string, dir: -1 | 1): BoardSection[] {
  const index = sections.findIndex((s) => s.id === id);
  if (index < 0) return sections;
  const target = index + dir;
  if (target < 0 || target >= sections.length) return sections;
  const next = sections.slice();
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}
