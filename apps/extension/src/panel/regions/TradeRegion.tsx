/**
 * Region B — the Trade layer (brass). Retail price + a trade-pricing hint when a
 * manufacturer vendor is linked. The full multi-vendor trade table arrives with
 * the trade-account wiring in a later phase.
 */
import { useDraft } from '../../state/CaptureProvider';

function fmt(dollars: string): string {
  const n = parseFloat(dollars);
  if (!dollars || isNaN(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TradeRegion() {
  const draft = useDraft();
  if (!draft) return null;
  const vendor = draft.manufacturer.vendor;

  return (
    <section className="rounded-md border border-brass/30 bg-brass/5 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-brass">
          Trade
        </span>
        <span className="font-mono text-[0.85rem] text-ink">{fmt(draft.fields.price.value)}</span>
      </div>
      <p className="mt-1 text-[0.72rem] leading-snug text-ink-soft">
        {vendor
          ? `Trade pricing resolves against ${vendor.name} once the account is linked.`
          : 'Link a manufacturer to surface trade pricing.'}
      </p>
    </section>
  );
}
