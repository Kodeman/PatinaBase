import { MetricBlock, StatusDot } from '@/components/portal';
import { formatVitalValue, formatVitalDelta, vitalTrend } from '@/lib/vitals-format';
import type { MarketplaceVitalRow } from '@/hooks/use-vitals';

// Band -> semantic token (matches ConfidenceBadge's BAND_TOKEN, WP-1.1). The
// dot is the only thing that changes on a band crossing — no other styling
// reacts to band, per the WP-1.2 "no sparkline zoo" instruction.
const BAND_TOKEN: Record<MarketplaceVitalRow['band'], string> = {
  green: 'var(--color-sage)',
  yellow: 'var(--color-clay)',
  red: 'var(--color-terracotta)',
  neutral: 'var(--text-muted)',
};

interface VitalTileProps {
  row: MarketplaceVitalRow;
}

export function VitalTile({ row }: VitalTileProps) {
  // Inactive placeholder (attach_rate until WP-3.1 instruments it): always
  // an em dash, muted sublabel, no status dot — never a band color for a
  // metric with nothing behind it yet.
  if (!row.active) {
    return (
      <MetricBlock
        label={row.label}
        value="—"
        change="Instruments in Q3 · WP-3.1"
        trend="neutral"
      />
    );
  }

  const value = formatVitalValue(row.unit, row.value);
  const change = formatVitalDelta(row.unit, row.value, row.prev_value);
  const trend = vitalTrend(row.value, row.prev_value);

  return (
    <MetricBlock
      label={row.label}
      labelExtra={<StatusDot color={BAND_TOKEN[row.band]} size="sm" />}
      value={value}
      change={change}
      trend={trend}
      changeClassName="tabular-nums"
    />
  );
}
