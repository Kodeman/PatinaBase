'use client';

import type { VendorDirectoryRow } from '@patina/fulfillment';
import { DataTable, type Column } from '@/components/portal';
import { Badge } from '@/components/ui/badge';

// Vendor Directory list (S4, spec §7). Every vendor appears, profiled or not
// (R1.6 — code never blocks on vendor facts); an unprofiled vendor shows
// "Needs profile" so the gap is visible instead of the row silently missing
// fields.

export interface VendorDirectoryTableProps {
  rows: VendorDirectoryRow[];
}

const TRANSMISSION_LABEL: Record<string, string> = {
  email: 'Email',
  portal: 'Portal',
  csv: 'CSV',
};
const TERMS_LABEL: Record<string, string> = {
  prepay: 'Prepay',
  fifty_fifty: '50/50',
  net_30: 'Net 30',
};

export function VendorDirectoryTable({ rows }: VendorDirectoryTableProps) {
  const columns: Column<VendorDirectoryRow>[] = [
    {
      key: 'name',
      header: 'Vendor',
      render: (r) => <span className="type-item-name">{r.vendorName}</span>,
    },
    {
      key: 'transmission',
      header: 'Transmission',
      render: (r) => (r.transmissionType ? TRANSMISSION_LABEL[r.transmissionType] ?? r.transmissionType : '—'),
    },
    {
      key: 'terms',
      header: 'Terms',
      render: (r) => (r.paymentTerms ? TERMS_LABEL[r.paymentTerms] ?? r.paymentTerms : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.hasProfile ? (
          <Badge variant="outline" data-testid="vendor-status-profiled">
            Profiled
          </Badge>
        ) : (
          <Badge data-testid="vendor-status-needs-profile" style={{ backgroundColor: 'var(--color-terracotta, var(--color-error))' }}>
            Needs profile
          </Badge>
        ),
      className: 'text-right',
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getKey={(r) => r.vendorId}
      onRowHref={(r) => `/fulfillment/vendors/${r.vendorId}`}
      emptyMessage="No vendors found."
    />
  );
}
