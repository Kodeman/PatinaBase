'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import {
  useClientPlanSet,
  useProjectDocuments,
  type ClientPlanSheet,
  type ProjectDocument,
} from '@patina/supabase';

import { ScoredAction } from '@/components/making/scored-action';
import {
  documentSignedUrl,
  useClientDocuments,
  type ClientDocument,
} from '@/hooks/use-documents-client';
import { clientEvents } from '@/lib/analytics/events';
import { DAY_MONTH, parseSourceDate } from '@/lib/threshold/derive';
import {
  documentKindLabel,
  groupClientPlanSet,
  isExecutedInstrument,
  paperKindLabel,
  papersForProject,
  PAPERS_TAB_LABEL,
} from '@/lib/threshold/papers';

import { useScrollLock } from './use-scroll-lock';

/* ── THE PAPERS ──────────────────────────────────────────────────────────────
   Everything the studio has filed for this house, laid on the page as a sheet
   over a sheet — paper on paper, one hairline between them, no shadow and no
   card. It is not a route: the house is still underneath, and the same tab
   that laid the sheet down takes it away again.

   THREE REGISTERS, THE HUB'S OWN. "Your drawings" is the shared plan set
   (`useClientPlanSet`). "Other papers" is the Folio's client-visible leg of
   `project_documents` (`useClientDocuments`) — contracts, photos, specs, the
   signed PDFs — which is the ONLY route a client has to those files once
   /documents is retired. "What you have signed" is the executed instruments
   from `useProjectDocuments`, which is a different register entirely and is
   not a substitute for the second.

   The drawings open INSIDE the sheet. The Documents hub sent every sheet to a
   new browser tab; here the signed URL is read into the sheet's own frame, and
   a "Save it" anchor keeps the browser's own choice for the formats a frame
   cannot show (dwg, xls, doc).

   ABSENCE IS SILENCE holds inside the sheet too: while a register is still
   coming — or has failed and cannot answer — the sheet holds its measure and
   says nothing, because "nothing has been filed" is an assertion and a failed
   read is not entitled to make it. ──────────────────────────────────────── */

/** An iframe can show these; anything else is offered as a file to save. */
const FRAMEABLE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const LINE_CLASS =
  'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[var(--border-subtle)] py-2.5';
const META_CLASS =
  'font-mono text-[11px] uppercase leading-[1.5] tracking-[0.12em] text-[var(--text-muted)]';
const HEAD_CLASS =
  'mb-1 mt-6 font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]';

function dayMonth(value: string | null | undefined): string | null {
  const parsed = parseSourceDate(value);
  return parsed ? DAY_MONTH.format(parsed) : null;
}

/** A frame can only stand in for the browser on the formats it can draw. */
function isFrameable(storagePath: string | null): boolean {
  const extension = storagePath?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return !extension || FRAMEABLE.has(extension);
}

export interface PapersSheetProps {
  projectId: string;
  open: boolean;
  onDismiss: () => void;
  /**
   * The door's read view, when the page has one: an executed instrument is
   * read where it was signed, not re-rendered here. Until it is wired the act
   * is not offered at all — an anchor under "Read it in full" would promise a
   * reading it does not give.
   */
  onOpenInstrument?: (proposalId: string) => void;
}

export function PapersSheet({
  projectId,
  open,
  onDismiss,
  onOpenInstrument,
}: PapersSheetProps) {
  if (!open) return null;
  return (
    <PapersSheetBody
      projectId={projectId}
      onDismiss={onDismiss}
      onOpenInstrument={onOpenInstrument}
    />
  );
}

function PapersSheetBody({
  projectId,
  onDismiss,
  onOpenInstrument,
}: Omit<PapersSheetProps, 'open'>) {
  const planSet = useClientPlanSet([projectId]);
  const filed = useClientDocuments([projectId]);
  const instruments = useProjectDocuments(projectId);
  const [viewing, setViewing] = useState<{ sheet: ClientPlanSheet; url: string } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // The sheet takes the reading, gives it back to whatever laid it down, and
  // holds the house still underneath it while it is down.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    return () => {
      opener?.focus?.();
    };
  }, []);
  // The details sheet mounts in the same wrapper and holds the same lock; two
  // independent capture/restore pairs strand the page scrolled-locked when
  // they close in the other order.
  useScrollLock(true);

  // Escape is bound on the document, not the dialog: once the reading is
  // inside a cross-origin frame no keydown reaches a React handler.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const container = containerRef.current;
    if (!container) return;
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === container)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // A register that failed has not answered. React Query drops `isLoading` on
  // error, so folding `isError` in is what keeps a failed read from printing
  // "Nothing has been filed here yet." over files that are simply unreadable.
  const answered = (query: { isLoading: boolean; isError: boolean }) =>
    !query.isLoading && !query.isError;
  // Each register stands on its own read. A failed drawings leg may not blank
  // the contracts and the signed PDFs that came back perfectly well — the
  // surface being absorbed says so in as many words
  // (app/documents/page.tsx:53-58) — so the conjunction below decides only
  // whether "Nothing has been filed here yet." may be asserted at all.
  const planSettled = answered(planSet);
  const filedSettled = answered(filed);
  const instrumentsSettled = answered(instruments);
  const settled = planSettled && filedSettled && instrumentsSettled;
  const nothingAnswered = planSet.isLoading && filed.isLoading && instruments.isLoading;

  const sheets = planSet.data ?? [];
  const groups = groupClientPlanSet(sheets);
  const { papers, earlier } = papersForProject(
    filed.data?.documents ?? [],
    projectId,
    filed.data?.proposalProjectIds ?? {},
  );
  const executed = (instruments.data ?? []).filter(isExecutedInstrument);
  const nothingFiled =
    settled &&
    sheets.length === 0 &&
    papers.length === 0 &&
    earlier.length === 0 &&
    executed.length === 0;

  return (
    <div
      data-testid="papers-sheet-overlay"
      className="fixed inset-0 z-[30] overflow-y-auto bg-[var(--bg-primary)] px-[clamp(14px,4vw,48px)] py-[clamp(18px,4vh,56px)]"
    >
      <div
        ref={containerRef}
        id="papers-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="papers-sheet-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        data-testid="papers-sheet"
        className="mx-auto w-full max-w-[760px] border border-[var(--border-default)] bg-[var(--bg-primary)] p-[clamp(16px,3vw,32px)] focus-visible:outline-none"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2
            id="papers-sheet-title"
            className="font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]"
          >
            The papers
          </h2>
          <ScoredAction
            actionKey="papers_sheet_tab"
            regionKey="papers"
            surfaceKey="the_threshold"
            variant="tertiary"
            onClick={onDismiss}
          >
            {PAPERS_TAB_LABEL}
          </ScoredAction>
        </div>

        {nothingAnswered && (
          <div
            aria-hidden="true"
            data-testid="papers-sheet-hold"
            className="min-h-[40vh]"
          />
        )}

        {viewing && (
          <div data-testid="papers-sheet-viewer" className="mt-6">
            <p className={META_CLASS}>
              {[
                viewing.sheet.number,
                viewing.sheet.revLetter ? `Rev ${viewing.sheet.revLetter}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h3 className="mt-1 font-heading text-[1.35rem] font-medium tracking-[-0.012em]">
              {viewing.sheet.title}
            </h3>
            {isFrameable(viewing.sheet.storagePath) && (
              <iframe
                title={viewing.sheet.title}
                src={viewing.url}
                className="mt-4 h-[62vh] w-full border border-[var(--border-subtle)]"
              />
            )}
            <div className="flex flex-wrap items-baseline gap-x-4">
              <ScoredAction
                actionKey="papers_sheet_back"
                regionKey="papers"
                surfaceKey="the_threshold"
                variant="tertiary"
                onClick={() => setViewing(null)}
              >
                Back to the papers
              </ScoredAction>
              <ScoredAction
                actionKey="papers_sheet_save"
                regionKey="papers"
                surfaceKey="the_threshold"
                variant="tertiary"
                href={viewing.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Save ${viewing.sheet.title}`}
              >
                Save it
              </ScoredAction>
            </div>
          </div>
        )}

        {!viewing && (
          <>
            {/* Absence is silence about CONTENT; it does not license silence
                about a failure the client can act on by refreshing. The
                retired page said these in the first person ("We couldn't load
                your drawings…"); the page voice here is third, and first
                person is reserved for a note the studio actually wrote. Same
                fact, this surface's voice. */}
            {planSet.isError && (
              <section className="mt-6" data-testid="plan-set-error">
                <h3 className={HEAD_CLASS}>Your drawings</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-body)]">
                  The drawings could not be read just now. Please refresh.
                </p>
              </section>
            )}

            {filed.isError && (
              <p
                data-testid="papers-sheet-error"
                className="mt-6 text-[15px] leading-relaxed text-[var(--text-body)]"
              >
                The documents could not be read just now. Please refresh.
              </p>
            )}

            {instruments.isError && (
              <p
                data-testid="instruments-error"
                className="mt-6 text-[15px] leading-relaxed text-[var(--text-body)]"
              >
                The signed papers could not be read just now. Please refresh.
              </p>
            )}

            {planSettled && groups.length > 0 && (
              <section data-testid="papers-sheet-drawings">
                <h3 className={HEAD_CLASS}>Your drawings</h3>
                {groups.map((group) => (
                  <div key={group.discipline} className="mt-4">
                    <p className={META_CLASS}>{group.discipline}</p>
                    <ul className="mt-1 list-none">
                      {group.sheets.map((sheet) => (
                        <SheetLine
                          key={sheet.sheetId}
                          sheet={sheet}
                          onOpened={(url) => setViewing({ sheet, url })}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}

            {filedSettled && papers.length > 0 && (
              <section data-testid="papers-sheet-other">
                <h3 className={HEAD_CLASS}>Other papers</h3>
                <ul className="mt-1 list-none">
                  {papers.map((document) => (
                    <FiledLine key={document.id} document={document} />
                  ))}
                </ul>
              </section>
            )}

            {filedSettled && earlier.length > 0 && (
              <section data-testid="papers-sheet-earlier">
                <h3 className={HEAD_CLASS}>Earlier papers</h3>
                <ul className="mt-1 list-none">
                  {earlier.map((document) => (
                    <FiledLine key={document.id} document={document} />
                  ))}
                </ul>
              </section>
            )}

            {instrumentsSettled && executed.length > 0 && (
              <section data-testid="papers-sheet-instruments">
                <h3 className={HEAD_CLASS}>What you have signed</h3>
                <ul className="mt-1 list-none">
                  {executed.map((instrument) => (
                    <InstrumentLine
                      key={instrument.id}
                      instrument={instrument}
                      onOpenInstrument={onOpenInstrument}
                    />
                  ))}
                </ul>
              </section>
            )}

            {nothingFiled && (
              <p
                data-testid="papers-sheet-empty"
                className="mt-6 border-t border-[var(--border-subtle)] pt-4 text-[15px] leading-relaxed text-[var(--text-body)]"
              >
                Nothing has been filed here yet.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SheetLine({
  sheet,
  onOpened,
}: {
  sheet: ClientPlanSheet;
  onOpened: (url: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'opening' | 'error'>('idle');

  async function handleOpen() {
    clientEvents.documentView({ documentId: sheet.projectDocumentId, kind: 'plan_sheet' });
    if (!sheet.storagePath) {
      setState('error');
      return;
    }
    setState('opening');
    const url = await documentSignedUrl(sheet.storagePath);
    if (!url) {
      setState('error');
      return;
    }
    setState('idle');
    onOpened(url);
  }

  const revised = dayMonth(sheet.revDate);

  return (
    <li className={LINE_CLASS} data-testid="papers-sheet-row">
      <div className="min-w-0 flex-1">
        <p className={META_CLASS}>
          {[sheet.number, sheet.revLetter ? `Rev ${sheet.revLetter}` : null, revised]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">{sheet.title}</p>
        {state === 'error' && (
          <p className="mt-0.5 text-[15px] leading-[1.5] text-[var(--text-body)]">
            Couldn&rsquo;t open this file.
          </p>
        )}
      </div>
      <ScoredAction
        actionKey="papers_sheet_open"
        regionKey="papers"
        surfaceKey="the_threshold"
        variant="tertiary"
        loading={state === 'opening'}
        loadingLabel="Opening"
        onClick={() => void handleOpen()}
        aria-label={`Open ${sheet.title}`}
      >
        Open
      </ScoredAction>
    </li>
  );
}

/**
 * One of the studio's filed papers — the register the Documents hub called
 * "Other papers". The act is the hub's own: a signed URL into the browser,
 * which lets it show a PDF and save a spreadsheet.
 */
function FiledLine({ document }: { document: ClientDocument }) {
  const [state, setState] = useState<'idle' | 'opening' | 'error'>('idle');

  async function handleOpen() {
    clientEvents.documentView({ documentId: document.id, kind: document.doc_type });
    if (!document.storage_path) {
      setState('error');
      return;
    }
    setState('opening');
    const url = await documentSignedUrl(document.storage_path);
    if (!url) {
      setState('error');
      return;
    }
    setState('idle');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const filed = dayMonth(document.created_at);

  return (
    <li className={LINE_CLASS} data-testid="papers-sheet-paper">
      <div className="min-w-0 flex-1">
        <p className={META_CLASS}>
          {[documentKindLabel(document), filed].filter(Boolean).join(' · ')}
        </p>
        <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">
          {document.title}
        </p>
        {state === 'error' && (
          <p className="mt-0.5 text-[15px] leading-[1.5] text-[var(--text-body)]">
            Couldn&rsquo;t open this file.
          </p>
        )}
      </div>
      <ScoredAction
        actionKey="papers_paper_open"
        regionKey="papers"
        surfaceKey="the_threshold"
        variant="tertiary"
        loading={state === 'opening'}
        loadingLabel="Opening"
        onClick={() => void handleOpen()}
        aria-label={`Open ${document.title}`}
      >
        Open
      </ScoredAction>
    </li>
  );
}

function InstrumentLine({
  instrument,
  onOpenInstrument,
}: {
  instrument: ProjectDocument;
  onOpenInstrument?: (proposalId: string) => void;
}) {
  const signed = dayMonth(instrument.signed_at);

  return (
    <li className={LINE_CLASS} data-testid="papers-sheet-instrument">
      <div className="min-w-0 flex-1">
        <p className={META_CLASS}>
          {[paperKindLabel(instrument.kind), signed ? `Signed ${signed}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">
          {instrument.title}
        </p>
      </div>
      {onOpenInstrument && (
        <ScoredAction
          actionKey="papers_read_instrument"
          regionKey="papers"
          surfaceKey="the_threshold"
          variant="tertiary"
          onClick={() => onOpenInstrument(instrument.id)}
          aria-label={`Read ${instrument.title} in full`}
        >
          Read it in full
        </ScoredAction>
      )}
    </li>
  );
}
