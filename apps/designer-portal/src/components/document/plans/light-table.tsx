'use client';

/**
 * The Light Table — where a dropped PDF becomes a set, and nothing is current
 * until the designer says so.
 *
 * The whole pipeline runs in the browser, in stages the designer can read:
 * split the file, read each page's text layer, propose where each page belongs,
 * draw a thumbnail. Nothing leaves the machine until the confirm strip fires —
 * this surface is entirely a preview.
 *
 * THE STAGED TABLE LIVES IN THE WORKSPACE, NOT HERE. Parsed pages, proposals,
 * fork answers, thumbnails and the idempotency key are all lifted, so stepping
 * out to look at a sheet and coming back restores the table exactly — no
 * re-parse, and above all NO NEW IDEMPOTENCY KEY. A key that rotated on
 * remount would turn "save the table for later" into a promise the room
 * cannot keep: the retry would land as a second batch. A new key is minted in
 * exactly two places — a new drop, and a successful commit.
 *
 * Two honest failures are surfaced rather than papered over:
 *  · a page with no sheet number is NOT guessed at — it goes to the loose
 *    papers tray and, from there, to the Folio (or onto a sheet the room
 *    already holds, via the card's own chooser).
 *  · a file with no text layer at all (a scan of a plot) cannot be read, so
 *    every card falls back to manual assignment behind a terracotta band.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlanRoomBundle } from '@patina/supabase';
import { useUploadFolioFile } from '@/hooks/use-folio';
import {
  confirmSummary,
  normalizeTextLayer,
  proposeMatches,
  type LightTableProposal,
  type StagedPage,
} from '@/lib/plans/model';
import {
  extractSinglePagePdf,
  loadPdfPages,
  renderPageThumbnail,
  sha256Hex,
} from '@/lib/plans/pdf';
import { planRoomEvents } from '@/lib/analytics/plan-room-events';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { SectionEyebrow } from '../section-eyebrow';
import { LightTableCard } from './light-table-card';
import type { PlanStagedSession } from './plan-confirm-strip';

/** The staged table, held by the workspace so no view switch can destroy it. */
export interface StagedTable {
  session: PlanStagedSession;
  proposals: LightTableProposal[];
  /** True when not one page in the drop carried a readable text layer. */
  noTextLayer: boolean;
  /**
   * Display only, by page index. Lifted so a return trip needs no redraw.
   * A MISSING key is a page not drawn yet; a key set to null is a page the
   * table tried to draw and could not. The card reads the difference.
   */
  thumbnails: Record<number, Blob | null | undefined>;
}

type ReadStage = 'reading' | 'proposing' | 'drawing';

const STAGE_LINE: Record<ReadStage, string> = {
  reading: 'Splitting the set and reading each page…',
  proposing: 'Proposing where each page belongs…',
  drawing: 'Drawing the pages…',
};

export interface LightTableProps {
  projectId: string;
  bundle: PlanRoomBundle;
  /** A fresh drop. The workspace clears it the moment staging lands. */
  pendingFiles: File[] | null;
  staged: StagedTable | null;
  onStaged: (table: StagedTable) => void;
  onProposalsChange: (proposals: LightTableProposal[]) => void;
  onThumbnail: (pageIndex: number, thumbnail: Blob | null) => void;
  onReadFailed: (message: string) => void;
}

export function LightTable({
  projectId,
  bundle,
  pendingFiles,
  staged,
  onStaged,
  onProposalsChange,
  onThumbnail,
  onReadFailed,
}: LightTableProps) {
  const [stage, setStage] = useState<ReadStage | null>(null);
  const [showMatched, setShowMatched] = useState(false);
  const [sentToFolio, setSentToFolio] = useState<Record<number, 'sending' | 'sent' | string>>(
    {},
  );
  const uploadFolio = useUploadFolioFile(projectId);
  /**
   * Run token rather than a boolean "live" flag plus a consumed-files ref.
   * React's development StrictMode mounts an effect, tears it down, and mounts
   * it again: a consumed-files guard would make the SECOND pass a no-op while
   * the first had already been cancelled, and the table would sit on "reading"
   * forever. Comparing the run id instead means the superseded pass stops on
   * its own and the live one always finishes.
   */
  const runId = useRef(0);

  const currentRevBySheet = useMemo(() => {
    const prints = new Map(bundle.prints.map((print) => [print.id, print]));
    const map = new Map<string, string>();
    for (const sheet of bundle.sheets) {
      const print = sheet.current_print_id ? prints.get(sheet.current_print_id) : undefined;
      if (print) map.set(sheet.id, print.rev_letter);
    }
    return map;
  }, [bundle]);

  // ── Read the drop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingFiles || pendingFiles.length === 0) return;
    runId.current += 1;
    const run = runId.current;
    const live = () => runId.current === run;

    void (async () => {
      try {
        setStage('reading');
        const sources: PlanStagedSession['sources'] = [];
        const origins: PlanStagedSession['origins'] = {};
        const pages: StagedPage[] = [];
        let pageIndex = 0;

        for (const [sourceIndex, file] of pendingFiles.entries()) {
          const loaded = await loadPdfPages(file);
          if (!live()) return;
          sources.push({ name: file.name, bytes: loaded.bytes });
          for (const page of loaded.pages) {
            const normalized = normalizeTextLayer(page.text);
            origins[pageIndex] = { sourceIndex, localPageIndex: page.pageIndex };
            pages.push({
              pageIndex,
              items: page.items,
              text: page.text,
              textSha256: normalized ? await sha256Hex(normalized) : null,
            });
            pageIndex += 1;
          }
        }
        if (!live()) return;

        setStage('proposing');
        const textShaBySheet: Record<string, string | null> = {};
        for (const sheet of bundle.sheets) {
          const print = bundle.prints.find((entry) => entry.id === sheet.current_print_id);
          textShaBySheet[sheet.id] = print?.text_sha256 ?? null;
        }
        const noTextLayer = pages.every((page) => page.items.length === 0);
        const proposals = noTextLayer
          ? pages.map(
              (page): LightTableProposal => ({
                pageIndex: page.pageIndex,
                parsedNumber: null,
                textSha256: page.textSha256,
                kind: 'new_sheet',
                sheetId: null,
                sheetNumber: null,
                sheetTitle: null,
                discipline: null,
                nearMiss: null,
                fork: 'new_sheet',
                requiresFork: false,
              }),
            )
          : proposeMatches(pages, bundle.sheets, textShaBySheet);

        onStaged({
          session: {
            projectId,
            // Minted ONCE per staged table, here and nowhere else.
            idempotencyKey: crypto.randomUUID(),
            sourceFilename: pendingFiles[0]?.name ?? null,
            sources,
            origins,
            startedAt: Date.now(),
          },
          proposals,
          noTextLayer,
          thumbnails: {},
        });
        planRoomEvents.lightTableStaged({
          project_id: projectId,
          page_count: proposals.length,
          proposed_revisions: proposals.filter((p) => p.kind === 'revision').length,
          proposed_new: proposals.filter((p) => p.kind === 'new_sheet').length,
          proposed_current: proposals.filter((p) => p.kind === 'confirm_current').length,
          unmatched: proposals.filter((p) => p.kind === 'unmatched').length,
        });

        setStage('drawing');
        for (const page of pages) {
          const origin = origins[page.pageIndex];
          const source = sources[origin.sourceIndex];
          try {
            const blob = await renderPageThumbnail(source.bytes, origin.localPageIndex);
            if (!live()) return;
            onThumbnail(page.pageIndex, blob);
          } catch {
            if (!live()) return;
            onThumbnail(page.pageIndex, null);
          }
        }
        if (live()) setStage(null);
      } catch (error) {
        if (!live()) return;
        setStage(null);
        onReadFailed(
          error instanceof Error ? error.message : 'That file could not be read.',
        );
      }
    })();
    // No teardown: a superseded run detects itself through the run id above.
    // bundle/callbacks are read at drop time; re-running on their identity would
    // re-parse the same file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles]);

  const proposals = staged?.proposals ?? [];
  const thumbnails = staged?.thumbnails ?? {};
  const summary = confirmSummary(proposals);
  const cleanlyMatched = proposals.filter((p) => p.kind === 'confirm_current');
  const decidable = proposals.filter(
    (p) => p.kind !== 'confirm_current' && p.kind !== 'unmatched',
  );
  const loose = proposals.filter((p) => p.kind === 'unmatched');

  const update = (next: LightTableProposal) => {
    onProposalsChange(
      proposals.map((p) => (p.pageIndex === next.pageIndex ? next : p)),
    );
  };

  const cardFor = (proposal: LightTableProposal) => (
    <LightTableCard
      key={proposal.pageIndex}
      proposal={proposal}
      thumbnail={thumbnails[proposal.pageIndex]}
      currentRev={
        proposal.sheetId ? (currentRevBySheet.get(proposal.sheetId) ?? null) : null
      }
      sheets={bundle.sheets}
      conflict={summary.conflicts[proposal.pageIndex] ?? null}
      onChange={update}
    />
  );

  const sendToFolio = async (proposal: LightTableProposal) => {
    if (!staged) return;
    const origin = staged.session.origins[proposal.pageIndex];
    const source = staged.session.sources[origin?.sourceIndex ?? -1];
    if (!origin || !source) return;
    setSentToFolio((prev) => ({ ...prev, [proposal.pageIndex]: 'sending' }));
    try {
      const bytes = await extractSinglePagePdf(source.bytes, origin.localPageIndex);
      const base = source.name.replace(/\.pdf$/i, '');
      const file = new File(
        [new Blob([bytes as BlobPart], { type: 'application/pdf' })],
        `${base} p${origin.localPageIndex + 1}.pdf`,
        { type: 'application/pdf' },
      );
      await uploadFolio.mutateAsync({ file, anchor: { kind: 'letterhead' } });
      setSentToFolio((prev) => ({ ...prev, [proposal.pageIndex]: 'sent' }));
    } catch (error) {
      setSentToFolio((prev) => ({
        ...prev,
        [proposal.pageIndex]:
          error instanceof Error ? error.message : 'It could not be filed.',
      }));
    }
  };

  return (
    <section aria-label="The light table" className="px-4 py-6 md:px-8">
      {stage && (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
        >
          {STAGE_LINE[stage]}
        </p>
      )}

      {staged?.noTextLayer && (
        <div
          role="alert"
          className="mb-5 border-l-2 border-[var(--color-terracotta)] bg-[var(--color-off-white)] px-3 py-2.5"
        >
          <p className="text-[0.82rem] text-[var(--color-charcoal)]">
            This file carries no text layer — a scan, not a plot. The table can’t
            read a sheet number off it, so each page needs a number and a title by
            hand, or a sheet you already hold to land on.
          </p>
        </div>
      )}

      {decidable.length > 0 && (
        <>
          <SectionEyebrow count={decidable.length}>Pages to place</SectionEyebrow>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {decidable.map(cardFor)}
          </div>
        </>
      )}

      {cleanlyMatched.length > 0 && (
        <div className="mb-8 border-t border-[var(--color-pearl)] pt-3">
          <button
            type="button"
            onClick={() => setShowMatched((open) => !open)}
            aria-expanded={showMatched}
            className="inline-flex min-h-[44px] items-center font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            {cleanlyMatched.length} further{' '}
            {cleanlyMatched.length === 1 ? 'page' : 'pages'} matched cleanly ·{' '}
            {showMatched ? 'fold them away' : 'open them'}
          </button>
          {showMatched && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cleanlyMatched.map(cardFor)}
            </div>
          )}
        </div>
      )}

      {loose.length > 0 && (
        <div className="border-t border-[var(--color-pearl)] pt-4">
          <SectionEyebrow count={loose.length}>Loose papers</SectionEyebrow>
          <p className="mb-3 max-w-xl text-[0.82rem] text-[var(--text-muted)]">
            No sheet number on these. They aren’t drawings in the set — they go to
            the Folio, clipped to the letterhead. If one is really a revision, put
            it on its sheet with the chooser on the card.
          </p>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {loose.map(cardFor)}
          </div>
          <div className="grid gap-2">
            {loose.map((proposal) => {
              const state = sentToFolio[proposal.pageIndex];
              return (
                <div
                  key={proposal.pageIndex}
                  className="flex flex-wrap items-center justify-between gap-3 border border-[var(--doc-ink-border)] px-3 py-2"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    p.{proposal.pageIndex + 1}
                    {proposal.sheetTitle ? ` · ${proposal.sheetTitle}` : ''}
                  </span>
                  {state === 'sent' ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#85947C]">
                      In the Folio
                    </span>
                  ) : (
                    <DocumentActionRow
                      surfaceKey="plan-room"
                      regionKey={`loose-page-${proposal.pageIndex}`}
                    >
                      <DocumentAction
                        actionKey="send-loose-page-to-folio"
                        variant="secondary"
                        loading={state === 'sending'}
                        loadingLabel="Filing…"
                        onClick={() => sendToFolio(proposal)}
                      >
                        Send to the Folio
                      </DocumentAction>
                    </DocumentActionRow>
                  )}
                  {state && state !== 'sent' && state !== 'sending' && (
                    <p
                      role="alert"
                      className="w-full font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-terracotta)]"
                    >
                      {state}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
