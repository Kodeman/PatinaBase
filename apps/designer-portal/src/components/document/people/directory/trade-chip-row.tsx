'use client';

/**
 * The quiet second chip row (Call Sheet Wave 2, slide 8's `.subchips`) — a
 * single-select refinement of the role chip above it, never a second axis of
 * its own. Trades (ALL_FIELD_TRADES) when the Subs chip is active; vendor
 * specialties (ALL_VENDOR_SPECIALTIES) when Makers is. Lowercase mono 8.5px
 * bordered chips; the active chip fills charcoal, matching the role-chip
 * grammar one size down. A currently-selected value that isn't in the
 * canonical list (legacy free text on an older row) still renders through the
 * same getLabel fallback the roster's own relationship line uses — never a
 * raw snake_case token.
 */

import {
  ALL_FIELD_TRADES,
  ALL_VENDOR_SPECIALTIES,
  getFieldTradeLabel,
  getVendorSpecialtyLabel,
} from '@patina/types';

export type TradeChipDomain = 'trade' | 'specialty';

const CHIP_BASE =
  'min-h-11 rounded-[12px] border px-2.5 py-1 font-mono text-[8.5px] lowercase tracking-[0.04em] transition-colors';
const CHIP_ON =
  'border-[var(--color-charcoal)] bg-[var(--color-charcoal)] text-[var(--color-off-white)]';
const CHIP_OFF =
  'border-[var(--color-pearl)] bg-white text-[var(--color-aged-oak)] hover:border-[var(--color-clay)]';

export function TradeChipRow({
  domain,
  value,
  onChange,
}: {
  domain: TradeChipDomain;
  /** 'all' or a canonical trade/specialty token. A free-text legacy value the
   *  roster happens to carry also renders (via the label fallback) if it's
   *  the current value, even though it isn't one of the option chips. */
  value: string;
  onChange: (value: string) => void;
}) {
  const options: readonly string[] =
    domain === 'trade' ? ALL_FIELD_TRADES : ALL_VENDOR_SPECIALTIES;
  const getLabel = domain === 'trade' ? getFieldTradeLabel : getVendorSpecialtyLabel;
  const freeTextValue = value !== 'all' && !options.includes(value) ? value : null;

  return (
    <div
      role="group"
      aria-label={domain === 'trade' ? 'Filter by trade' : 'Filter by specialty'}
      className="mb-4 flex flex-wrap gap-1.5"
    >
      <button
        type="button"
        onClick={() => onChange('all')}
        aria-pressed={value === 'all'}
        className={`${CHIP_BASE} ${value === 'all' ? CHIP_ON : CHIP_OFF}`}
      >
        all
      </button>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={`${CHIP_BASE} ${value === opt ? CHIP_ON : CHIP_OFF}`}
        >
          {getLabel(opt).toLowerCase()}
        </button>
      ))}
      {freeTextValue && (
        <button
          type="button"
          onClick={() => onChange(freeTextValue)}
          aria-pressed="true"
          className={`${CHIP_BASE} ${CHIP_ON}`}
        >
          {getLabel(freeTextValue).toLowerCase()}
        </button>
      )}
    </div>
  );
}
