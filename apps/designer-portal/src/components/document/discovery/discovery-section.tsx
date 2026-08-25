'use client';

/**
 * The Discovery section (R66) — a self-composing structured-capture body that
 * replaces the inert spine bar. Eight blocks fill in any order (R40 grammar);
 * the Strata Mark is the only progress device; the five essentials → "ready
 * for Direction" (a soft gate). On readiness the designer begins the Direction
 * — a seeded draft design agreement (begin_direction_from_discovery, 00224) —
 * and the act lands on the successor document, whose Direction section is now
 * the engagement's identity (J1).
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
  capturedRooms,
  capturedLifestyle,
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
import { CallPlan } from './call-plan';
import { DiscoveryScheduleLine } from './discovery-schedule-line';
import { DocumentAction, DocumentActionGroup } from '../document-action';

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
    case 'scope': {
      // F5: only rooms WITH a name count — three empty "+ Add a room" rows
      // must not read as "3 rooms".
      const rooms = capturedRooms(d.rooms).length;
      return rooms ? `${rooms} room${rooms > 1 ? 's' : ''}` : 'not yet';
    }
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
    case 'lifestyle': {
      const rows = capturedLifestyle(d.lifestyle).length;
      return rows ? `${rows} captured` : 'not yet';
    }
    case 'keep_avoid':
      return d.keep_items.length || d.avoid_items.length
        ? `${d.keep_items.length} keep · ${d.avoid_items.length} avoid`
        : 'optional';
    case 'deciders':
      return d.decision_makers.length
        ? `${d.decision_makers.length} named`
        : 'optional';
    case 'site_scan':
      return d.room_scan_id
        ? 'scan attached'
        : d.site_notes
          ? 'noted'
          : 'optional';
  }
}

export function DiscoverySection({
  engagementId,
  designerId,
  clientProfileId,
  clientName,
  projectId = null,
}: {
  engagementId: string; // the designer_clients.id (Shape D)
  designerId: string;
  clientProfileId: string | null;
  clientName: string;
  /** This document's project, when it has one — the scope the designer leg of
   *  the scan picker is filtered to. Null on a pre-project engagement, which
   *  means the picker offers the client's scans only. */
  projectId?: string | null;
}) {
  const router = useRouter();
  const { data: read } = useDiscovery(engagementId);
  const upsert = useUpsertDiscovery();
  const beginDirection = useBeginDirection();
  const { data: styles } = useStyles() as {
    data: { id: string; name: string }[] | undefined;
  };
  // `clientProfileId` is the client's auth uid — what `useClientRoomScans`
  // now resolves against directly (`room_scans.user_id`). It used to be read
  // as a `designer_clients.id`, which no caller ever passes, so the client leg
  // never returned a row on production.
  const { data: scans } = useClientRoomScans(clientProfileId ?? '', projectId) as {
    data:
      | {
          id: string;
          name?: string | null;
          created_at?: string;
          owner_kind?: 'designer' | 'client';
        }[]
      | undefined;
  };

  const [draft, setDraft] = useState<DiscoveryDraft>(EMPTY_DRAFT);
  const [open, setOpen] = useState<Set<BlockKey>>(new Set());
  const [callOpen, setCallOpen] = useState(false);
  // R83 (F2, walk 2026-07): a failed Begin-the-Direction explains itself in a
  // quiet inline band AT the act — never a toast.
  const [beginError, setBeginError] = useState<string | null>(null);
  // The act is not over when the RPC resolves — it is over when the successor
  // document has been navigated to. Held until this component unmounts under
  // the new URL, so the primary act never looks idle mid-flight.
  const [landing, setLanding] = useState(false);
  const hydrated = useRef(false);

  // Debounced, SERIALIZED self-persist (no Save button) — F3/F4 (walk 2026-07).
  // The pending patch accrues; each flush CHAINS onto the previous write so
  // saves land at the DB in commit order. Before this, concurrent in-flight
  // upserts could land out of order and a mid-typing prefix ("600" of "60000")
  // became the last write — the budget-corruption / lost-keystroke family.
  const pending = useRef<Partial<DiscoveryDraft>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  // mutateAsync is referentially stable across renders (React Query), unlike
  // the `upsert` result object — depending on the latter re-created `flush`
  // every render and made the unmount-flush effect fire per keystroke.
  const upsertAsync = upsert.mutateAsync;

  const flush = useCallback((): Promise<unknown> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (Object.keys(pending.current).length === 0) return chain.current;
    const patch = { ...pending.current };
    pending.current = {};
    // F5: content-empty rows never persist — they don't count toward the
    // essentials, and the seed RPC would otherwise turn a stray "+ Add a room"
    // click into a phantom "Room" in the proposal's scope.
    if (patch.rooms)
      patch.rooms = capturedRooms(patch.rooms) as DiscoveryDraft['rooms'];
    if (patch.lifestyle)
      patch.lifestyle = capturedLifestyle(
        patch.lifestyle,
      ) as DiscoveryDraft['lifestyle'];
    chain.current = chain.current
      .catch(() => undefined) // an earlier failed write must not wedge the chain
      .then(() =>
        upsertAsync({ designerClientId: engagementId, designerId, patch }),
      )
      .catch(() => undefined); // surfaced by the mutation's own error handling
    return chain.current;
  }, [engagementId, designerId, upsertAsync]);

  // Hydrate the draft once from the row (or the lead prefill) when it arrives.
  useEffect(() => {
    if (hydrated.current || !read) return;
    hydrated.current = true;
    const base = read.row ?? read.prefill ?? {};
    setDraft({ ...EMPTY_DRAFT, ...(base as Partial<DiscoveryDraft>) });
    // F2 (walk 2026-07): the lead-derived prefill was DISPLAYED but never
    // persisted — project_type stayed NULL server-side, so the RPC rejected
    // ("discovery not ready") while the UI read "Ready". Blur-save law: what
    // the blocks show is what the row holds — persist the non-null prefill
    // facts on first render so the shown values exist in client_discovery.
    if (!read.row && read.prefill) {
      const seeded = Object.fromEntries(
        Object.entries(read.prefill).filter(([, v]) => v != null),
      ) as Partial<DiscoveryDraft>;
      if (Object.keys(seeded).length > 0) {
        pending.current = { ...seeded, ...pending.current };
        void flush();
      }
    }
  }, [read, flush]);

  const commit = useCallback(
    (patch: Partial<DiscoveryDraft>) => {
      setDraft((d) => ({ ...d, ...patch }));
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    },
    [flush],
  );

  // Flush any pending edit on TRUE unmount so nothing is lost (via a ref —
  // an effect keyed on `flush` would run its cleanup on every dep change).
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      void flushRef.current();
    },
    [],
  );

  const { done, essentialsDone, ready, fill } = deriveDiscoveryReadiness(
    toFacts(draft),
  );
  const alreadySeeded = Boolean(read?.row?.seeded_proposal_id);

  const styleOptions: Option[] = (styles ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));
  // Wave 1P (spec §11.2): the designer's own scans now appear here too. The
  // provenance suffix appears ONLY when the union actually contributed one —
  // a picker showing only the client's scans stays byte-identical to before
  // this wave, which is what the unflagged posture rests on (FC-R10).
  const scanRows = scans ?? [];
  const hasOwnScan = scanRows.some((s) => s.owner_kind === 'designer');
  const scanOptions: Option[] = scanRows.map((s) => {
    const name = s.name || `Scan ${s.created_at?.slice(0, 10) ?? ''}`.trim();
    if (!hasOwnScan) return { value: s.id, label: name };
    return {
      value: s.id,
      label: `${name} · ${s.owner_kind === 'designer' ? 'yours' : 'from your client'}`,
    };
  });

  const toggle = (b: BlockKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(b) ? next.delete(b) : next.add(b);
      return next;
    });
  const openBlock = (b: BlockKey) => setOpen((prev) => new Set(prev).add(b));

  const begin = async () => {
    setBeginError(null);
    // AWAIT the serialized save chain — the server gate must read the FINAL
    // facts, not race a still-in-flight edit (F2).
    await flush();
    setLanding(true);
    try {
      const proposalId = await beginDirection.mutateAsync({
        designerClientId: engagementId,
      });
      // J1: the document's IDENTITY moves here. document_state keys the
      // pre-Direction row on designer_clients.id (shape D) and suppresses it
      // the moment a draft proposal exists (00327), while the successor row
      // (shape B) is keyed on the proposal. So /doc/<designerClientId> stops
      // resolving to anything at this instant — staying put renders "No
      // document answers to this name". Navigate to the successor id the RPC
      // just returned; replace, because the old name is now a dead end.
      router.replace(`/doc/${proposalId}`);
    } catch (err) {
      setLanding(false);
      // R83: the failure is explained in place, with a retry act. The RPC
      // rejects with a PostgrestError (message-shaped, not always an
      // instanceof Error) — read .message off whatever arrived.
      const message = (err as { message?: string } | null)?.message;
      setBeginError(message || 'Something went wrong beginning the Direction.');
    }
  };

  const essentials: { key: BlockKey; name: string; node: React.ReactNode }[] = [
    {
      key: 'scope',
      name: 'Scope & rooms',
      node: <ScopeEditor draft={draft} commit={commit} />,
    },
    {
      key: 'budget',
      name: 'Budget comfort',
      node: <BudgetEditor draft={draft} commit={commit} />,
    },
    {
      key: 'timeline',
      name: 'Timeline',
      node: <TimelineEditor draft={draft} commit={commit} />,
    },
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
    {
      key: 'lifestyle',
      name: 'How they live',
      node: <LifestyleEditor draft={draft} commit={commit} />,
    },
  ];
  const deepening: { key: BlockKey; name: string; node: React.ReactNode }[] = [
    {
      key: 'keep_avoid',
      name: 'Keep & avoid',
      node: <KeepAvoidEditor draft={draft} commit={commit} />,
    },
    {
      key: 'deciders',
      name: 'Decision-makers',
      node: <DecidersEditor draft={draft} commit={commit} />,
    },
    {
      key: 'site_scan',
      name: 'The site & scan',
      node: (
        <SiteScanEditor
          draft={draft}
          commit={commit}
          scanOptions={scanOptions}
        />
      ),
    },
  ];

  return (
    // Blur-save law (F4): focusout bubbles here from every block editor, so
    // leaving ANY field flushes the debounce with the field's final value —
    // the last write is always the completed entry, never a typing prefix.
    <section
      onBlur={() => {
        void flush();
      }}
    >
      <div className="mb-1.5 mt-5 flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
          Discovery
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          {ready ? 'ready' : 'in progress'}
        </span>
      </div>

      {/* Arrival Arc (R106 §5 / build-plan 2.5): the arc-born engagement's
          first honest fact — what was offered, or what was booked — plus the
          intro-thread reference. Renders nothing for a non-arc engagement. */}
      <DiscoveryScheduleLine
        designerClientId={engagementId}
        clientName={clientName}
      />

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
        <DocumentAction
          actionKey={alreadySeeded ? 'open-direction' : 'begin-direction'}
          surfaceKey="discovery"
          regionKey="readiness"
          variant="primary"
          onClick={() => void begin()}
          disabled={!ready || landing}
          loading={landing}
          loadingLabel="Opening…"
          className="shrink-0"
        >
          {alreadySeeded ? 'Open the Direction' : 'Begin the Direction'}
        </DocumentAction>
      </div>

      {/* R83 (F2): the act's failure, inline AT the act — a quiet terracotta
          band with the server's reason and a retry. Never a toast. */}
      {beginError && (
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[3px] border-l-2 border-[var(--color-terracotta)] bg-[rgba(212,160,144,0.10)] px-4 py-2.5">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[#C4836F]">
            Couldn&rsquo;t begin the Direction
          </span>
          <span className="text-[12px] leading-snug text-[var(--color-charcoal)]">
            {beginError}
          </span>
          <DocumentAction
            actionKey="retry-begin-direction"
            surfaceKey="discovery"
            regionKey="readiness-error"
            variant="primary"
            onClick={() => void begin()}
          >
            Try again
          </DocumentAction>
        </div>
      )}

      {/* Toolrow — the call checklist + the two clip-ins. */}
      <DocumentActionGroup
        surfaceKey="discovery"
        regionKey="tools"
        className="mb-5"
      >
        <DocumentAction
          actionKey="run-discovery-call"
          variant="secondary"
          onClick={() => setCallOpen(true)}
        >
          Run the discovery call
        </DocumentAction>
        <DocumentAction
          actionKey="attach-room-scan"
          variant="secondary"
          onClick={() => openBlock('site_scan')}
        >
          Attach the room scan
        </DocumentAction>
        {/* I74a — the scan door opens the Room View (`/room/[id]`), not the
            in-page 3D sheet; ?from=document is the room-origin/telemetry-attribution
            marker (room_opened origin=document lands with W3-T7). */}
        {draft.room_scan_id && (
          <DocumentAction
            actionKey="view-room-scan"
            variant="tertiary"
            onClick={() =>
              router.push(`/room/${draft.room_scan_id}?from=document&docId=${engagementId}`)
            }
          >
            View the scan
          </DocumentAction>
        )}
        <DocumentAction
          actionKey="add-inspiration"
          variant="secondary"
          onClick={() => openBlock('style')}
        >
          Add inspiration
        </DocumentAction>
      </DocumentActionGroup>

      <p className="mb-2 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        The essentials — structured · they open &amp; seed the agreement
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
          targetId={`discovery-facet-${b.key}`}
          accent="var(--color-clay)"
        >
          {b.node}
        </FacetSection>
      ))}

      <p className="mb-2 mt-5 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Deepen it — a sharper agreement, not required
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

      <CallPlan
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
