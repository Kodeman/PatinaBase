'use client';

import type { FulfillmentQueueRow } from '@patina/fulfillment';
import { describeNextAction, formatStageAge, isBreachedAge } from '@patina/fulfillment';
import { ListRow } from '@/components/portal';

// A single Fulfillment Queue row (S1, spec §5.1): mono order number + client
// name, a meta line (vendor count / designer-sourced / unmapped / exception
// counts), per-PO stage dots, and the right-edge next-action verb in clay —
// terracotta when the row is SLA-breached. Renders whatever the queue view
// gives it: an unrecognized next_action_kind still renders (describeNextAction
// falls back to a neutral verb) — this row is never dropped for that reason.

type PoStatus = FulfillmentQueueRow['po_stages'][number]['status'];

function stageDotVariant(status: PoStatus): 'off' | 'on' | 'bad' {
  if (status === 'cancelled') return 'bad';
  if (status === 'draft' || status === 'sent') return 'off';
  return 'on'; // acknowledged, in_production, shipped, delivered, settled
}

function StageDots({ poStages }: { poStages: FulfillmentQueueRow['po_stages'] }) {
  if (!poStages || poStages.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1" data-testid="stage-dots">
      {poStages.slice(0, 6).map((po) => {
        const variant = stageDotVariant(po.status);
        const color =
          variant === 'bad'
            ? 'var(--color-terracotta, var(--color-error))'
            : variant === 'on'
              ? 'var(--color-sage, var(--color-success))'
              : 'var(--border-default)';
        return (
          <span
            key={po.po_id}
            data-testid="stage-dot"
            data-variant={variant}
            title={`${po.vendor_name ?? 'Vendor'} — ${po.status}`}
            className="inline-block h-1.5 w-1.5 rounded-full border"
            style={{
              borderColor: color,
              backgroundColor: variant === 'off' ? 'transparent' : color,
            }}
          />
        );
      })}
    </span>
  );
}

export interface QueueRowProps {
  row: FulfillmentQueueRow;
  selected: boolean;
  onOpen: () => void;
}

export function QueueRow({ row, selected, onOpen }: QueueRowProps) {
  const breached = isBreachedAge(row.breached);
  const verb = describeNextAction({ kind: row.next_action_kind, params: row.next_action_params ?? undefined });
  const age = formatStageAge(row.stage_age_business_hours);

  const metaParts: Array<string | undefined | false> = [
    row.vendor_count > 0 ? `${row.vendor_count} vendor${row.vendor_count === 1 ? '' : 's'}` : undefined,
    row.designer_attribution ? 'designer-sourced' : undefined,
    row.has_unmapped ? `${row.unmapped_count} unmapped` : undefined,
    row.open_exceptions > 0
      ? `${row.open_exceptions} exception${row.open_exceptions === 1 ? '' : 's'}`
      : undefined,
  ];

  return (
    <div
      data-testid="queue-row"
      data-order-id={row.order_id}
      data-band={row.band}
      data-selected={selected}
      className={
        selected
          ? 'outline outline-2 outline-offset-[-2px] outline-[var(--color-clay)]'
          : undefined
      }
    >
      <ListRow
        onClick={onOpen}
        title={
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[0.72rem] text-[var(--text-muted)]">
              #{row.order_no}
            </span>
            <span>{row.client_name}</span>
          </span>
        }
        meta={metaParts}
        right={
          <div className="flex items-center gap-4">
            <StageDots poStages={row.po_stages} />
            <div className="text-right">
              <div
                data-testid="queue-row-verb"
                className="text-[0.78rem] font-medium"
                style={{ color: 'var(--color-clay)' }}
              >
                {verb}
              </div>
              <div
                data-testid="queue-row-age"
                data-breached={breached}
                className="mt-0.5 font-mono text-[0.66rem]"
                style={{
                  color: breached
                    ? 'var(--color-terracotta, var(--color-error))'
                    : 'var(--text-subtle)',
                }}
              >
                {age}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
