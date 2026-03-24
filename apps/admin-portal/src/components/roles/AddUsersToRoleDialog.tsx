'use client';

import { useState, useEffect } from 'react';
import { Loader2, UserPlus, Search, X, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { useBulkAssignRole } from '@/hooks/use-roles';

interface UserResult {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

interface AddUsersToRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string;
  roleName: string;
  existingUserIds: string[];
}

export function AddUsersToRoleDialog({
  open,
  onOpenChange,
  roleId,
  roleName,
  existingUserIds,
}: AddUsersToRoleDialogProps) {
  const { toast } = useToast();
  const bulkAssignMutation = useBulkAssignRole();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedUserIds(new Set());
    }
  }, [open]);

  // Search users when query changes
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/users?query=${encodeURIComponent(searchQuery)}&pageSize=20`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error('Search failed');
        const json = await res.json();
        const users = (json.data?.data ?? []).map((u: any) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
        }));
        // Filter out users already assigned to this role
        setSearchResults(users.filter((u: UserResult) => !existingUserIds.includes(u.id)));
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setSearchResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, existingUserIds]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleAssign = async () => {
    if (selectedUserIds.size === 0) return;

    try {
      const result = await bulkAssignMutation.mutateAsync({
        roleId,
        userIds: Array.from(selectedUserIds),
      });

      toast({
        title: 'Users assigned',
        description: `${result.successCount} user(s) have been assigned the "${roleName}" role.`,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Failed to assign users',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const selectedUsers = searchResults.filter((u) => selectedUserIds.has(u.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Users to Role
          </DialogTitle>
          <DialogDescription>
            Search for users and assign them the "{roleName}" role.
          </DialogDescription>
        </DialogHeader>

        {/* Selected users */}
        {selectedUserIds.size > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map((user) => (
              <Badge key={user.id} variant="secondary" className="gap-1 pr-1">
                {user.displayName || user.email}
                <button
                  type="button"
                  onClick={() => toggleUser(user.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Search results */}
        <ScrollArea className="max-h-[300px]">
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-1">
              {searchResults.map((user) => {
                const isSelected = selectedUserIds.has(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatarUrl} />
                      <AvatarFallback>
                        {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {user.displayName || 'Unnamed User'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          ) : searchQuery.length >= 2 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No users found matching "{searchQuery}"
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={bulkAssignMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={selectedUserIds.size === 0 || bulkAssignMutation.isPending}
          >
            {bulkAssignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign {selectedUserIds.size > 0 ? `${selectedUserIds.size} User(s)` : 'Users'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
