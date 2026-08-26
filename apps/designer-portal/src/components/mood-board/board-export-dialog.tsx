'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  type MoodBoardRasterInput,
} from '@patina/design-system';
import type { BoardOwnerRef } from '@patina/types';
import { Button } from '@/components/ui/controls';
import { downloadSpecPdf } from '@/lib/scope/spec-pdf-client';
import {
  exportMoodBoardPng,
  formatMoodBoardExportScale,
  getMoodBoardPngExportPlan,
  safeMoodBoardFilename,
} from '@/lib/mood-board-assets/export-board';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';

export type BoardExportFormat = 'png' | 'pdf_composition' | 'pdf_spec_sheet';

export interface BoardExportResult {
  format: BoardExportFormat;
  durationMs: number;
  failedImageCount: number;
}

function pngExportMessage(result: {
  effectiveScale: number;
  warnings: readonly unknown[];
}): string {
  const scale = result.effectiveScale < 2
    ? ` at ${formatMoodBoardExportScale(result.effectiveScale)}× effective scale (8192px cap)`
    : '';
  const placeholders = result.warnings.length
    ? ` with ${result.warnings.length} labelled image placeholder${result.warnings.length === 1 ? '' : 's'}`
    : '';
  return `PNG downloaded${scale}${placeholders}.`;
}

function pdfExportMessage(warnings: readonly string[], placeholderCount: number): string {
  const messages: string[] = ['PDF downloaded.'];
  if (warnings.includes('dense_board')) {
    messages.push(
      'This board is dense at one-page composition scale; choose Spec sheet for a more legible product reference.',
    );
  }
  if (warnings.includes('image_placeholders')) {
    messages.push(
      placeholderCount > 0
        ? `${placeholderCount} image${placeholderCount === 1 ? '' : 's'} could not be loaded and were replaced with labelled placeholders.`
        : 'Some images could not be loaded and were replaced with labelled placeholders.',
    );
  }
  if (warnings.some((warning) => warning !== 'dense_board' && warning !== 'image_placeholders')) {
    messages.push('The export completed with additional warnings.');
  }
  return messages.join(' ');
}

export function BoardExportDialog({
  boardId,
  boardName,
  owner,
  input,
  open,
  onOpenChange,
  flush,
  onExported,
}: {
  boardId: string;
  boardName: string;
  owner: BoardOwnerRef;
  input: MoodBoardRasterInput;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flush: () => Promise<void>;
  onExported?: (result: BoardExportResult) => void;
}) {
  const [busy, setBusy] = useState<BoardExportFormat | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pngPlan = useMemo(() => getMoodBoardPngExportPlan(input), [input]);

  const requestOwner = owner.kind === 'proposal'
    ? { proposalId: owner.id }
    : { projectId: owner.id };

  const run = async (
    format: BoardExportFormat,
    action: () => Promise<{ failedImageCount: number; message?: string }>,
  ) => {
    if (busy) return;
    const started = performance.now();
    setBusy(format);
    setProgress(0);
    setMessage(null);
    setError(null);
    try {
      await flush();
      const result = await action();
      setProgress(1);
      setMessage(result.message ?? 'Export downloaded.');
      const exported = {
        format,
        durationMs: Math.max(0, Math.round(performance.now() - started)),
        failedImageCount: result.failedImageCount,
      };
      moodBoardEvents.exported({
        format,
        board_id: boardId,
        item_count: 'items' in input && Array.isArray(input.items) ? input.items.length : 0,
        duration_ms: exported.durationMs,
        failed_image_count: exported.failedImageCount,
      });
      onExported?.(exported);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'The board could not be exported.';
      setError(reason);
      moodBoardEvents.exportFailed({ format, board_id: boardId, reason });
    } finally {
      setBusy(null);
    }
  };

  const exportPng = () =>
    void run('png', async () => {
      const result = await exportMoodBoardPng({
        input,
        boardName,
        onProgress: (value) => setProgress(value),
      });
      return {
        failedImageCount: result.warnings.length,
        message: pngExportMessage(result),
      };
    });

  const exportPdf = (kind: 'board-composition' | 'board') => {
    const format = kind === 'board-composition' ? 'pdf_composition' : 'pdf_spec_sheet';
    void run(format, async () => {
      const result = await downloadSpecPdf(
        { kind, ...requestOwner, boardId },
        safeMoodBoardFilename(
          kind === 'board-composition' ? boardName : `${boardName}-spec-sheet`,
          'pdf',
        ),
      );
      const placeholderMetadata = result.warningMetadata?.imagePlaceholders;
      const parsedPlaceholderCount = Array.isArray(placeholderMetadata)
        ? placeholderMetadata.length
        : Number(placeholderMetadata ?? 0);
      const placeholderCount = Number.isFinite(parsedPlaceholderCount)
        ? Math.max(0, parsedPlaceholderCount)
        : 0;
      return {
        failedImageCount: placeholderCount,
        message: pdfExportMessage(result.warnings, placeholderCount),
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export {boardName}</DialogTitle>
          <DialogDescription>
            Composition exports preserve the canvas. The spec sheet creates a grouped product reference.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={exportPng}
            disabled={busy !== null}
            className="rounded-[5px] border border-[var(--border-default)] p-4 text-left hover:border-[var(--color-clay)] disabled:cursor-wait disabled:opacity-60"
          >
            <span className="font-heading text-[14px] text-[var(--text-primary)]">Composition · PNG</span>
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
              {pngPlan.capped
                ? `${formatMoodBoardExportScale(pngPlan.effectiveScale)}× effective scale · ${pngPlan.width} × ${pngPlan.height}px (8192px cap).`
                : `2× raster · ${pngPlan.width} × ${pngPlan.height}px.`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => exportPdf('board-composition')}
            disabled={busy !== null}
            className="rounded-[5px] border border-[var(--border-default)] p-4 text-left hover:border-[var(--color-clay)] disabled:cursor-wait disabled:opacity-60"
          >
            <span className="font-heading text-[14px] text-[var(--text-primary)]">Composition · PDF</span>
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">One landscape page with authored geometry.</span>
          </button>
          <button
            type="button"
            onClick={() => exportPdf('board')}
            disabled={busy !== null}
            className="rounded-[5px] border border-[var(--border-default)] p-4 text-left hover:border-[var(--color-clay)] disabled:cursor-wait disabled:opacity-60"
          >
            <span className="font-heading text-[14px] text-[var(--text-primary)]">Spec sheet · PDF</span>
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">Section-grouped product tiles for sourcing.</span>
          </button>
        </div>

        {busy && (
          <div role="status" className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
              <div
                className="h-full bg-[var(--color-clay)] transition-[width] motion-reduce:transition-none"
                style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
              />
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              Preparing {Math.round(progress * 100)}%
            </p>
          </div>
        )}
        {message && <p className="text-[12px] text-[var(--color-sage)]">{message}</p>}
        {error && <p role="alert" className="text-[12px] text-[var(--color-clay-ink)]">{error}</p>}
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
