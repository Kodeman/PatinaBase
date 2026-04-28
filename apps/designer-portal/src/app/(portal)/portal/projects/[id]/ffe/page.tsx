'use client';

import { use, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProjectFFEItems, useProjectRooms } from '@/hooks/use-projects';
import { useProject } from '@/hooks/use-projects';
import { useUpdateFFEItemStatus, useVendors } from '@patina/supabase';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { SearchInput } from '@/components/portal/search-input';
import {
  FacetedFilterPopover,
  type Facet,
  type FacetSelections,
} from '@/components/portal/faceted-filter-popover';
import { BulkActionBar, BulkActionButton } from '@/components/portal/bulk-action-bar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyItem = any;

const STAGES = [
  { key: 'specified',  label: 'Specified',   color: 'var(--text-muted)' },
  { key: 'quoted',     label: 'Quoted',      color: 'var(--color-dusty-blue, #8B9CAD)' },
  { key: 'approved',   label: 'Approved',    color: 'var(--color-clay, #C4A57B)' },
  { key: 'ordered',    label: 'Ordered',     color: 'var(--color-dusty-blue, #8B9CAD)' },
  { key: 'production', label: 'Production',  color: 'var(--color-golden-hour, #E8C547)' },
  { key: 'shipped',    label: 'Shipped',     color: 'var(--color-golden-hour, #E8C547)' },
  { key: 'delivered',  label: 'Delivered',   color: 'var(--color-sage, #A8B5A0)' },
  { key: 'installed',  label: 'Installed',   color: 'var(--color-sage, #A8B5A0)' },
];

function formatDollars(cents: number): string {
  return `$${((cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FFEPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const drawerItemId = searchParams.get('item');

  const { data: project } = useProject(projectId);
  const { data: rawItems } = useProjectFFEItems(projectId);
  const { data: rawRooms } = useProjectRooms(projectId);
  const { data: vendors } = useVendors();
  const updateStatus = useUpdateFFEItemStatus();

  const items = (Array.isArray(rawItems) ? rawItems : []) as AnyItem[];
  const rooms = (Array.isArray(rawRooms) ? rawRooms : []) as AnyItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorList = (Array.isArray(vendors) ? vendors : []) as any[];

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FacetSelections>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const facets = useMemo<Facet[]>(() => {
    const itemTypes = new Set<string>();
    const itemVendors = new Map<string, string>();
    for (const it of items) {
      if (it.item_type) itemTypes.add(it.item_type);
      if (it.vendor_name) itemVendors.set(it.vendor_id || it.vendor_name, it.vendor_name);
    }
    return [
      {
        key: 'room',
        label: 'Room',
        options: rooms.map((r) => ({ value: r.id, label: r.name })),
      },
      {
        key: 'vendor',
        label: 'Vendor',
        options: Array.from(itemVendors.entries()).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'type',
        label: 'Type',
        options: Array.from(itemTypes).map((t) => ({
          value: t,
          label: t === 'fixed' ? 'Fixed' : t === 'allowance' ? 'Allowance' : 'TBD',
        })),
      },
    ];
  }, [items, rooms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (q) {
        const hay = [it.name, it.vendor_name, it.po_number].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const roomSel = filters.room ?? [];
      if (roomSel.length > 0 && !roomSel.includes(it.project_room_id)) return false;
      const vendorSel = filters.vendor ?? [];
      if (vendorSel.length > 0 && !vendorSel.includes(it.vendor_id || it.vendor_name)) return false;
      const typeSel = filters.type ?? [];
      if (typeSel.length > 0 && !typeSel.includes(it.item_type)) return false;
      return true;
    });
  }, [items, search, filters]);

  const grouped = useMemo(() => {
    const map: Record<string, AnyItem[]> = {};
    for (const stage of STAGES) map[stage.key] = [];
    for (const it of filtered) {
      const key = it.status || 'specified';
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return map;
  }, [filtered]);

  const drawerItem = drawerItemId ? items.find((it) => it.id === drawerItemId) : null;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkAdvance = async (toStatus: string) => {
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((itemId) => updateStatus.mutateAsync({ itemId, projectId, status: toStatus }))
    );
    setSelected(new Set());
  };

  if (!project) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: project.name, href: `/portal/projects/${projectId}` },
          { label: 'FF&E' },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
          FF&amp;E Pipeline
        </h1>
        <div className="type-meta-small text-[var(--text-muted)]">
          {filtered.length} of {items.length} items
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search items, vendors, PO numbers" />
        <FacetedFilterPopover facets={facets} value={filters} onChange={setFilters} />
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const stageItems = grouped[stage.key] || [];
            return (
              <div
                key={stage.key}
                className="flex w-[260px] shrink-0 flex-col rounded-md border"
                style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}
              >
                <div
                  className="flex items-center justify-between border-b px-3 py-2"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-meta)',
                        fontSize: '0.62rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {stage.label}
                    </span>
                  </span>
                  <span className="type-meta-small text-[var(--text-muted)]">
                    {stageItems.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-2 min-h-[100px]">
                  {stageItems.map((it) => {
                    const isSelected = selected.has(it.id);
                    return (
                      <div
                        key={it.id}
                        className="cursor-pointer rounded-md border bg-white p-2.5 text-left transition-colors hover:border-[var(--text-primary)]"
                        style={{
                          borderColor: isSelected
                            ? 'var(--text-primary)'
                            : 'var(--border-default)',
                        }}
                        onClick={() =>
                          router.push(`/portal/projects/${projectId}/ffe?item=${it.id}`)
                        }
                      >
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <span className="line-clamp-2 font-body text-[0.8rem] font-medium">
                            {it.name}
                          </span>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelect(it.id)}
                            aria-label={`Select ${it.name}`}
                          />
                        </div>
                        {it.blocked && (
                          <div className="mb-1.5 type-meta-small uppercase tracking-wider" style={{ color: 'var(--color-terracotta, #D4A090)' }}>
                            ⚠ Blocked
                          </div>
                        )}
                        {it.room?.name && (
                          <div className="type-meta-small text-[var(--text-muted)]">
                            {it.room.name}
                          </div>
                        )}
                        {it.vendor_name && (
                          <div className="type-meta-small text-[var(--text-muted)]">
                            {it.vendor_name}
                          </div>
                        )}
                        <div className="mt-1.5 flex items-baseline justify-between">
                          <span className="font-heading text-[0.85rem] font-semibold">
                            {formatDollars(it.line_total_cents || 0)}
                          </span>
                          {it.eta && (
                            <span className="type-meta-small text-[var(--text-muted)]">
                              ETA {formatDate(it.eta)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {stageItems.length === 0 && (
                    <div className="py-6 text-center type-meta-small text-[var(--text-muted)]">
                      —
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Item drawer */}
      {drawerItem && (
        <ItemDrawer
          item={drawerItem}
          rooms={rooms}
          vendors={vendorList}
          onClose={() => router.push(`/portal/projects/${projectId}/ffe`)}
          onUpdateStatus={async (status) => {
            await updateStatus.mutateAsync({ itemId: drawerItem.id, projectId, status });
          }}
        />
      )}

      {/* Bulk action bar */}
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkActionButton onClick={() => bulkAdvance('approved')}>Mark Approved</BulkActionButton>
        <BulkActionButton onClick={() => bulkAdvance('ordered')}>Mark Ordered</BulkActionButton>
        <BulkActionButton onClick={() => alert('Generate POs — coming soon')}>
          Generate POs
        </BulkActionButton>
        <BulkActionButton onClick={() => alert('Reassign vendor — coming soon')}>
          Reassign Vendor
        </BulkActionButton>
      </BulkActionBar>
    </div>
  );
}

function ItemDrawer({
  item,
  rooms,
  vendors,
  onClose,
  onUpdateStatus,
}: {
  item: AnyItem;
  rooms: AnyItem[];
  vendors: AnyItem[];
  onClose: () => void;
  onUpdateStatus: (status: string) => Promise<void>;
}) {
  const room = rooms.find((r) => r.id === item.project_room_id);
  const currentIdx = STAGES.findIndex((s) => s.key === item.status);
  const nextStage = currentIdx >= 0 && currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[480px] max-w-[95vw] overflow-y-auto border-l bg-[var(--bg-surface)] shadow-xl"
      style={{ borderColor: 'var(--border-default)' }}>
      <div className="flex items-center justify-between border-b p-4" style={{ borderColor: 'var(--border-default)' }}>
        <span className="type-meta-small uppercase tracking-wider">Item Detail</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[1rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-5">
        <h2
          className="mb-3"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            color: 'var(--text-primary)',
          }}
        >
          {item.name}
        </h2>

        <Field label="Room" value={room?.name || '—'} />
        <Field label="Vendor" value={item.vendor_name || '—'} />
        <Field label="PO Number" value={item.po_number || '—'} />
        <Field label="Quantity" value={String(item.quantity ?? 1)} />
        <Field label="Unit Price" value={formatDollars(item.unit_price_cents || 0)} />
        <Field label="Line Total" value={formatDollars(item.line_total_cents || 0)} />
        <Field label="ETA" value={formatDate(item.eta)} />
        <Field label="Last Updated" value={formatDate(item.last_status_change_at || item.updated_at)} />

        {item.blocked && (
          <div
            className="my-3 rounded-md border-2 p-3"
            style={{ borderColor: 'var(--color-terracotta, #D4A090)' }}
          >
            <div className="type-meta-small uppercase tracking-wider mb-1" style={{ color: 'var(--color-terracotta)' }}>
              ⚠ Blocked
            </div>
            <p className="type-body text-[0.82rem]">
              {item.blocked_reason || 'Pending decision blocks this item.'}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {nextStage && (
            <button
              type="button"
              onClick={() => onUpdateStatus(nextStage.key)}
              className="rounded-[3px] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
              style={{ background: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            >
              Mark as {nextStage.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => alert('Generate PO — coming soon')}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{ borderColor: 'var(--border-default)' }}
          >
            Generate PO
          </button>
        </div>

        {/* Suppress unused vendors prop warning until vendor reassignment ships */}
        <span className="hidden">{vendors.length}</span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b py-1.5 last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="type-meta-small text-[var(--text-muted)]">{label}</span>
      <span className="type-body text-[0.85rem] text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
