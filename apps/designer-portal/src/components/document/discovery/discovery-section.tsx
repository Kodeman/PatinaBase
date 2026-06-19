'use client';

/**
 * The Discovery section (R66) — a self-composing structured-capture body that
 * replaces the inert spine bar. Eight blocks fill in any order (R40 grammar);
 * the Strata Mark is the only progress device; the five essentials → "ready
 * for Direction" (a soft gate). On readiness the designer begins the Direction
 * — a seeded draft proposal (begin_direction_from_discovery, 00224) — and the
 * document re-derives Discovery→Direction, opening the Drafting Room pre-seeded.
 *
 * The margin holds only the unstructured call Note (R66's load-bearing split);
 * structured facts live in the blocks and seed the proposal field→field.
 * Zero shadows (D4).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useDiscovery,
  useUpsertDiscovery,
  useBeginDirection,
  useStyles,
  useClientRoomScans,
} from '@patina/supabase';
import { StrataMark } from '../strata-mark';
import { FacetSection } from '../rooms/drafting/facet-section';
import {
  deriveDiscoveryReadiness,
  type BlockKey,
  type DiscoveryFacts,
} from '@/lib/document/discovery-readiness';
import { formatBudgetRange } from '@/lib/document/discovery-seed';
import type { Option } from './field-kit';
import {
  ScopeEditor,
  BudgetEditor,
  TimelineEditor,
  StyleEditor,
  LifestyleEditor,
  KeepAvoidEditor,
  DecidersEditor,
  SiteScanEditor,
  type DiscoveryDraft,
} from './editors';
import { DiscoveryCallSheet } from './discovery-call-sheet';

const EMPTY_DRAFT: DiscoveryDraft = {
  project_type: null,
  rooms: [],
  budget_min_cents: null,
  budget_max_cents: null,
  budget_basis: null,
  target_date: null,
  hard_date: null,
  start_urgency: null,
  style_tag_ids: [],
  style_keywords: [],
  lifestyle: [],
  keep_items: [],
  avoid_items: [],
  decision_makers: [],
  site_notes: null,
  room_scan_id: null,
};

function toFacts(d: DiscoveryDraft): DiscoveryFacts {
  return {
    project_type: d.project_type,
    rooms: d.rooms,
    budget_max_cents: d.budget_max_cents,
    target_date: d.target_date,
    hard_date: d.hard_date,
    style_tag_ids: d.style_tag_ids,
    style_keywords: d.style_keywords,
    lifestyle: d.lifestyle,
    keep_items: d.keep_items,
    avoid_items: d.avoid_items,
    decision_makers: d.decision_makers,
    room_scan_id: d.room_scan_id,
    site_notes: d.site_notes,
  };
}

function statusFor(block: BlockKey, d: DiscoveryDraft): string {
  switch (block) {
    case 'scope':
      return d.rooms.length ? `${d.rooms.length} room${d.rooms.length > 1 ? 's' : ''}` : 'not yet';
    case 'budget':
      return d.budget_max_cents != null
        ? formatBudgetRange(d.budget_min_cents, d.budget_max_cents)
        : 'not yet';
    case 'timeline':
      return d.target_date || d.hard_date ? 'dated' : 'not yet';
    case 'style':
      return d.style_tag_ids.length || d.style_keywords.length
        ? `${d.style_tag_ids.length + d.style_keywords.length} tags`
        : 'not yet';
    case 'lifestyle':
      return d.lifestyle.length ? `${d.lifestyle.length} captured` : 'not yet';
    case 'keep_avoid':
      return d.keep_items.length || d.avoid_items.length
        ? `${d.keep_items.length} keep · ${d.avoid_items.length} avoid`
        : 'optional';
    case 'deciders':
      return d.decision_makers.length ? `${d.decision_makers.length} named` : 'optional';
    case 'site_scan':
      return d.room_scan_id ? 'scan attached' : d.site_notes ? 'noted' : 'optional';
  }
}

export function DiscoverySection({
  engagementId,
  designerId,
  clientProfileId,
  clientName,
}: {
  engagementId: string; // the designer_clients.id (Shape D)
  designerId: string;
  clientProfileId: string | null;
  clientName: string;
}) {
  const router = useRouter();
  const { data: read } = useDiscovery(engagementId);
  const upsert = useUpsertDiscovery();
  const beginDirection = useBeginDirection();
  const { data: styles } = useStyles() as { data: { id: string; name: string }[] | undefined };
  const { data: scans } = useClientRoomScans(clientProfileId ?? '') as {
    data: { id: string; name?: string | null; created_at?: string }[] | undefined;
  };

  const [draft, setDraft] = useState<DiscoveryDraft>(EMPTY_DRAFT);
  const [open, setOpen] = useState<Set<BlockKey>>(new Set());
  const [callOpen, setCallOpen] = useState(false);
  const hydrated = useRef(false);

  // Hydrate the draft once from the row (or the lead prefill) when it arrives.
  useEffect(() => {
    if (hydrated.current || !read) return;
    hydrated.current = true;
    const base = read.row ?? read.prefill ?? {};
    setDraft({ ...EMPTY_DRAFT, ...(base as Partial<DiscoveryDraft>) });
  }, [read]);

  // Debounced self-persist (no Save button). Pending patch accrues + flushes.
  const pending = useRef<Partial<DiscoveryDraft>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (Object.keys(pending.current).length === 0) return;
    const patch = pending.current;
    pending.current = {};
    upsert.mutate({ designerClientId: engagementId, designerId, patch });
  }, [engagementId, designerId, upsert]);

  const commit = useCallback(
    (patch: Partial<DiscoveryDraft>) => {
      setDraft((d) => ({ ...d, ...patch }));
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    },
    [flush]
  );

  // Flush any pending edit on unmount so nothing is lost.
  useEffect(() => () => flush(), [flush]);

  const { done, essentialsDone, ready, fill } = deriveDiscoveryReadiness(toFacts(draft));
  const alreadySeeded = Boolean(read?.row?.seeded_proposal_id);

  const styleOptions: Option[] = (styles ?? []).map((s) => ({ value: s.id, label: s.name }));
  const scanOptions: Option[] = (scans ?? []).map((s) => ({
    value: s.id,
    label: s.name || `Scan ${s.created_at?.slice(0, 10) ?? ''}`.trim(),
  }));

  const toggle = (b: BlockKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(b) ? next.delete(b) : next.add(b);
      return next;
    });
  const openBlock = (b: BlockKey) => setOpen((prev) => new Set(prev).add(b));

  const begin = () => {
    flush(); // persist any in-flight edit before seeding
    beginDirection.mutate(
      { designerClientId: engagementId },
      {
        onSuccess: (proposalId) => {
          if (proposalId) router.push(`/doc/${proposalId}`);
        },
      }
    );
  };

  const essentials: { key: BlockKey; name: string; node: React.ReactNode }[] = [
    { key: 'scope', name: 'Scope & rooms', node: <ScopeEditor draft={draft} commit={commit} /> },
    { key: 'budget', name: 'Budget comfort', node: <BudgetEditor draft={draft} commit={commit} /> },
    { key: 'timeline', name: 'Timeline', node: <TimelineEditor draft={draft} commit={commit} /> },
    {
      key: 'style',
      name: 'Style & inspiration',
      node: (
        <StyleEditor
          draft={draft}
          commit={commit}
          styleOptions={styleOptions}
          designerClientId={engagementId}
        />
      ),
    },
    { key: 'lifestyle', name: 'How they live', node: <LifestyleEditor draft={draft} commit={commit} /> },
  ];
  const deepening: { key: BlockKey; name: string; node: React.ReactNode }[] = [
    { key: 'keep_avoid', name: 'Keep & avoid', node: <KeepAvoidEditor draft={draft} commit={commit} /> },
    { key: 'deciders', name: 'Decision-makers', node: <DecidersEditor draft={draft} commit={commit} /> },
    {
      key: 'site_scan',
      name: 'The site & scan',
      node: <SiteScanEditor draft={draft} commit={commit} scanOptions={scanOptions} />,
    },
  ];

  return (
    <section>
      <div className="mb-1.5 mt-5 flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
          Discovery
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          {ready ? 'ready' : 'in progress'}
        </span>
      </div>

      {/* Readiness header — the Strata Mark fills toward Ready (R66). */}
      <div
        className={`mb-2.5 flex items-center gap-4 rounded-[3px] px-4 py-3.5 transition-colors ${
          ready ? 'bg-[rgba(168,181,160,0.16)]' : 'bg-[rgba(229,221,208,0.5)]'
        }`}
      >
        <StrataMark size="lg" fill={fill} />
        <div className="flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Working with {clientName}
          </p>
          <p className="mt-0.5 text-[14px] text-[var(--color-charcoal)]">
            {ready ? (
              <>
                <b>Ready for Direction</b> — essentials captured
              </>
            ) : (
              <>
                <b>{essentialsDone}</b> of 5 essentials captured — keep going
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={begin}
          disabled={!ready || beginDirection.isPending}
          className={`shrink-0 rounded-[3px] border px-3.5 py-2 font-mono text-[11px] tracking-[0.03em] transition-colors ${
            ready
              ? 'border-[var(--color-mocha)] bg-white text-[var(--color-mocha)] hover:bg-[var(--color-mocha)] hover:text-[#f6efe2]'
              : 'cursor-not-allowed border-[var(--color-pearl)] text-[var(--text-muted)]'
          }`}
        >
          {beginDirection.isPending
            ? 'Opening…'
            : alreadySeeded
              ? 'Open the Direction →'
              : 'Begin the Direction →'}
        </button>
      </div>

      {/* Toolrow — the call checklist + the two clip-ins. */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setCallOpen(true)}
          className="rounded-[3px] border border-[var(--color-pearl)] px-3 py-1.5 font-mono text-[11px] text-[var(--color-charcoal)] transition-colors hover:border-[var(--color-clay)]"
        >
          ▶ Run the discovery call
        </button>
        <button
          type="button"
          onClick={() => openBlock('site_scan')}
          className="rounded-[3px] border border-[var(--color-pearl)] px-3 py-1.5 font-mono text-[11px] text-[var(--color-charcoal)] transition-colors hover:border-[var(--color-clay)]"
        >
          ＋ Attach the room scan
        </button>
        <button
          type="button"
          onClick={() => openBlock('style')}
          className="rounded-[3px] border border-[var(--color-pearl)] px-3 py-1.5 font-mono text-[11px] text-[var(--color-charcoal)] transition-colors hover:border-[var(--color-clay)]"
        >
          ＋ Add inspiration
        </button>
      </div>

      <p className="mb-2 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        The essentials — structured · they open &amp; seed the proposal
        <span className="h-px flex-1 bg-[var(--color-pearl)]" />
      </p>
      {essentials.map((b) => (
        <FacetSection
          key={b.key}
          name={b.name}
          status={statusFor(b.key, draft)}
          done={done[b.key]}
          open={open.has(b.key)}
          onToggle={() => toggle(b.key)}
          accent="var(--color-clay)"
        >
          {b.node}
        </FacetSection>
      ))}

      <p className="mb-2 mt-5 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Deepen it — a sharper proposal, not required
        <span className="h-px flex-1 bg-[var(--color-pearl)]" />
      </p>
      {deepening.map((b) => (
        <FacetSection
          key={b.key}
          name={b.name}
          status={statusFor(b.key, draft)}
          done={done[b.key]}
          open={open.has(b.key)}
          onToggle={() => toggle(b.key)}
        >
          {b.node}
        </FacetSection>
      ))}

      <DiscoveryCallSheet
        open={callOpen}
        onClose={() => setCallOpen(false)}
        done={done}
        onOpenBlock={(b) => {
          openBlock(b);
          setCallOpen(false);
        }}
        designerClientId={engagementId}
      />
    </section>
  );
}
