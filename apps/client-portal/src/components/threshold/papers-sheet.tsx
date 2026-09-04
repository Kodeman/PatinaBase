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
import { documentSignedUrl } from '@/hooks/use-documents-client';
import { parseSourceDate } from '@/lib/threshold/derive';
import {
  groupClientPlanSet,
  isExecutedInstrument,
  paperKindLabel,
  PAPERS_TAB_LABEL,
} from '@/lib/threshold/papers';

/* ── THE PAPERS ──────────────────────────────────────────────────────────────
   Everything the studio has filed for this house, laid on the page as a sheet
   over a sheet — paper on paper, one hairline between them, no shadow and no
   card. It is not a route: the house is still underneath, and the same tab
   that laid the sheet down takes it away again.

   The drawings open INSIDE the sheet. The Documents hub sent every sheet to a
   new browser tab; here the signed URL is read into the sheet's own frame, so
   a client who opens a drawing has not left her house to look at it.

   ABSENCE IS SILENCE holds inside the sheet too: while the two registers are
   still coming the sheet holds its measure and says nothing, because "nothing
   has been filed" is an assertion and it would be taken back a moment later.
   ────────────────────────────────────────────────────────────────────────── */

/** "19 June" — the house's date idiom. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

const FOCUSABLE =
  'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

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

export interface PapersSheetProps {
  projectId: string;
  open: boolean;
  onDismiss: () => void;
  /**
   * The door's read view, when the page has one: an executed instrument is
   * read where it was signed, not re-rendered here.
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
  const documents = useProjectDocuments(projectId);
  const [viewing, setViewing] = useState<{ sheet: ClientPlanSheet; url: string } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // The sheet takes the reading, and gives it back to whatever laid it down.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onDismiss();
      return;
    }
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

  const settled = !planSet.isLoading && !documents.isLoading;
  const sheets = planSet.data ?? [];
  const papers = documents.data ?? [];
  const groups = groupClientPlanSet(sheets);
  const nothingFiled = settled && sheets.length === 0 && papers.length === 0;

  return (
    <div
      data-testid="papers-sheet-overlay"
      className="fixed inset-0 z-[30] overflow-y-auto bg-[var(--bg-primary)] px-[clamp(14px,4vw,48px)] py-[clamp(18px,4vh,56px)]"
    >
      <div
        ref={containerRef}
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
            aria-expanded
            onClick={onDismiss}
          >
            {PAPERS_TAB_LABEL}
          </ScoredAction>
        </div>

        {!settled && (
          <div
            aria-hidden="true"
            data-testid="papers-sheet-hold"
            className="min-h-[40vh]"
          />
        )}

        {settled && viewing && (
          <div data-testid="papers-sheet-viewer" className="mt-6">
            <p className={META_CLASS}>
              {[viewing.sheet.number, `Rev ${viewing.sheet.revLetter}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h3 className="mt-1 font-heading text-[1.35rem] font-medium tracking-[-0.012em]">
              {viewing.sheet.title}
            </h3>
            <iframe
              title={viewing.sheet.title}
              src={viewing.url}
              className="mt-4 h-[62vh] w-full border border-[var(--border-subtle)]"
            />
            <ScoredAction
              actionKey="papers_sheet_back"
              regionKey="papers"
              surfaceKey="the_threshold"
              variant="tertiary"
              onClick={() => setViewing(null)}
            >
              Back to the papers
            </ScoredAction>
          </div>
        )}

        {settled && !viewing && (
          <>
            {groups.length > 0 && (
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

            {papers.length > 0 && (
              <section data-testid="papers-sheet-other">
                <h3 className={HEAD_CLASS}>Other papers</h3>
                <ul className="mt-1 list-none">
                  {papers.map((paper) => (
                    <PaperLine
                      key={paper.id}
                      paper={paper}
                      onOpenInstrument={onOpenInstrument}
                      onDismiss={onDismiss}
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
          {[sheet.number, `Rev ${sheet.revLetter}`, revised].filter(Boolean).join(' · ')}
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

function PaperLine({
  paper,
  onOpenInstrument,
  onDismiss,
}: {
  paper: ProjectDocument;
  onOpenInstrument?: (proposalId: string) => void;
  onDismiss: () => void;
}) {
  const signed = dayMonth(paper.signed_at);
  const executed = isExecutedInstrument(paper);

  return (
    <li className={LINE_CLASS} data-testid="papers-sheet-paper">
      <div className="min-w-0 flex-1">
        <p className={META_CLASS}>
          {[paperKindLabel(paper.kind), signed ? `Signed ${signed}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">{paper.title}</p>
      </div>
      {executed &&
        (onOpenInstrument ? (
          <ScoredAction
            actionKey="papers_read_instrument"
            regionKey="papers"
            surfaceKey="the_threshold"
            variant="tertiary"
            onClick={() => onOpenInstrument(paper.id)}
            aria-label={`Read ${paper.title} in full`}
          >
            Read it in full
          </ScoredAction>
        ) : (
          <ScoredAction
            actionKey="papers_read_instrument"
            regionKey="papers"
            surfaceKey="the_threshold"
            variant="tertiary"
            href="#previously"
            onClick={onDismiss}
            aria-label={`Read ${paper.title} in full`}
          >
            Read it in full
          </ScoredAction>
        ))}
    </li>
  );
}
