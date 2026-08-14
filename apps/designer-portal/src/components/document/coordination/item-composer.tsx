'use client';

/**
 * ItemComposer — the one composition sheet (Track 5 + R55).
 *
 * Create / build / publish a decision of ANY of the five workflow shapes
 * (selection · rfi · submittal · signoff · punch) in any order, modeled on the
 * Drafting Room (a self-saving facet form), NOT the legacy shadowed
 * decision-composer modal. The facets compose in any order and the sheet is a
 * savable draft at every point (R40 grammar):
 *   type-picker grid → (selection) subject-matter taxonomy → court-picker grid
 *   (gc/vendor pick a concrete project_parties row) → the prompt + the
 *   client-facing context → options (selection only — the shipped
 *   DecisionOptionBuilder via ComposerOptionBuilder) → "what does it block?"
 *   (FF&E lines · open tasks · the phase) → link-to-a-phase → due → footer.
 *
 * R55 generalizes the Track-5 composer into the full decision composer:
 *   · the FF&E-line gate (blocksKind 'ffe' + blockedFfeItemIds) — publishing a
 *     blocking selection LIGHTS the decision_due stamp on the gated FF&E line;
 *   · the subject-matter taxonomy (00084 decision_type — Material/Color/…);
 *   · a separate client-facing context (R55 lists title AND context);
 *   · the phase link (00084 phase_id);
 *   · EDIT mode — re-open the composer on an unsent draft (hydrate → update →
 *     optionally publish), the R55 "editing a draft re-opens the composer".
 *
 * RENDERED AS A DocSheet CHILD (the margin "+ New" or the band own the DocSheet
 * `open` state, D1): this component receives onClose / onCreated, never `open` or
 * a route. The DocSheet frame is charcoal, so the composer renders an inner
 * bg-[var(--doc-paper)] panel (1px ink-border edges, value contrast for depth) —
 * zero shadows (D4).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useCreateCoordinationItem,
  useUpdateCoordinationItem,
  usePublishCoordinationItem,
  useDeleteCoordinationItem,
  isProjectArtifactApproval,
  type CoordinationKind,
  type CoordinationItem,
  type Court,
  type DecisionType,
  type ProjectParty,
} from '@patina/supabase';
import type { PartyKind } from '@patina/types';
import type { SectionTask } from '@/hooks/use-section-work';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { deriveBlocksKind } from '@/lib/document/coordination-derivation';
import { canDeleteDecision } from '@/lib/document/decision-edges';
import { ITEM_TYPE_ORDER, itemTypeToken, chipStyle } from './item-type';
import { courtToken, partyFor } from './party';
import { COURT_ORDER } from '@/lib/document/coordination-derivation';
import {
  emptyOption,
  optionToValue,
  optionValueToInput,
  useMaterializeDraftOptions,
  type DecisionOptionValue,
} from '@/components/portal/decision-option-builder';
import { ComposerOptionBuilder } from './composer-option-builder';
import { DateTextInput } from '../date-text-input';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { PartyMiniRow } from '../roster/party-mini-row';
import { RolodexPicker } from '../roster/rolodex-picker';

const NEW_ITEM_TYPE_ORDER = ITEM_TYPE_ORDER.filter(
  (kind) => kind !== 'signoff',
);

/** New Stage-2 approvals own sign-off authoring; historical drafts remain editable. */
export function composerItemTypeOrder(
  editItem?: Pick<CoordinationItem, 'coordination_kind'> | null,
): CoordinationKind[] {
  return editItem?.coordination_kind === 'signoff'
    ? [...ITEM_TYPE_ORDER]
    : [...NEW_ITEM_TYPE_ORDER];
}

/** An FF&E line the composer can gate (subset of project_ffe_items). */
export interface ComposerFfeItem {
  id: string;
  name: string;
  /** Which decision currently gates this line (for edit-mode hydration). */
  blocked_by_decision_id: string | null;
  /** The room label, for disambiguating same-named lines. */
  roomName?: string | null;
}

/** A project phase the composer can link to (subset of project_phases). */
export interface ComposerPhase {
  id: string;
  name: string;
}

/** Map raw project_ffe_items rows (untyped from the hook) to the gate picker's
 *  shape — id, the line name, the room label, and the current gating decision. */
export function toComposerFfeItems(rows: unknown): ComposerFfeItem[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as {
      id: string;
      name: string;
      blocked_by_decision_id?: string | null;
      room?: { name?: string | null } | null;
    };
    return {
      id: row.id,
      name: row.name,
      blocked_by_decision_id: row.blocked_by_decision_id ?? null,
      roomName: row.room?.name ?? null,
    };
  });
}

/** Map raw project_phases rows to the phase-link select's shape. */
export function toComposerPhases(rows: unknown): ComposerPhase[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as { id: string; name: string };
    return { id: row.id, name: row.name };
  });
}

export interface ItemComposerProps {
  projectId: string;
  designerClientId: string;
  /** Selectable "what does this block?" task list (incomplete tasks). */
  tasks: SectionTask[];
  /** The project's FF&E lines — the R55 FF&E-line gate picker. */
  ffeItems: ComposerFfeItem[];
  /** The project's phases — the R55 link-to-a-phase select. */
  phases: ComposerPhase[];
  /** Court party rows for the court picker (gc/vendor concrete names). */
  parties: ProjectParty[];
  /** When set, the composer re-opens on this unsent draft (R55 edit). */
  editItem?: CoordinationItem | null;
  onClose: () => void;
  /** After create / update (draft or published) — the host invalidates + closes. */
  onCreated: () => void;
  /** C4 — prefill product-linked options on a FRESH compose (rejected + alts). */
  initialOptions?: DecisionOptionValue[];
  /** C4 — prefill the prompt/title on a FRESH compose. */
  initialTitle?: string;
  /** C4 — fires with the created item (CREATE only), for the escalate back-link. */
  onCreatedItem?: (item: CoordinationItem) => void;
}

// ─── the subject-matter taxonomy (00084 decision_type) for a selection ────────

const TAXONOMY: { key: DecisionType; label: string }[] = [
  { key: 'material', label: 'Material' },
  { key: 'color', label: 'Color' },
  { key: 'product', label: 'Product' },
  { key: 'layout', label: 'Layout' },
  { key: 'substitution', label: 'Substitution' },
  { key: 'budget', label: 'Budget' },
  { key: 'approval', label: 'Approval' },
];

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

/** The scored word that opens the rolodex from the court block (flag-on only) —
 *  the portal's shared SCORED INK idiom, not a button. */
const SCORED_WORD =
  'da-score-hover min-h-11 inline-flex items-center font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-mocha)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

export function ItemComposer({
  projectId,
  designerClientId,
  tasks,
  ffeItems,
  phases,
  parties,
  editItem = null,
  onClose,
  onCreated,
  initialOptions,
  initialTitle,
  onCreatedItem,
}: ItemComposerProps) {
  const createItem = useCreateCoordinationItem(projectId);
  const updateItem = useUpdateCoordinationItem(projectId);
  const publishItem = usePublishCoordinationItem(projectId);
  const deleteItem = useDeleteCoordinationItem(projectId);
  const materializeDrafts = useMaterializeDraftOptions();
  // Call Sheet Wave 3 — the court block's <select> becomes a PartyMiniRow radio
  // list plus a way to the rolodex. Nothing else in the composer forks: the
  // state (`courtPartyId`), the auto-select-sole-match rule, and the submit
  // payload are the same in both modes by construction.
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const [pickerOpen, setPickerOpen] = useState(false);
  // A party added through the picker arrives asynchronously (the add invalidates
  // ['project-parties', projectId] and the host re-renders us with a longer
  // list). Remember the name so we can select the row the moment it lands.
  const [pendingPartyName, setPendingPartyName] = useState<string | null>(null);

  const isEdit = Boolean(editItem);
  // R87 — delete stays draft-only. A published item (pending/expired/responded)
  // is never deleted; it's reopened or resolved so the R56 audit trail survives.
  // The composer only ever re-opens on drafts today (both call sites filter to
  // status='draft'); this guard makes that invariant local to the surface.
  const canDelete = isEdit && canDeleteDecision(editItem?.status);
  // A two-tap inline confirm for the destructive delete (no modal — D1).
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // ── facet state (hydrated from editItem when re-opening a draft) ──
  const [kind, setKind] = useState<CoordinationKind>(
    editItem?.coordination_kind ?? 'selection',
  );
  const [decisionType, setDecisionType] = useState<DecisionType>(
    (editItem?.decision_type as DecisionType | null) ?? 'product',
  );
  const [court, setCourt] = useState<Court>(editItem?.court ?? 'client');
  const [courtPartyId, setCourtPartyId] = useState<string | null>(
    editItem?.court_party_id ?? null,
  );
  const [prompt, setPrompt] = useState(editItem?.title ?? initialTitle ?? '');
  const [context, setContext] = useState(editItem?.context ?? '');
  const [phaseId, setPhaseId] = useState<string | null>(
    editItem?.phase_id ?? null,
  );
  const [due, setDue] = useState(
    editItem?.due_date ? editItem.due_date.slice(0, 10) : '',
  );

  // The task/phase checklist holds task ids + the PHASE_PICK sentinel.
  const [blocks, setBlocks] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (editItem) {
      tasks.forEach((t) => {
        if (t.blocked_by_item_id === editItem.id) s.add(t.id);
      });
      if (editItem.blocks_kind === 'phase') s.add(PHASE_PICK);
    }
    return s;
  });
  // The FF&E lines this item gates (R55).
  const [ffeBlocks, setFfeBlocks] = useState<Set<string>>(() => {
    if (!editItem) return new Set();
    return new Set(
      ffeItems
        .filter((f) => f.blocked_by_decision_id === editItem.id)
        .map((f) => f.id),
    );
  });

  // Selection options — start with the two-option floor of a real choice (or the
  // draft's saved options when editing).
  const [options, setOptions] = useState<DecisionOptionValue[]>(() => {
    if (editItem?.options && editItem.options.length > 0) {
      return [...editItem.options]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(optionToValue);
    }
    // C4 — a fresh compose prefilled from a flagged line (rejected + taught alts).
    if (initialOptions && initialOptions.length > 0) return initialOptions;
    return [emptyOption(), emptyOption()];
  });
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

  // The picker's add lands here: select the freshly-added party once the host's
  // refreshed `parties` prop carries it. Never clears an existing pick.
  useEffect(() => {
    if (!pendingPartyName) return;
    const landed = courtParties.find((p) => p.display_name === pendingPartyName);
    if (!landed) return;
    setCourtPartyId(landed.id);
    setPendingPartyName(null);
  }, [pendingPartyName, courtParties]);

  const toggleBlock = (id: string) =>
    setBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleFfe = (id: string) =>
    setFfeBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const blockedTaskIds = useMemo(
    () => [...blocks].filter((id) => id !== PHASE_PICK),
    [blocks],
  );
  const blockedFfeItemIds = useMemo(() => [...ffeBlocks], [ffeBlocks]);

  // blocksKind: ffe (procurement gate — lights decision_due) > phase > task > none.
  const blocksKind = deriveBlocksKind({
    ffe: ffeBlocks.size > 0,
    phase: blocks.has(PHASE_PICK),
    task: blockedTaskIds.length > 0,
  });

  // The footer's "where it lands" hint (mirrors the prototype's right-aligned note).
  const landsHint =
    court === 'designer'
      ? 'lands in your court'
      : `sends to ${partyFor(court, { party: courtParties.find((p) => p.id === courtPartyId) }).label}`;

  // ONE copy path for the empty court — flag ON and flag OFF render this exact
  // sentence, so the composer never says two different things about the same
  // empty court.
  const emptyCourtCopy = (
    <>
      No {court === 'gc' ? 'GC' : 'vendors'} on this project yet &mdash;
      it&rsquo;ll wait in the {court === 'gc' ? 'GC' : 'vendor'} court.
    </>
  );

  const handleSave = async (asDraft: boolean) => {
    if (saving || (editItem && isProjectArtifactApproval(editItem))) return;
    const title = prompt.trim();
    if (!title) return;
    setSaving(true);

    try {
      // Selections carry options — materialize "save as draft" manual entries to
      // real products first, then map to the create/update input's option shape.
      let optionInput: ReturnType<typeof optionValueToInput>[] | undefined;
      if (kind === 'selection') {
        const named = options.filter((o) => o.name.trim());
        const materialized = await materializeDrafts(named);
        optionInput = materialized.map(optionValueToInput);
      }

      const courtPartyFinal =
        court === 'gc' || court === 'vendor' ? courtPartyId : null;
      const decisionTypeFinal = kind === 'selection' ? decisionType : undefined;

      if (editItem) {
        // EDIT — patch the draft, replace options / re-tag the gate (pass the full
        // sets, incl. empties, so removed gates clear). Then publish if asked.
        await updateItem.mutateAsync({
          itemId: editItem.id,
          expectedUpdatedAt: editItem.updated_at,
          designerClientId,
          projectId,
          title,
          context: context.trim() || null,
          dueDate: due || null,
          coordinationKind: kind,
          court,
          courtPartyId: courtPartyFinal,
          blocksKind,
          decisionType: decisionTypeFinal,
          phaseId: phaseId || null,
          options: kind === 'selection' ? (optionInput ?? []) : [],
          blockedFfeItemIds,
          blockedTaskIds,
        });
        if (!asDraft) {
          await publishItem.mutateAsync({
            itemId: editItem.id,
            designerClientId,
          });
        }
      } else {
        // CREATE — draft or publish straight to pending (one act).
        const created = await createItem.mutateAsync({
          designerClientId,
          projectId,
          title,
          context: context.trim() || undefined,
          dueDate: due || undefined,
          coordinationKind: kind,
          court,
          courtPartyId: courtPartyFinal,
          blocksKind,
          decisionType: decisionTypeFinal,
          phaseId: phaseId || null,
          options: optionInput,
          blockedFfeItemIds:
            blockedFfeItemIds.length > 0 ? blockedFfeItemIds : undefined,
          blockedTaskIds:
            blockedTaskIds.length > 0 ? blockedTaskIds : undefined,
          status: asDraft ? 'draft' : 'pending',
        });
        // C4 — hand the created decision to the host so it can link the flag.
        if (created && onCreatedItem)
          onCreatedItem(created as CoordinationItem);
      }

      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editItem || saving || isProjectArtifactApproval(editItem)) return;
    setSaving(true);
    try {
      await deleteItem.mutateAsync({ itemId: editItem.id, designerClientId });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const canSave = prompt.trim().length > 0 && !saving;

  if (editItem && isProjectArtifactApproval(editItem)) {
    return (
      <p
        role="alert"
        className="rounded-[5px] border border-[var(--color-terracotta)] bg-[var(--doc-paper)] p-3 text-[13px] text-[var(--color-charcoal)]"
      >
        This exact-artifact request belongs in the Client approvals record and
        cannot be edited with legacy decision controls.
      </p>
    );
  }

  return (
    // The inner paper panel inside DocSheet's charcoal frame: 1px ink-border edge,
    // value contrast for depth, zero shadow (D4).
    <div className="mx-auto w-full max-w-[640px] rounded-[8px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-6 py-6">
      {/* Header: the New-item chip + Playfair title. */}
      <div
        className="mb-1 inline-block -rotate-[1.5deg] rounded-[3px] border-[1.5px] px-[9px] py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
        style={{ borderColor: 'var(--color-clay)', color: 'var(--color-clay)' }}
      >
        {isEdit ? 'Edit draft' : 'New decision'}
      </div>
      <h2 className="mt-2 font-heading text-[1.4rem] leading-tight text-[var(--color-charcoal)]">
        {isEdit
          ? 'Pick this draft back up'
          : 'Raise something that needs a decision'}
      </h2>
      <p className="mb-6 mt-2 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
        Pick what it is, whose court it&rsquo;s in, and what it blocks.
      </p>

      {/* ── What kind of item — the 5-type grid ── */}
      <label className={fieldLabelCls}>What kind of item</label>
      <div className="mb-5 grid grid-cols-2 gap-1.5 min-[560px]:grid-cols-5">
        {composerItemTypeOrder(editItem).map((k) => {
          const token = itemTypeToken(k);
          const on = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={on}
              className="min-h-11 rounded-[7px] border px-2 py-2.5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
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

      {/* ── (selection) subject-matter taxonomy — 00084 decision_type ── */}
      {kind === 'selection' && (
        <div className="mb-5">
          <label className={fieldLabelCls}>
            What&rsquo;s it about{' '}
            <span className="font-normal normal-case text-[var(--color-aged-oak)]">
              (the subject)
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TAXONOMY.map((t) => {
              const on = decisionType === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setDecisionType(t.key)}
                  aria-pressed={on}
                  className="min-h-11 rounded-[5px] border px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.04em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                  style={{
                    borderColor: on
                      ? 'var(--color-clay)'
                      : 'var(--color-pearl)',
                    background: on ? 'rgba(196,165,123,0.1)' : 'transparent',
                    color: on ? 'var(--color-clay)' : 'var(--color-aged-oak)',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Whose court — the 4-court grid ── */}
      <label className={fieldLabelCls}>
        Whose court &mdash; who owns the next move
      </label>
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
              className="min-h-11 rounded-[7px] border px-2 py-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
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

      {/* gc/vendor: name the concrete party (a project_parties row).
          Flag OFF renders the shipped <select> unchanged; flag ON renders the
          same rows as PartyMiniRow radios over the same `courtPartyId`. */}
      {(court === 'gc' || court === 'vendor') &&
        courtParties.length > 0 &&
        (callSheetOn ? (
          <div className="mb-5">
            <label className={fieldLabelCls}>
              Which {court === 'gc' ? 'GC' : 'vendor'}
            </label>
            <div
              role="radiogroup"
              aria-label={`Which ${court === 'gc' ? 'GC' : 'vendor'}`}
              className="flex flex-col"
            >
              {courtParties.map((p) => (
                <PartyMiniRow
                  key={p.id}
                  name={p.display_name}
                  kind={p.party_kind}
                  trade={p.trade}
                  reach={p.profile_id ? 'account' : 'on_paper'}
                  subline={p.company_name}
                  selectable
                  selected={courtPartyId === p.id}
                  // Re-picking the chosen row clears it — the radio list's
                  // stand-in for the select's "Unassigned" option.
                  onSelect={() =>
                    setCourtPartyId(courtPartyId === p.id ? null : p.id)
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className={SCORED_WORD}
            >
              Someone new
            </button>
          </div>
        ) : (
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
        ))}
      {(court === 'gc' || court === 'vendor') &&
        courtParties.length === 0 &&
        (callSheetOn ? (
          <div className="mb-5">
            <p className="mt-1 text-[0.66rem] italic text-[var(--color-aged-oak)]">
              {emptyCourtCopy}
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className={SCORED_WORD}
            >
              Someone new
            </button>
          </div>
        ) : (
          <p className="mb-5 mt-1 text-[0.66rem] italic text-[var(--color-aged-oak)]">
            {emptyCourtCopy}
          </p>
        ))}
      {court !== 'gc' && court !== 'vendor' && <div className="mb-5" />}

      {/* The rolodex, pre-scoped to the court being filled. Mounted only while
          open so its queries stay off the composer's cold path. */}
      {callSheetOn && pickerOpen && (court === 'gc' || court === 'vendor') && (
        <RolodexPicker
          open
          onClose={() => setPickerOpen(false)}
          projectId={projectId}
          scopeKinds={[court as PartyKind]}
          onAdded={(name) => {
            setPendingPartyName(name);
            setPickerOpen(false);
          }}
        />
      )}

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

      {/* ── The client-facing context (R55: title AND context) ── */}
      <div className="mb-5">
        <label className={fieldLabelCls}>
          Context{' '}
          <span className="font-normal normal-case text-[var(--color-aged-oak)]">
            (the client sees this &mdash; optional)
          </span>
        </label>
        <textarea
          rows={2}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Why this matters, what you'd recommend, anything they should weigh."
          className={`${inputCls} resize-y`}
        />
      </div>

      {/* ── Options (selection only) — the shipped option builder ── */}
      {kind === 'selection' && (
        <div className="mb-5">
          <label className={fieldLabelCls}>
            Options &mdash; materialize the choices
          </label>
          <ComposerOptionBuilder value={options} onChange={setOptions} />
        </div>
      )}

      {/* ── What does it block? — FF&E lines + open tasks + the phase ── */}
      <label className={fieldLabelCls}>
        What does it block?{' '}
        <span className="font-normal normal-case text-[var(--color-aged-oak)]">
          (the dependency)
        </span>
      </label>
      <div className="mb-5 flex max-h-[260px] flex-col gap-1.5 overflow-y-auto pr-0.5">
        {ffeItems.map((line) => {
          const on = ffeBlocks.has(line.id);
          return (
            <button
              key={`ffe-${line.id}`}
              type="button"
              onClick={() => toggleFfe(line.id)}
              aria-pressed={on}
              className="flex items-center gap-2.5 rounded-[6px] border px-2.5 py-2 text-left text-[0.74rem] text-[var(--color-charcoal)] transition-colors"
              style={{
                borderColor: on ? 'var(--color-clay)' : 'var(--color-pearl)',
                background: on ? 'rgba(196,165,123,0.06)' : 'transparent',
              }}
            >
              <BlockTick on={on} />
              <span className="flex-1 truncate">
                {line.name}
                {line.roomName ? (
                  <span className="text-[var(--color-aged-oak)]">
                    {' '}
                    &middot; {line.roomName}
                  </span>
                ) : null}
              </span>
              <span className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
                FF&amp;E
              </span>
            </button>
          );
        })}
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
            borderColor: blocks.has(PHASE_PICK)
              ? 'var(--color-clay)'
              : 'var(--color-pearl)',
            background: blocks.has(PHASE_PICK)
              ? 'rgba(196,165,123,0.06)'
              : 'transparent',
          }}
        >
          <BlockTick on={blocks.has(PHASE_PICK)} />
          <span className="flex-1">The phase advancing</span>
        </button>
      </div>

      {/* ── Link to a phase (00084 phase_id) + Due ── */}
      <div className="mb-2 flex flex-wrap items-end gap-4">
        {phases.length > 0 && (
          <div>
            <label className={fieldLabelCls}>Phase</label>
            <select
              value={phaseId ?? ''}
              onChange={(e) => setPhaseId(e.target.value || null)}
              className={`${inputCls} w-auto`}
            >
              <option value="">No phase</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={fieldLabelCls}>Due</label>
          <DateTextInput
            value={due || null}
            onChange={(value) => setDue(value ?? '')}
            ariaLabel="Due"
            className={`${inputCls} w-auto`}
          />
        </div>
      </div>

      {/* ── Footer: Save as draft / Publish → + the lands-hint ── */}
      <DocumentActionGroup
        surfaceKey="coordination"
        regionKey="item-composer"
        className="mt-6 border-t border-[var(--doc-ink-border)] pt-4"
      >
        <DocumentAction
          actionKey="publish-coordination-item"
          variant="primary"
          disabled={!canSave}
          onClick={() => handleSave(false)}
        >
          {isEdit ? 'Publish draft' : 'Publish'}
        </DocumentAction>
        <DocumentAction
          actionKey="save-coordination-draft"
          variant="secondary"
          disabled={!canSave}
          onClick={() => handleSave(true)}
        >
          Save as draft
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-coordination-item"
          variant="tertiary"
          onClick={onClose}
        >
          Cancel
        </DocumentAction>

        {/* Delete (draft only, R87) — a two-tap inline confirm, never a modal (D1). */}
        {canDelete &&
          (confirmingDelete ? (
            <span className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
              Delete draft?
              <DocumentAction
                actionKey="confirm-delete-coordination-draft"
                variant="danger"
                disabled={saving}
                onClick={handleDelete}
              >
                Delete
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-delete-coordination-draft"
                variant="tertiary"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </DocumentAction>
            </span>
          ) : (
            <DocumentAction
              actionKey="open-delete-coordination-draft"
              variant="tertiary"
              onClick={() => setConfirmingDelete(true)}
              className="text-[var(--color-terracotta)]"
            >
              Delete
            </DocumentAction>
          ))}

        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
          {landsHint}
        </span>
      </DocumentActionGroup>
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
