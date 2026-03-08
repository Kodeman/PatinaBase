'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { usersService } from '@/services/users';
import { formatDate } from '@/lib/utils';
import { SuspendUserDialog } from '@/components/users/SuspendUserDialog';
import { BanUserDialog } from '@/components/users/BanUserDialog';
import { ActivateUserDialog } from '@/components/users/ActivateUserDialog';
import { VerifyEmailDialog } from '@/components/users/VerifyEmailDialog';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import type { User } from '@/types';

export default function UsersPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Dialog states
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [verifyEmailDialogOpen, setVerifyEmailDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['users', { query, status: statusFilter !== 'all' ? statusFilter : undefined, page }],
    queryFn: () =>
      usersService.getUsers({
        query,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page,
        pageSize: 20,
      }),
  });

  const users = data?.data?.data || [];
  const meta = data?.data?.meta;

  const handleAction = (user: User, action: string) => {
    setSelectedUser(user);
    switch (action) {
      case 'view':
        router.push(`/users/${user.id}`);
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

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'suspended':
        return 'warning';
      case 'banned':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts, roles, and permissions
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No users found
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user: User) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.email}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <span className="text-sm font-medium">
                          {user.email.substring(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/users/${user.id}`)}
                          className="font-medium hover:underline text-left"
                        >
                          {user.email}
                        </button>
                        {user.emailVerified ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-yellow-600" />
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {user.displayName || 'No display name'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex gap-1">
                        {user.roles?.map((role) => (
                          <Badge key={role.id} variant="outline">
                            {role.name}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Joined {formatDate(user.createdAt)}
                      </div>
                    </div>
                    <Badge variant={getStatusVariant(user.status)}>
                      {user.status}
                    </Badge>

                    {/* Actions Dropdown */}
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

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {(meta.page - 1) * meta.limit + 1} to{' '}
                {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} users
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
                  disabled={page === meta.totalPages}
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
      <CreateUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
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
