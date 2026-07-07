'use client';

import { Select } from '@/components/ui/controls';
import {
  LEAD_TIME_BUCKETS,
  isKnownLeadTimeBucket,
  leadTimeLabel,
} from '@/lib/scope/lead-time';

/**
 * Lead-time bucket picker (Track S · S2). Writes the bucket's upper bound into
 * proposal_items.lead_time_weeks. Shared by the scope-builder edit form and the
 * Drafting Room line unfold. Shadow-free (safe on Document surfaces).
 *
 * `value` is the stored int (or null). A legacy value that isn't a canonical
 * bucket is preserved as a transient "N wks" option so editing never silently
 * drops it.
 */
export function LeadTimeSelect({
  value,
  onChange,
  disabled,
  className,
  ariaLabel = 'Lead time',
}: {
  value: number | null;
  onChange: (weeks: number | null) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const isLegacy = value != null && !isKnownLeadTimeBucket(value);
  const selectValue = value == null ? '' : String(value);

  return (
    <Select
      aria-label={ariaLabel}
      value={selectValue}
      disabled={disabled}
      className={className}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : Number(v));
      }}
    >
      <option value="">Lead time…</option>
      {LEAD_TIME_BUCKETS.map((b) => (
        <option key={b.value} value={b.value}>
          {b.label}
        </option>
      ))}
      {isLegacy && (
        <option value={String(value)}>{leadTimeLabel(value)}</option>
      )}
    </Select>
  );
}
