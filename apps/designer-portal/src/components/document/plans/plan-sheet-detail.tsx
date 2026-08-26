'use client';

/**
 * One sheet, and every print it has ever had.
 *
 * The rail reads newest first because the top of it is the answer to "what is
 * current". Older prints stay reachable and stay stamped SUPERSEDED — the
 * record never hides, it only stops being current.
 *
 * Shared is a CLIENT gate and nothing more (00429): it puts the sheet's current
 * print in the client's folio and keeps putting the current one there as the
 * sheet revises. The studio's own people reach every print regardless.
 */

import { useState } from 'react';
import { useSetPlanSheetState, type PlanRoomBundle } from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';
import { planRoomEvents } from '@/lib/analytics/plan-room-events';
import { DocumentAction, DocumentActionGroup, DocumentActionRow } from '../document-action';
import { SectionEyebrow } from '../section-eyebrow';
import { Stamp } from '../stamp';
import { StatusChip } from '../status-chip';
import { PlanPrintViewer } from './plan-print-viewer';

export interface PlanSheetDetailProps {
  projectId: string;
  bundle: PlanRoomBundle;
  sheetId: string;
  onBack: () => void;
  onIssue: () => void;
}

export function PlanSheetDetail({
  projectId,
  bundle,
  sheetId,
  onBack,
  onIssue,
}: PlanSheetDetailProps) {
  const [openPrintId, setOpenPrintId] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const setSheetState = useSetPlanSheetState(projectId);

  const sheet = bundle.sheets.find((row) => row.id === sheetId);
  if (!sheet) {
    return (
      <section className="px-4 py-10 md:px-8">
        <p className="font-heading italic text-[var(--text-muted)]">
          That sheet is no longer in this room.
        </p>
        <DocumentActionRow surfaceKey="plan-room" regionKey="sheet-missing">
          <DocumentAction actionKey="back-to-set" variant="tertiary" onClick={onBack}>
            ← The current set
          </DocumentAction>
        </DocumentActionRow>
      </section>
    );
  }

  const prints = bundle.prints
    .filter((print) => print.sheet_id === sheetId)
    .sort((a, b) => b.print_number - a.print_number);
  const currentPrint = prints.find((print) => print.id === sheet.current_print_id) ?? null;
  const shared = sheet.state === 'shared';
  const openPrint = prints.find((print) => print.id === openPrintId) ?? null;

  const historyFor = (printId: string): string | null => {
    const issueIds = bundle.issuePrints
      .filter((issuePrint) => issuePrint.print_id === printId)
      .map((issuePrint) => issuePrint.issue_id);
    if (issueIds.length === 0) return null;
    const names = bundle.issues
      .filter((issue) => issueIds.includes(issue.id))
      .map((issue) => issue.name);
    const parties = bundle.transmittals
      .filter((transmittal) => issueIds.includes(transmittal.issue_id))
      .map((transmittal) => transmittal.party_display_name);
    const unique = [...new Set(parties)];
    return [
      names.join(' · '),
      unique.length > 0 ? `sent to ${unique.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const toggleState = async () => {
    setStateError(null);
    const next = shared ? 'draft' : 'shared';
    try {
      await setSheetState.mutateAsync({ sheetId, state: next });
      planRoomEvents.sheetStateChanged({
        project_id: projectId,
        sheet_id: sheetId,
        from: sheet.state,
        to: next,
      });
    } catch (error) {
      setStateError(
        error instanceof Error ? error.message : 'That sheet could not be moved.',
      );
    }
  };

  return (
    <section aria-label={`Sheet ${sheet.sheet_number}`} className="px-4 py-6 md:px-8">
      {/* The title block */}
      <div className="border-b border-[var(--color-pearl)] pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {sheet.sheet_number}
          {sheet.discipline ? ` · ${sheet.discipline}` : ''}
        </p>
        <h2 className="mt-1 font-heading text-2xl text-[var(--color-charcoal)]">
          {sheet.title}
        </h2>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Rev {currentPrint?.rev_letter ?? '—'} ·{' '}
          {prints.length} {prints.length === 1 ? 'print' : 'prints'} filed
          {currentPrint ? ` · current since ${fmtDay(currentPrint.created_at)}` : ''}
        </p>

        <DocumentActionGroup
          surfaceKey="plan-room"
          regionKey="sheet-actions"
          className="mt-3"
          aria-label={`Acts for sheet ${sheet.sheet_number}`}
        >
          <DocumentAction
            actionKey="open-current-print"
            variant="primary"
            disabled={!currentPrint}
            onClick={() => {
              if (!currentPrint) return;
              planRoomEvents.printViewed({
                project_id: projectId,
                print_id: currentPrint.id,
                is_current: true,
              });
              setOpenPrintId(currentPrint.id);
            }}
          >
            Open the print
          </DocumentAction>
          <DocumentAction
            actionKey="issue-current-set-sheet"
            variant="secondary"
            onClick={onIssue}
          >
            Issue the current set
          </DocumentAction>
          <DocumentAction
            actionKey="toggle-plan-sheet-state"
            variant="secondary"
            loading={setSheetState.isPending}
            loadingLabel="Moving…"
            onClick={toggleState}
          >
            {shared ? 'Keep it in the studio' : 'Share with the client'}
          </DocumentAction>
          <DocumentAction actionKey="back-to-set" variant="tertiary" onClick={onBack}>
            ← The current set
          </DocumentAction>
        </DocumentActionGroup>

        <p className="mt-2 max-w-xl text-[0.8rem] text-[var(--text-muted)]">
          {shared
            ? 'Shared — the client sees the current print of this sheet, always the current print.'
            : 'Draft — this sheet is the studio’s alone. Sharing puts its current print in the client’s folio.'}
        </p>
        {stateError && (
          <p
            role="alert"
            className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]"
          >
            {stateError}
          </p>
        )}
      </div>

      {/* The print rail — newest first */}
      <div className="mt-6">
        <SectionEyebrow count={prints.length}>The prints</SectionEyebrow>
        <div className="grid">
          {prints.map((print) => {
            const isCurrent = print.id === sheet.current_print_id;
            // The print that superseded this one is the NEXT one filed — the
            // lowest print_number above it. `prints` is newest-first, so
            // `.find` would hand back the newest instead, and Rev A would
            // claim it was superseded by Rev D when Rev B is what replaced it.
            const supersededBy = isCurrent
              ? null
              : (prints
                  .filter((later) => later.print_number > print.print_number)
                  .reduce<(typeof prints)[number] | null>(
                    (lowest, candidate) =>
                      lowest == null || candidate.print_number < lowest.print_number
                        ? candidate
                        : lowest,
                    null,
                  )?.rev_letter ?? null);
            const history = historyFor(print.id);
            return (
              <div
                key={print.id}
                data-plan-print-row
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--color-pearl)] py-3"
              >
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
                      Rev {print.rev_letter}
                    </span>
                    {isCurrent ? (
                      <StatusChip label="Current" color="#85947C" />
                    ) : (
                      <Stamp
                        label={`Superseded · by Rev ${supersededBy ?? '—'} · ${fmtDay(print.created_at)}`}
                        color="var(--color-terracotta)"
                        ink="var(--color-aged-oak)"
                      />
                    )}
                  </span>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    filed {fmtDay(print.created_at)}
                    {print.source_filename ? ` · ${print.source_filename}` : ''} ·{' '}
                    <span title={print.sha256}>sha {print.sha256.slice(0, 8)}</span>
                  </p>
                  {history && (
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                      {history}
                    </p>
                  )}
                </div>
                <DocumentActionRow
                  surfaceKey="plan-room"
                  regionKey={`print-${print.id}`}
                >
                  <DocumentAction
                    actionKey="open-plan-print"
                    variant="tertiary"
                    onClick={() => {
                      planRoomEvents.printViewed({
                        project_id: projectId,
                        print_id: print.id,
                        is_current: isCurrent,
                      });
                      setOpenPrintId(print.id);
                    }}
                  >
                    Open
                  </DocumentAction>
                </DocumentActionRow>
              </div>
            );
          })}
        </div>
      </div>

      {openPrint && (
        <PlanPrintViewer
          sheetNumber={sheet.sheet_number}
          sheetTitle={sheet.title}
          revLetter={openPrint.rev_letter}
          filedAt={openPrint.created_at}
          projectDocumentId={openPrint.project_document_id}
          isCurrent={openPrint.id === sheet.current_print_id}
          supersededBy={
            openPrint.id === sheet.current_print_id
              ? null
              : (currentPrint?.rev_letter ?? null)
          }
          onClose={() => setOpenPrintId(null)}
        />
      )}
    </section>
  );
}
