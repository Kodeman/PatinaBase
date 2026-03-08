'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Check, Minus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Permission, PermissionGroup } from '@/services/roles';

interface PermissionGridProps {
  groups: PermissionGroup[];
  selectedPermissions: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

export function PermissionGrid({
  groups,
  selectedPermissions,
  onSelectionChange,
  disabled = false,
  readOnly = false,
}: PermissionGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    new Set(groups.map((g) => g.domain))
  );

  // Filter permissions based on search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;

    const query = searchQuery.toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter(
          (p) =>
            p.code.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query) ||
            p.action.toLowerCase().includes(query) ||
            p.resource.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [groups, searchQuery]);

  const toggleDomain = (domain: string) => {
    const next = new Set(expandedDomains);
    if (next.has(domain)) {
      next.delete(domain);
    } else {
      next.add(domain);
    }
    setExpandedDomains(next);
  };

  const togglePermission = (permissionId: string) => {
    if (disabled || readOnly) return;

    const next = new Set(selectedPermissions);
    if (next.has(permissionId)) {
      next.delete(permissionId);
    } else {
      next.add(permissionId);
    }
    onSelectionChange(next);
  };

  const toggleDomainAll = (domain: string, permissions: Permission[]) => {
    if (disabled || readOnly) return;

    const permissionIds = permissions.map((p) => p.id);
    const allSelected = permissionIds.every((id) => selectedPermissions.has(id));

    const next = new Set(selectedPermissions);
    if (allSelected) {
      // Deselect all in domain
      permissionIds.forEach((id) => next.delete(id));
    } else {
      // Select all in domain
      permissionIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  };

  const getDomainSelectionState = (permissions: Permission[]) => {
    const ids = permissions.map((p) => p.id);
    const selectedCount = ids.filter((id) => selectedPermissions.has(id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === ids.length) return 'all';
    return 'partial';
  };

  const selectAll = () => {
    if (disabled || readOnly) return;
    const allIds = groups.flatMap((g) => g.permissions.map((p) => p.id));
    onSelectionChange(new Set(allIds));
  };

  const selectNone = () => {
    if (disabled || readOnly) return;
    onSelectionChange(new Set());
  };

  const totalPermissions = groups.reduce((sum, g) => sum + g.permissions.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search permissions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={disabled}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone} disabled={disabled}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Selection summary */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">
          {selectedPermissions.size} / {totalPermissions} selected
        </Badge>
      </div>

      {/* Permission groups */}
      <div className="space-y-2 rounded-lg border">
        {filteredGroups.map((group) => {
          const isExpanded = expandedDomains.has(group.domain);
          const selectionState = getDomainSelectionState(group.permissions);
          const selectedInDomain = group.permissions.filter((p) =>
            selectedPermissions.has(p.id)
          ).length;

          return (
            <div key={group.domain} className="border-b last:border-b-0">
              {/* Domain header */}
              <button
                type="button"
                onClick={() => toggleDomain(group.domain)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50',
                  'transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
                )}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}

                {!readOnly && (
                  <div
                    role="checkbox"
                    aria-checked={
                      selectionState === 'all' ? true : selectionState === 'partial' ? 'mixed' : false
                    }
                    tabIndex={0}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      selectionState === 'all' && 'bg-primary border-primary',
                      selectionState === 'partial' && 'bg-primary/50 border-primary',
                      selectionState === 'none' && 'border-input',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDomainAll(group.domain, group.permissions);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        toggleDomainAll(group.domain, group.permissions);
                      }
                    }}
                  >
                    {selectionState === 'all' && <Check className="h-3 w-3 text-primary-foreground" />}
                    {selectionState === 'partial' && <Minus className="h-3 w-3 text-primary-foreground" />}
                  </div>
                )}

                <div className="flex flex-1 items-center justify-between">
                  <span className="font-medium">{group.displayName}</span>
                  <Badge variant="outline" className="ml-2">
                    {selectedInDomain}/{group.permissions.length}
                  </Badge>
                </div>
              </button>

              {/* Permissions list */}
              {isExpanded && (
                <div className="border-t bg-muted/20 px-4 py-2">
                  <div className="grid gap-1">
                    {group.permissions.map((permission) => {
                      const isSelected = selectedPermissions.has(permission.id);
                      return (
                        <label
                          key={permission.id}
                          className={cn(
                            'flex items-start gap-3 rounded-md p-2',
                            'hover:bg-muted/50 transition-colors cursor-pointer',
                            disabled && 'opacity-50 cursor-not-allowed',
                            readOnly && 'cursor-default'
                          )}
                        >
                          {!readOnly && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => togglePermission(permission.id)}
                              disabled={disabled}
                              className="mt-0.5"
                            />
                          )}
                          {readOnly && (
                            <div
                              className={cn(
                                'mt-0.5 flex h-4 w-4 items-center justify-center rounded border',
                                isSelected ? 'bg-primary border-primary' : 'border-input'
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                          )}
                          <div className="flex-1 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                                {permission.code}
                              </code>
                            </div>
                            {permission.description && (
                              <p className="text-xs text-muted-foreground">{permission.description}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredGroups.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No permissions found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}

export default PermissionGrid;
