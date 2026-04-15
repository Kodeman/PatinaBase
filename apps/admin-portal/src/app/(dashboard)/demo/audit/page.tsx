'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Download } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import {
  PageHeader,
  Section,
  DataTable,
  StatusDot,
  type Column,
} from '@/components/portal';

interface AuditLog {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  result: string;
}

const mockAuditLogs: AuditLog[] = [
  { id: '1', action: 'designer.approved', actor: 'admin@patina.com', timestamp: new Date().toISOString(), result: 'success' },
  { id: '2', action: 'product.published', actor: 'admin@patina.com', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), result: 'success' },
  { id: '3', action: 'user.suspended', actor: 'support@patina.com', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), result: 'success' },
  { id: '4', action: 'role.assigned', actor: 'admin@patina.com', timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), result: 'success' },
];

const columns: Column<AuditLog>[] = [
  { key: 'id', header: 'ID', className: 'font-mono', render: (l) => l.id },
  {
    key: 'action',
    header: 'Action',
    render: (l) => <span className="font-mono text-[0.85rem]">{l.action}</span>,
  },
  { key: 'actor', header: 'Actor', render: (l) => l.actor },
  {
    key: 'timestamp',
    header: 'Timestamp',
    render: (l) => <span className="type-meta-small">{formatDateTime(l.timestamp)}</span>,
  },
  {
    key: 'result',
    header: 'Result',
    render: (l) => (
      <StatusDot variant={l.result === 'success' ? 'success' : 'error'} label={l.result} />
    ),
  },
];

export default function AuditPage() {
  return (
    <div>
      <PageHeader
        title="Audit"
        accent="Logs"
        description="Immutable audit trail of all privileged actions."
        actions={
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        }
      />

      <Section className="mt-10">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search by action, actor, resource..."
              className="pl-9"
            />
          </div>
        </div>

        <DataTable columns={columns} rows={mockAuditLogs} getKey={(l) => l.id} />
      </Section>
    </div>
  );
}
