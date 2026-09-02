'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStudioUserSearch } from '@/hooks/use-studios';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { StudioOwner } from '@/types';

// Single-select, debounced user picker backed by
// /api/admin/studios/user-search — a real full-table search, unlike
// AddUsersToRoleDialog's inline search (roles/AddUsersToRoleDialog.tsx),
// which only searches the first 20 auth users returned by /api/users. That
// dialog is left untouched (B5 follow-up: migrate it to this component).

interface UserSearchPickerProps {
  /** Selected user, or null when nothing is picked yet. */
  value: StudioOwner | null;
  onChange: (user: StudioOwner | null) => void;
  /** Exclude users already active/invited in this studio. */
  excludeStudioId?: string;
  placeholder?: string;
}

export function UserSearchPicker({
  value,
  onChange,
  excludeStudioId,
  placeholder = 'Search by name or email...',
}: UserSearchPickerProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: results, isLoading } = useStudioUserSearch(debouncedQuery, excludeStudioId);

  useEffect(() => {
    if (value) setQuery('');
  }, [value]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border p-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={value.avatarUrl} />
            <AvatarFallback>
              {value.displayName?.charAt(0) || value.email.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium">{value.displayName || 'Unnamed User'}</div>
            <div className="truncate text-xs text-muted-foreground">{value.email}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      {query.trim().length >= 2 && (
        <ScrollArea className="max-h-[240px] rounded-md border">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : results && results.length > 0 ? (
            <div className="space-y-1 p-1">
              {results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => onChange(user)}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted/50"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatarUrl} />
                    <AvatarFallback>
                      {user.displayName?.charAt(0) || user.email.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{user.displayName || 'Unnamed User'}</div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <Check className="h-4 w-4 shrink-0 text-transparent" />
                </button>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No users found matching &quot;{query}&quot;
            </div>
          )}
        </ScrollArea>
      )}
      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="text-xs text-muted-foreground">Type at least 2 characters to search</p>
      )}
    </div>
  );
}
