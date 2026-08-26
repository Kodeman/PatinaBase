'use client';

/**
 * The Light Table's confirm strip — one honest sentence and its two verbs,
 * built on ScheduleConfirmStrip's discipline (schedule/schedule-confirm-strip
 * .tsx, R100). Same laws, different act:
 *
 *  · It renders ONLY inside a staged session. Outside one it is null, so a plan
 *    room nobody has dropped a set on is byte-identical to one that never had a
 *    Light Table at all.
 *  · Nothing is written until the primary fires. Every proposal, every rev
 *    letter, every "becomes Rev C" on the cards is a preview computed by the
 *    pure model; the room is untouched until `file_plan_prints` runs, and that
 *    one RPC is the whole write (one batch, one transaction).
 *  · An unresolved fork is the commit gate. The button is disabled while any
 *    card still asks a question AND the handler re-guards — a force-enabled
 *    button writes nothing.
 *  · Failure keeps the session. The stage that failed is named inline in
 *    terracotta (R83 — the Document opts out of toasts); the staged table is
 *    still there, and the deterministic storage path means a retry overwrites
 *    its own bytes rather than orphaning them.
 *  · Esc reverts, guarded on a pending commit (mid-flight the write lands
 *    anyway, so Esc could no longer restore the prior state) and on an open
 *    dialog (a coincident revert would throw away a table the designer is
 *    still deciding on).
 *
 * Zero shadows: depth is the golden-hour rule and value contrast.
 */

import { useEffect, useState } from 'react';
import {
  createBrowserClient,
  useFilePlanPrints,
  type FilePlanPrintsResult,
  type PrintUploadInput,
} from '@patina/supabase';
import {
  confirmSummary,
  planFileEntries,
  type LightTableProposal,
} from '@/lib/plans/model';
import { extractSinglePagePdf, sha256Hex } from '@/lib/plans/pdf';
import { planRoomEvents } from '@/lib/analytics/plan-room-events';
import { DocumentAction, DocumentActionGroup } from '../document-action';

/** One PDF the designer dropped, held in memory for the length of the session. */
export interface PlanStagedSource {
  name: string;
  bytes: Uint8Array;
}

/**
 * A staged Light Table. The idempotency key is minted ONCE per staged table and
 * held across every retry — that, plus the deterministic storage path, is what
 * makes a failed filing safe to run again.
 */
export interface PlanStagedSession {
  projectId: string;
  idempotencyKey: string;
  sourceFilename: string | null;
  sources: PlanStagedSource[];
  /** Global staged page index → the file it came from and its page there. */
  origins: Record<number, { sourceIndex: number; localPageIndex: number }>;
  startedAt: number;
}

type CommitStage = 'cutting' | 'hashing' | 'uploading' | 'filing';

/**
 * The machine-readable half of a failure, for telemetry only. A Postgres error
 * from file_plan_prints interpolates the offending sheet number into its
 * message, and a storage error can carry a signed path — neither belongs in an
 * analytics payload, so the event gets the SQLSTATE or HTTP status and nothing
 * else. The human-readable message still reaches the designer, inline.
 */
function failureCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: unknown;
      statusCode?: unknown;
      status?: unknown;
    };
    if (typeof candidate.code === 'string' && candidate.code) return candidate.code;
    if (typeof candidate.statusCode === 'string' && candidate.statusCode) {
      return candidate.statusCode;
    }
    if (typeof candidate.statusCode === 'number') return String(candidate.statusCode);
    if (typeof candidate.status === 'number') return String(candidate.status);
  }
  return 'unknown';
}

const STAGE_LINE: Record<CommitStage, string> = {
  cutting: 'Cutting the pages…',
  hashing: 'Taking each page’s fingerprint…',
  uploading: 'Filing the prints…',
  filing: 'Moving the pointers — one transaction…',
};

export interface PlanConfirmStripProps {
  session: PlanStagedSession | null;
  proposals: LightTableProposal[];
  onSaveForLater: () => void;
  onRevert: () => void;
  onCommitted: (result: FilePlanPrintsResult) => void;
}

export function PlanConfirmStrip({
  session,
  proposals,
  onSaveForLater,
  onRevert,
  onCommitted,
}: PlanConfirmStripProps) {
  const projectId = session?.projectId ?? '';
  const filePrints = useFilePlanPrints(projectId);
  const [stage, setStage] = useState<CommitStage | null>(null);
  const [failure, setFailure] = useState<{ stage: CommitStage; message: string } | null>(
    null,
  );

  const running = stage !== null;

  useEffect(() => {
    if (session == null) {
      setStage(null);
      setFailure(null);
    }
  }, [session]);

  useEffect(() => {
    if (session == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Mid-flight the write completes regardless; Esc must restore the exact
      // prior state, and it no longer can.
      if (running) return;
      if (
        typeof document !== 'undefined' &&
        document.querySelector('[role="dialog"]')
      )
        return;
      event.stopPropagation();
      onRevert();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [session, running, onRevert]);

  if (session == null) return null;

  const summary = confirmSummary(proposals);
  const commitDisabled = !summary.ready || running;

  const handleCommit = async () => {
    // Re-guard: the button is disabled on an open fork, but a force-enabled
    // button (or a stray keyboard activation) must still write nothing.
    if (!summary.ready || running) return;
    setFailure(null);

    const fail = (failedStage: CommitStage, error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : typeof (error as { message?: unknown })?.message === 'string'
            ? String((error as { message: string }).message)
            : 'The filing could not be completed.';
      setFailure({ stage: failedStage, message });
      setStage(null);
      planRoomEvents.lightTableFailed({
        project_id: session.projectId,
        stage: failedStage,
        code: failureCode(error),
      });
    };

    const uploads: Record<number, PrintUploadInput> = {};
    const supabase = createBrowserClient() as unknown as {
      storage: {
        from: (bucket: string) => {
          upload: (
            path: string,
            body: Blob,
            options: { contentType: string; upsert: boolean },
          ) => Promise<{ error: { message: string } | null }>;
        };
      };
    };

    for (const proposal of proposals) {
      if (proposal.kind === 'unmatched') continue;
      const resolved = proposal.fork ?? proposal.kind;
      if (resolved === 'confirm_current') continue;

      const origin = session.origins[proposal.pageIndex];
      const source = origin ? session.sources[origin.sourceIndex] : undefined;
      if (!origin || !source) {
        fail('cutting', new Error('A staged page lost the file it came from.'));
        return;
      }

      // ── Stage 1 — cut the page out as its own PDF ──────────────────────
      setStage('cutting');
      let pageBytes: Uint8Array;
      try {
        pageBytes = await extractSinglePagePdf(source.bytes, origin.localPageIndex);
      } catch (error) {
        fail('cutting', error);
        return;
      }

      // ── Stage 2 — fingerprint the bytes and the text layer ─────────────
      setStage('hashing');
      let sha256: string;
      try {
        sha256 = await sha256Hex(pageBytes);
      } catch (error) {
        fail('hashing', error);
        return;
      }

      // ── Stage 3 — put the bytes where the RPC will look for them ───────
      // The path is derived from the session key, so a retry overwrites its own
      // object rather than leaving an orphan behind.
      setStage('uploading');
      const safeNumber = (proposal.sheetNumber ?? 'page').replace(/[^\w.-]+/g, '_');
      const storagePath = `${session.projectId}/plans/${session.idempotencyKey}/${proposal.pageIndex}-${safeNumber}.pdf`;
      try {
        const { error } = await supabase.storage
          .from('project-documents')
          .upload(storagePath, new Blob([pageBytes as BlobPart], { type: 'application/pdf' }), {
            contentType: 'application/pdf',
            upsert: true,
          });
        // Rethrow the object itself, not a fresh Error — its statusCode is what
        // failureCode reports, and wrapping would flatten it to 'unknown'.
        if (error) throw error;
      } catch (error) {
        fail('uploading', error);
        return;
      }

      uploads[proposal.pageIndex] = {
        storage_path: storagePath,
        sha256,
        text_sha256: proposal.textSha256,
        size_bytes: pageBytes.byteLength,
        page_index: origin.localPageIndex,
        source_filename: source.name,
        doc_type: 'pdf',
      };
    }

    // ── Stage 4 — one RPC files every entry in one transaction ───────────
    setStage('filing');
    try {
      const result = await filePrints.mutateAsync({
        idempotencyKey: session.idempotencyKey,
        sourceFilename: session.sourceFilename,
        entries: planFileEntries(proposals, uploads),
      });
      planRoomEvents.lightTableConfirmed({
        project_id: session.projectId,
        batch_id: result.batchId,
        new_sheet_count: summary.newCount,
        revision_count: summary.revisionCount,
        confirmed_current_count: summary.confirmCount,
        loose_count: summary.looseCount,
        duration_ms: Date.now() - session.startedAt,
      });
      setStage(null);
      onCommitted(result);
    } catch (error) {
      fail('filing', error);
    }
  };

  return (
    <div
      role="region"
      aria-label="Pending filing"
      data-plan-confirm-strip
      /* Clears the Studio drawer exactly as the composition bar and the log
         strip do: the drawer is a 60px fixed rail at z-40 from 1180px up, and
         a strip that sat under it put the one verb that writes anything out of
         reach — which an e2e caught by clicking into the drawer instead. */
      className="sticky bottom-0 z-[45] mt-4 flex flex-wrap items-center justify-between gap-4 border-l-[2.5px] border-[var(--color-golden-hour)] bg-[var(--color-off-white)] px-4 py-2.5 min-[1180px]:bottom-[60px]"
    >
      <div className="min-w-0">
        <p
          aria-hidden
          className="font-body text-[0.82rem] leading-snug text-[var(--color-charcoal)]"
        >
          <strong className="font-semibold">{summary.sentence}</strong>
        </p>
        <span className="sr-only" aria-live="polite">
          {summary.sentence}
        </span>
        {!summary.ready && (
          <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {Object.keys(summary.conflicts).length > 0
              ? 'Two cards want the same sheet — settle it before the table files'
              : 'Answer every card before the table files'}
          </p>
        )}
        {stage && (
          <p
            role="status"
            aria-live="polite"
            className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]"
          >
            {STAGE_LINE[stage]}
          </p>
        )}
        {failure && (
          <p
            role="alert"
            className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]"
          >
            {STAGE_LINE[failure.stage].replace('…', '')} failed — nothing moved.{' '}
            {failure.message}
          </p>
        )}
      </div>

      <DocumentActionGroup
        surfaceKey="plan-room"
        regionKey="light-table-confirmation"
        className="shrink-0"
      >
        <DocumentAction
          actionKey="save-light-table"
          variant="tertiary"
          onClick={onSaveForLater}
          disabled={running}
        >
          Save the table for later
        </DocumentAction>
        <DocumentAction
          actionKey="file-plan-prints"
          variant="primary"
          onClick={handleCommit}
          disabled={commitDisabled}
          loading={running}
          loadingLabel="Filing…"
        >
          {summary.primaryLabel}
        </DocumentAction>
      </DocumentActionGroup>
    </div>
  );
}
