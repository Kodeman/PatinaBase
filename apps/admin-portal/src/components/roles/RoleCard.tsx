'use client';

import { useState } from 'react';
import { Shield, Users, Key, MoreHorizontal, Pencil, Copy, Trash2, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Role } from '@/services/roles';

interface RoleCardProps {
  role: Role;
  onEdit?: (role: Role) => void;
  onClone?: (role: Role) => void;
  onDelete?: (role: Role) => void;
  onViewUsers?: (role: Role) => void;
  onViewPermissions?: (role: Role) => void;
}

export function RoleCard({
  role,
  onEdit,
  onClone,
  onDelete,
  onViewUsers,
  onViewPermissions,
}: RoleCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const formatRoleName = (name: string) => {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Card className={cn('relative', role.isSystem && 'border-primary/30 bg-primary/5')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Shield className={cn('h-5 w-5', role.isSystem ? 'text-primary' : 'text-muted-foreground')} />
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                {formatRoleName(role.name)}
                {role.isSystem && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          System
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        System roles cannot be modified or deleted, but can be cloned.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {role.description || 'No description provided'}
              </CardDescription>
            </div>
          </div>

          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!role.isSystem && onEdit && (
                <DropdownMenuItem onClick={() => onEdit(role)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Role
                </DropdownMenuItem>
              )}
              {onClone && (
                <DropdownMenuItem onClick={() => onClone(role)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Clone Role
                </DropdownMenuItem>
              )}
              {onViewPermissions && (
                <DropdownMenuItem onClick={() => onViewPermissions(role)}>
                  <Key className="mr-2 h-4 w-4" />
                  View Permissions
                </DropdownMenuItem>
              )}
              {onViewUsers && (
                <DropdownMenuItem onClick={() => onViewUsers(role)}>
                  <Users className="mr-2 h-4 w-4" />
                  View Users
                </DropdownMenuItem>
              )}
              {!role.isSystem && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(role)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Role
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => onViewUsers?.(role)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Users className="h-4 w-4" />
            <span>
              {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onViewPermissions?.(role)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Key className="h-4 w-4" />
            <span>
              {role.permissionCount} {role.permissionCount === 1 ? 'permission' : 'permissions'}
            </span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default RoleCard;
