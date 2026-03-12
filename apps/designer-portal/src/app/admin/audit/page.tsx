'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
} from '@patina/design-system';
import { Search, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';

interface AuditLogEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  resourceType: string;
  timestamp: string;
  result: 'success' | 'failure' | 'denied';
  ipAddress: string;
  details?: string;
}

const actionTypes = [
  'designer.approved',
  'designer.rejected',
  'product.published',
  'product.unpublished',
  'product.created',
  'product.deleted',
  'user.created',
  'user.suspended',
  'user.reactivated',
  'role.assigned',
  'role.revoked',
  'role.created',
  'order.refunded',
  'order.cancelled',
  'flag.toggled',
  'settings.updated',
  'export.requested',
  'privacy.fulfilled',
];

const resourceTypes = ['user', 'product', 'order', 'role', 'flag', 'settings', 'privacy'];

const mockAuditLogs: AuditLogEntry[] = [
  {
    id: 'aud-1001',
    action: 'designer.approved',
    actor: 'admin@patina.com',
    target: 'Sarah Chen (usr-2041)',
    resourceType: 'user',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
    details: 'Portfolio verified, credentials confirmed',
  },
  {
    id: 'aud-1002',
    action: 'product.published',
    actor: 'catalog@patina.com',
    target: 'Modern Walnut Dining Table (prd-204)',
    resourceType: 'product',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
  },
  {
    id: 'aud-1003',
    action: 'user.suspended',
    actor: 'support@patina.com',
    target: 'bad.actor@example.com (usr-3102)',
    resourceType: 'user',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    result: 'success',
    ipAddress: '198.51.100.23',
    details: 'Violation of terms of service',
  },
  {
    id: 'aud-1004',
    action: 'role.assigned',
    actor: 'admin@patina.com',
    target: 'catalog:editor to James Miller (usr-1842)',
    resourceType: 'role',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
  },
  {
    id: 'aud-1005',
    action: 'order.refunded',
    actor: 'support@patina.com',
    target: 'Order #ORD-4821 ($325.00)',
    resourceType: 'order',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    result: 'success',
    ipAddress: '198.51.100.23',
    details: 'Customer requested refund - defective item',
  },
  {
    id: 'aud-1006',
    action: 'flag.toggled',
    actor: 'admin@patina.com',
    target: 'checkoutEnabled -> true',
    resourceType: 'flag',
    timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
  },
  {
    id: 'aud-1007',
    action: 'user.created',
    actor: 'system',
    target: 'emma.designer@gmail.com (usr-3210)',
    resourceType: 'user',
    timestamp: new Date(Date.now() - 1000 * 60 * 420).toISOString(),
    result: 'success',
    ipAddress: '203.0.113.45',
    details: 'Self-registration via designer portal',
  },
  {
    id: 'aud-1008',
    action: 'product.deleted',
    actor: 'catalog@patina.com',
    target: 'Discontinued Ottoman (prd-189)',
    resourceType: 'product',
    timestamp: new Date(Date.now() - 1000 * 60 * 500).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
    details: 'Soft delete - vendor discontinued',
  },
  {
    id: 'aud-1009',
    action: 'role.revoked',
    actor: 'admin@patina.com',
    target: 'orders:manage from Kelly Tran (usr-1723)',
    resourceType: 'role',
    timestamp: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
  },
  {
    id: 'aud-1010',
    action: 'privacy.fulfilled',
    actor: 'system',
    target: 'Data export for simon.wright@example.com',
    resourceType: 'privacy',
    timestamp: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
    result: 'success',
    ipAddress: '10.0.0.1',
    details: 'GDPR Article 20 - Data portability request',
  },
  {
    id: 'aud-1011',
    action: 'settings.updated',
    actor: 'admin@patina.com',
    target: 'Notification preferences',
    resourceType: 'settings',
    timestamp: new Date(Date.now() - 1000 * 60 * 840).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
  },
  {
    id: 'aud-1012',
    action: 'designer.rejected',
    actor: 'admin@patina.com',
    target: 'Fake Portfolio Co (usr-3198)',
    resourceType: 'user',
    timestamp: new Date(Date.now() - 1000 * 60 * 960).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
    details: 'Portfolio images found to be stock photos',
  },
  {
    id: 'aud-1013',
    action: 'export.requested',
    actor: 'admin@patina.com',
    target: 'Catalog CSV export (2,341 products)',
    resourceType: 'product',
    timestamp: new Date(Date.now() - 1000 * 60 * 1080).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
  },
  {
    id: 'aud-1014',
    action: 'order.cancelled',
    actor: 'support@patina.com',
    target: 'Order #ORD-4799',
    resourceType: 'order',
    timestamp: new Date(Date.now() - 1000 * 60 * 1200).toISOString(),
    result: 'denied',
    ipAddress: '198.51.100.23',
    details: 'Cannot cancel - already shipped',
  },
  {
    id: 'aud-1015',
    action: 'role.created',
    actor: 'admin@patina.com',
    target: 'catalog:reviewer (custom role)',
    resourceType: 'role',
    timestamp: new Date(Date.now() - 1000 * 60 * 1440).toISOString(),
    result: 'success',
    ipAddress: '64.71.12.91',
  },
];

const PAGE_SIZE = 8;

function getResultBadgeColor(result: AuditLogEntry['result']) {
  switch (result) {
    case 'success':
      return 'success' as const;
    case 'failure':
      return 'error' as const;
    case 'denied':
      return 'warning' as const;
  }
}

function getResourceColor(resourceType: string) {
  const colors: Record<string, string> = {
    user: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    product: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    order: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    role: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    flag: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    settings: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
    privacy: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return colors[resourceType] || colors.settings;
}

export default function AuditPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [resourceFilter, setResourceFilter] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    return mockAuditLogs.filter((log) => {
      const matchesSearch =
        !searchQuery ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.target.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAction = !actionFilter || log.action === actionFilter;
      const matchesResource = !resourceFilter || log.resourceType === resourceFilter;
      const matchesResult = !resultFilter || log.result === resultFilter;
      return matchesSearch && matchesAction && matchesResource && matchesResult;
    });
  }, [searchQuery, actionFilter, resourceFilter, resultFilter]);

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const paginatedLogs = filteredLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const hasActiveFilters = actionFilter || resourceFilter || resultFilter;

  const clearFilters = () => {
    setActionFilter(null);
    setResourceFilter(null);
    setResultFilter(null);
    setSearchQuery('');
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">
            Immutable audit trail of all privileged actions
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Search and filters */}
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by action, actor, or target..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-4">
              {/* Resource type filter */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Resource
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {resourceTypes.map((type) => (
                    <button
                      key={type}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        resourceFilter === type
                          ? getResourceColor(type)
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                      onClick={() => {
                        setResourceFilter(resourceFilter === type ? null : type);
                        setPage(0);
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Result filter */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Result
                </label>
                <div className="flex gap-1.5">
                  {['success', 'failure', 'denied'].map((result) => (
                    <button
                      key={result}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        resultFilter === result
                          ? result === 'success'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : result === 'failure'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                      onClick={() => {
                        setResultFilter(resultFilter === result ? null : result);
                        setPage(0);
                      }}
                    >
                      {result}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {paginatedLogs.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No audit logs match your filters
              </div>
            )}
            {paginatedLogs.map((log) => (
              <div key={log.id}>
                <div
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`text-xs font-mono px-2 py-1 rounded ${getResourceColor(log.resourceType)}`}>
                      {log.resourceType}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium font-mono text-sm">{log.action}</div>
                      <div className="text-sm text-muted-foreground truncate">{log.target}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="text-right hidden md:block">
                      <div className="text-sm text-muted-foreground">{log.actor}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeTime(log.timestamp)}
                      </div>
                    </div>
                    <Badge variant="subtle" color={getResultBadgeColor(log.result)}>
                      {log.result}
                    </Badge>
                  </div>
                </div>
                {expandedId === log.id && (
                  <div className="mx-4 mb-2 p-3 rounded-b-lg bg-muted/30 border border-t-0 text-sm space-y-1">
                    <div className="flex gap-8">
                      <div>
                        <span className="text-muted-foreground">ID:</span>{' '}
                        <span className="font-mono">{log.id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IP:</span>{' '}
                        <span className="font-mono">{log.ipAddress}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Time:</span>{' '}
                        {formatDateTime(log.timestamp)}
                      </div>
                    </div>
                    {log.details && (
                      <div>
                        <span className="text-muted-foreground">Details:</span> {log.details}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} entries
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
