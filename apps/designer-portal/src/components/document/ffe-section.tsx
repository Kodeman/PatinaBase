'use client';

/**
 * Project / Install section (spec §6, §13 Slice 2): the FF&E table as
 * typographic lines with R2 stamps. Built from the ffe/* kit's canon —
 * useProjectFFEItems (unified query key) + STAGE_CONFIG (R2 label/color
 * source).
 *
 * R25 (Dissolve Track 1.3): rooms are how a real schedule is written —
 * room headings as Playfair-italic sub-heads (name + live allocation +
 * placed count), Strata mini-rules as dividers, lines beneath keeping every
 * existing behavior; unassigned lines fall under "Throughout · unassigned";
 * "+ Room" adds inline. Assignment happens from the line unfold (drag lands
 * as polish later — DECISIONS I25).
 *
 * R23/R24: the section head carries The Work block and the folio strip.
 *
 * R76: the schedule can BILL — the section head carries a quiet "Bill →" act
 * opening the R74b invoice composer with every uninvoiced priced line
 * pre-ticked (the Document descendant of ?ffeItemIds=), and each line wears
 * its 00187 coverage truth (invoiced · N° / paid / unpriced) as a quiet
 * mono note under the maker line. (The per-line Bill act rides the line
 * unfold — Track 11-M's surface — wired post-merge.)
 */

import Link from 'next/link';
import {
  useFfeInvoiceCoverage,
  useProjectFFEItems,
  type FfeItemCoverage,
} from '@patina/supabase';
import { openInvoiceComposer } from './accounts/invoice-overlays';
import { MobileMarginChips } from './mobile/mobile-margin-chips';
import { STAGE_CONFIG } from '@/components/portal/ffe/stages';
import type { FFEStageKey } from '@patina/types';
import { useState } from 'react';
import {
  deriveLineStamp,
  type LineStamp,
} from '@/lib/document/stamp-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { Stamp } from './stamp';
import { LineUnfold } from './line-unfold';
import { StrataMark } from './strata-mark';
import { StrataMiniRule } from './strata-mini-rule';
import { WorkBlock } from './work-block';
import { FolioStrip } from './folio-strip';
import {
  useAddDocumentRoom,
  useDocumentRooms,
} from '@/hooks/use-document-rooms';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { DocumentAction } from './document-action';

/** Warm borders need darker text ink on paper (prototype stamp treatment). */
const STAGE_INK: Partial<Record<FFEStageKey, string>> = {
  approved: '#A8895E',
  production: '#B89A2E',
  shipped: '#B89A2E',
  delivered: '#85947C',
  installed: '#85947C',
};

function stampProps(stamp: LineStamp): {
  label: string;
  color: string;
  ink?: string;
} {
  switch (stamp.kind) {
    case 'decision_due':
      return {
        label: stamp.dueDate
          ? `Decision due · ${fmtDay(stamp.dueDate)}`
          : 'Decision due',
        color: 'var(--color-terracotta)',
        ink: '#C4836F',
      };
    case 'received':
      return { label: 'Received', color: 'var(--color-sage)', ink: '#85947C' };
    case 'partial':
      // R18: the W5-T2 short receipt, surfaced — golden hour like the
      // inspection outcome it derives from.
      return {
        label: 'Partial',
        color: 'var(--color-golden-hour)',
        ink: '#B89A2E',
      };
    case 'damaged':
      // Item-grain truth only (00196): an open claim attributed to THIS line.
      return {
        label: 'Damaged',
        color: 'var(--color-terracotta)',
        ink: '#C4836F',
      };
    default: {
      const cfg = STAGE_CONFIG[stamp.kind];
      return { label: cfg.label, color: cfg.color, ink: STAGE_INK[stamp.kind] };
    }
  }
}

const UNDERWAY = new Set([
  'ordered',
  'production',
  'shipped',
  'delivered',
  'received',
  'partial',
  'installed',
]);
const COMMITTED = UNDERWAY;

type FFERow = any; // row from useProjectFFEItems (untyped hook, view-shaped)

function vendorLine(item: FFERow, stamp: LineStamp, showRoom = false): string {
  const parts: string[] = [];
  const maker = item.vendor_name ?? item.product?.brand;
  if (maker) parts.push(maker);
  if (showRoom && item.room?.name) parts.push(item.room.name);
  if (stamp.kind === 'delivered') parts.push('awaiting inspection');
  else if (
    item.eta &&
    (stamp.kind === 'ordered' ||
      stamp.kind === 'production' ||
      stamp.kind === 'shipped')
  )
    parts.push(`arrives ~${fmtDay(item.eta)}`);
  return parts.join(' · ');
}

interface LineRow {
  item: FFERow;
  stamp: LineStamp;
}

/** R76 — the line's billing truth (00187), a quiet mono note: SAGE paid,
 *  dusty-blue invoiced, muted unpriced. Never a second loud stamp. */
function coverageNote(
  item: FFERow,
  coverage: FfeItemCoverage | undefined,
): { text: string; color: string } | null {
  if (coverage && coverage.coverage === 'paid')
    return { text: 'paid', color: '#85947C' };
  if (coverage && coverage.coverage === 'invoiced')
    return {
      text: coverage.invoiceNumber
        ? `invoiced · ${coverage.invoiceNumber}`
        : 'invoiced',
      color: '#7E8FA6',
    };
  if (item.unit_price_cents === null || item.unit_price_cents === undefined)
    return { text: 'unpriced', color: 'var(--text-muted)' };
  return null;
}

function FFELine({
  item,
  stamp,
  projectId,
  projectName,
  highlightId,
  unfolded,
  onToggle,
  onAddNote,
  showRoom = false,
  coverage,
}: LineRow & {
  projectId: string;
  projectName: string;
  highlightId: string | null;
  unfolded: boolean;
  onToggle: () => void;
  onAddNote: (lineId: string) => void;
  showRoom?: boolean;
  coverage?: FfeItemCoverage;
}) {
  const sp = stampProps(stamp);
  const line = vendorLine(item, stamp, showRoom);
  const billing = coverageNote(item, coverage);
  return (
    <li className="border-b border-[var(--color-pearl)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={unfolded}
        className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-2 py-2.5 text-left transition-colors duration-150 ${
          item.id === highlightId
            ? 'bg-[rgba(196,165,123,0.08)]'
            : stamp.kind === 'decision_due'
              ? 'bg-[rgba(232,197,71,0.05)]'
              : 'hover:bg-[rgba(196,165,123,0.04)]'
        }`}
      >
        <div>
          <p className="text-[12.5px] font-medium leading-snug text-[var(--color-charcoal)]">
            {item.name}
            {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
          </p>
          {line && (
            <p className="mt-px text-[10.5px] text-[var(--text-muted)]">
              {line}
            </p>
          )}
          {/* R76: the coverage stamp — the 00187 bridge's per-line truth. */}
          {billing && (
            <p
              className="mt-px font-mono text-[8px] uppercase tracking-[0.08em]"
              style={{ color: billing.color }}
            >
              {billing.text}
            </p>
          )}
          {/* R38: the quiet, honest footprint of a piece the Engine placed. */}
          {item.added_via === 'engine' && (
            <p className="mt-px font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--color-clay)] opacity-70">
              via the Engine
            </p>
          )}
        </div>
        <Stamp label={sp.label} color={sp.color} ink={sp.ink} />
        <span className="whitespace-nowrap text-right font-heading text-[13px] font-medium text-[var(--color-charcoal)]">
          {item.line_total_cents != null ? fmtUsd(item.line_total_cents) : '—'}
        </span>
      </button>
      {/* D13: this line's margin items as chips beneath it (mobile). */}
      <MobileMarginChips
        projectId={projectId}
        proposalId={null}
        anchorKind="line"
        anchorId={item.id}
      />
      {unfolded && (
        <LineUnfold
          item={item}
          projectId={projectId}
          projectName={projectName}
          onAddNote={onAddNote}
          onFold={onToggle}
        />
      )}
    </li>
  );
}

/** R25 room heading: Playfair-italic name + allocation/progress, over a
 *  Strata mini-rule. The mark's state is the room's truth: all installed =
 *  settled, lines underway = active, empty = future. */
function RoomHeading({
  name,
  roomId,
  budgetCents,
  rows,
}: {
  name: string;
  roomId?: string;
  budgetCents: number;
  rows: LineRow[];
}) {
  const committed = rows
    .filter((r) => COMMITTED.has(r.stamp.kind))
    .reduce((s, r) => s + (r.item.line_total_cents ?? 0), 0);
  const installed = rows.filter((r) => r.stamp.kind === 'installed').length;
  const underway = rows.filter((r) => UNDERWAY.has(r.stamp.kind)).length;
  const state: 'settled' | 'active' | 'future' =
    rows.length > 0 && installed === rows.length
      ? 'settled'
      : rows.length > 0
        ? 'active'
        : 'future';

  // R33 F5 — one schedule, one vocabulary: rooms speak the section's word.
  // "Placed" retires until it can truthfully mean installed.
  const meta = [
    budgetCents > 0
      ? `committed ${fmtUsd(committed)} of ${fmtUsd(budgetCents)}`
      : null,
    rows.length > 0 ? `${underway} of ${rows.length} underway` : 'no lines yet',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      id={roomId ? `doc-room-${roomId}` : undefined}
      className="mt-4 scroll-mt-16"
    >
      <div className="flex items-baseline gap-2.5 pb-1">
        <StrataMark size="sm" state={state} />
        <h3 className="font-heading text-[13.5px] font-medium italic text-[var(--color-charcoal)]">
          {name}
        </h3>
        <span className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          {meta}
        </span>
      </div>
      {/* The Strata mini-rule divides the room from its lines (HTML §3). */}
      <StrataMiniRule className="mb-0.5 ml-[3px]" />
    </div>
  );
}

function AddRoomInline({ projectId }: { projectId: string }) {
  const addRoom = useAddDocumentRoom(projectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');

  if (!open) {
    return (
      <DocumentAction
        actionKey="open-add-project-room"
        surfaceKey="project"
        regionKey="room-list"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="mt-3"
      >
        Add room
      </DocumentAction>
    );
  }

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cents = budget
      ? Math.round(parseFloat(budget.replace(/[^0-9.]/g, '')) * 100)
      : null;
    addRoom.mutate({
      name: trimmed,
      budgetCents: cents && cents > 0 ? cents : 0,
    });
    setName('');
    setBudget('');
    setOpen(false);
  };

  return (
    <div
      className="mt-3 flex items-center gap-2 border-b border-dashed border-[var(--color-pearl)] pb-1.5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
        }
        if (e.key === 'Enter') save();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Room name"
        className="min-w-0 flex-1 bg-transparent font-heading text-[13px] italic text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)]"
      />
      <input
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        placeholder="allocation $"
        aria-label="Budget allocation (dollars)"
        className="w-24 bg-transparent text-right font-mono text-[9.5px] text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]"
      />
      <DocumentAction
        actionKey="add-project-room"
        surfaceKey="project"
        regionKey="room-capture"
        variant="primary"
        onClick={save}
        disabled={!name.trim()}
      >
        Add
      </DocumentAction>
    </div>
  );
}

export function FFESection({
  projectId,
  projectName = '',
  mode,
  highlightId = null,
  onAddNote = () => {},
  sectionKey = null,
  clientUserId = null,
  clientName = '',
  folioDrop = null,
  onFolioDropConsumed = () => {},
  sectionDragOver = false,
}: {
  projectId: string;
  projectName?: string;
  mode: 'project' | 'install';
  /** Line hovered in the margin (§13 Slice 3 anchored highlight). */
  highlightId?: string | null;
  /** Slice 4 (R14): open the margin note composer pre-anchored to a line. */
  onAddNote?: (lineId: string) => void;
  /** R23/R24: which document section this table embodies — mounts The Work
   *  block + the section folio strip under the head when present. */
  sectionKey?: SectionKey | null;
  clientUserId?: string | null;
  clientName?: string;
  /** R24: files dropped anywhere on the section, caught by the folio. */
  folioDrop?: File[] | null;
  onFolioDropConsumed?: () => void;
  sectionDragOver?: boolean;
}) {
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const { data: items, isLoading } = useProjectFFEItems(projectId) as {
    data: FFERow[] | undefined;
    isLoading: boolean;
  };
  const { data: rooms } = useDocumentRooms(
    mode === 'project' ? projectId : null,
  );
  // R76 — per-line billing truth (00187 bridge). Invalidated by every invoice
  // mutation that moves money, so the stamps stay honest without a poll.
  const { data: coverage } = useFfeInvoiceCoverage(projectId);

  const rows: LineRow[] = (items ?? []).map((item) => ({
    item,
    stamp: deriveLineStamp(item),
  }));
  const total = rows.length;
  const underway = rows.filter((r) => UNDERWAY.has(r.stamp.kind)).length;
  const installed = rows.filter((r) => r.stamp.kind === 'installed').length;

  // R76 — what the section-level Bill act would carry: priced lines not yet
  // on a live invoice (the composer re-partitions; this is the offer).
  const billableUninvoiced = (items ?? []).filter((it) => {
    if (it.unit_price_cents === null || it.unit_price_cents === undefined)
      return false;
    const cov = coverage?.[it.id];
    return !cov || cov.coverage === 'uninvoiced';
  });

  const meta =
    mode === 'install'
      ? total > 0
        ? `${installed} of ${total} installed`
        : ''
      : total > 0
        ? `${underway} of ${total} underway`
        : '';

  const sectionLabel = sectionKey
    ? sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1)
    : mode === 'install'
      ? 'Install'
      : 'Project';

  const lineProps = (row: LineRow) => ({
    ...row,
    projectId,
    projectName,
    highlightId,
    unfolded: openLineId === row.item.id,
    onToggle: () =>
      setOpenLineId(openLineId === row.item.id ? null : row.item.id),
    onAddNote,
    showRoom: !groupByRoom,
    coverage: coverage?.[row.item.id],
  });

  // R25 grouping (project mode): rooms in sort order, then Throughout.
  const groupByRoom = mode === 'project' && (rooms ?? []).length > 0;
  const roomGroups = groupByRoom
    ? (rooms ?? []).map((room) => ({
        room,
        rows: rows.filter((r) => r.item.project_room_id === room.id),
      }))
    : [];
  const unassigned = groupByRoom
    ? rows.filter(
        (r) =>
          !r.item.project_room_id ||
          !(rooms ?? []).some((rm) => rm.id === r.item.project_room_id),
      )
    : rows;

  return (
    <section>
      <div className="mb-1.5 mt-5 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
          {mode === 'install' ? 'Install' : 'Project · FF&E'}
        </h2>
        <span className="flex items-baseline gap-3">
          {meta && (
            <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              {meta}
            </span>
          )}
          {mode === 'project' && (
            <Link
              href={`/doc/${projectId}/spec-book`}
              className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:text-[var(--color-charcoal)]"
            >
              Spec book →
            </Link>
          )}
          {/* R76 — bill the schedule: the composer opens FF&E-prefilled with
              every uninvoiced priced line ticked (untick there to narrow). */}
          {billableUninvoiced.length > 0 && (
            <DocumentAction
              actionKey="bill-project-ffe"
              surfaceKey="project"
              regionKey="ffe-head"
              variant="primary"
              onClick={() =>
                openInvoiceComposer({
                  projectId,
                  initialFfeItemIds: billableUninvoiced.map(
                    (it) => it.id as string,
                  ),
                })
              }
            >
              Bill {billableUninvoiced.length} uninvoiced
            </DocumentAction>
          )}
        </span>
      </div>

      {/* R23: the quiet work block under the section head. */}
      {sectionKey && (
        <WorkBlock
          projectId={projectId}
          sectionKey={sectionKey}
          sectionLabel={sectionLabel}
          clientUserId={clientUserId}
          clientName={clientName}
        />
      )}

      {/* R24: the section's folio strip — drops on the section land here. */}
      {sectionKey && (
        <FolioStrip
          projectId={projectId}
          anchor={{ kind: 'section', sectionKey }}
          droppedFiles={folioDrop}
          onDropConsumed={onFolioDropConsumed}
          sectionDragOver={sectionDragOver}
        />
      )}

      {isLoading && (
        <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">
          Reading the schedule…
        </p>
      )}

      {!isLoading && total === 0 && (
        <p className="border-t border-[var(--color-pearl)] py-3 text-[11.5px] text-[var(--text-muted)]">
          No FF&E lines yet.
        </p>
      )}

      {groupByRoom ? (
        <>
          {roomGroups.map(({ room, rows: roomRows }) => (
            <div key={room.id}>
              <RoomHeading
                name={room.name}
                roomId={room.id}
                budgetCents={room.budget_cents}
                rows={roomRows}
              />
              <ul>
                {roomRows.map((row) => (
                  <FFELine key={row.item.id} {...lineProps(row)} />
                ))}
              </ul>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div>
              <RoomHeading
                name="Throughout · unassigned"
                budgetCents={0}
                rows={unassigned}
              />
              <ul>
                {unassigned.map((row) => (
                  <FFELine key={row.item.id} {...lineProps(row)} />
                ))}
              </ul>
            </div>
          )}
          {mode === 'project' && <AddRoomInline projectId={projectId} />}
        </>
      ) : (
        <>
          <ul>
            {rows.map((row) => (
              <FFELine key={row.item.id} {...lineProps(row)} />
            ))}
          </ul>
          {mode === 'project' && <AddRoomInline projectId={projectId} />}
        </>
      )}
    </section>
  );
}
