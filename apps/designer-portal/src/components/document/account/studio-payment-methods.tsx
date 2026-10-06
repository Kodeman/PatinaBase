'use client';

/**
 * Studio payment methods (D2 §M5, D1-11): the cards and accounts the studio
 * pays its makers with, named the way the studio says them ("Amex · Leah").
 * Only the last four digits are kept, never a full number — the RPC refuses
 * anything else (00695). Removing one archives it, so the payments that name
 * it keep their label. Any non-guest member may keep this list.
 */

import { useState } from 'react';
import {
  useStudioPaymentMethods,
  useUpsertStudioPaymentMethod,
  type VendorPaymentMethodKind,
} from '@patina/supabase';
import { Select } from '@/components/ui/controls';
import { DocumentAction, DocumentActionGroup } from '../document-action';

const FIELD =
  'w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[14px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]';
const LABEL =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const HELP = 'mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]';

const KIND_OPTIONS: { value: VendorPaymentMethodKind; label: string }[] = [
  { value: 'card', label: 'Card' },
  { value: 'ach', label: 'ACH' },
  { value: 'check', label: 'Check' },
  { value: 'wire', label: 'Wire' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

const kindLabel = (k: VendorPaymentMethodKind) =>
  KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;

const errText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

export function StudioPaymentMethodsCard({
  studioId,
  canEdit,
}: {
  studioId: string;
  canEdit: boolean;
}) {
  const { data: methods, isLoading } = useStudioPaymentMethods(studioId);
  const upsert = useUpsertStudioPaymentMethod({ errorSurface: 'inline' });
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<VendorPaymentMethodKind>('card');
  const [last4, setLast4] = useState('');
  const [error, setError] = useState<string | null>(null);

  const last4Ok = last4 === '' || /^\d{4}$/.test(last4);
  const canAdd = label.trim() !== '' && last4Ok && !upsert.isPending;

  const add = () => {
    if (!canAdd) return;
    setError(null);
    upsert
      .mutateAsync({
        organizationId: studioId,
        label: label.trim(),
        kind,
        last4: last4 || null,
      })
      .then(() => {
        setLabel('');
        setLast4('');
        setKind('card');
      })
      .catch((e) => setError(errText(e, 'Could not add this payment method.')));
  };

  const remove = (id: string) => {
    if (upsert.isPending) return;
    setError(null);
    upsert
      .mutateAsync({ id, archived: true })
      .catch((e) => setError(errText(e, 'Could not remove this payment method.')));
  };

  return (
    <div
      data-testid="studio-payment-methods"
      className="mb-6 border-t border-[var(--color-pearl)] pt-5"
    >
      <h3 className={`${LABEL} mb-3`}>Paying makers</h3>
      <p className={`${HELP} mb-4 mt-0`}>
        The cards and accounts the studio pays vendors with, offered when
        someone records a payment. Only the last four digits are kept.
      </p>

      {isLoading ? (
        <p className={HELP}>Reading…</p>
      ) : (methods ?? []).length === 0 ? (
        <p className={HELP}>None yet.</p>
      ) : (
        <ul className="mb-4 max-w-md">
          {(methods ?? []).map((m) => (
            <li
              key={m.id}
              className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--color-pearl)] text-[13px] text-[var(--color-charcoal)]"
            >
              <span>
                {m.label}
                <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                  {kindLabel(m.kind)}
                  {m.last4 ? ` ••${m.last4}` : ''}
                </span>
              </span>
              {canEdit && (
                <DocumentAction
                  actionKey="archive-studio-payment-method"
                  surfaceKey="account"
                  regionKey="studio-payment-methods"
                  variant="tertiary"
                  disabled={upsert.isPending}
                  onClick={() => remove(m.id)}
                  aria-label={`Remove ${m.label}`}
                >
                  Remove
                </DocumentAction>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="max-w-md">
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_120px_96px]">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="studio-pm-label" className={LABEL}>
                Name
              </label>
              <input
                id="studio-pm-label"
                value={label}
                placeholder="Amex · Leah"
                onChange={(e) => setLabel(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="studio-pm-kind" className={LABEL}>
                Kind
              </label>
              <Select
                id="studio-pm-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as VendorPaymentMethodKind)}
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="studio-pm-last4" className={LABEL}>
                Last 4
              </label>
              <input
                id="studio-pm-last4"
                value={last4}
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                placeholder="4471"
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={FIELD}
              />
            </div>
          </div>
          {!last4Ok && (
            <p role="alert" className="mt-1 text-[12px] text-[var(--color-terracotta-ink)]">
              Enter exactly four digits, or leave it empty.
            </p>
          )}
          <DocumentActionGroup
            surfaceKey="account"
            regionKey="studio-payment-methods"
            className="mt-3 items-center"
          >
            <DocumentAction
              actionKey="add-studio-payment-method"
              variant="secondary"
              onClick={add}
              disabled={!canAdd}
              loading={upsert.isPending}
              loadingLabel="Saving…"
            >
              Add
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}
