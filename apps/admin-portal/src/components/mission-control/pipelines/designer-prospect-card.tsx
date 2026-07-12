'use client';

import { GripVertical } from 'lucide-react';
import type { DesignerProspect } from '@/services/pipelines';
import {
  DESIGNER_PROSPECT_STAGES,
  DESIGNER_PROSPECT_STAGE_LABELS,
  formatAgeInStage,
  isAgeStale,
} from '@/lib/pipeline-stages';
import type { DragHandleProps } from './pipeline-dnd-board';
import { CardActionMenu } from './card-action-menu';

const STAGE_TARGETS = DESIGNER_PROSPECT_STAGES.map((id) => ({
  id,
  label: DESIGNER_PROSPECT_STAGE_LABELS[id],
}));

interface DesignerProspectCardProps {
  prospect: DesignerProspect;
  dragHandleProps: DragHandleProps;
  onMove: (toStage: string) => void;
  moving?: boolean;
}

export function DesignerProspectCard({
  prospect,
  dragHandleProps,
  onMove,
  moving,
}: DesignerProspectCardProps) {
  const age = formatAgeInStage(prospect.stage_entered_at);
  const stale = isAgeStale(prospect.stage_entered_at);

  return (
    <div
      data-testid="designer-prospect-card"
      data-prospect-id={prospect.id}
      className="border border-[var(--border-subtle)] bg-[var(--bg-surface,transparent)] p-3 transition-colors hover:border-[var(--border-default)]"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
          aria-label="Drag to move"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-[var(--text-subtle)] hover:text-[var(--text-muted)] active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="type-item-name truncate">{prospect.full_name}</h4>
            <CardActionMenu
              currentStage={prospect.stage}
              stages={STAGE_TARGETS}
              onMove={onMove}
              disabled={moving}
            />
          </div>

          {prospect.studio_name && (
            <p className="truncate text-[0.72rem] text-[var(--text-muted)]">{prospect.studio_name}</p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-flex items-center border border-[var(--border-default)] px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-meta)' }}
            >
              {prospect.owner}
            </span>
            <span
              className="tabular-nums text-[0.68rem]"
              style={{
                fontFamily: 'var(--font-meta)',
                color: stale ? 'var(--color-terracotta)' : 'var(--text-muted)',
              }}
              title="Time in current stage"
            >
              {age}
            </span>
          </div>

          {(prospect.next_action || prospect.next_action_due) && (
            <p className="mt-2 text-[0.7rem] italic text-[var(--text-subtle)]">
              {prospect.next_action ?? 'Next action'}
              {prospect.next_action_due && (
                <>
                  {' '}
                  &middot; due{' '}
                  {new Date(prospect.next_action_due + 'T00:00:00').toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
