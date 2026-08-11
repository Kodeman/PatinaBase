'use client';

/**
 * The margin rail (spec §5, D12): anchored items down the document's right
 * edge — and the notification model itself (D2): nothing here breaks
 * through; it accumulates quietly and the Desk re-sorts. Empty margins show
 * the R8 placeholder so the full-bleed geometry holds.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  useProjectFFEItems,
  useProjectParties,
  useProjectPhases,
  useCoordinationItems,
  useDesignerClientForClientUser,
  type CoordinationItem,
} from '@patina/supabase';
import { useSectionTasks } from '@/hooks/use-section-work';
import { useMarginItems } from '@/hooks/use-margin-items';
import {
  classifyMarginItems,
  legacyCoordinationDrafts,
  marginDecisionClassificationState,
  MarginDecisionClassificationNotice,
} from '@/lib/document/stage2-approval-exclusions';
import { useCreateMarginNote } from '@/hooks/use-margin-notes';
import {
  useMarkProjectFileChangeRead,
  useProjectFileChangeNotifications,
} from '@/hooks/use-project-file-change-notifications';
import {
  partitionMargin,
  type MarginItemRow,
} from '@/lib/document/margin-derivation';
import { todayYmd } from '@/lib/document/format';
import { MarginItem } from './margin-item';
import { MarginHandoffs, useHandoffGates } from './margin-handoff-item';
import { MarginItemBody } from './margin-bodies';
import { MarginNote } from './margin-note';
import { DocSheet, DocSheetOriginProvider } from './overlays/doc-sheet';
import { lockBodyScroll } from './overlays/body-scroll-lock';
import {
  registerManagedModalDialog,
  topActiveModalDialog,
} from './overlays/active-dialog';
import {
  ItemComposer,
  toComposerFfeItems,
  toComposerPhases,
} from './coordination/item-composer';
import { itemTypeToken } from './coordination/item-type';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';

/**
 * Ask the margin to open. Between 1180px and 1440px the rail is a closed,
 * `inert` sheet, so an anchor inside it cannot be focused until it opens — a
 * guide action naming a margin control has to raise the drawer first.
 */
export const OPEN_MARGIN_EVENT = 'document:open-margin' as const;

export function openMarginRail(): void {
  window.dispatchEvent(new CustomEvent(OPEN_MARGIN_EVENT));
}

const COMPACT_MARGIN_QUERY = '(min-width: 1180px)';
const FULL_MARGIN_QUERY = '(min-width: 1440px)';
const FOCUSABLE_MARGIN_CONTROLS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The responsive edge around the margin's existing content.
 *
 * At laptop widths the margin is an on-demand paper sheet, keeping the work
 * canvas intact. At 1440px it settles back into the document grid as the
 * familiar sticky rail. The content stays mounted across both modes so notes,
 * open folds, and draft composers do not reset during a resize.
 */
export function ResponsiveMarginRail({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isCompactShell, setIsCompactShell] = useState(false);
  const [isFullRail, setIsFullRail] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const [isTopModal, setIsTopModal] = useState(true);

  useEffect(() => {
    const compactMedia = window.matchMedia(COMPACT_MARGIN_QUERY);
    const fullMedia = window.matchMedia(FULL_MARGIN_QUERY);
    const syncMode = () => {
      setIsCompactShell(compactMedia.matches);
      setIsFullRail(fullMedia.matches);
      if (!compactMedia.matches || fullMedia.matches) {
        setOpen(false);
      } else if (topActiveModalDialog()?.dataset.docSheetOrigin === 'margin') {
        setOpen(true);
      }
    };

    syncMode();
    compactMedia.addEventListener('change', syncMode);
    fullMedia.addEventListener('change', syncMode);
    return () => {
      compactMedia.removeEventListener('change', syncMode);
      fullMedia.removeEventListener('change', syncMode);
    };
  }, []);

  useEffect(() => {
    const onOpenRequest = () => setOpen(true);
    window.addEventListener(OPEN_MARGIN_EVENT, onOpenRequest);
    return () => window.removeEventListener(OPEN_MARGIN_EVENT, onOpenRequest);
  }, []);

  useEffect(() => {
    if (!open || !isCompactShell || isFullRail) return;

    const panel = panelRef.current;
    const returnFocusTarget = triggerRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      const topDialog = topActiveModalDialog();
      if (!topDialog || topDialog === panel) closeRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const topDialog = topActiveModalDialog();
      if (topDialog && topDialog !== panel) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !panel) return;
      const focusScope = panel;
      const controls = Array.from(
        focusScope.querySelectorAll<HTMLElement>(FOCUSABLE_MARGIN_CONTROLS),
      ).filter((control) => !control.hasAttribute('disabled'));
      if (controls.length === 0) {
        event.preventDefault();
        focusScope.focus();
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        document.activeElement === focusScope ||
        !focusScope.contains(document.activeElement)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown, true);
      if (
        window.matchMedia(COMPACT_MARGIN_QUERY).matches &&
        !window.matchMedia(FULL_MARGIN_QUERY).matches
      ) {
        window.requestAnimationFrame(() => returnFocusTarget?.focus());
      }
    };
  }, [isCompactShell, isFullRail, open]);

  const openAsSheet = isCompactShell && !isFullRail && open;
  const visible = isFullRail || openAsSheet;

  useEffect(() => {
    const panel = panelRef.current;
    if (!openAsSheet || !panel) return;
    return registerManagedModalDialog(panel, setIsTopModal);
  }, [openAsSheet]);

  // The compact margin is modal, so it joins the same ref-counted body lock as
  // any DocSheet opened inside it. Sharing the counter keeps the page locked if
  // a breakpoint settles the margin into its rail while a nested sheet remains.
  useEffect(() => {
    if (!openAsSheet) return;
    return lockBodyScroll();
  }, [openAsSheet]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-controls={`${titleId}-panel`}
        aria-expanded={openAsSheet}
        onClick={() => setOpen(true)}
        data-margin-trigger
        className="group fixed right-0 top-28 z-[30] hidden min-h-11 min-w-11 items-center gap-2 rounded-l-[4px] border border-r-0 border-[var(--color-pearl)] bg-[rgba(250,247,242,0.96)] px-3 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)] hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] min-[1180px]:inline-flex min-[1440px]:hidden"
      >
        <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
          Margin
        </span>
        <span aria-hidden>←</span>
      </button>

      {openAsSheet && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[31] hidden cursor-default bg-[rgba(44,40,37,0.08)] min-[1180px]:block min-[1440px]:hidden"
        />
      )}

      <aside
        ref={panelRef}
        id={`${titleId}-panel`}
        role={openAsSheet ? 'dialog' : undefined}
        aria-modal={openAsSheet && isTopModal ? true : undefined}
        aria-label={isFullRail ? 'Margin' : undefined}
        aria-labelledby={openAsSheet ? titleId : undefined}
        aria-hidden={!visible || (openAsSheet && !isTopModal)}
        inert={!visible || (openAsSheet && !isTopModal) ? true : undefined}
        tabIndex={openAsSheet ? -1 : undefined}
        data-margin-panel
        data-margin-mode={isFullRail ? 'rail' : 'sheet'}
        className={`z-[32] hidden border-[var(--color-pearl)] bg-[rgba(250,247,242,0.98)] motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transition-none min-[1180px]:fixed min-[1180px]:inset-y-0 min-[1180px]:right-0 min-[1180px]:block min-[1180px]:h-screen min-[1180px]:w-[min(360px,calc(100vw-56px))] min-[1180px]:overflow-y-auto min-[1180px]:border-l min-[1440px]:sticky min-[1440px]:top-0 min-[1440px]:col-start-3 min-[1440px]:h-screen min-[1440px]:w-auto min-[1440px]:translate-x-0 min-[1440px]:overflow-y-auto min-[1440px]:bg-[rgba(250,247,242,0.55)] ${
          openAsSheet
            ? 'min-[1180px]:translate-x-0 min-[1180px]:pointer-events-auto'
            : 'min-[1180px]:translate-x-full min-[1180px]:pointer-events-none min-[1440px]:pointer-events-auto'
        }`}
      >
        <div className="sticky top-0 z-[1] flex min-h-14 items-center justify-between border-b border-[var(--color-pearl)] bg-[var(--doc-paper)] px-4 min-[1440px]:hidden">
          <p
            id={titleId}
            className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]"
          >
            In the margin
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close margin"
            data-margin-close
            className="group inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)] hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
              Close
            </span>
          </button>
        </div>
        <div className="px-4 pb-24 pt-4 min-[1440px]:pt-6">
          <DocSheetOriginProvider origin="margin">
            {children}
          </DocSheetOriginProvider>
        </div>
      </aside>
    </>
  );
}

export function MarginRail({
  projectId,
  proposalId,
  clientName,
  clientUserId = null,
  onHoverLine,
  pendingNoteAnchor = null,
  onNoteAnchorConsumed = () => {},
  approvalSurfaceMounted = false,
  now,
}: {
  projectId: string | null;
  proposalId: string | null;
  clientName: string;
  /** Whether the Stage-2 approval ceremony is mounted on this document; the
   *  gates' `open` act dispatches to it and is withheld when it is not. */
  approvalSurfaceMounted?: boolean;
  /** The document's one clock, so the margin stamp and the guide sentence
   *  cannot disagree across a midnight. */
  now: Date;
  /** The client's AUTH uid (row.client_profile_id) — resolves designer_clients.id
   *  for the R55 decision composer's INSERT (the same FK the band resolves). */
  clientUserId?: string | null;
  onHoverLine: (lineId: string | null) => void;
  /** R14: a line unfold asked for a note — open the composer pre-anchored. */
  pendingNoteAnchor?: string | null;
  onNoteAnchorConsumed?: () => void;
}) {
  const { data: items, isLoading } = useMarginItems(projectId, proposalId);
  const handoffGates = useHandoffGates({ projectId, clientName, now });
  const coordinationQuery = useCoordinationItems(projectId);
  const coordItems = coordinationQuery.data;
  const classificationState = marginDecisionClassificationState({
    projectId,
    coordinationItems: coordItems,
    isLoading:
      coordinationQuery.isLoading === true ||
      coordinationQuery.isPending === true,
    isError: coordinationQuery.isError === true,
  });
  const classifiedMargin = useMemo(
    () =>
      classifyMarginItems(items ?? [], coordItems ?? [], classificationState),
    [classificationState, coordItems, items],
  );
  const visibleItems = classifiedMargin.items;
  const { data: fileChanges } = useProjectFileChangeNotifications(projectId);
  const markFileChangeRead = useMarkProjectFileChangeRead();
  const [openId, setOpenId] = useState<string | null>(null);
  const [settledOpen, setSettledOpen] = useState(false);

  // R12 ordering: needs-action floats → anchor order → "Settled · N" fold.
  // Line anchors rank by the document's rendered FF&E order (shared cache
  // with FFESection — same query key). The full rows also feed the R55
  // composer's FF&E-line gate picker.
  const { data: ffeItems } = useProjectFFEItems(projectId ?? '');
  const { raised, settled } = useMemo(() => {
    const lineRank = new Map<string, number>();
    ((ffeItems ?? []) as Array<{ id: string }>).forEach((it, i) =>
      lineRank.set(it.id, i),
    );
    return partitionMargin(visibleItems, new Date(), { lineRank });
  }, [visibleItems, ffeItems]);

  // ── R55: the decision composer, opened from the margin "+ New" ──
  // designer_clients.id resolution (the band's pattern) — the composer INSERT
  // needs the FK, not the raw client auth uid. null until the resolver lands.
  const { data: designerClient } = useDesignerClientForClientUser(
    clientUserId ?? '',
  );
  const designerClientId = designerClient?.id ?? null;
  const canCompose = Boolean(projectId && designerClientId);

  const { data: parties } = useProjectParties(projectId ?? '');
  const { data: phaseRows } = useProjectPhases(projectId ?? '');
  const { data: tasks } = useSectionTasks(projectId ?? '');

  const composerFfe = useMemo(() => toComposerFfeItems(ffeItems), [ffeItems]);
  const composerPhases = useMemo(
    () => toComposerPhases(phaseRows),
    [phaseRows],
  );
  const draftItems = useMemo(
    () => legacyCoordinationDrafts(coordItems ?? []),
    [coordItems],
  );

  // The composer sheet: a new decision, or re-opening an unsent draft (R55).
  const [composer, setComposer] = useState<
    { mode: 'new' } | { mode: 'edit'; item: CoordinationItem } | null
  >(null);
  const [draftsOpen, setDraftsOpen] = useState(false);

  // ── Note capture (R14: ≤5 seconds — one tap, type, save) ──
  const createNote = useCreateMarginNote();
  const [composing, setComposing] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  // Dates default to today (Kody, 2026-06-12). A kept default makes the
  // note dued-today — it joins needs-action at 5pm (R12/R14 interplay).
  const [noteDue, setNoteDue] = useState(todayYmd());
  const [noteAnchorLine, setNoteAnchorLine] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingNoteAnchor) return;
    setComposing(true);
    setNoteAnchorLine(pendingNoteAnchor);
    onNoteAnchorConsumed();
  }, [pendingNoteAnchor, onNoteAnchorConsumed]);

  const saveNote = () => {
    if (!noteBody.trim()) return;
    createNote.mutate(
      {
        projectId,
        proposalId,
        body: noteBody.trim(),
        anchorKind: noteAnchorLine ? 'line' : 'letterhead',
        anchorId: noteAnchorLine,
        dueDate: noteDue ? new Date(`${noteDue}T17:00:00`).toISOString() : null,
      },
      {
        onSuccess: () => {
          setComposing(false);
          setNoteBody('');
          setNoteDue(todayYmd());
          setNoteAnchorLine(null);
        },
      },
    );
  };

  const decisionRows = visibleItems.filter((i) => i.kind === 'decision');

  const bodyFor = (row: MarginItemRow) => (
    <MarginItemBody
      row={row}
      projectId={projectId}
      clientName={clientName}
      decisionRows={decisionRows}
    />
  );

  const renderItem = (row: MarginItemRow) => {
    const expandable = row.kind !== 'time';
    return (
      <MarginItem
        key={`${row.kind}-${row.item_id}`}
        row={row}
        open={openId === row.item_id}
        targetId={row.kind === 'pulse' ? 'document-pulse-control-desktop' : undefined}
        onToggle={
          expandable
            ? () => setOpenId((v) => (v === row.item_id ? null : row.item_id))
            : undefined
        }
        onHoverAnchor={onHoverLine}
      >
        {bodyFor(row)}
      </MarginItem>
    );
  };

  return (
    <>
      {/* R94 — the document's one first-touch note (help-desk Wave 1, copy
          §E.2): what the margin is, and the Esc/timer contract. Projects only
          (the timer claim is only true with a project in hand); the primitive
          owns once-only + recede. */}
      {projectId && (
        <MarginNote noteKey="doc-first-touch" className="mb-5">
          The margin on the right is where decisions and money gather. Esc puts
          the document down — and the hours log themselves while it&apos;s in
          your hand.
        </MarginNote>
      )}
      {fileChanges.map((change) => (
        <MarginNote
          key={change.eventKey}
          noteKey={`file-change:${change.id}`}
          seen={Boolean(change.readAt)}
          onSeen={() => {
            void markFileChangeRead(change.id).catch(() => undefined);
          }}
          caption={`${change.projectName} · ${new Date(change.occurredAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}`}
          className="mb-4"
        >
          {change.actorName} changed {change.fileName}.
        </MarginNote>
      ))}
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
          In the margin
        </p>
        <DocumentActionGroup
          surfaceKey="open-document"
          regionKey="margin-capture"
          aria-label="Margin capture actions"
        >
          {canCompose && (
            <DocumentAction
              actionKey="new-margin-decision"
              variant="secondary"
              onClick={() => setComposer({ mode: 'new' })}
            >
              + Decision
            </DocumentAction>
          )}
          <DocumentAction
            actionKey="new-margin-note"
            variant="secondary"
            onClick={() => setComposing((v) => !v)}
          >
            + Note
          </DocumentAction>
        </DocumentActionGroup>
      </div>

      <MarginDecisionClassificationNotice
        state={classifiedMargin.decisionState}
      />

      {/* R55: unsent drafts live here — editable in the margin until published. */}
      {draftItems.length > 0 && (
        <div className="mb-2">
          <button
            type="button"
            aria-expanded={draftsOpen}
            onClick={() => setDraftsOpen((v) => !v)}
            className="group mb-1 inline-flex min-h-11 min-w-11 items-center font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)] transition-colors hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
          >
            <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
              Drafts · {draftItems.length} {draftsOpen ? '↑' : '↓'}
            </span>
          </button>
          {draftsOpen && (
            <div className="flex flex-col gap-1">
              {draftItems.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setComposer({ mode: 'edit', item: d })}
                  className="group flex min-h-11 min-w-11 items-center gap-2 px-2 py-1.5 text-left text-[14px] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                >
                  <span
                    className="inline-block rounded-[2px] border px-1 py-px font-mono text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-charcoal)]"
                    style={{ borderColor: 'var(--color-pearl)' }}
                  >
                    {itemTypeToken(d.coordination_kind).label}
                  </span>
                  <span className="flex-1 truncate">
                    {d.title || 'Untitled draft'}
                  </span>
                  <span className="da-score-hover font-mono text-[12px] uppercase tracking-[0.05em] text-[var(--color-charcoal)] transition-colors group-hover:text-[var(--color-clay)] group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100 motion-reduce:transition-none">
                    edit
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {composing && (
        <div
          className="mb-2 rounded-[5px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] p-3"
          style={{ borderLeft: '2.5px solid var(--color-aged-oak)' }}
        >
          <textarea
            rows={2}
            autoFocus
            placeholder={
              noteAnchorLine ? 'Note on this line…' : 'Note to the margin…'
            }
            aria-label="Note body"
            className="w-full resize-none rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1.5 text-[16px] leading-relaxed text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote();
            }}
          />
          <DocumentActionRow
            surfaceKey="open-document"
            regionKey="margin-note"
            className="mt-1.5"
            aria-label="Margin note actions"
          >
            <input
              type="date"
              aria-label="Note due date (optional)"
              className="rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1 text-[16px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
              value={noteDue}
              onChange={(e) => setNoteDue(e.target.value)}
            />
            <DocumentAction
              actionKey="save-margin-note"
              variant="primary"
              disabled={!noteBody.trim() || createNote.isPending}
              loading={createNote.isPending}
              loadingLabel="Saving…"
              onClick={saveNote}
            >
              Save
            </DocumentAction>
            <DocumentAction
              actionKey="discard-margin-note"
              variant="tertiary"
              onClick={() => {
                setComposing(false);
                setNoteAnchorLine(null);
              }}
            >
              Discard
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      {/* Ruling III: the handoffs are margin items. They lead the rail because
          a thing waiting on a named party outranks the studio's own notes. */}
      <MarginHandoffs
        gates={handoffGates.gates}
        handoffsById={handoffGates.handoffsById}
        isError={handoffGates.isError}
        approvalSurfaceMounted={approvalSurfaceMounted}
      />

      {/* The empty line speaks for the whole margin, so it must not appear
          beneath handoff items that are plainly sitting in it. */}
      {!isLoading &&
        visibleItems.length === 0 &&
        handoffGates.gates.length === 0 && (
          <p className="text-[14px] italic leading-relaxed text-[var(--color-charcoal)]">
            The margin — decisions, messages, and money gather here
          </p>
        )}

      {raised.map(renderItem)}

      {/* R12: resolved items fold away — the fold label is the only number
          anywhere in the margin. */}
      {settled.length > 0 && (
        <div className="mt-3 border-t border-dashed border-[var(--color-pearl)] pt-2">
          <button
            type="button"
            aria-expanded={settledOpen}
            onClick={() => setSettledOpen((v) => !v)}
            className="group mb-1.5 inline-flex min-h-11 min-w-11 items-center font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)] transition-colors hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
          >
            <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
              Settled · {settled.length} {settledOpen ? '↑' : '↓'}
            </span>
          </button>
          {settledOpen && settled.map(renderItem)}
        </div>
      )}

      {/* R55: the decision composer — a DocSheet overlay; the document stays
          mounted beneath (D1). Keyed so switching new↔draft remounts fresh. */}
      <DocSheet
        open={Boolean(composer) && canCompose}
        onClose={() => setComposer(null)}
        title={composer?.mode === 'edit' ? 'Edit draft' : 'New decision'}
      >
        {composer && projectId && designerClientId && (
          <ItemComposer
            key={composer.mode === 'edit' ? composer.item.id : 'new'}
            projectId={projectId}
            designerClientId={designerClientId}
            tasks={tasks ?? []}
            ffeItems={composerFfe}
            phases={composerPhases}
            parties={parties ?? []}
            editItem={composer.mode === 'edit' ? composer.item : null}
            onClose={() => setComposer(null)}
            onCreated={() => setComposer(null)}
          />
        )}
      </DocSheet>
    </>
  );
}
