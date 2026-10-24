'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import {
  useClientPlanSet,
  useProjectDocuments,
  type ClientPlanSheet,
  type ProjectDocument,
} from '@patina/supabase';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
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
  /** Gallery supplies the single modal, focus boundary and scroll lock. */
  embedded?: boolean;
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
  embedded = false,
}: PapersSheetProps) {
  if (!open) return null;
  return (
    <PapersSheetBody
      projectId={projectId}
      onDismiss={onDismiss}
      onOpenInstrument={onOpenInstrument}
      embedded={embedded}
    />
  );
}

function tabTarget(event: ReactKeyboardEvent<HTMLDivElement>, container: HTMLDivElement) {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  const edge = event.shiftKey ? focusable[0] : focusable.at(-1);
  if (document.activeElement !== edge && document.activeElement !== container) return null;
  return event.shiftKey ? focusable.at(-1) : focusable[0];
}
function trapTab(event: ReactKeyboardEvent<HTMLDivElement>, container: HTMLDivElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const target = tabTarget(event, container);
  if (target) { event.preventDefault(); target.focus(); }
}

function useSheetBoundary(embedded: boolean, onDismiss: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollLock(!embedded);
  useEffect(() => {
    if (embedded) return;
    const opener = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    return () => opener?.focus();
  }, [embedded]);
  useEffect(() => {
    if (embedded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [embedded, onDismiss]);
  return { containerRef, handleKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => trapTab(event, containerRef.current) };
}

type ViewingSheet = { sheet: ClientPlanSheet; url: string };
function SheetViewer({ viewing, onBack }: { viewing: ViewingSheet; onBack: () => void }) {
  return <div data-testid="papers-sheet-viewer" className="mt-6">
    <p className={META_CLASS}>{[viewing.sheet.number, viewing.sheet.revLetter ? 'Rev ' + viewing.sheet.revLetter : null].filter(Boolean).join(' · ')}</p>
    <h3 className="mt-1 font-heading text-[1.35rem]">{viewing.sheet.title}</h3>
    {isFrameable(viewing.sheet.storagePath) && <iframe title={viewing.sheet.title} src={viewing.url} className="mt-4 h-[62vh] w-full border border-[var(--border-subtle)]" />}
    <div className="flex flex-wrap items-baseline gap-x-4">
      <ScoredAction actionKey="papers_sheet_back" regionKey="papers" surfaceKey="the_threshold" variant="tertiary" onClick={onBack}>Back to the papers</ScoredAction>
      <ScoredAction actionKey="papers_sheet_save" regionKey="papers" surfaceKey="the_threshold" variant="tertiary" href={viewing.url} target="_blank" rel="noopener noreferrer" aria-label={'Save ' + viewing.sheet.title}>Save it</ScoredAction>
    </div>
  </div>;
}

type RegisterRead = { isLoading: boolean; isError: boolean };
function answered(query: RegisterRead) { return !query.isLoading && !query.isError; }
function RegisterError({ read, testId, children }: { read: RegisterRead; testId: string; children: React.ReactNode }) {
  return read.isError ? <p data-testid={testId} className="mt-6 text-[16px] leading-relaxed">{children}</p> : null;
}
function FiledRegister({ title, testId, documents, read }: { title: string; testId: string; documents: ClientDocument[]; read: RegisterRead }) {
  if (!answered(read) || !documents.length) return null;
  return <section data-testid={testId}><h3 className={HEAD_CLASS}>{title}</h3><ul className="mt-1 list-none">{documents.map(document => <FiledLine key={document.id} document={document} />)}</ul></section>;
}
function DrawingsRegister({ read, onOpened }: { read: ReturnType<typeof useClientPlanSet>; onOpened: (viewing: ViewingSheet) => void }) {
  const groups = groupClientPlanSet(read.data ?? []);
  if (!answered(read) || !groups.length) return null;
  return <section data-testid="papers-sheet-drawings"><h3 className={HEAD_CLASS}>Your drawings</h3>
    {groups.map(group => <div key={group.discipline} className="mt-4"><p className={META_CLASS}>{group.discipline}</p><ul className="mt-1 list-none">
      {group.sheets.map(sheet => <SheetLine key={sheet.sheetId} sheet={sheet} onOpened={url => onOpened({ sheet, url })} />)}
    </ul></div>)}
  </section>;
}
function InstrumentsRegister({ read, onOpenInstrument }: { read: ReturnType<typeof useProjectDocuments>; onOpenInstrument?: (id: string) => void }) {
  const executed = (read.data ?? []).filter(isExecutedInstrument);
  if (!answered(read) || !executed.length) return null;
  return <section data-testid="papers-sheet-instruments"><h3 className={HEAD_CLASS}>What you have signed</h3><ul className="mt-1 list-none">
    {executed.map(instrument => <InstrumentLine key={instrument.id} instrument={instrument} onOpenInstrument={onOpenInstrument} />)}
  </ul></section>;
}
function NothingFiled({ reads, lengths }: { reads: RegisterRead[]; lengths: number[] }) {
  if (!reads.every(answered) || lengths.some(length => length > 0)) return null;
  return <p data-testid="papers-sheet-empty" className="mt-6 border-t border-[var(--border-subtle)] pt-4 text-[16px]">Nothing has been filed here yet.</p>;
}
function filedPapers(read: ReturnType<typeof useClientDocuments>, projectId: string) {
  return papersForProject(read.data?.documents ?? [], projectId, read.data?.proposalProjectIds ?? {});
}
function PapersRegisters({ projectId, onOpened, onOpenInstrument }: { projectId: string; onOpened: (viewing: ViewingSheet) => void; onOpenInstrument?: (proposalId: string) => void }) {
  const planSet = useClientPlanSet([projectId]);
  const filed = useClientDocuments([projectId]);
  const instruments = useProjectDocuments(projectId);
  const { papers, earlier } = filedPapers(filed, projectId);
  return <>
    {[planSet, filed, instruments].every(read => read.isLoading) && <div aria-hidden="true" data-testid="papers-sheet-hold" className="min-h-[40vh]" />}
    <RegisterError read={planSet} testId="plan-set-error">The drawings could not be read just now. Please refresh.</RegisterError>
    <RegisterError read={filed} testId="papers-sheet-error">The documents could not be read just now. Please refresh.</RegisterError>
    <RegisterError read={instruments} testId="instruments-error">The signed papers could not be read just now. Please refresh.</RegisterError>
    <DrawingsRegister read={planSet} onOpened={onOpened} />
    <FiledRegister title="Other papers" testId="papers-sheet-other" documents={papers} read={filed} />
    <FiledRegister title="Earlier papers" testId="papers-sheet-earlier" documents={earlier} read={filed} />
    <InstrumentsRegister read={instruments} onOpenInstrument={onOpenInstrument} />
    <NothingFiled reads={[planSet, filed, instruments]} lengths={[planSet.data?.length ?? 0, papers.length, earlier.length, (instruments.data ?? []).filter(isExecutedInstrument).length]} />
  </>;
}

function PapersSheetBody({ projectId, onDismiss, onOpenInstrument, embedded = false }: Omit<PapersSheetProps, 'open'>) {
  const [viewing, setViewing] = useState<ViewingSheet | null>(null);
  const { containerRef, handleKeyDown } = useSheetBoundary(embedded, onDismiss);
  return <div data-testid="papers-sheet-overlay" className={embedded ? 'gallery-documents' : 'fixed inset-0 z-[30] overflow-y-auto bg-[var(--bg-primary)] px-[clamp(14px,4vw,48px)] py-[clamp(18px,4vh,56px)]'}>
    <div ref={containerRef} id="papers-sheet" role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby="papers-sheet-title" tabIndex={-1}
      onKeyDown={embedded ? undefined : handleKeyDown} data-testid="papers-sheet" className="mx-auto w-full max-w-[760px] border border-[var(--border-default)] bg-[var(--bg-primary)] p-[clamp(16px,3vw,32px)] focus-visible:outline-none">
      <div className="flex flex-wrap items-baseline justify-between gap-4"><h2 id="papers-sheet-title" className={HEAD_CLASS}>The papers</h2>
        <ScoredAction actionKey="papers_sheet_tab" regionKey="papers" surfaceKey="the_threshold" variant="tertiary" onClick={onDismiss}>{PAPERS_TAB_LABEL}</ScoredAction>
      </div>
      {viewing ? <SheetViewer viewing={viewing} onBack={() => setViewing(null)} /> : <PapersRegisters projectId={projectId} onOpened={setViewing} onOpenInstrument={onOpenInstrument} />}
    </div>
  </div>;
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
