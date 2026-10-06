'use client';

/**
 * The Vendors page (R28, C-7): each vendor page is a small book — a bookbar
 * (Terms · Thread · Orders · N), DM-mono page links never tabs. Terms carries
 * the trade account + the "+ Brief vendor" opener; Thread carries the vendor
 * comms in the margin's .mitem grammar (the studio's own posts read "You" in
 * clay) with a PO-anchored deep-link into the document; Orders carries the
 * open POs. "+ Brief vendor" (R29 colophon) opens this pane pre-addressed.
 *
 * The thread resolves through vendors.contact_profile_id (00207): the
 * vendor_brief threads whose vendor-side participant is the company's comms
 * profile. A vendor without a profile has no thread yet — the page says so.
 */

import { useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBrowserClient,
  useCanSeeStudioMargin,
  useProcurementItems,
  useSendMessage,
  useStartVendorBrief,
  useStudioContacts,
  useStudioPaymentMethods,
  useStudioVendorAccount,
  useStudioVendorAccounts,
  useThreadMessages,
  useUpsertStudioVendorAccount,
  useUser,
  type PaymentPattern,
  type StudioVendorAccountRequest,
  type StudioVendorAccountRow,
  type StudioVendorTransmission,
} from '@patina/supabase';
import { Select } from '@/components/ui/controls';
import { useInternalTimeStudio } from '@/hooks/use-viewer-studio';
import {
  OrderPaperQueue,
  PAYMENT_PATTERN_OPTIONS,
  type OrderPaperVendor,
  type PendingOrder,
} from '@/components/portal/procurement/order-paper';
import { Stamp } from './stamp';
import { MItem } from './m-item';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import {
  commercialDocumentKeys,
  fetchProjectBillingAuthority,
} from '@/hooks/use-commercial-documents';
import { mapProjectInstruments } from '@/lib/document/project-commerce';
import { VendorRecordQuoteAct } from './line-unfold/record-quote';
import {
  buildInstrumentIndex,
  deriveLineAuthorization,
  deriveOrderReadiness,
  type InstrumentIndex,
  type OrderReadiness,
} from '@/lib/document/authorization-derivation';

type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const MONO_LABEL =
  'doc-type-meta uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]';
const ROW_LINK =
  'da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]';
// The vendor message accent — dusty-blue (the message margin kind); MItem
// repaints it clay for the studio's own voice.
const MSG_ACCENT = {
  border: 'var(--color-dusty-blue)',
  label: 'var(--color-dusty-blue)',
};

type VendorPage = 'terms' | 'thread' | 'orders';

const PO_STAMP: Record<string, { color: string; ink?: string }> = {
  draft: { color: 'var(--color-aged-oak)', ink: 'var(--color-aged-oak)' },
  confirmed: { color: 'var(--color-dusty-blue)' },
  in_production: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  shipped: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  delivered: { color: 'var(--color-sage)' },
  cancelled: { color: 'var(--color-terracotta)', ink: 'var(--color-terracotta-ink)' },
};

/** The studio account's terms, else the shared vendor default (C-12). */
const termsLabel = (
  vendor: AnyRecord,
  account?: StudioVendorAccountRow | null,
): string => {
  const pattern = account?.payment_pattern ?? vendor.default_payment_terms;
  return pattern ? pattern.replace(/_/g, ' ') : 'terms n/a';
};

/** The studio's account with a vendor, unless it has been archived. */
const liveAccount = (account: StudioVendorAccountRow | null | undefined) =>
  account && !account.archived_at ? account : null;

// ─── C-12: the studio vendor account on the Terms page ─────────────────────

const FIELD =
  'doc-type-control min-h-11 w-full min-w-0 rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-2 text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]';

/** R-PB9: what a blank claim window means. */
export const CLAIMS_WINDOW_DEFAULT_DAYS = 3;
export const CONCEALED_CARRIER_DEFAULT_DAYS = 5;

const TRANSMISSION_OPTIONS: { value: StudioVendorTransmission; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'portal', label: 'Trade portal' },
  { value: 'phone', label: 'Phone' },
  { value: 'showroom', label: 'Showroom' },
];

/** The editor's text state: one string per field, '' for unset. */
interface AccountForm {
  accountNumber: string;
  repContactId: string;
  paymentPattern: string;
  depositPct: string;
  netDays: string;
  paymentMethodId: string;
  transmission: string;
  ordersEmailOverride: string;
  portalUrl: string;
  leadTimeDays: string;
  claimsWindowDays: string;
  concealedCarrierDays: string;
  resaleCertOnFileOn: string;
  notes: string;
  tradeDiscountPct: string;
}

const str = (v: unknown): string => (v == null ? '' : String(v));

function formFromAccount(account: StudioVendorAccountRow | null): AccountForm {
  const inspection = (account?.inspection_window_days ?? null) as Record<string, number> | null;
  return {
    accountNumber: str(account?.account_number),
    repContactId: str(account?.rep_contact_id),
    paymentPattern: str(account?.payment_pattern),
    depositPct: str(account?.deposit_pct),
    netDays: str(account?.net_days),
    paymentMethodId: str(account?.payment_method_id),
    transmission: str(account?.transmission),
    ordersEmailOverride: str(account?.orders_email_override),
    portalUrl: str(account?.portal_url),
    leadTimeDays: str(account?.lead_time_days),
    claimsWindowDays: str(account?.claims_window_days),
    concealedCarrierDays: str(inspection?.concealed_carrier),
    resaleCertOnFileOn: str(account?.resale_cert_on_file_on),
    notes: str(account?.notes),
    tradeDiscountPct: str(account?.trade_discount_pct),
  };
}

/**
 * The upsert request for the form, or an error sentence. Every field is sent
 * (blank clears it); the trade discount only when the viewer may see margin
 * (C-36), and the concealed-carrier window merges into the account's other
 * inspection windows.
 */
export function accountRequestFromForm(
  form: AccountForm,
  account: StudioVendorAccountRow | null,
  canSeeMargin: boolean,
): { request: StudioVendorAccountRequest } | { error: string } {
  const text = (v: string) => v.trim() || null;
  const num = (v: string, label: string): number | null | string => {
    const t = v.trim().replace(/%$/, '');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : `${label} must be a number.`;
  };
  const whole = (v: string, label: string): number | null | string => {
    const n = num(v, label);
    return typeof n === 'number' && !Number.isInteger(n) ? `${label} must be whole days.` : n;
  };
  const numbers = {
    depositPct: num(form.depositPct, 'Deposit %'),
    netDays: whole(form.netDays, 'Net days'),
    leadTimeDays: whole(form.leadTimeDays, 'Lead time'),
    claimsWindowDays: whole(form.claimsWindowDays, 'The claims window'),
    concealedCarrierDays: whole(form.concealedCarrierDays, 'The concealed-damage window'),
    tradeDiscountPct: canSeeMargin ? num(form.tradeDiscountPct, 'Trade discount') : null,
  };
  const bad = Object.values(numbers).find((v) => typeof v === 'string');
  if (typeof bad === 'string') return { error: bad };
  const n = numbers as Record<keyof typeof numbers, number | null>;
  const email = text(form.ordersEmailOverride);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'The orders email doesn’t look right.' };
  }

  const inspection = {
    ...((account?.inspection_window_days ?? {}) as Record<string, number>),
  };
  if (n.concealedCarrierDays == null) delete inspection.concealed_carrier;
  else inspection.concealed_carrier = n.concealedCarrierDays;

  return {
    request: {
      accountNumber: text(form.accountNumber),
      repContactId: text(form.repContactId),
      paymentPattern: (text(form.paymentPattern) as PaymentPattern | null) ?? null,
      depositPct: n.depositPct,
      netDays: n.netDays,
      paymentMethodId: text(form.paymentMethodId),
      transmission: (text(form.transmission) as StudioVendorTransmission | null) ?? null,
      ordersEmailOverride: email,
      portalUrl: text(form.portalUrl),
      leadTimeDays: n.leadTimeDays,
      claimsWindowDays: n.claimsWindowDays,
      inspectionWindowDays: Object.keys(inspection).length > 0 ? inspection : null,
      resaleCertOnFileOn: text(form.resaleCertOnFileOn),
      notes: text(form.notes),
      ...(canSeeMargin ? { tradeDiscountPct: n.tradeDiscountPct } : {}),
    },
  };
}

function TermsField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className={`${MONO_LABEL} block`}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * C-12: the studio's own account with this vendor — account number, rep,
 * terms, how it orders, claim windows, resale certificate. Read for every
 * vendor (no PO needed); any non-guest member may edit it. The trade discount
 * shows only to a viewer who may see the studio's margin (C-36, R1): the read
 * nulls it otherwise, so it is hidden, never shown as zero.
 */
export function VendorAccountTerms({ vendor }: { vendor: AnyRecord }) {
  const { studio } = useInternalTimeStudio();
  const studioId = studio?.id ?? null;
  const { data: accountRow, isLoading } = useStudioVendorAccount(studioId, vendor.id);
  const account = liveAccount(accountRow);
  const { data: canSeeMargin } = useCanSeeStudioMargin(studioId);
  const { data: contacts } = useStudioContacts(studioId);
  const { data: methods } = useStudioPaymentMethods(studioId ?? undefined);
  const upsert = useUpsertStudioVendorAccount({ errorSurface: 'inline' });
  const [form, setForm] = useState<AccountForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!studioId) {
    return (
      <p className="doc-type-body italic text-[var(--color-quiet-ink)]">
        Your studio keeps its account with {vendor.name} here once you work in one.
      </p>
    );
  }
  if (isLoading) {
    return <p className="doc-type-body italic text-[var(--color-quiet-ink)]">Opening the account…</p>;
  }

  const people = (contacts ?? []).filter((c) => c.entity_kind === 'person');
  const repName = people.find((c) => c.id === account?.rep_contact_id)?.full_name ?? null;
  const method = (methods ?? []).find((m) => m.id === account?.payment_method_id) ?? null;
  const inspection = (account?.inspection_window_days ?? null) as Record<string, number> | null;
  const showDiscount = canSeeMargin === true;

  if (!form) {
    const rows: [string, string | null][] = [
      ['Account #', account?.account_number ?? null],
      ['Rep', repName],
      [
        'Terms',
        account?.payment_pattern
          ? [
              termsLabel(vendor, account),
              account.deposit_pct != null ? `${account.deposit_pct}% deposit` : null,
              account.net_days != null ? `net ${account.net_days}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : vendor.default_payment_terms
            ? `${termsLabel(vendor)} (vendor default)`
            : null,
      ],
      ['Pays by', method ? method.label : null],
      [
        'Orders',
        [
          TRANSMISSION_OPTIONS.find((o) => o.value === account?.transmission)?.label,
          account?.orders_email_override ?? vendor.orders_email ?? null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      ],
      ['Lead time', account?.lead_time_days != null ? `${account.lead_time_days} days` : null],
      [
        'Claims',
        `vendor ${account?.claims_window_days ?? CLAIMS_WINDOW_DEFAULT_DAYS} days · concealed damage ${
          inspection?.concealed_carrier ?? CONCEALED_CARRIER_DEFAULT_DAYS
        } days`,
      ],
      ['Resale cert', account?.resale_cert_on_file_on ? `on file ${fmtDay(account.resale_cert_on_file_on)}` : null],
      ...(showDiscount
        ? ([['Trade discount', account?.trade_discount_pct != null ? `${account.trade_discount_pct}%` : null]] as [
            string,
            string | null,
          ][])
        : []),
      ['Notes', account?.notes ?? null],
    ];
    const portal = account?.portal_url ?? vendor.trade_portal_url ?? null;
    return (
      <div data-vendor-account>
        <dl className="grid min-w-0 grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className={MONO_LABEL}>{label}</dt>
              <dd className="doc-type-body min-w-0 break-words text-[var(--color-charcoal)]">
                {value ?? <span className="text-[var(--color-quiet-ink)]">—</span>}
              </dd>
            </div>
          ))}
        </dl>
        {portal && (
          <a href={portal} target="_blank" rel="noreferrer" className={`${ROW_LINK} mt-1`}>
            trade portal →
          </a>
        )}
        <DocumentActionRow
          surfaceKey="orders"
          regionKey="vendor-account"
          className="mt-2"
          aria-label="Vendor account actions"
        >
          <DocumentAction
            actionKey="edit-vendor-account"
            variant="tertiary"
            onClick={() => {
              setError(null);
              setForm(formFromAccount(account));
            }}
          >
            {account ? 'Edit the account' : 'Set up the account'}
          </DocumentAction>
        </DocumentActionRow>
      </div>
    );
  }

  const set = (key: keyof AccountForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm({ ...form, [key]: e.target.value });
  const id = (key: string) => `vendor-account-${vendor.id}-${key}`;

  const save = () => {
    const built = accountRequestFromForm(form, account, showDiscount);
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setError(null);
    upsert.mutate(
      { organizationId: studioId, vendorId: vendor.id, request: built.request },
      {
        onSuccess: () => setForm(null),
        onError: (e: unknown) =>
          setError(e instanceof Error && e.message ? e.message : 'The account could not be saved.'),
      },
    );
  };

  const input = (key: keyof AccountForm, label: string, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <TermsField label={label} htmlFor={id(key)}>
      <input id={id(key)} value={form[key]} onChange={set(key)} className={FIELD} {...props} />
    </TermsField>
  );

  return (
    <div data-vendor-account-editor>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {input('accountNumber', 'Account #')}
        <TermsField label="Rep" htmlFor={id('repContactId')}>
          <Select id={id('repContactId')} value={form.repContactId} onChange={set('repContactId')}>
            <option value="">No rep</option>
            {people.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name ?? 'Unnamed'}
              </option>
            ))}
          </Select>
        </TermsField>
        <TermsField label="Terms" htmlFor={id('paymentPattern')}>
          <Select id={id('paymentPattern')} value={form.paymentPattern} onChange={set('paymentPattern')}>
            <option value="">
              {vendor.default_payment_terms ? `${termsLabel(vendor)} (Vendor default)` : 'Not set'}
            </option>
            {PAYMENT_PATTERN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </TermsField>
        {input('depositPct', 'Deposit %', { inputMode: 'decimal' })}
        {input('netDays', 'Net days', { inputMode: 'numeric' })}
        <TermsField label="Pays by" htmlFor={id('paymentMethodId')}>
          <Select id={id('paymentMethodId')} value={form.paymentMethodId} onChange={set('paymentMethodId')}>
            <option value="">Not set</option>
            {(methods ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </TermsField>
        <TermsField label="Orders go by" htmlFor={id('transmission')}>
          <Select id={id('transmission')} value={form.transmission} onChange={set('transmission')}>
            <option value="">Not set</option>
            {TRANSMISSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </TermsField>
        {input('ordersEmailOverride', 'Orders email', {
          type: 'email',
          placeholder: vendor.orders_email ?? 'Where POs go',
        })}
        {input('portalUrl', 'Portal URL', { type: 'url', placeholder: vendor.trade_portal_url ?? '' })}
        {input('leadTimeDays', 'Lead time (days)', { inputMode: 'numeric' })}
        {input('claimsWindowDays', 'Vendor claims (days)', {
          inputMode: 'numeric',
          placeholder: `${CLAIMS_WINDOW_DEFAULT_DAYS} (72 h default)`,
        })}
        {input('concealedCarrierDays', 'Concealed damage (days)', {
          inputMode: 'numeric',
          placeholder: `${CONCEALED_CARRIER_DEFAULT_DAYS} (5 d default)`,
        })}
        {input('resaleCertOnFileOn', 'Resale cert on file', { type: 'date' })}
        {showDiscount && input('tradeDiscountPct', 'Trade discount %', { inputMode: 'decimal' })}
      </div>
      <TermsField label="Notes" htmlFor={id('notes')}>
        <textarea id={id('notes')} rows={2} value={form.notes} onChange={set('notes')} className={`${FIELD} resize-none`} />
      </TermsField>
      {error && (
        <p role="alert" className="doc-type-body mt-1 text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
      <DocumentActionRow
        surfaceKey="orders"
        regionKey="vendor-account"
        className="mt-2"
        aria-label="Vendor account actions"
      >
        <DocumentAction
          actionKey="save-vendor-account"
          variant="primary"
          loading={upsert.isPending}
          loadingLabel="Saving…"
          disabled={upsert.isPending}
          onClick={save}
        >
          Save
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-vendor-account"
          variant="tertiary"
          disabled={upsert.isPending}
          onClick={() => {
            setError(null);
            setForm(null);
          }}
        >
          Cancel
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}

// ─── PRC-24 (R84): "Order all —" — the multi-line Order Assistant ──────────

/** What a project says about the commercial gate: null until it is known. */
type ProjectOrderContext = {
  isCommercialOrigin: boolean;
  index: InstrumentIndex;
} | null;

/**
 * The commercial gate per project: an agreement behind the job (authority),
 * and on such a job its instruments, read under the same query keys the
 * schedule uses so the cache is shared. A project still loading (or failing)
 * stays null and its lines wait — the gate fails closed.
 */
function useProjectOrderContexts(
  projectIds: readonly string[],
): Map<string, ProjectOrderContext> {
  const authorities = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: commercialDocumentKeys.authority(projectId),
      queryFn: () => fetchProjectBillingAuthority(projectId),
    })),
  });
  const instruments = useQueries({
    queries: projectIds.map((projectId, i) => ({
      queryKey: commercialDocumentKeys.instruments(projectId),
      enabled: Boolean(authorities[i]?.data),
      queryFn: async () => {
        const { data, error } = await getSupabase().rpc(
          'list_furnishings_authorizations',
          { p_project_id: projectId },
        );
        if (error) throw error;
        return mapProjectInstruments(data);
      },
    })),
  });

  const contexts = new Map<string, ProjectOrderContext>();
  projectIds.forEach((projectId, i) => {
    const authority = authorities[i];
    if (!authority?.isSuccess) return contexts.set(projectId, null);
    if (!authority.data) {
      return contexts.set(projectId, {
        isCommercialOrigin: false,
        index: new Map(),
      });
    }
    const held = instruments[i];
    contexts.set(
      projectId,
      held?.isSuccess
        ? { isCommercialOrigin: true, index: buildInstrumentIndex(held.data) }
        : null,
    );
  });
  return contexts;
}

/**
 * The one readiness rule (C-11a) — the same test the line unfold uses, so
 * the assistant never opens on a batch the database would refuse.
 */
const readinessOf = (
  it: AnyRecord,
  context: ProjectOrderContext | undefined,
): OrderReadiness | null =>
  context
    ? deriveOrderReadiness(it, {
        isCommercialOrigin: context.isCommercialOrigin,
        lineAuth: deriveLineAuthorization(it, context.index),
      })
    : null;

/**
 * The vendor page's whole-queue ordering act: every ready, unordered FF&E
 * line the studio holds with this vendor, laid as order papers (C-23). One PO
 * covers one project, so a multi-project vendor gets one paper per (vendor,
 * project), stepped through in the same sheet. PRC-09's order-all rides this
 * same act.
 */
function VendorOrderAll({ vendor }: { vendor: AnyRecord }) {
  const { data: items } = useProcurementItems({ vendorId: vendor.id }) as {
    data: AnyRecord[] | undefined;
  };
  const projectIds = useMemo(
    () =>
      Array.from(
        new Set(
          (items ?? [])
            .filter((it) => !it.purchase_order_id && it.project_id)
            .map((it) => String(it.project_id)),
        ),
      ),
    [items],
  );
  const contexts = useProjectOrderContexts(projectIds);
  const readinessById = new Map<string, OrderReadiness>();
  for (const it of items ?? []) {
    const readiness = readinessOf(it, contexts.get(String(it.project_id)));
    if (readiness?.ready) readinessById.set(it.id, readiness);
  }
  const orderable = (items ?? []).filter((it) => readinessById.has(it.id));
  // R-PB1: no-agreement lines order, with the consequence said once.
  const unsigned = orderable.filter(
    (it) => (readinessById.get(it.id)?.warnings.length ?? 0) > 0,
  ).length;
  const [queue, setQueue] = useState<PendingOrder[]>([]);
  const active = queue.length > 0;

  // Catalog vendors keep their Patina-handled path (W1.5.5) — no manual POs.
  // NOTE: a live queue keeps the mount alive even as the created POs drain
  // the orderable list (invalidateFfeCaches refetches mid-walk) — otherwise
  // the paper's sent record would vanish under the designer.
  if (vendor.is_patina_catalog || (orderable.length === 0 && !active))
    return null;

  const orderAll = () => {
    const paperVendor: OrderPaperVendor = {
      id: vendor.id,
      name: vendor.name,
      default_payment_terms: vendor.default_payment_terms ?? null,
      trade_portal_url: vendor.trade_portal_url ?? undefined,
      trade_account_email: vendor.trade_account_email ?? undefined,
      is_patina_catalog: vendor.is_patina_catalog ?? false,
      orders_email: vendor.orders_email ?? null,
      contact_info: vendor.contact_info ?? null,
    };
    const byProject = new Map<string, AnyRecord[]>();
    for (const it of orderable) {
      const list = byProject.get(it.project_id) ?? [];
      list.push(it);
      byProject.set(it.project_id, list);
    }
    setQueue(
      Array.from(byProject.entries()).map(([pid, list]) => ({
        vendor: paperVendor,
        project: { id: pid, name: list[0].project?.name ?? 'Project' },
        ffeItems: list.map((it) => ({
          id: it.id,
          name: it.name,
          room: it.room?.name,
          line_total_cents: it.line_total_cents ?? 0,
          // Dual pricing (00185/00186): the paper totals
          // COALESCE(trade, unit) × qty, matching the RPC's server total.
          quantity: it.quantity ?? 1,
          unit_price_cents: it.unit_price_cents ?? null,
          trade_price_cents: it.trade_price_cents ?? null,
          currency: it.currency ?? null,
          blocked: it.blocked,
          blocked_by_decision_id: it.blocked_by_decision_id ?? null,
          blocked_reason: it.blocked_reason,
          spec: it.spec ?? null,
          configurationSnapshot:
            it.configurationSnapshot ?? it.configuration_snapshot ?? null,
          configurationSnapshotHash:
            it.configurationSnapshotHash ??
            it.configuration_snapshot_hash ??
            null,
          configurationLockedAt:
            it.configurationLockedAt ?? it.configuration_locked_at ?? null,
        })),
      })),
    );
  };

  return (
    <>
      {orderable.length > 0 && (
        <DocumentActionGroup
          surfaceKey="orders"
          regionKey="vendor-order-all"
          className="mb-2 justify-between"
          aria-label="Vendor ordering actions"
        >
          <DocumentAction
            actionKey="order-all-vendor-items"
            variant="primary"
            onClick={orderAll}
            trailing="→"
          >
            Order all — {orderable.length} item
            {orderable.length === 1 ? '' : 's'}
          </DocumentAction>
          <span className={MONO_LABEL}>ready · unordered</span>
        </DocumentActionGroup>
      )}
      {unsigned > 0 && (
        <p className="doc-type-meta mb-2 text-[var(--color-charcoal)]">
          {unsigned === orderable.length
            ? 'No signed agreement behind these yet. You can still order.'
            : `${unsigned} of ${orderable.length} have no signed agreement behind them yet. You can still order.`}
        </p>
      )}
      {active && <OrderPaperQueue orders={queue} onClose={() => setQueue([])} />}
    </>
  );
}

/** The vendor's brief threads, newest first (RLS scopes to the caller). */
function useVendorThreads(contactProfileId: string | null) {
  return useQuery({
    queryKey: ['vendor-threads', contactProfileId],
    enabled: !!contactProfileId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('comms_threads')
        .select(
          'id, project_id, created_at, last_message_at, project:projects(name), participants:comms_thread_participants!inner(profile_id, role)',
        )
        .eq('kind', 'vendor_brief')
        .eq('participants.profile_id', contactProfileId)
        .eq('participants.role', 'vendor')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });
}

/** One brief's messages in the margin's .mitem grammar + the reply line.
 *  A PO-anchored deep-link chip (R28) lets the thread jump to its document. */
function VendorThread({
  thread,
  onOpenDocument,
}: {
  thread: AnyRecord;
  onOpenDocument: (projectId: string | null) => void;
}) {
  const qc = useQueryClient();
  const { user } = useUser();
  const { data: pages } = useThreadMessages(thread.id) as { data: AnyRecord };
  const send = useSendMessage();
  const [body, setBody] = useState('');

  const messages: AnyRecord[] = useMemo(() => {
    const flat = (pages?.pages ?? []).flat();
    return flat.slice(0, 12).reverse(); // oldest → newest down the page
  }, [pages]);

  const projectName = thread.project?.name ?? null;
  const deepLink =
    thread.project_id && projectName ? (
      <button
        type="button"
        onClick={() => onOpenDocument(thread.project_id)}
        className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.1em] text-[var(--color-quiet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
      >
        re: {projectName} →
      </button>
    ) : null;

  return (
    <div className="mt-1.5">
      {deepLink && <div className="mb-1.5">{deepLink}</div>}
      <ul className="mb-2 space-y-1.5">
        {messages.map((m) => {
          const own =
            !m.system && m.sender_id != null && m.sender_id === user?.id;
          const sender = m.system
            ? 'The book'
            : own
              ? 'You'
              : (m.sender?.full_name ?? 'Message');
          return (
            <MItem
              key={m.id}
              tone="paper"
              accent={MSG_ACCENT}
              ownVoice={own}
              kindLine={`${sender} · ${fmtDay(m.created_at)}`}
              title={m.body}
            />
          );
        })}
        {messages.length === 0 && (
          <li className="doc-type-body italic text-[var(--color-quiet-ink)]">
            Opening the thread…
          </li>
        )}
      </ul>
      <DocumentActionRow
        surfaceKey="orders"
        regionKey="vendor-thread-reply"
        className="min-w-0 flex-col items-stretch sm:flex-row sm:items-end"
        aria-label="Vendor reply actions"
      >
        <textarea
          rows={2}
          placeholder="Reply…"
          aria-label="Reply to vendor"
          className="doc-type-control min-h-11 w-full min-w-0 flex-1 resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-2 text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <DocumentAction
          actionKey="send-vendor-reply"
          variant="primary"
          disabled={!body.trim() || send.isPending}
          loading={send.isPending}
          loadingLabel="Sending…"
          onClick={() =>
            send.mutate(
              { threadId: thread.id, body: body.trim() },
              {
                onSuccess: () => {
                  setBody('');
                  void qc.invalidateQueries({ queryKey: ['comms'] });
                  void qc.invalidateQueries({ queryKey: ['vendor-threads'] });
                },
              },
            )
          }
        >
          Send
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}

/** The "+ Brief vendor" composer — R29's pre-addressed landing. */
function BriefComposer({
  vendor,
  briefProjectId,
  briefProjectName,
  onOpened,
}: {
  vendor: AnyRecord;
  briefProjectId: string | null;
  briefProjectName: string | null;
  onOpened: () => void;
}) {
  const startBrief = useStartVendorBrief();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!vendor.contact_profile_id) {
    return (
      <p className="doc-type-body mt-2 italic text-[var(--color-quiet-ink)]">
        No comms profile on file for {vendor.name} — link one to open a thread.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-[var(--color-pearl)] pt-2">
      <p className={MONO_LABEL}>
        + Brief vendor{briefProjectName ? ` · about ${briefProjectName}` : ''}
      </p>
      <DocumentActionRow
        surfaceKey="orders"
        regionKey="vendor-brief"
        className="mt-1 min-w-0 flex-col items-stretch sm:flex-row sm:items-end"
        aria-label="Vendor brief actions"
      >
        <textarea
          rows={2}
          placeholder={`Brief ${vendor.name}…`}
          aria-label="Opening brief"
          className="doc-type-control min-h-11 w-full min-w-0 flex-1 resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-2 text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <DocumentAction
          actionKey="open-vendor-brief"
          variant="primary"
          disabled={!body.trim() || startBrief.isPending}
          loading={startBrief.isPending}
          loadingLabel="Opening…"
          onClick={() => {
            setError(null);
            startBrief.mutate(
              {
                vendorProfileId: vendor.contact_profile_id,
                projectId: briefProjectId ?? undefined,
                initialMessage: body.trim(),
              },
              {
                onSuccess: () => {
                  setBody('');
                  onOpened();
                },
                onError: (e: unknown) =>
                  setError(
                    e instanceof Error ? e.message : 'Could not open the brief',
                  ),
              },
            );
          }}
        >
          Open brief
        </DocumentAction>
      </DocumentActionRow>
      {error && (
        <p className="doc-type-body mt-1 text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** The vendor pane's bookbar — DM-mono page links, never tabs (R28). */
function VendorBookbar({
  vendor,
  account,
  page,
  openCount,
  onPage,
}: {
  vendor: AnyRecord;
  account: StudioVendorAccountRow | null;
  page: VendorPage;
  openCount: number;
  onPage: (p: VendorPage) => void;
}) {
  const pages: { key: VendorPage; label: string }[] = [
    { key: 'terms', label: `Terms · ${termsLabel(vendor, account)}` },
    { key: 'thread', label: 'Thread' },
    { key: 'orders', label: `Orders · ${openCount}` },
  ];
  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--color-pearl)] pb-1">
      <span className="font-heading text-[15px] font-medium text-[var(--color-charcoal)]">
        {vendor.name}{' '}
        <em className="not-italic text-[var(--color-quiet-ink)]">· vendor</em>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-x-3">
        {pages.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPage(p.key)}
            aria-current={page === p.key ? 'page' : undefined}
            className={`da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.1em] transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${
              page === p.key
                ? 'da-score-on text-[var(--color-charcoal)]'
                : 'text-[var(--color-quiet-ink)] hover:text-[var(--color-charcoal)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </span>
    </div>
  );
}

export function VendorsBookPage({
  vendors,
  orders,
  initialVendorId,
  briefProjectId,
  onOpenDocument,
}: {
  vendors: AnyRecord[];
  orders: AnyRecord[];
  initialVendorId: string | null;
  /** R29 pre-addressing: the document the brief is about. */
  briefProjectId: string | null;
  onOpenDocument: (projectId: string | null) => void;
}) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(initialVendorId);
  const [page, setPage] = useState<VendorPage>('thread');
  const vendor = vendors.find((v) => v.id === selectedId) ?? null;
  const { studio } = useInternalTimeStudio();
  const { data: accounts } = useStudioVendorAccounts(studio?.id ?? null);
  const accountByVendor = useMemo(
    () =>
      new Map(
        (accounts ?? [])
          .filter((a) => !a.archived_at)
          .map((a) => [a.vendor_id, a] as const),
      ),
    [accounts],
  );

  const openPos = useMemo(
    () =>
      (orders ?? []).filter(
        (o) =>
          o.vendor_id === selectedId &&
          o.status !== 'cancelled' &&
          o.status !== 'delivered',
      ),
    [orders, selectedId],
  );

  const { data: threads } = useVendorThreads(
    vendor?.contact_profile_id ?? null,
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const thread =
    (threads ?? []).find((t) => t.id === activeThreadId) ??
    (threads ?? [])[0] ??
    null;

  const briefProjectName =
    briefProjectId != null
      ? ((orders ?? []).find(
          (o) => (o.project_id ?? o.project?.id) === briefProjectId,
        )?.project?.name ?? null)
      : null;

  if (!vendor) {
    return (
      <ul className="min-w-0">
        {vendors.map((v) => (
          <li
            key={v.id}
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-pearl)] px-1 py-3"
          >
            <div className="min-w-[12rem] flex-1">
              <button
                type="button"
                onClick={() => setSelectedId(v.id)}
                className="da-score-hover doc-type-body inline-flex min-h-11 min-w-11 items-center text-left font-medium text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
              >
                {v.name}
              </button>
              <p className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                {(() => {
                  const account = accountByVendor.get(v.id) ?? null;
                  return (
                    [
                      account?.payment_pattern || v.default_payment_terms
                        ? termsLabel(v, account)
                        : null,
                      account?.account_number ? `acct ${account.account_number}` : null,
                      account?.orders_email_override ?? v.trade_account_email,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No terms on file'
                  );
                })()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(v.id)}
              className={ROW_LINK}
            >
              open page →
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setSelectedId(null)}
        className={`${ROW_LINK} mb-2 uppercase tracking-[0.07em]`}
      >
        ← all vendors
      </button>

      <VendorBookbar
        vendor={vendor}
        account={accountByVendor.get(vendor.id) ?? null}
        page={page}
        openCount={openPos.length}
        onPage={setPage}
      />

      {/* ── Terms page: the trade account + the brief opener ── */}
      {page === 'terms' && (
        <div>
          <VendorAccountTerms key={vendor.id} vendor={vendor} />
          {/* R78/R60 cross-link contract: trade lives here; the RELATIONSHIP lives in People. */}
          <a
            href={`/people?person=${vendor.id}&role=maker`}
            className={`${ROW_LINK} mt-1`}
          >
            their profile · in People →
          </a>
        </div>
      )}

      {/* ── Orders page: open POs, PO-anchored, deep-link into documents ── */}
      {page === 'orders' && (
        <>
          {/* PRC-24: the whole approved-unordered queue, one act. Keyed so a
            vendor switch never carries another vendor's queue along. */}
          <VendorOrderAll key={vendor.id} vendor={vendor} />
          {/* C-29: what the maker sent back, studio-entered (R-PB8). */}
          {!vendor.is_patina_catalog && (
            <div className="mb-2">
              <VendorRecordQuoteAct key={vendor.id} vendor={{ id: vendor.id, name: vendor.name }} />
            </div>
          )}
          <ul>
            {openPos.map((po) => {
              const stamp = PO_STAMP[po.status] ?? PO_STAMP.draft;
              return (
                <li
                  key={po.id}
                  data-orders-vendor-po-row
                  className="border-b border-[var(--color-pearl)] px-1 py-3"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="doc-type-body min-w-[11rem] flex-1 font-medium text-[var(--color-charcoal)]">
                      {po.po_number ??
                        po.vendor_po_number ??
                        po.sidemark ??
                        'PO drafted'}
                    </p>
                    <Stamp
                      label={po.status.replace(/_/g, ' ')}
                      color={stamp.color}
                      ink={stamp.ink}
                    />
                    <span className="doc-type-meta whitespace-nowrap text-[var(--color-charcoal)]">
                      {po.confirmed_eta ? `~${fmtDay(po.confirmed_eta)}` : '—'}
                    </span>
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="doc-type-meta min-w-[12rem] flex-1 uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                      {[
                        po.project?.name ?? 'Project',
                        po.total_cents != null ? fmtUsd(po.total_cents) : '—',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDocument(po.project_id ?? po.project?.id ?? null)
                      }
                      className={ROW_LINK}
                    >
                      open document →
                    </button>
                  </div>
                </li>
              );
            })}
            {openPos.length === 0 && (
              <li className="doc-type-body py-2 italic text-[var(--color-quiet-ink)]">
                Nothing open with {vendor.name}.
              </li>
            )}
          </ul>
        </>
      )}

      {/* ── Thread page: the vendor comms (.mitem grammar) ── */}
      {page === 'thread' && (
        <>
          {!vendor.contact_profile_id ? (
            <p className="doc-type-body italic text-[var(--color-quiet-ink)]">
              No comms profile on file for {vendor.name} — link one to open a
              thread.
            </p>
          ) : (threads ?? []).length > 0 && thread ? (
            <>
              {(threads ?? []).length > 1 && (
                <p className="doc-type-meta mb-1 uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
                  {(threads ?? []).map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveThreadId(t.id)}
                      className={`da-score-hover inline-flex min-h-11 min-w-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${
                        t.id === thread.id
                          ? 'da-score-on text-[var(--color-charcoal)]'
                          : 'text-[var(--color-quiet-ink)] hover:text-[var(--color-charcoal)]'
                      }`}
                    >
                      {i > 0 ? ' · ' : ''}
                      {t.project?.name ?? 'General'}
                    </button>
                  ))}
                </p>
              )}
              <VendorThread thread={thread} onOpenDocument={onOpenDocument} />
            </>
          ) : (
            <p className="doc-type-body italic text-[var(--color-quiet-ink)]">
              No thread with {vendor.name} yet.
            </p>
          )}
          <BriefComposer
            vendor={vendor}
            briefProjectId={briefProjectId}
            briefProjectName={briefProjectName}
            onOpened={() =>
              void qc.invalidateQueries({ queryKey: ['vendor-threads'] })
            }
          />
        </>
      )}
    </div>
  );
}
