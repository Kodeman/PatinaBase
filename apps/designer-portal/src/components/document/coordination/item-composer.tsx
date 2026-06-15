'use client';

/**
 * ItemComposer — Track 5 (the coordination band's "+ New open item").
 *
 * The matrix's #1 P0 gap, generalized: create / publish a decision of ANY of the
 * five workflow shapes (selection · rfi · submittal · signoff · punch). Modeled on
 * the Drafting Room (a self-saving facet form), NOT the legacy shadowed
 * decision-composer modal: type-picker grid → court-picker grid (gc/vendor pick a
 * concrete project_parties row) → the prompt (label varies by kind) → options
 * (selection only — the shipped DecisionOptionBuilder via the thin
 * ComposerOptionBuilder wrapper) → "what does it block?" checklist (open tasks +
 * "the phase") → due → footer "Save as draft" / "Publish →".
 *
 * RENDERED AS A DocSheet CHILD by the band (the band owns the DocSheet `open`
 * state, D1): this component receives onClose / onCreated, never `open` or a
 * route. The DocSheet frame is charcoal, so the composer renders an inner
 * bg-[var(--doc-paper)] panel (1px ink-border edges, value contrast for depth) so
 * the sheet reads as paper exactly like the prototype — zero shadows (D4).
 *
 * On publish it materializes any "save as draft" selection options into real
 * products, maps them through optionValueToInput, derives blocksKind +
 * blockedTaskIds from the blocks checklist, and calls useCreateCoordinationItem.
 */

import { useMemo, useState } from 'react';
import {
  useCreateCoordinationItem,
  type CoordinationKind,
  type Court,
  type BlocksKind,
  type ProjectParty,
} from '@patina/supabase';
import type { SectionTask } from '@/hooks/use-section-work';
import {
  ITEM_TYPE_ORDER,
  itemTypeToken,
  chipStyle,
} from './item-type';
import { courtToken, partyFor } from './party';
import { COURT_ORDER } from '@/lib/document/coordination-derivation';
import {
  emptyOption,
  optionValueToInput,
  useMaterializeDraftOptions,
  type DecisionOptionValue,
} from '@/components/portal/decision-option-builder';
import { ComposerOptionBuilder } from './composer-option-builder';

export interface ItemComposerProps {
  projectId: string;
  designerClientId: string;
  /** Selectable "what does this block?" task list (incomplete tasks). */
  tasks: SectionTask[];
  /** Court party rows for the court picker (gc/vendor concrete names). */
  parties: ProjectParty[];
  onClose: () => void;
  /** After create (draft or published) — band invalidates + closes. */
  onCreated: () => void;
}

// ─── prompt copy per kind (mirrors the prototype's compPlaceholder/label) ─────

const PROMPT_LABEL: Record<CoordinationKind, string> = {
  selection: "What's being decided",
  rfi: 'The question',
  submittal: "What's being submitted",
  signoff: 'What needs sign-off',
  punch: 'The punch item',
};

const PROMPT_PLACEHOLDER: Record<CoordinationKind, string> = {
  selection: 'e.g. Which pendant for the entry?',
  rfi: 'e.g. Confirm the tile layout at the niche before I set it.',
  submittal: 'e.g. Drapery hardware shop drawings for approval.',
  signoff: 'e.g. Final furniture plan for your approval.',
  punch: 'e.g. Touch-up paint at the north window return.',
};

// The sentinel the blocks-checklist uses for "the phase advancing" (not a task id).
const PHASE_PICK = '__phase__';

// ─── field chrome (paper grammar — DM Mono labels, 1px pearl edges) ───────────

const fieldLabelCls =
  'mb-1.5 block font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const inputCls =
  'w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.82rem] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)] focus:outline-none';

export function ItemComposer({
  projectId,
  designerClientId,
  tasks,
  parties,
  onClose,
  onCreated,
}: ItemComposerProps) {
  const createItem = useCreateCoordinationItem(projectId);
  const materializeDrafts = useMaterializeDraftOptions();

  const [kind, setKind] = useState<CoordinationKind>('selection');
  const [court, setCourt] = useState<Court>('client');
  const [courtPartyId, setCourtPartyId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [due, setDue] = useState('');
  // The checklist holds task ids and the PHASE_PICK sentinel.
  const [blocks, setBlocks] = useState<Set<string>>(() => new Set());
  // Selection options — start with the two-option floor of a real choice.
  const [options, setOptions] = useState<DecisionOptionValue[]>(() => [
    emptyOption(),
    emptyOption(),
  ]);
  const [saving, setSaving] = useState(false);

  // Only incomplete tasks are pickable as "what does this block?".
  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done'),
    [tasks],
  );

  // Parties for the currently-picked court (gc/vendor name a concrete row).
  const courtParties = useMemo(
    () =>
      court === 'gc' || court === 'vendor'
        ? parties.filter((p) => p.party_kind === court)
        : [],
    [parties, court],
  );

  const pickCourt = (c: Court) => {
    setCourt(c);
    // Auto-select the sole gc/vendor party if there's exactly one; else clear.
    if (c === 'gc' || c === 'vendor') {
      const matches = parties.filter((p) => p.party_kind === c);
      setCourtPartyId(matches.length === 1 ? matches[0].id : null);
    } else {
      setCourtPartyId(null);
    }
  };

  const toggleBlock = (id: string) =>
    setBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // blocksKind: the phase pick wins (a phase gate), else any task pick is a task
  // gate, else none. (FF&E gates are wired from the FF&E surface, not here.)
  const blocksKind: BlocksKind = blocks.has(PHASE_PICK)
    ? 'phase'
    : [...blocks].some((id) => id !== PHASE_PICK)
      ? 'task'
      : 'none';

  const blockedTaskIds = useMemo(
    () => [...blocks].filter((id) => id !== PHASE_PICK),
    [blocks],
  );

  // The footer's "where it lands" hint (mirrors the prototype's right-aligned note).
  const landsHint =
    court === 'designer'
      ? 'lands in your court'
      : `sends to ${partyFor(court, { party: courtParties.find((p) => p.id === courtPartyId) }).label}`;

  const handleCreate = async (asDraft: boolean) => {
    if (saving) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setSaving(true);

    try {
      // Selections carry options — materialize "save as draft" manual entries to
      // real products first, then map to the create input's option shape.
      let optionInput: ReturnType<typeof optionValueToInput>[] | undefined;
      if (kind === 'selection') {
        const named = options.filter((o) => o.name.trim());
        const materialized = await materializeDrafts(named);
        optionInput = materialized.map(optionValueToInput);
      }

      await createItem.mutateAsync({
        designerClientId,
        projectId,
        // The prompt IS the title (clamped — long prompts keep the row legible).
        title: trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed,
        context: trimmed.length > 80 ? trimmed : undefined,
        dueDate: due || undefined,
        coordinationKind: kind,
        court,
        courtPartyId: court === 'gc' || court === 'vendor' ? courtPartyId : null,
        blocksKind,
        blockedTaskIds: blockedTaskIds.length > 0 ? blockedTaskIds : undefined,
        options: optionInput,
        status: asDraft ? 'draft' : 'pending',
      });

      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const canSave = prompt.trim().length > 0 && !saving;

  return (
    // The inner paper panel inside DocSheet's charcoal frame: 1px ink-border edge,
    // value contrast for depth, zero shadow (D4).
    <div className="mx-auto w-full max-w-[640px] rounded-[8px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-6 py-6">
      {/* Header: the New-item chip + Playfair title + the generalize note. */}
      <div
        className="mb-1 inline-block -rotate-[1.5deg] rounded-[3px] border-[1.5px] px-[9px] py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
        style={{ borderColor: 'var(--color-clay)', color: 'var(--color-clay)' }}
      >
        New open item
      </div>
      <h2 className="mt-2 font-heading text-[1.4rem] leading-tight text-[var(--color-charcoal)]">
        Raise something that needs a decision
      </h2>
      <p className="mb-6 mt-2 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
        Pick what it is, whose court it&rsquo;s in, and what it blocks.
      </p>

      {/* ── What kind of item — the 5-type grid ── */}
      <label className={fieldLabelCls}>What kind of item</label>
      <div className="mb-5 grid grid-cols-2 gap-1.5 min-[560px]:grid-cols-5">
        {ITEM_TYPE_ORDER.map((k) => {
          const token = itemTypeToken(k);
          const on = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={on}
              className="rounded-[7px] border px-2 py-2.5 text-center transition-colors"
              style={{
                borderColor: on ? 'var(--color-clay)' : 'var(--color-pearl)',
                background: on ? 'rgba(196,165,123,0.08)' : 'transparent',
              }}
            >
              <span
                className="inline-block rounded-[3px] border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.04em]"
                style={chipStyle(k)}
              >
                {token.label}
              </span>
              <span className="mt-1.5 block text-[0.56rem] leading-tight text-[var(--color-aged-oak)]">
                {token.who}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Whose court — the 4-court grid ── */}
      <label className={fieldLabelCls}>Whose court &mdash; who owns the next move</label>
      <div className="mb-2 grid grid-cols-4 gap-1.5">
        {COURT_ORDER.map((c) => {
          const token = courtToken(c);
          const on = court === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => pickCourt(c)}
              aria-pressed={on}
              className="rounded-[7px] border px-2 py-2 text-center transition-colors"
              style={{
                borderColor: on ? 'var(--color-clay)' : 'var(--color-pearl)',
                background: on ? 'rgba(196,165,123,0.08)' : 'transparent',
              }}
            >
              <span
                aria-hidden
                className="mx-auto mb-1.5 block h-[9px] w-[9px] rounded-full"
                style={{ background: token.dotColor }}
              />
              <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.03em] text-[var(--color-charcoal)]">
                {token.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* gc/vendor: name the concrete party (a project_parties row). */}
      {(court === 'gc' || court === 'vendor') && courtParties.length > 0 && (
        <div className="mb-5">
          <label className={fieldLabelCls}>
            Which {court === 'gc' ? 'GC' : 'vendor'}
          </label>
          <select
            value={courtPartyId ?? ''}
            onChange={(e) => setCourtPartyId(e.target.value || null)}
            className={inputCls}
          >
            <option value="">Unassigned</option>
            {courtParties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
                {p.company_name ? ` · ${p.company_name}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {(court === 'gc' || court === 'vendor') && courtParties.length === 0 && (
        <p className="mb-5 mt-1 text-[0.66rem] italic text-[var(--color-aged-oak)]">
          No {court === 'gc' ? 'GC' : 'vendors'} on this project yet &mdash; it&rsquo;ll wait in the {court === 'gc' ? 'GC' : 'vendor'} court.
        </p>
      )}
      {court !== 'gc' && court !== 'vendor' && <div className="mb-5" />}

      {/* ── The prompt (label + placeholder vary by kind) ── */}
      <div className="mb-5">
        <label className={fieldLabelCls}>{PROMPT_LABEL[kind]}</label>
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={PROMPT_PLACEHOLDER[kind]}
          className={`${inputCls} resize-y`}
        />
      </div>

      {/* ── Options (selection only) — the shipped option builder ── */}
      {kind === 'selection' && (
        <div className="mb-5">
          <label className={fieldLabelCls}>Options &mdash; materialize the choices</label>
          <ComposerOptionBuilder value={options} onChange={setOptions} />
        </div>
      )}

      {/* ── What does it block? — open tasks + the phase ── */}
      <label className={fieldLabelCls}>
        What does it block?{' '}
        <span className="font-normal normal-case text-[var(--color-aged-oak)]">
          (the dependency)
        </span>
      </label>
      <div className="mb-5 flex flex-col gap-1.5">
        {openTasks.map((t) => {
          const on = blocks.has(t.id);
          const owner = courtToken(t.owner);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleBlock(t.id)}
              aria-pressed={on}
              className="flex items-center gap-2.5 rounded-[6px] border px-2.5 py-2 text-left text-[0.74rem] text-[var(--color-charcoal)] transition-colors"
              style={{
                borderColor: on ? 'var(--color-clay)' : 'var(--color-pearl)',
                background: on ? 'rgba(196,165,123,0.06)' : 'transparent',
              }}
            >
              <BlockTick on={on} />
              <span className="flex-1">{t.title}</span>
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ background: owner.dotColor }}
                />
                {owner.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => toggleBlock(PHASE_PICK)}
          aria-pressed={blocks.has(PHASE_PICK)}
          className="flex items-center gap-2.5 rounded-[6px] border px-2.5 py-2 text-left text-[0.74rem] text-[var(--color-charcoal)] transition-colors"
          style={{
            borderColor: blocks.has(PHASE_PICK) ? 'var(--color-clay)' : 'var(--color-pearl)',
            background: blocks.has(PHASE_PICK) ? 'rgba(196,165,123,0.06)' : 'transparent',
          }}
        >
          <BlockTick on={blocks.has(PHASE_PICK)} />
          <span className="flex-1">The phase advancing</span>
        </button>
      </div>

      {/* ── Due ── */}
      <div className="mb-2">
        <label className={fieldLabelCls}>Due</label>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className={`${inputCls} w-auto`}
        />
      </div>

      {/* ── Footer: Save as draft / Publish → + the lands-hint ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-[var(--doc-ink-border)] pt-4">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => handleCreate(true)}
          className="rounded-[6px] border border-[var(--color-pearl)] bg-white px-4 py-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-charcoal)] transition-colors hover:border-[var(--color-clay)] disabled:opacity-40"
        >
          Save as draft
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => handleCreate(false)}
          className="rounded-[6px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-4 py-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Publish &rarr;
        </button>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
        >
          Cancel
        </button>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
          {landsHint}
        </span>
      </div>
    </div>
  );
}

/** The block-pick tick — a square that fills clay with a ✓ when on (the
 *  prototype's `.block-pick .bx`, in the work-block tick grammar). Zero shadow. */
function BlockTick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-[13px] w-[13px] flex-shrink-0 items-center justify-center rounded-[3px] border-[1.5px] text-[8px] font-bold leading-none text-white"
      style={{
        borderColor: on ? 'var(--color-clay)' : 'var(--doc-ink-border)',
        background: on ? 'var(--color-clay)' : 'transparent',
      }}
    >
      {on ? '✓' : ''}
    </span>
  );
}
