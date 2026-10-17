'use client';

/**
 * Account · Profile · Pricing (US-37 #4, contract D4; 00809). The designer's
 * default markups: goods (35 until set) and one each for freight, delivery
 * and install. A line takes its kind's default when its cost is known and its
 * client price is not, and on a reset. A job's own target, set in the Price
 * lens summary, overrides the goods default there. Saving prices nothing
 * already placed (set_my_pricing_settings).
 */

import { useEffect, useState } from 'react';
import { usePricingSettings, useSetPricingSettings } from '@patina/supabase';
import type { DesignerPricingSettings, SetDesignerPricingSettingsRequest } from '@patina/types';
import { Input } from '@/components/ui/controls';
import { ActFailLine } from '@/components/feedback/act-fail-line';
import { DocumentAction } from '../document-action';

const FIELD =
  'w-[120px] rounded-none border-0 border-b border-[var(--color-pearl)] bg-transparent px-0 py-2 text-[15px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:ring-0';
const LABEL =
  'mb-1 block font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

type Key = keyof SetDesignerPricingSettingsRequest;

const FIELDS: ReadonlyArray<{ key: Key; label: string }> = [
  { key: 'defaultMarkupPercent', label: 'Default markup %' },
  { key: 'freightMarkupPercent', label: 'Freight markup %' },
  { key: 'deliveryMarkupPercent', label: 'Delivery markup %' },
  { key: 'installMarkupPercent', label: 'Install markup %' },
];

type Drafts = Record<Key, string>;

function draftsOf(settings: DesignerPricingSettings | undefined): Drafts {
  const text = (n: number | undefined) => (n == null ? '35' : String(n));
  return {
    defaultMarkupPercent: text(settings?.defaultMarkupPercent),
    freightMarkupPercent: text(settings?.freightMarkupPercent),
    deliveryMarkupPercent: text(settings?.deliveryMarkupPercent),
    installMarkupPercent: text(settings?.installMarkupPercent),
  };
}

/** `35`, `12.5 %` → a markup from 0 to 1000; undefined otherwise. */
function parseMarkup(text: string): number | undefined {
  const cleaned = text.replace(/[%\s]/g, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : undefined;
}

export function AccountPricingSection() {
  const { data: settings } = usePricingSettings();
  const save = useSetPricingSettings();
  const [drafts, setDrafts] = useState<Drafts>(() => draftsOf(settings));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setDrafts(draftsOf(settings));
  }, [settings]);

  const handleSave = () => {
    const request: SetDesignerPricingSettingsRequest = {};
    for (const { key, label } of FIELDS) {
      const value = parseMarkup(drafts[key]);
      if (value === undefined) {
        setError(`${label.replace(' %', '')} is a number from 0 to 1000.`);
        return;
      }
      request[key] = value;
    }
    setError(null);
    setSaved(false);
    save.mutate(request, { onSuccess: () => setSaved(true) });
  };

  return (
    <section aria-labelledby="account-pricing-heading">
      <h3
        id="account-pricing-heading"
        className="mb-1 font-heading text-[15px] text-[var(--color-charcoal)]"
      >
        Pricing
      </h3>
      <p className="mb-3 max-w-[60ch] text-[14px] leading-[1.5] text-[var(--color-aged-oak)]">
        A line takes its kind&apos;s markup when its cost is known and its client price is
        not, and again when you reset it. A job&apos;s own target, set on its Price page,
        overrides the default markup there. Saving changes no price already set.
      </p>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label htmlFor={`account-pricing-${key}`} className={LABEL}>
              {label}
            </label>
            <Input
              id={`account-pricing-${key}`}
              variant="underline"
              inputMode="decimal"
              value={drafts[key]}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const value = e.target.value;
                setSaved(false);
                setDrafts((current) => ({ ...current, [key]: value }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              className={`t-money ${FIELD}`}
              style={{ fontFamily: 'var(--font-meta)' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <DocumentAction
          actionKey="save-pricing-defaults"
          surfaceKey="account"
          regionKey="pricing"
          variant="secondary"
          onClick={handleSave}
          disabled={save.isPending}
          loading={save.isPending}
          loadingLabel="Saving…"
        >
          Save pricing
        </DocumentAction>
        {saved ? (
          <span role="status" className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
            Saved
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] text-[var(--color-charcoal)]">
          {error}
        </p>
      ) : null}
      <ActFailLine error={save.error} onRetry={handleSave} retryKey="retry-save-pricing" />
    </section>
  );
}
