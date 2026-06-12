'use client';

/**
 * The Orders ledger (D8/R5, §13 Slice 4): cross-engagement procurement as a
 * book pulled over whatever the designer is holding. Vendor-grouped PO rows
 * with open-document links, the R5 vendor directory pane, and ONE batch
 * action — "same truck": a shared confirmed ETA across selected POs of a
 * vendor, written back into each document through log_po_acknowledgment
 * (coalesce semantics: only the ETA changes). Semantics flagged in I14.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserClient, usePurchaseOrders, useVendors } from '@patina/supabase';
import { Stamp } from './stamp';
import { fmtDay, fmtUsd } from '@/lib/document/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const PO_STAMP: Record<string, { color: string; ink?: string }> = {
  draft: { color: 'var(--color-pearl)', ink: 'rgba(250,247,242,0.6)' },
  confirmed: { color: 'var(--color-dusty-blue)' },
  in_production: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  shipped: { color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  delivered: { color: 'var(--color-sage)' },
  cancelled: { color: 'var(--color-terracotta)' },
};

export function OrdersLedger({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: orders, isLoading } = usePurchaseOrders() as {
    data: AnyRecord[] | undefined;
    isLoading: boolean;
  };
  // useVendors returns { data, pagination } — unwrap, and ask for the
  // whole directory (the vendor pane is a book, not a feed).
  const { data: vendorsPage } = useVendors(undefined, { page: 1, pageSize: 200 }) as {
    data: { data: AnyRecord[] } | undefined;
  };
  const vendors = vendorsPage?.data;

  const [showVendors, setShowVendors] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [truckEta, setTruckEta] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  const vendorById = useMemo(() => {
    const map = new Map<string, AnyRecord>();
    (vendors ?? []).forEach((v) => map.set(v.id, v));
    return map;
  }, [vendors]);

  const groups = useMemo(() => {
    const live = (orders ?? []).filter((o) => o.status !== 'cancelled');
    const byVendor = new Map<string, AnyRecord[]>();
    for (const o of live) {
      const list = byVendor.get(o.vendor_id) ?? [];
      list.push(o);
      byVendor.set(o.vendor_id, list);
    }
    return [...byVendor.entries()]
      .map(([vendorId, pos]) => ({
        vendorId,
        vendorName: vendorById.get(vendorId)?.name ?? pos[0]?.vendor?.name ?? 'Vendor',
        pos,
      }))
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  }, [orders, vendorById]);

  const selectedVendor = useMemo(() => {
    const pos = (orders ?? []).filter((o) => selected.includes(o.id));
    const vendorIds = new Set(pos.map((o) => o.vendor_id));
    return vendorIds.size === 1 ? [...vendorIds][0] : null;
  }, [orders, selected]);

  const openDocument = (projectId: string | null) => {
    if (!projectId) return;
    onClose();
    router.push(`/doc/${projectId}`);
  };

  const sameTruck = async () => {
    if (!truckEta || selected.length < 2) return;
    setBatchBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      for (const poId of selected) {
        const { error } = await supabase.rpc('log_po_acknowledgment', {
          p_po_id: poId,
          p_vendor_po_number: null,
          p_confirmed_eta: truckEta,
        });
        if (error) throw error;
      }
      setSelected([]);
      setTruckEta('');
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl text-[var(--color-pearl)]">
            Orders <em className="italic text-[var(--color-clay)]">· the studio ledger</em>
          </h2>
          <p className="mt-0.5 text-[11px] text-[rgba(250,247,242,0.45)]">
            A lens over every document — pulled over whatever you&apos;re holding, put back when
            done.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowVendors((v) => !v)}
          className="whitespace-nowrap rounded-[3px] border border-[rgba(250,247,242,0.15)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.07em] text-[rgba(250,247,242,0.55)] hover:text-[var(--color-clay)]"
        >
          {showVendors ? 'Orders' : 'Vendors'}
        </button>
      </div>

      {showVendors ? (
        <ul>
          {(vendors ?? []).map((v) => (
            <li
              key={v.id}
              className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-[rgba(250,247,242,0.08)] px-1 py-2.5"
            >
              <div>
                <p className="text-[13px] font-medium text-[var(--color-off-white)]">{v.name}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
                  {[v.default_payment_terms, v.trade_account_email].filter(Boolean).join(' · ') ||
                    'No terms on file'}
                </p>
              </div>
              {v.trade_portal_url && (
                <a
                  href={v.trade_portal_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10.5px] text-[var(--color-clay)] hover:underline"
                >
                  trade portal →
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <>
          {isLoading && (
            <p className="py-3 text-[12px] italic text-[rgba(250,247,242,0.5)]">
              Opening the book…
            </p>
          )}
          {groups.map((g) => (
            <section key={g.vendorId} className="mb-4">
              <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay)]">
                {g.vendorName}
              </p>
              <ul>
                {g.pos.map((po) => {
                  const stamp = PO_STAMP[po.status] ?? PO_STAMP.draft;
                  return (
                    <li
                      key={po.id}
                      className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-[rgba(250,247,242,0.08)] px-1 py-2.5"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${po.vendor_po_number ?? po.sidemark ?? 'PO'}`}
                        checked={selected.includes(po.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, po.id]
                              : prev.filter((x) => x !== po.id),
                          )
                        }
                      />
                      <div>
                        <p className="text-[12.5px] font-medium text-[var(--color-off-white)]">
                          {po.vendor_po_number ?? po.sidemark ?? 'PO drafted'}
                        </p>
                        <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
                          {po.project?.name ?? 'Project'} ·{' '}
                          {po.total_cents != null ? fmtUsd(po.total_cents) : '—'}
                        </p>
                      </div>
                      <Stamp
                        label={po.status.replace(/_/g, ' ')}
                        color={stamp.color}
                        ink={stamp.ink}
                      />
                      <span className="whitespace-nowrap font-heading text-[12.5px] text-[var(--color-off-white)]">
                        {po.confirmed_eta ? `~${fmtDay(po.confirmed_eta)}` : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openDocument(po.project_id ?? po.project?.id ?? null)}
                        className="whitespace-nowrap text-[10.5px] text-[var(--color-clay)] hover:underline"
                      >
                        open document →
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {selected.length >= 2 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[5px] border border-[rgba(196,165,123,0.3)] bg-[rgba(196,165,123,0.05)] px-3 py-2.5">
              <p className="text-[11.5px] text-[var(--color-off-white)]">
                {selected.length} orders{' '}
                {selectedVendor ? '— same truck?' : '— pick one vendor to batch'}
              </p>
              {selectedVendor && (
                <>
                  <input
                    type="date"
                    aria-label="Shared ETA"
                    className="rounded-[4px] border border-[rgba(250,247,242,0.2)] bg-transparent px-2 py-1 text-[11px] text-[var(--color-off-white)]"
                    value={truckEta}
                    onChange={(e) => setTruckEta(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!truckEta || batchBusy}
                    onClick={sameTruck}
                    className="rounded-[4px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {batchBusy ? 'Writing…' : 'Set shared ETA'}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
