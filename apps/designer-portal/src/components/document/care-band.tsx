'use client';

/**
 * The Care band (Track 7 · R80) — completion as ONE act. The Direction work
 * band's sibling (R68.1 grammar: tinted flat band, Strata-adjacent mono label,
 * one SOLID lead act, quiet seconds): the closure checklist + the portfolio
 * snapshot compose in place, and "Close the book" settles the project in a
 * single transaction (close_project, 00238).
 *
 * Where it lives: the tail of the active Project/Install section. It carries
 * its own volume control so an early project never wears a closure band —
 *   · install phases (installation / final_walkthrough): the full band opens
 *     unfolded — closing out IS the work of this stage.
 *   · earlier: one quiet mono line ("Close the book…") that unfolds on click,
 *     so a handshake project that never stages install can still settle.
 *   · completed: one settled line (the Care section owns the settled read; the
 *     line exists so the running index's `care` stop has a root to land on).
 *
 * After close: a quiet inline confirmation (R51), then the document re-derives
 * — active section flips to Care and the sections settle. No route change, no
 * toast (D2), zero shadows (D4).
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  useCoordinationItems,
  useFfeInvoiceCoverage,
  useProjectFFEItems,
  useProjectInvoices,
  useProjectPaymentMilestones,
  useProjectPhases,
  useProjectV2,
  useScopeChangeRequests,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useCloseProject } from '@/hooks/use-project-lifecycle';
import {
  centsToDollarString,
  closureReady,
  defaultClosureItems,
  deriveCloseoutReadiness,
  dollarsToCents,
  seedSnapshot,
  toggleClosureItem,
  type ClosureItem,
} from '@/lib/document/closure-derivation';
import { StrataMark } from './strata-mark';
import { DocumentAction } from './document-action';
import { RegionHead, type RegionLedgerEntry } from './region/region-head';
import { useRegionFold, type RegionDensity } from './region/use-region-fold';
import { useLensDensityStore } from '@/hooks/use-lens-density';
import { FoldSeam, focusRegionHeading } from './region/fold-seam';
import { RegionRule } from './region/region-rule';

const HEADING_ID = 'care-band-heading';
const BODY_ID = 'care-band-body';
/** The guide's care act names this checklist (`document-guide.ts`). */
const CHECKLIST_ID = 'closing-the-book';
/**
 * W2 (C-2, `document-index.ts`) — the running index's stable id for this
 * region root. Not fixed in `document-index.ts` on this branch yet
 * (`DocumentIndexKey` does not carry `'care' | 'record'` here — W2-L2 adds
 * those keys), so this is the literal fallback named by the build plan.
 */
const CARE_INDEX_HEADING_ID = 'care-region-heading';
/**
 * OD-12 — the quiet height, held at EVERY density so a body shorter than its
 * reserve cannot shrink the region on mount. W3-L3 declares both floors as
 * tokens; `-exc` is for a head that prints standing exceptions, and this head
 * prints none, so the care root takes the minimum.
 */
const QUIET_RESERVE = 'var(--doc-quiet-reserve-min)';

type AnyRecord = any;

/** What the band knows about closing out, stated once for every reader. */
export interface CloseoutState {
  ready: boolean;
  closed: number;
  total: number;
}

const FIELD_CLS =
  'w-full rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)] focus:outline-none';
const LABEL_CLS =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

function closeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Could not close the book. Try again.';
}

export function CareBand({
  projectId,
  onCloseoutReady,
  indexRoot = false,
}: {
  projectId: string;
  /** A3-L7 — the closure gate, published to the page so the guide's care rest
   *  state can be gated on it. This band is the only reader of both halves
   *  (the eight closeout queries and the checklist's own state), so it states
   *  the answer once rather than the page deriving a second one.
   *
   *  W2 fix (D-B9) — it reports the CHECKLIST too, not only the gate: the
   *  ladder's care stop prints `N OF M CLOSED OUT`, and nothing else on the
   *  page can state that pair without repeating the eight reads. */
  onCloseoutReady?: (state: CloseoutState) => void;
  /**
   * W2 (C-2) — marks this mount as the running index's `care` region root.
   * `CareBand` mounts twice (the Project section here, and again on the
   * Install section per `page.tsx:2158`); only ONE of those two may claim
   * the `care` key, or the index has two roots answering to one key. Default
   * `false` so an unmigrated caller changes nothing; the project mount
   * (`page.tsx:2134`) is the one that should pass `true`.
   */
  indexRoot?: boolean;
}) {
  const { data: project } = useProjectV2(projectId) as { data: AnyRecord };
  const { user, isLoading: authLoading } = useAuth();
  const phaseQuery = useProjectPhases(projectId);
  const coordinationQuery = useCoordinationItems(projectId);
  const scopeChangeQuery = useScopeChangeRequests(projectId);
  const ffeQuery = useProjectFFEItems(projectId);
  const coverageQuery = useFfeInvoiceCoverage(projectId);
  const milestoneQuery = useProjectPaymentMilestones(projectId);
  const invoiceQuery = useProjectInvoices(projectId);
  const closeProject = useCloseProject();

  const nearClose =
    project?.current_phase === 'installation' ||
    project?.current_phase === 'final_walkthrough';

  const [items, setItems] = useState<ClosureItem[]>(defaultClosureItems);
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [valueDollars, setValueDollars] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [rooms, setRooms] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  const operationalDataReady =
    phaseQuery.data !== undefined &&
    coordinationQuery.data !== undefined &&
    scopeChangeQuery.data !== undefined &&
    ffeQuery.data !== undefined &&
    coverageQuery.data !== undefined &&
    milestoneQuery.data !== undefined &&
    invoiceQuery.data !== undefined &&
    !phaseQuery.isError &&
    !coordinationQuery.isError &&
    !scopeChangeQuery.isError &&
    !ffeQuery.isError &&
    !coverageQuery.isError &&
    !milestoneQuery.isError &&
    !invoiceQuery.isError;
  const operational = deriveCloseoutReadiness({
    dataReady: operationalDataReady,
    projectTotalCents: project?.total_amount_cents ?? null,
    projectPhases: (phaseQuery.data ?? []) as Array<{
      id: string;
      status: string | null;
    }>,
    coordinationItems: (coordinationQuery.data ?? []) as Array<{
      id: string;
      status: string | null;
    }>,
    scopeChanges: (scopeChangeQuery.data ?? []) as Array<{
      id: string;
      status: string | null;
      applied_at: string | null;
    }>,
    ffeItems: (ffeQuery.data ?? []) as Array<{
      id: string;
      status: string | null;
      quantity: number | null;
      unit_price_cents: number | null;
      line_total_cents: number | null;
    }>,
    ffeCoverage: coverageQuery.data ?? {},
    paymentMilestones: (milestoneQuery.data ?? []) as Array<{
      id: string;
      status: string | null;
      amount_cents: number | null;
    }>,
    invoices: (invoiceQuery.data ?? []) as Array<{
      id: string;
      status: string | null;
      total_cents: number | null;
      amount_paid_cents: number | null;
    }>,
  });
  const paymentReady =
    operationalDataReady &&
    !operational.blockers.some((blocker) =>
      [
        'ffe_not_paid',
        'milestone_unpaid',
        'invoice_balance_due',
        'project_balance_due',
      ].includes(blocker.code),
    );
  // Payment is not a self-attestation: it mirrors invoice/milestone truth.
  const effectiveItems = items.map((item) =>
    item.key === 'payment'
      ? { ...item, completed: paymentReady }
      : item,
  );
  const ready = closureReady(effectiveItems, operational);
  const done = effectiveItems.filter((i) => i.completed).length;

  const total = effectiveItems.length;
  useEffect(() => {
    onCloseoutReady?.({ ready, closed: done, total });
  }, [onCloseoutReady, ready, done, total]);

  // W4 (C-8) — the lens's fourth voice. The body never reads the DOM: it
  // subscribes to the store the page-level observer writes, and the fold hook
  // resolves that against the three voices that outrank it.
  const positionDensity = useLensDensityStore('care');
  const fold = useRegionFold({
    docId: projectId,
    region: 'care',
    defaultFolded: ready === undefined ? null : !nearClose,
    forceOpen: nearClose,
    positionDensity,
  });
  const density: RegionDensity = fold.density;

  const unfoldFocusRef = useRef(false);

  useEffect(() => {
    if (!fold.folded && unfoldFocusRef.current) {
      unfoldFocusRef.current = false;
      focusRegionHeading(HEADING_ID);
    }
  }, [fold.folded]);

  // W2 (C-2) — the attributes that make this mount the running index's `care`
  // root, applied identically across every return branch below (never on
  // `RegionHead` or `FoldSeam`, which only exist in one branch each and would
  // leave the other branches unmarked). `tabIndex` is part of the pair: L-10's
  // jump focuses `regionHeadingId('care')`, and `.focus()` on an element that
  // cannot take focus is a silent no-op — the reader lands on the region with
  // focus still in the rail.
  // W4 — `data-density` is RENDERED BY REACT from the fold's answer (OD-13),
  // never written imperatively here, and the reserve rides the same root at
  // every density (OD-12). Both belong to the index root only: the second
  // `CareBand` mount is not a stop and has nothing for the lens to say.
  const indexRootAttrs = indexRoot
    ? {
        'data-index-region': 'care' as const,
        id: CARE_INDEX_HEADING_ID,
        tabIndex: -1,
        'data-density': density,
        style: { '--doc-quiet-reserve': QUIET_RESERVE } as CSSProperties,
      }
    : {};

  if (!project) return null;
  // The settled read belongs to the Care section, so the band prints no
  // checklist here — but a spread that DECLARES the care stop must give it a
  // root to land on, or the ladder prints a stop with nothing behind it.
  if (project.status === 'completed') {
    return (
      <div
        {...indexRootAttrs}
        className="mt-[var(--doc-region-gap)] rounded-[3px] bg-[rgba(168,181,160,0.16)] px-4 py-3.5"
      >
        <p className="text-[13px] text-[var(--color-charcoal)]">
          <b>The book is closed.</b>{' '}
          <span className="text-[var(--text-muted)]">
            Care holds the settled read of this project.
          </span>
        </p>
      </div>
    );
  }
  // Auth has not answered yet: no root, and the ladder says so — `mountedKeys`
  // reports the stop unmounted and it prints its name over its fallback rather
  // than a press onto nothing.
  if (authLoading) return null;

  const isProjectOwner =
    typeof project.designer_id === 'string' && project.designer_id === user?.id;
  if (!isProjectOwner) {
    const ownerName =
      typeof project.designer?.full_name === 'string' &&
      project.designer.full_name.trim()
        ? project.designer.full_name.trim()
        : 'the project owner';

    return (
      <section
        {...indexRootAttrs}
        aria-label="Project closeout ownership"
        className="mt-[var(--doc-region-gap)] border-l-2 border-[var(--color-sage)] px-3.5 py-2.5"
      >
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Project closeout · owner action
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-charcoal)]">
          Only {ownerName} can close the book. The project stays available for
          your coordination work until its owner completes closeout.
        </p>
      </section>
    );
  }

  const seed = seedSnapshot(project);

  // R51 — the quiet inline confirmation while the read models re-derive.
  if (closed) {
    return (
      <div
        {...indexRootAttrs}
        className="mt-[var(--doc-region-gap)] rounded-[3px] bg-[rgba(168,181,160,0.16)] px-4 py-3.5"
      >
        <p className="text-[13px] text-[var(--color-charcoal)]">
          <b>The book is closed.</b>{' '}
          <span className="text-[var(--text-muted)]">
            The project settles into Care — its sections fold behind it.
          </span>
        </p>
      </div>
    );
  }

  // The folded quiet line — closure stays reachable without wearing a band.
  if (fold.folded) {
    return (
      <div {...indexRootAttrs} className="mt-[var(--doc-region-gap)]">
        <RegionRule />
        <FoldSeam
          headingId={HEADING_ID}
          bodyId={BODY_ID}
          name="Closing the book"
          summary={`${done} of ${items.length} closed out`}
          cause={fold.cause}
          onUnfold={() => {
            unfoldFocusRef.current = true;
            fold.setFolded(false);
          }}
          surfaceKey="care"
          regionKey="closure-fold"
        />
      </div>
    );
  }

  const submit = () => {
    setError(null);
    closeProject.mutate(
      {
        projectId,
        closure: effectiveItems,
        snapshot: {
          headline: headline.trim(),
          description: description.trim(),
          value_cents:
            valueDollars === null
              ? seed.value_cents
              : dollarsToCents(valueDollars),
          duration: (duration ?? seed.duration).trim(),
          rooms: rooms.trim(),
        },
      },
      {
        onSuccess: () => setClosed(true),
        onError: (err) => setError(closeErrorMessage(err)),
      },
    );
  };

  const headLedger: RegionLedgerEntry[] = [
    {
      key: 'close-project',
      label: 'Close the book',
      onClick: submit,
      disabled: !ready || closeProject.isPending,
      loading: closeProject.isPending,
      loadingLabel: 'Closing…',
    },
  ];

  return (
    <div
      {...indexRootAttrs}
      className="mt-[var(--doc-region-gap)] rounded-[3px] bg-[rgba(229,221,208,0.5)] px-4 py-3.5"
    >
      <RegionRule />
      {/* The band head — R68.1: mark · mono label · reading · the solid act. */}
      <div className="flex items-center gap-4">
        <StrataMark size="lg" label="Closing the book" />
        <div className="min-w-0 flex-1">
          <RegionHead
            headingId={HEADING_ID}
            name="Closing the book"
            eyebrow="Care · closing the book"
            status={
              ready ? (
                <>
                  <b>Everything is settled</b> — close the book when
                  you&rsquo;re ready
                </>
              ) : (
                <>
                  <b>
                    {done} of {items.length} closed out
                  </b>{' '}
                  · the checklist settles this project
                </>
              )
            }
            surfaceKey="care"
            regionKey="closure"
            actions={headLedger}
          />
        </div>
      </div>

      {density === 'quiet' ? (
        <>
          <p
            data-region-count-line
            className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]"
          >
            {`${done} OF ${total} CLOSED OUT`}
          </p>
          <p className="sr-only">Quiet — opens as you read</p>
        </>
      ) : (
      <div id={BODY_ID}>
      {/* The closure checklist — square ticks that fill sage (the Work
          block's stamp grammar, not a SaaS checkbox). */}
      {operational.blockers.length > 0 && (
        <div
          role="status"
          className="mt-3 rounded-[3px] border-l-2 border-[var(--color-terracotta)] bg-[rgba(212,160,144,0.08)] px-3.5 py-2.5"
        >
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]">
            Operational closeout still open
          </p>
          <ul className="mt-1 space-y-0.5 text-[11.5px] text-[var(--color-charcoal)]">
            {operational.blockers.map((blocker) => (
              <li key={blocker.code}>· {blocker.label}</li>
            ))}
          </ul>
        </div>
      )}
      {/* The care stage's act lands on the checklist itself, not on the band's
          first inch. */}
      <ul
        id={CHECKLIST_ID}
        tabIndex={-1}
        className="mt-3 scroll-mt-16 border-t border-[rgba(139,115,85,0.14)] pt-2"
      >
        {effectiveItems.map((item) => (
          <li
            key={item.key}
            className="border-b border-dashed border-[rgba(139,115,85,0.14)]"
          >
            <button
              type="button"
              aria-disabled={item.key === 'payment'}
              onClick={() =>
                item.key !== 'payment' &&
                setItems((prev) => toggleClosureItem(prev, item.key))
              }
              className={`grid w-full grid-cols-[auto_1fr] items-baseline gap-2.5 px-1 py-1.5 text-left ${
                item.key === 'payment'
                  ? 'cursor-default'
                  : 'hover:bg-[rgba(196,165,123,0.06)]'
              }`}
            >
              <span
                aria-hidden
                className="relative top-px inline-flex h-[13px] w-[13px] items-center justify-center rounded-[3px] border-[1.5px] text-[8px] font-bold leading-none"
                style={{
                  borderColor: item.completed
                    ? 'var(--color-sage)'
                    : 'var(--doc-ink-border)',
                  background: item.completed
                    ? 'rgba(168,181,160,0.15)'
                    : 'transparent',
                  color: 'var(--color-sage)',
                }}
              >
                {item.completed ? '✓' : ''}
              </span>
              <span
                className={`text-[12px] leading-snug ${
                  item.completed
                    ? 'text-[var(--text-muted)]'
                    : 'text-[var(--color-charcoal)]'
                }`}
              >
                {item.key === 'payment'
                  ? paymentReady
                    ? 'No balance due · verified from billing'
                    : 'Final payment collected · waiting on billing'
                  : item.label}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* The portfolio snapshot — what this project becomes once it's a
          memory. Persisted by the same one act. */}
      <div className="mt-3">
        <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          The portfolio snapshot
        </p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>Headline</span>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. A prairie home reimagined — full living space redesign"
              className={FIELD_CLS}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>For the portfolio card</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Two or three sentences — the challenge, the transformation, the result."
              className={`${FIELD_CLS} resize-y`}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Project value</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-[var(--color-aged-oak)]">
                $
              </span>
              <input
                inputMode="decimal"
                value={valueDollars ?? centsToDollarString(seed.value_cents)}
                onChange={(e) => setValueDollars(e.target.value)}
                className={`${FIELD_CLS} pl-6`}
              />
            </div>
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Duration</span>
            <input
              value={duration ?? seed.duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 5 months"
              className={FIELD_CLS}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>Rooms</span>
            <input
              value={rooms}
              onChange={(e) => setRooms(e.target.value)}
              placeholder="e.g. Living room, dining room, entry"
              className={FIELD_CLS}
            />
          </label>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 text-[11.5px] text-[var(--color-terracotta-ink)]"
        >
          {error} <span className="opacity-80">The act is safe to retry.</span>
        </p>
      )}

      {!nearClose && (
        <div className="mt-3">
          <DocumentAction
            actionKey="fold-project-closure"
            surfaceKey="care"
            regionKey="closure"
            variant="tertiary"
            onClick={() => fold.setFolded(true)}
          >
            Not yet — fold it away
          </DocumentAction>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
