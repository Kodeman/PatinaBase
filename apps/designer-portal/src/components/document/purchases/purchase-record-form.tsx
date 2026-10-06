'use client';

/**
 * "Bought it already" (C-25, d2 §M9, D1-13, Story C at 390): the purchase
 * record form inside the Add to the job sheet. A store buy, a find, an
 * antique or auction lot, an expense or a sample fee. The payee is just a
 * name, with an optional link to a maker. Recording against a line moves
 * the line to ordered through record_studio_purchase (00703), which holds the
 * FF&E guard. The form records the cost only. Billing it is the composer's
 * act, at cost on its own line by default (R-PB7).
 *
 * One column at 390, every control at least 44px tall, the record act last.
 */

import { useMemo, useState } from 'react';
import {
  useOrganizationMembers,
  useProjectFFEItems,
  useProjectRecordedStudio,
  useRecordStudioPurchase,
  useStudioPaymentMethods,
  useStudioPurchases,
  useUser,
  type StudioPurchaseKind,
} from '@patina/supabase';
import { formatCurrency } from '@patina/shared';
import { useUploadFolioFile } from '@/hooks/use-folio';
import { todayYmd } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { MakerSearch, type MakerOption } from '../line-unfold/the-buy-cell';
import {
  OWN_CARD,
  PURCHASE_KINDS,
  buildPurchaseRequest,
  buyableLines,
  draftFigures,
  returnableByDefault,
  takesBuyerPremium,
  type PurchaseDraft,
} from './purchase-record';

const FIELD =
  'min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2.5 text-[13px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]';
const LABEL = 'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const META = 'text-[11px] text-[var(--text-muted)]';

const errText = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'The buy could not be recorded.';

export function PurchaseRecordForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: (result: string) => void;
}) {
  const record = useRecordStudioPurchase({ errorSurface: 'inline' });
  const upload = useUploadFolioFile(projectId);
  const { data: studioId } = useProjectRecordedStudio(projectId);
  const { data: methods } = useStudioPaymentMethods(studioId ?? undefined);
  const { data: members } = useOrganizationMembers(studioId ?? '');
  const { user } = useUser();
  const { data: items } = useProjectFFEItems(projectId);
  const { data: purchases } = useStudioPurchases({ projectId });

  const [draft, setDraft] = useState<PurchaseDraft>(() => ({
    kind: 'card_retail',
    description: '',
    payeeName: '',
    vendorId: null,
    purchasedOn: todayYmd(),
    amount: '',
    tax: '',
    buyerPremium: '',
    shipping: '',
    paidWith: '',
    returnable: true,
    returnBy: null,
    forProject: true,
    ffeItemId: '',
    billableToClient: true,
  }));
  const [maker, setMaker] = useState<{ id: string; name: string } | null>(null);
  const [linkingMaker, setLinkingMaker] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PurchaseDraft>(key: K, value: PurchaseDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const chooseKind = (kind: StudioPurchaseKind) =>
    setDraft((d) => ({
      ...d,
      kind,
      returnable: returnableByDefault(kind),
      returnBy: returnableByDefault(kind) ? d.returnBy : null,
    }));

  const memberId = useMemo(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((members ?? []) as any[]).find((m) => m.user_id === user?.id && m.status === 'active')?.id ?? null,
    [members, user?.id],
  );
  const lines = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => buyableLines((items ?? []) as any[], purchases ?? []),
    [items, purchases],
  );
  // The studio's first saved card stands until the buyer says otherwise.
  const paidWith = draft.paidWith || methods?.[0]?.id || '';
  const figures = draftFigures(draft);
  const busy = record.isPending || upload.isPending;

  const chooseMaker = (option: MakerOption) => {
    setLinkingMaker(false);
    if (option.kind !== 'vendor') return;
    setMaker({ id: option.id, name: option.name });
    setDraft((d) => ({ ...d, vendorId: option.id, payeeName: d.payeeName || option.name }));
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    const preflight = buildPurchaseRequest({ ...draft, paidWith }, { projectId, organizationId: studioId ?? null, memberId });
    if (!preflight.ok) {
      setError(preflight.error);
      return;
    }
    try {
      let receiptDocumentPath: string | null = null;
      if (receipt && draft.forProject) {
        const filed = await upload.mutateAsync({
          file: receipt,
          anchor: draft.ffeItemId ? { kind: 'line', anchorId: draft.ffeItemId } : { kind: 'section', sectionKey: 'project' },
        });
        receiptDocumentPath = filed.storage_path ?? null;
      }
      const built = buildPurchaseRequest(
        { ...draft, paidWith },
        { projectId, organizationId: studioId ?? null, memberId, receiptDocumentPath },
      );
      if (!built.ok) throw new Error(built.error);
      const row = await record.mutateAsync(built.request);
      onDone(`Recorded · ${row.description ?? row.payee_name}`);
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div data-testid="purchase-record-form" className="space-y-4">
      <fieldset>
        <legend className={LABEL}>What kind of buy</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PURCHASE_KINDS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={draft.kind === kind}
              onClick={() => chooseKind(kind)}
              className={`min-h-11 rounded-[3px] border px-2 text-[12px] ${draft.kind === kind ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]' : 'border-[var(--color-pearl)] text-[var(--text-muted)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className={LABEL}>What</span>
        <input
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Pair of table lamps"
          className={`${FIELD} font-heading text-[16px]`}
        />
      </label>

      <div>
        <label className="block">
          <span className={LABEL}>Where</span>
          <input
            value={draft.payeeName}
            onChange={(e) => set('payeeName', e.target.value)}
            placeholder="CB2 · Chicago"
            className={FIELD}
          />
        </label>
        {linkingMaker ? (
          <div className="mt-1.5">
            <MakerSearch disabled={busy} autoFocus onChoose={chooseMaker} onCancel={() => setLinkingMaker(false)} />
          </div>
        ) : maker ? (
          <p className={`${META} mt-1 flex min-h-11 items-center gap-2`}>
            Linked to {maker.name}
            <button
              type="button"
              onClick={() => {
                setMaker(null);
                set('vendorId', null);
              }}
              className="text-[var(--color-clay-ink)] underline"
            >
              Unlink
            </button>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setLinkingMaker(true)}
            className={`${META} mt-1 min-h-11 text-[var(--color-clay-ink)] underline`}
          >
            Link to a maker (optional)
          </button>
        )}
      </div>

      <label className="block">
        <span className={LABEL}>When</span>
        <DateTextInput value={draft.purchasedOn} ariaLabel="Bought on" disabled={busy} onChange={(v) => set('purchasedOn', v)} className={FIELD} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={LABEL}>Paid</span>
          <input inputMode="decimal" aria-label="Amount paid" value={draft.amount} onChange={(e) => set('amount', e.target.value)} placeholder="before tax" className={FIELD} />
        </label>
        <label>
          <span className={LABEL}>Tax</span>
          <input inputMode="decimal" aria-label="Tax" value={draft.tax} onChange={(e) => set('tax', e.target.value)} className={FIELD} />
        </label>
        {takesBuyerPremium(draft.kind) && (
          <label>
            <span className={LABEL}>Buyer&apos;s premium</span>
            <input inputMode="decimal" aria-label="Buyer's premium" value={draft.buyerPremium} onChange={(e) => set('buyerPremium', e.target.value)} className={FIELD} />
          </label>
        )}
        <label>
          <span className={LABEL}>Shipping</span>
          <input inputMode="decimal" aria-label="Shipping" value={draft.shipping} onChange={(e) => set('shipping', e.target.value)} className={FIELD} />
        </label>
      </div>

      <label className="block">
        <span className={LABEL}>Paid with</span>
        <select aria-label="Paid with" value={paidWith} disabled={busy} onChange={(e) => set('paidWith', e.target.value)} className={FIELD}>
          {(methods ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.last4 ? `${m.label} ••${m.last4}` : m.label}
            </option>
          ))}
          <option value={OWN_CARD}>My own card — reimburse me</option>
          {(methods ?? []).length === 0 && <option value="">Not said</option>}
        </select>
      </label>

      <label className="block">
        <span className={LABEL}>Receipt</span>
        {draft.forProject ? (
          <input
            type="file"
            aria-label="Receipt"
            accept="image/*,application/pdf"
            disabled={busy}
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            className="min-h-11 w-full text-[12px] text-[var(--text-muted)]"
          />
        ) : (
          <span className={META}>A receipt files to a project&apos;s folio.</span>
        )}
      </label>

      <fieldset>
        <legend className={LABEL}>Returns</legend>
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-[var(--color-charcoal)]">
          <input
            type="checkbox"
            checked={draft.returnable}
            onChange={(e) => setDraft((d) => ({ ...d, returnable: e.target.checked, returnBy: e.target.checked ? d.returnBy : null }))}
          />
          Returnable
        </label>
        {draft.returnable && (
          <label className="block">
            <span className="sr-only">Return by</span>
            <DateTextInput value={draft.returnBy} ariaLabel="Return by" disabled={busy} onChange={(v) => set('returnBy', v)} minDate={draft.purchasedOn} className={FIELD} />
            <span className={META}>The store&apos;s window. The Desk raises it three days before it closes.</span>
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend className={LABEL}>For</legend>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" aria-pressed={draft.forProject} onClick={() => set('forProject', true)} className={`min-h-11 rounded-[3px] border px-2 text-[12px] ${draft.forProject ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]' : 'border-[var(--color-pearl)] text-[var(--text-muted)]'}`}>
            This project
          </button>
          <button type="button" aria-pressed={!draft.forProject} onClick={() => setDraft((d) => ({ ...d, forProject: false, ffeItemId: '' }))} className={`min-h-11 rounded-[3px] border px-2 text-[12px] ${!draft.forProject ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]' : 'border-[var(--color-pearl)] text-[var(--text-muted)]'}`}>
            The studio, no project
          </button>
        </div>
        {draft.forProject && (
          <>
            <label className="mt-3 block">
              <span className={LABEL}>Line (optional)</span>
              <select aria-label="Line" value={draft.ffeItemId} onChange={(e) => set('ffeItemId', e.target.value)} className={FIELD}>
                <option value="">No line</option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>{line.name}</option>
                ))}
              </select>
              {draft.ffeItemId && <span className={META}>Recording moves this line to ordered.</span>}
            </label>
            <label className="mt-2 flex min-h-11 items-center gap-2 text-[13px] text-[var(--color-charcoal)]">
              <input type="checkbox" checked={draft.billableToClient} onChange={(e) => set('billableToClient', e.target.checked)} />
              Bill the client, at cost, on its own line
            </label>
          </>
        )}
      </fieldset>

      <DocumentActionGroup surfaceKey="project" regionKey="add-to-project" className="justify-end">
        <DocumentAction actionKey="record-studio-purchase" variant="secondary" loading={busy} loadingLabel="Recording…" onClick={() => void submit()}>
          {`Record the buy${figures.ok ? ` · ${formatCurrency(figures.totalCents)}` : ''}`}
        </DocumentAction>
      </DocumentActionGroup>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}
