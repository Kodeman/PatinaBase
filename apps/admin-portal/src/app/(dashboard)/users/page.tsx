'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
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
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  Eye,
  Pause,
  Ban,
  Play,
  Mail,
  CheckCircle2,
  AlertCircle,
  Users as UsersIcon,
} from 'lucide-react';
import {
  PageHeader,
  Section,
  EmptyState as PortalEmptyState,
  LoadingStrata,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
import { usersService } from '@/services/users';
import { formatDate } from '@/lib/utils';
import { SuspendUserDialog } from '@/components/users/SuspendUserDialog';
import { BanUserDialog } from '@/components/users/BanUserDialog';
import { ActivateUserDialog } from '@/components/users/ActivateUserDialog';
import { VerifyEmailDialog } from '@/components/users/VerifyEmailDialog';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { InviteDesignerDialog } from '@/components/users/InviteDesignerDialog';
import type { User } from '@/types';
// F2 admin-portal help-system migration — Sprint 3.
// `EmptyState` from `@/components/portal` is the legacy local primitive
// (label + message). We alias it as `PortalEmptyState` so the canonical
// CMS-backed `EmptyState` from `@patina/help-system` can sit alongside it
// for the empty-no-users and no-filter-results surfaces. The portal
// primitive remains in use for error states (which surface a label like
// "Error" plus a transient message — not a CMS authoring concern).
import {
  EmptyState,
  InfoIcon,
  SectionIntro,
  SurfaceKeys,
  useHelpContent,
} from '@patina/help-system';

export default function UsersPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <LoadingStrata />;

  return <UsersPageContent />;
}

// ─── Empty-state wrapper (F2 admin-portal users) ─────────────────────────────
//
// Mirrors the designer-portal Clients pattern: probe `useHelpContent` first
// so a clean CMS miss can fall back to local copy instead of leaving the
// list silently blank. Two distinct surfaces — different copy for "no users
// at all" vs. "your filter returned nothing." Each surface is tracked
// independently in Sanity per spec §6.2.

interface UsersEmptyStateProps {
  isFiltered: boolean;
}

function UsersEmptyState({ isFiltered }: UsersEmptyStateProps) {
  const surfaceKey = isFiltered
    ? SurfaceKeys.AdminPortal.Users.Empty.NoFilterResults
    : SurfaceKeys.AdminPortal.Users.Empty.NoUsers;
  const fallback = isFiltered
    ? 'No users match these filters. Adjust your search or status filter.'
    : 'No users yet. Use Create User to invite a team member.';

  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');

  if (isLoading) {
    return (
      <p className="type-body py-16 text-center italic text-[var(--text-muted)]">…</p>
    );
  }

  if (data) {
    return (
      <EmptyState
        surfaceKey={surfaceKey}
        icon={<UsersIcon className="h-8 w-8 text-[var(--text-muted)]" strokeWidth={1.5} />}
      />
    );
  }

  // CMS miss — render the local fallback so first-time operators see helpful
  // copy instead of a blank section.
  return (
    <p className="type-body py-16 text-center text-[var(--text-muted)]">{fallback}</p>
  );
}

function UsersPageContent() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inviteDesignerDialogOpen, setInviteDesignerDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [verifyEmailDialogOpen, setVerifyEmailDialogOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'users',
      { query, status: statusFilter !== 'all' ? statusFilter : undefined, page },
    ],
    queryFn: () =>
      usersService.getUsers({
        query,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page,
        pageSize: 20,
      }),
  });

  const users = data?.data || [];
  const meta = data?.meta;

  const handleAction = (user: User, action: string) => {
    setSelectedUser(user);
    switch (action) {
      case 'view':
        router.push(`/users/${user.id}` as any);
        break;
      case 'suspend':
        setSuspendDialogOpen(true);
        break;
      case 'ban':
        setBanDialogOpen(true);
        break;
      case 'activate':
        setActivateDialogOpen(true);
        break;
      case 'verify':
        setVerifyEmailDialogOpen(true);
        break;
    }
  };

  const statusVariantFor = (status: string): StatusVariant => {
    switch (status) {
      case 'active':
        return 'success';
      case 'suspended':
        return 'warning';
      case 'banned':
        return 'error';
      default:
        return 'neutral';
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage user accounts, roles, and permissions."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setInviteDesignerDialogOpen(true)}>
              <Mail className="mr-2 h-4 w-4" />
              Invite Designer
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </div>
        }
      />

      {/* Page-level intro under the header. Voice is utility: tells the
          operator what they can do on this page. CMS-authored fallback
          keeps first-time operators from seeing a blank prompt. */}
      <SectionIntro
        surfaceKey={SurfaceKeys.AdminPortal.Users.ListIntro}
        fallback="All user accounts. Suspend, ban, or reactivate from the row menu."
        className="-mt-4 mb-6 max-w-prose"
      />

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search users by email or name..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingStrata />
        ) : isError ? (
          // Error state stays on the local portal primitive — it's a
          // transient label + dynamic message, not a CMS authoring concern.
          <PortalEmptyState
            label="Error"
            message={error instanceof Error ? error.message : 'Failed to load users.'}
          />
        ) : users.length === 0 ? (
          // Two distinct CMS-backed empties so authors can write bespoke
          // copy per zero-state (no users at all vs. no filter matches).
          // The query-or-filter distinction is the same one used by the
          // designer-portal Clients screen (F1.6). Falls back to inline
          // copy until Sanity content lands.
          <UsersEmptyState
            isFiltered={Boolean(query.trim()) || statusFilter !== 'all'}
          />
        ) : (
          <div>
            {users.map((user: User) => (
              <div
                key={user.id}
                className="group flex items-center justify-between border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(196,165,123,0.12)] text-[var(--accent-primary)]">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.avatarUrl}
                        alt={user.email}
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <span className="type-label text-[0.7rem]">
                        {user.email.substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/users/${user.id}` as any)}
                        className="type-item-name text-left hover:text-[var(--accent-primary)]"
                      >
                        {user.email}
                      </button>
                      {user.emailVerified ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-[var(--color-warning)]" />
                      )}
                    </div>
                    <div className="type-label-secondary mt-0.5">
                      {user.displayName || 'No display name'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex gap-1.5">
                      {user.roles?.map((role) => (
                        <Badge key={role.id} variant="outline">
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                    <div className="type-meta-small mt-1">
                      Joined {formatDate(user.createdAt)}
                    </div>
                  </div>
                  <StatusDot variant={statusVariantFor(user.status)} label={user.status} />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleAction(user, 'view')}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>

                      {!user.emailVerified && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleAction(user, 'verify')}>
                            <Mail className="mr-2 h-4 w-4" />
                            Verify Email
                          </DropdownMenuItem>
                        </>
                      )}

                      <DropdownMenuSeparator />

                      {user.status === 'active' && (
                        <>
                          <DropdownMenuItem onClick={() => handleAction(user, 'suspend')}>
                            <Pause className="mr-2 h-4 w-4" />
                            Suspend User
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleAction(user, 'ban')}
                            className="text-destructive focus:text-destructive"
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            Ban User
                          </DropdownMenuItem>
                        </>
                      )}

                      {(user.status === 'suspended' || user.status === 'banned') && (
                        <DropdownMenuItem onClick={() => handleAction(user, 'activate')}>
                          <Play className="mr-2 h-4 w-4" />
                          Reactivate User
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}

        {meta && meta.total > meta.pageSize && (
          <div className="mt-6 flex items-center justify-between border-t border-[var(--border-default)] pt-4">
            <div className="type-meta-small">
              Showing {(meta.page - 1) * meta.pageSize + 1} to{' '}
              {Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
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
      </Section>

      <CreateUserDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <InviteDesignerDialog
        open={inviteDesignerDialogOpen}
        onOpenChange={setInviteDesignerDialogOpen}
      />

      {selectedUser && (
        <>
          <SuspendUserDialog
            userId={selectedUser.id}
            userEmail={selectedUser.email}
            open={suspendDialogOpen}
            onOpenChange={setSuspendDialogOpen}
          />
          <BanUserDialog
            userId={selectedUser.id}
            userEmail={selectedUser.email}
            open={banDialogOpen}
            onOpenChange={setBanDialogOpen}
          />
          <ActivateUserDialog
            userId={selectedUser.id}
            userEmail={selectedUser.email}
            currentStatus={selectedUser.status}
            open={activateDialogOpen}
            onOpenChange={setActivateDialogOpen}
          />
          <VerifyEmailDialog
            userId={selectedUser.id}
            userEmail={selectedUser.email}
            open={verifyEmailDialogOpen}
            onOpenChange={setVerifyEmailDialogOpen}
          />
        </>
      )}
    </div>
  );
}
