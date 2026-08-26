'use client';

import { useState, type ReactNode } from 'react';
import { type FFEStageKey } from '@patina/types';
import { StageSelect, type StageSyncInfo } from './stage-select';

type ItemType = 'fixed' | 'allowance' | 'tbd';

export interface FFEItemCardStage {
  currentStatus: FFEStageKey | string;
  onChangeStatus: (next: FFEStageKey) => void | Promise<void>;
  disabled?: boolean;
  /** PO-sync indicator (00184 stage ratchet) — passed through to StageSelect. */
  sync?: StageSyncInfo;
}

export interface FFEItemCardProps {
  name: string;
  imageUrl?: string | null;
  roomName?: string | null;
  vendorName?: string | null;
  /** Short spec/catalog reference (00262), rendered mono over the name. Hidden when absent. */
  docCode?: string | null;
  /** Pre-formatted lead-time bucket label (e.g. "3–4 wks"). Hidden when absent. */
  leadTimeLabel?: string | null;
  quantity?: number | null;
  /** Pre-formatted line total or budget range (e.g. "$4,200" or "$2k – $4k"). */
  unitTotalLabel?: string | null;
  /** Pre-formatted ETA (project board only). */
  etaLabel?: string | null;
  /**
   * Pre-formatted margin meta, e.g. "Margin $1,140" (00185 dual pricing).
   * Callers compute it ONLY for studio owners on items with a trade cost —
   * omitted/null renders nothing (hidden, never disabled).
   */
  marginLabel?: string | null;
  itemType?: ItemType | null;
  blocked?: boolean;
  blockedReason?: string | null;
  blockedByDecisionId?: string | null;

  selected?: boolean;
  /** Omit → no selection checkbox (proposal builder). */
  onToggleSelect?: () => void;
  /** Omit → card is not clickable (proposal builder uses inline edit). */
  onOpenDetail?: () => void;

  /** Optional stage dropdown slot — rendered only when provided (project board). */
  stage?: FFEItemCardStage;

  /** Optional action cluster (e.g. proposal edit/remove), revealed on hover. */
  actions?: ReactNode;
}

function typeChip(type: ItemType): { label: string; color: string; bg: string } {
  switch (type) {
    case 'fixed':
      return { label: 'Fixed', color: 'var(--color-sage)', bg: 'rgba(122, 155, 118, 0.08)' };
    case 'allowance':
      return { label: 'Allowance', color: 'var(--color-golden-hour)', bg: 'rgba(232, 197, 71, 0.08)' };
    case 'tbd':
      return { label: 'TBD', color: 'var(--text-muted)', bg: 'rgba(139, 115, 85, 0.06)' };
  }
}

/**
 * Shared FF&E item card used by the project FF&E board (with a stage dropdown)
 * and — visually — by the proposal schedule builder (no stage; edit/remove via
 * the `actions` slot). Adds a product thumbnail over the old image-less card.
 */
export function FFEItemCard({
  name,
  imageUrl,
  roomName,
  vendorName,
  docCode,
  leadTimeLabel,
  quantity,
  unitTotalLabel,
  etaLabel,
  marginLabel,
  itemType,
  blocked,
  blockedReason,
  blockedByDecisionId,
  selected = false,
  onToggleSelect,
  onOpenDetail,
  stage,
  actions,
}: FFEItemCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const chip = itemType ? typeChip(itemType) : null;
  const clickable = !!onOpenDetail;

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-md border bg-white text-left transition-colors ${
        clickable ? 'cursor-pointer hover:border-[var(--text-primary)]' : ''
      }`}
      style={{ borderColor: selected ? 'var(--text-primary)' : 'var(--border-default)' }}
      onClick={onOpenDetail}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenDetail?.();
              }
            }
          : undefined
      }
    >
      {/* Thumbnail */}
      <div
        className="relative w-full overflow-hidden bg-[var(--bg-surface)]"
        style={{ aspectRatio: '4 / 3' }}
      >
        {imageUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ color: 'var(--text-muted)' }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', opacity: 0.5 }}>
              {(name || '?').trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggleSelect}
            aria-label={`Select ${name}`}
            className="absolute right-2 top-2 h-4 w-4 cursor-pointer accent-[var(--text-primary)]"
          />
        )}
        {chip && (
          <span
            className="absolute left-2 top-2 inline-flex whitespace-nowrap rounded-sm px-1.5 py-0.5"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: chip.color,
              background: chip.bg,
            }}
          >
            {chip.label}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        {docCode && (
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[var(--color-clay-ink)]">
            {docCode}
          </span>
        )}
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 font-body text-[0.8rem] font-medium text-[var(--text-primary)]">
            {name}
          </span>
          {actions && (
            <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {actions}
            </span>
          )}
        </div>

        {blocked && (
          <div
            className="type-meta-small uppercase tracking-wider"
            style={{ color: 'var(--color-terracotta-ink)' }}
            title={blockedReason ?? undefined}
          >
            ⚠ Blocked
            {blockedByDecisionId ? ' — pending decision' : ''}
          </div>
        )}

        {roomName && (
          <div className="type-meta-small text-[var(--text-muted)]">{roomName}</div>
        )}
        {vendorName && (
          <div className="type-meta-small text-[var(--text-muted)]">{vendorName}</div>
        )}
        {leadTimeLabel && (
          <div className="type-meta-small text-[var(--text-muted)]">Lead {leadTimeLabel}</div>
        )}

        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <span className="font-heading text-[0.85rem] font-semibold text-[var(--text-primary)]">
            {unitTotalLabel ?? '—'}
            {typeof quantity === 'number' && quantity > 1 && (
              <span className="ml-1 type-meta-small font-normal text-[var(--text-muted)]">
                ×{quantity}
              </span>
            )}
          </span>
          {etaLabel && (
            <span className="type-meta-small text-[var(--text-muted)]">ETA {etaLabel}</span>
          )}
        </div>

        {marginLabel && (
          <div className="type-meta-small text-[var(--text-muted)]">{marginLabel}</div>
        )}

        {stage && (
          <div className="pt-1">
            <StageSelect
              currentStatus={stage.currentStatus}
              onChangeStatus={stage.onChangeStatus}
              disabled={stage.disabled}
              sync={stage.sync}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
