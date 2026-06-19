'use client';

/**
 * The Discovery block editors (R66). Each is purely typed inputs — the
 * essentials cannot be filled as prose; that is the load-bearing structure
 * that makes readiness real and the proposal seed clean. The unstructured
 * read (tone, hesitations) lives in the margin Note, never here.
 */

import type {
  DiscoveryRoom,
  LifestyleRow,
  KeepItem,
  AvoidItem,
  DecisionMaker,
} from '@patina/supabase';
import {
  Field,
  Select,
  NumberInput,
  DateInput,
  ChipMultiSelect,
  KeywordChips,
  RowListEditor,
  type Option,
} from './field-kit';
import { DiscoveryFolio } from './discovery-folio';

/** The editable shape the orchestrator threads through (a draft of the row). */
export interface DiscoveryDraft {
  project_type: string | null;
  rooms: DiscoveryRoom[];
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  budget_basis: string | null;
  target_date: string | null;
  hard_date: string | null;
  start_urgency: string | null;
  style_tag_ids: string[];
  style_keywords: string[];
  lifestyle: LifestyleRow[];
  keep_items: KeepItem[];
  avoid_items: AvoidItem[];
  decision_makers: DecisionMaker[];
  site_notes: string | null;
  room_scan_id: string | null;
}

export type Commit = (patch: Partial<DiscoveryDraft>) => void;

export const PROJECT_TYPES: Option[] = [
  { value: 'full_room', label: 'Full room' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'single_piece', label: 'Single piece' },
  { value: 'staging', label: 'Staging' },
];

const ROOM_TYPES: Option[] = [
  { value: 'living', label: 'Living' },
  { value: 'dining', label: 'Dining' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'primary_bed', label: 'Primary bed' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'ensuite', label: 'Ensuite' },
  { value: 'bath', label: 'Bath' },
  { value: 'office', label: 'Office' },
  { value: 'entry', label: 'Entry' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'other', label: 'Other' },
];

const URGENCY: Option[] = [
  { value: 'asap', label: 'ASAP' },
  { value: '1_3_months', label: '1–3 months' },
  { value: '3_6_months', label: '3–6 months' },
  { value: '6_12_months', label: '6–12 months' },
  { value: 'flexible', label: 'Flexible' },
];

const BUDGET_BASIS: Option[] = [
  { value: 'all_in', label: 'All-in (design + furnishings)' },
  { value: 'furnishings_only', label: 'Furnishings only' },
  { value: 'design_fee_only', label: 'Design fee only' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asRows = (v: any[]): Record<string, any>[] => (Array.isArray(v) ? v : []);

export function ScopeEditor({ draft, commit }: { draft: DiscoveryDraft; commit: Commit }) {
  return (
    <div className="space-y-3">
      <Field label="Project type">
        <Select
          value={draft.project_type}
          onChange={(v) => commit({ project_type: v })}
          options={PROJECT_TYPES}
          placeholder="Choose a type"
        />
      </Field>
      <div>
        <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
          Rooms in scope
        </p>
        <RowListEditor
          rows={asRows(draft.rooms)}
          onChange={(rows) => commit({ rooms: rows as unknown as DiscoveryRoom[] })}
          addLabel="Add a room"
          columns={[
            { key: 'name', label: 'Room', type: 'text', placeholder: 'Living', className: 'min-w-[120px] flex-1' },
            { key: 'room_type', label: 'Type', type: 'select', options: ROOM_TYPES, className: 'min-w-[110px]' },
            { key: 'floor_area_sqft', label: 'Sq ft', type: 'number', placeholder: 'sq ft', className: 'w-[78px]' },
            { key: 'keep_as_is', label: 'Keep', type: 'checkbox' },
          ]}
        />
      </div>
    </div>
  );
}

export function BudgetEditor({ draft, commit }: { draft: DiscoveryDraft; commit: Commit }) {
  // Stored in cents; edited in whole dollars.
  const toDollars = (c: number | null) => (c == null ? null : Math.round(c / 100));
  const toCents = (d: number | null) => (d == null ? null : Math.round(d * 100));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Comfortable from">
          <NumberInput
            prefix="$"
            value={toDollars(draft.budget_min_cents)}
            onChange={(v) => commit({ budget_min_cents: toCents(v) })}
            placeholder="60,000"
          />
        </Field>
        <Field label="Up to">
          <NumberInput
            prefix="$"
            value={toDollars(draft.budget_max_cents)}
            onChange={(v) => commit({ budget_max_cents: toCents(v) })}
            placeholder="80,000"
          />
        </Field>
      </div>
      <Field label="Basis">
        <Select
          value={draft.budget_basis}
          onChange={(v) => commit({ budget_basis: v })}
          options={BUDGET_BASIS}
          placeholder="What the range covers"
        />
      </Field>
    </div>
  );
}

export function TimelineEditor({ draft, commit }: { draft: DiscoveryDraft; commit: Commit }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Target (move-in)">
        <DateInput value={draft.target_date} onChange={(v) => commit({ target_date: v })} />
      </Field>
      <Field label="Hard date (the event)">
        <DateInput value={draft.hard_date} onChange={(v) => commit({ hard_date: v })} />
      </Field>
      <Field label="Urgency to start">
        <Select
          value={draft.start_urgency}
          onChange={(v) => commit({ start_urgency: v })}
          options={URGENCY}
          placeholder="—"
        />
      </Field>
    </div>
  );
}

export function StyleEditor({
  draft,
  commit,
  styleOptions,
  designerClientId,
}: {
  draft: DiscoveryDraft;
  commit: Commit;
  styleOptions: Option[];
  designerClientId: string;
}) {
  const toggle = (id: string) => {
    const on = draft.style_tag_ids.includes(id);
    commit({
      style_tag_ids: on
        ? draft.style_tag_ids.filter((x) => x !== id)
        : [...draft.style_tag_ids, id],
    });
  };
  return (
    <div className="space-y-3">
      <Field label="Style tags (the Aesthete vocabulary)">
        <ChipMultiSelect options={styleOptions} selected={draft.style_tag_ids} onToggle={toggle} />
      </Field>
      <Field label="In their words">
        <KeywordChips
          values={draft.style_keywords}
          onChange={(v) => commit({ style_keywords: v })}
          placeholder="warm minimal, organic…"
        />
      </Field>
      <div>
        <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
          Inspiration board
        </p>
        <DiscoveryFolio designerClientId={designerClientId} />
      </div>
    </div>
  );
}

export function LifestyleEditor({ draft, commit }: { draft: DiscoveryDraft; commit: Commit }) {
  const roomOpts: Option[] = [
    { value: 'Household', label: 'Household' },
    ...draft.rooms
      .map((r) => r.name)
      .filter(Boolean)
      .map((n) => ({ value: n, label: n })),
  ];
  return (
    <div>
      <p className="mb-1 text-[11.5px] text-[var(--text-muted)]">
        Per room (or the household): who, and how they live there daily.
      </p>
      <RowListEditor
        rows={asRows(draft.lifestyle)}
        onChange={(rows) => commit({ lifestyle: rows as unknown as LifestyleRow[] })}
        addLabel="Add a room / the household"
        columns={[
          { key: 'room', label: 'Room', type: 'select', options: roomOpts, className: 'min-w-[120px]' },
          { key: 'who', label: 'Who', type: 'text', placeholder: '2 adults, toddler, dog', className: 'min-w-[140px] flex-1' },
          { key: 'how', label: 'How', type: 'text', placeholder: 'movie nights, hosts 8–10', className: 'min-w-[140px] flex-1' },
        ]}
      />
    </div>
  );
}

export function KeepAvoidEditor({ draft, commit }: { draft: DiscoveryDraft; commit: Commit }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
          Keep
        </p>
        <RowListEditor
          rows={asRows(draft.keep_items)}
          onChange={(rows) => commit({ keep_items: rows as unknown as KeepItem[] })}
          addLabel="Add a piece to keep"
          columns={[
            { key: 'label', label: 'Piece', type: 'text', placeholder: 'walnut credenza', className: 'min-w-[140px] flex-1' },
            { key: 'reason', label: 'Why', type: 'text', placeholder: 'heirloom', className: 'min-w-[120px] flex-1' },
          ]}
        />
      </div>
      <div>
        <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
          Avoid
        </p>
        <RowListEditor
          rows={asRows(draft.avoid_items)}
          onChange={(rows) => commit({ avoid_items: rows as unknown as AvoidItem[] })}
          addLabel="Add a hard no"
          columns={[
            { key: 'label', label: 'Avoid', type: 'text', placeholder: 'glass tables', className: 'min-w-[160px] flex-1' },
          ]}
        />
      </div>
    </div>
  );
}

export function DecidersEditor({ draft, commit }: { draft: DiscoveryDraft; commit: Commit }) {
  return (
    <RowListEditor
      rows={asRows(draft.decision_makers)}
      onChange={(rows) => commit({ decision_makers: rows as unknown as DecisionMaker[] })}
      addLabel="Add a decision-maker"
      columns={[
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Maya', className: 'min-w-[110px] flex-1' },
        { key: 'role', label: 'Role', type: 'text', placeholder: 'day-to-day', className: 'min-w-[110px] flex-1' },
        { key: 'approves', label: 'Approves', type: 'text', placeholder: 'big spends', className: 'min-w-[110px] flex-1' },
        { key: 'comms', label: 'Comms', type: 'text', placeholder: 'email, Fri recap', className: 'min-w-[110px] flex-1' },
      ]}
    />
  );
}

export function SiteScanEditor({
  draft,
  commit,
  scanOptions,
}: {
  draft: DiscoveryDraft;
  commit: Commit;
  scanOptions: Option[];
}) {
  return (
    <div className="space-y-3">
      <Field label="Room scan (iOS RoomPlan)">
        <Select
          value={draft.room_scan_id}
          onChange={(v) => commit({ room_scan_id: v })}
          options={scanOptions}
          placeholder={scanOptions.length ? 'Attach a scan' : 'No scans on file'}
        />
      </Field>
      <Field label="Measurements & constraints">
        <textarea
          className="w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[12.5px] text-[var(--color-charcoal)] outline-none transition-colors focus:border-[var(--color-clay)]"
          rows={2}
          value={draft.site_notes ?? ''}
          placeholder={'9\'2" ceilings · two columns in living'}
          onChange={(e) => commit({ site_notes: e.target.value || null })}
        />
      </Field>
    </div>
  );
}
