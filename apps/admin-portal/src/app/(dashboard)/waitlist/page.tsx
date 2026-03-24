'use client';

import { useState, useEffect } from 'react';
import {
  ClipboardList,
  Search,
  Filter,
  MoreVertical,
  Eye,
  UserPlus,
  Users,
  ArrowRight,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWaitlistEntries, useWaitlistStats } from '@/hooks/use-waitlist';
import { ConvertToUserDialog } from '@/components/waitlist/ConvertToUserDialog';
import { WaitlistDetailDialog } from '@/components/waitlist/WaitlistDetailDialog';
import type { WaitlistEntry } from '@/services/waitlist';

export default function WaitlistPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading waitlist...</div>
    );
  }

  return <WaitlistPageContent />;
}

function WaitlistPageContent() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Dialog states
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const { data: statsData } = useWaitlistStats();
  const { data, isLoading, isError, error } = useWaitlistEntries({
    search: search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as 'pending' | 'converted') : undefined,
    role: roleFilter !== 'all' ? roleFilter : undefined,
    page,
    pageSize: 20,
  });

  const entries = data?.data || [];
  const meta = data?.meta;

  const handleAction = (entry: WaitlistEntry, action: 'convert' | 'detail') => {
    setSelectedEntry(entry);
    if (action === 'convert') {
      setConvertDialogOpen(true);
    } else {
      setDetailDialogOpen(true);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const conversionRate = statsData && statsData.total > 0
    ? Math.round((statsData.converted / statsData.total) * 100)
    : 0;

  // Get unique sources for filter dropdown
  const sources = statsData?.bySource ? Object.keys(statsData.bySource).sort() : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <ClipboardList className="h-8 w-8" />
          Waitlist
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage waitlist signups and convert them to Patina users.
        </p>
      </div>

      {/* Stats Cards */}
      {statsData && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Total Signups</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Designers</p>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.byRole['designer'] || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Consumers</p>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.byRole['consumer'] || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Converted</p>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsData.converted}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({conversionRate}%)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Entries List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by email..."
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="designer">Designer</SelectItem>
                <SelectItem value="consumer">Consumer</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            {sources.length > 0 && (
              <Select
                value=""
                onValueChange={(v) => {
                  // Toggle source filter
                  setSearch('');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading entries...</div>
          ) : isError ? (
            <div className="text-center py-8 text-destructive">
              <AlertCircle className="mx-auto h-8 w-8 mb-2" />
              <p className="font-medium">Failed to load waitlist</p>
              <p className="text-sm text-muted-foreground mt-1">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No waitlist entries found
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => {
                const isConverted = !!entry.convertedAt;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium">
                          {entry.email.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <button
                          onClick={() => handleAction(entry, 'detail')}
                          className="font-medium hover:underline text-left"
                        >
                          {entry.email}
                        </button>
                        <div className="text-sm text-muted-foreground">
                          Signed up {formatDate(entry.createdAt)}
                          {entry.utmCampaign && (
                            <span className="ml-2">via {entry.utmCampaign}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{entry.role}</Badge>
                      <Badge variant="secondary">{entry.source}</Badge>
                      {isConverted ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Converted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                          Pending
                        </Badge>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleAction(entry, 'detail')}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {!isConverted && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleAction(entry, 'convert')}>
                                <ArrowRight className="mr-2 h-4 w-4" />
                                Convert to User
                              </DropdownMenuItem>
                            </>
                          )}
                          {isConverted && entry.authUserId && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <a href={`/users/${entry.authUserId}`}>
                                  <UserPlus className="mr-2 h-4 w-4" />
                                  View User Profile
                                </a>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {meta && meta.total > meta.pageSize && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {(meta.page - 1) * meta.pageSize + 1} to{' '}
                {Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total} entries
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * meta.pageSize >= meta.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ConvertToUserDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        entry={selectedEntry}
      />
      <WaitlistDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        entry={selectedEntry}
      />
    </div>
  );
}
