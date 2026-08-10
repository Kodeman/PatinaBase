'use client';

import { useMemo } from 'react';
import Image from 'next/image';

import { useClientSelections } from '@/hooks/use-commercial-client';
import type { ClientSelection } from '@/lib/commercial-documents';

const STATUS_ORDER = [
  'approved',
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
] as const;

type ClientVisibleStatus = (typeof STATUS_ORDER)[number];

const STATUS_LABEL: Record<ClientVisibleStatus, string> = {
  approved: 'Approved',
  ordered: 'Ordered',
  production: 'In production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  installed: 'Installed',
};

const STATUS_TONE: Record<ClientVisibleStatus, string> = {
  approved: 'bg-amber-50 text-amber-800',
  ordered: 'bg-blue-50 text-blue-800',
  production: 'bg-blue-50 text-blue-800',
  shipped: 'bg-blue-50 text-blue-800',
  delivered: 'bg-green-50 text-green-800',
  installed: 'bg-green-50 text-green-800',
};

export function FFEPipelinePanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useClientSelections(projectId);

  const items = useMemo(() => {
    return (data?.selections ?? []).filter((item) =>
      (STATUS_ORDER as readonly string[]).includes(item.logisticsStatus)
    );
  }, [data]);

  const grouped = useMemo(() => {
    const map = new Map<ClientVisibleStatus, typeof items>();
    for (const status of STATUS_ORDER) map.set(status, []);
    for (const item of items) {
      const list = map.get(item.logisticsStatus as ClientVisibleStatus);
      if (list) list.push(item);
    }
    return map;
  }, [items]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[var(--border-default)] bg-white p-5">
        <h3 className="font-heading text-base text-[var(--text-primary)] mb-3">Procurement</h3>
        <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-lg border border-[var(--border-default)] bg-white p-5">
        <h3 className="font-heading text-base text-[var(--text-primary)] mb-3">Procurement</h3>
        <p className="type-body-small text-[var(--text-muted)]">
          Items will appear here once your designer kicks off procurement.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-[var(--border-default)] bg-white p-5"
      data-testid="ffe-pipeline-panel"
    >
      <h3 className="font-heading text-base text-[var(--text-primary)] mb-4">Procurement</h3>
      <div className="space-y-5">
        {STATUS_ORDER.map((status) => {
          const list = grouped.get(status) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={status}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`inline-block rounded-sm px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider ${STATUS_TONE[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>
                <span className="type-meta-small text-[var(--text-muted)]">
                  {list.length} {list.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              <ul className="divide-y divide-[var(--border-subtle)] rounded border border-[var(--border-subtle)]">
                {list.map((item) => (
                  <FFEItemRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FFEItemRow({ item }: { item: ClientSelection }) {
  // This component consumes the RPC allowlist only. Price, vendor, notes and
  // working-media paths never enter the browser through this presentation.
  const visibleName = item.name;
  const room = item.roomName;
  const productImage = item.imageUrl;

  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-[var(--bg-surface)]">
        {productImage ? (
          <Image
            src={productImage}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {visibleName}
        </p>
        <p className="type-meta-small text-[var(--text-muted)]">
          {room || '—'}
        </p>
      </div>
    </li>
  );
}
