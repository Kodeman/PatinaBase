'use client';

import { GripVertical } from 'lucide-react';
import Link from 'next/link';
import type { VendorPipeline } from '@patina/types';
import { StatusDot } from '@/components/portal/status-dot';
import {
  VENDOR_STAGES,
  VENDOR_STAGE_LABELS,
  formatAgeInStage,
  formatVendorScore,
  isAgeStale,
  TRIAGE_DOT_COLOR,
  type TriageLevel,
} from '@/lib/pipeline-stages';
import type { DragHandleProps } from './pipeline-dnd-board';
import { CardActionMenu } from './card-action-menu';

type Vendor = VendorPipeline.Vendor;

const STAGE_TARGETS = VENDOR_STAGES.map((id) => ({ id, label: VENDOR_STAGE_LABELS[id] }));

interface MakerVendorCardProps {
  vendor: Vendor;
  dragHandleProps: DragHandleProps;
  onMove: (toStage: string) => void;
  moving?: boolean;
}

export function MakerVendorCard({ vendor, dragHandleProps, onMove, moving }: MakerVendorCardProps) {
  const age = formatAgeInStage(vendor.stage_changed_at);
  const stale = isAgeStale(vendor.stage_changed_at);
  const score = formatVendorScore(vendor.total_score);
  const triage = vendor.triage_level as TriageLevel | null;

  return (
    <div
      data-testid="maker-vendor-card"
      data-vendor-id={vendor.id}
      className="border border-[var(--border-subtle)] p-3 transition-colors hover:border-[var(--border-default)]"
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
            <Link
              href={`/pipeline/${vendor.slug}` as any}
              className="type-item-name truncate no-underline hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {vendor.name}
            </Link>
            <CardActionMenu
              currentStage={vendor.stage}
              stages={STAGE_TARGETS}
              onMove={onMove}
              disabled={moving}
            />
          </div>

          <div className="mt-1 flex items-center gap-2">
            {triage && <StatusDot color={TRIAGE_DOT_COLOR[triage]} size="sm" />}
            {score && (
              <span
                className="tabular-nums text-[0.68rem] text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-meta)' }}
              >
                {score}
              </span>
            )}
            {vendor.awaiting_leah_review && (
              <span
                className="inline-flex items-center border border-[var(--color-clay)] px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-clay)]"
                style={{ fontFamily: 'var(--font-meta)' }}
              >
                Leah review
              </span>
            )}
          </div>

          <div className="mt-2">
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
        </div>
      </div>
    </div>
  );
}
