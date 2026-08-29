'use client';

/**
 * The quiet second chip row (Call Sheet Wave 2, slide 8's `.subchips`) — a
 * single-select refinement of the role chip above it, never a second axis of
 * its own. Trades (ALL_FIELD_TRADES) when the Subs chip is active; vendor
 * specialties (ALL_VENDOR_SPECIALTIES) when Makers is. Same Scored Ink
 * grammar as scope-lens.tsx and every other da-score control in the app —
 * plain lowercase mono words, no border, no fill, no pill: aged-oak at rest,
 * `da-score-hover`'s hairline on hover/focus, `da-score-on`'s charcoal
 * underline-held-down when selected. A currently-selected value that isn't in
 * the canonical list (legacy free text on an older row) still renders through
 * the same getLabel fallback the roster's own relationship line uses — never
 * a raw snake_case token.
 */

import {
  ALL_FIELD_TRADES,
  ALL_VENDOR_SPECIALTIES,
  getFieldTradeLabel,
  getVendorSpecialtyLabel,
} from '@patina/types';

export type TradeChipDomain = 'trade' | 'specialty';

const WORD =
  'da-score-hover min-h-11 inline-flex items-center font-mono text-[11px] lowercase tracking-[0.04em] transition-colors';
const WORD_ON = 'da-score-on text-[var(--color-charcoal)]';
const WORD_OFF = 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]';

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
      className="mb-4 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5"
    >
      <button
        type="button"
        onClick={() => onChange('all')}
        aria-pressed={value === 'all'}
        className={`${WORD} ${value === 'all' ? WORD_ON : WORD_OFF}`}
      >
        all
      </button>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={`${WORD} ${value === opt ? WORD_ON : WORD_OFF}`}
        >
          {getLabel(opt).toLowerCase()}
        </button>
      ))}
      {freeTextValue && (
        <button
          type="button"
          onClick={() => onChange(freeTextValue)}
          aria-pressed="true"
          className={`${WORD} ${WORD_ON}`}
        >
          {getLabel(freeTextValue).toLowerCase()}
        </button>
      )}
    </div>
  );
}
