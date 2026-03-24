'use client';

import { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mail, User, X, ArrowRight } from 'lucide-react';
import { useCreateUser } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { useInvalidateWaitlist } from '@/hooks/use-waitlist';
import { toast } from 'sonner';
import type { WaitlistEntry } from '@/services/waitlist';
import type { Role } from '@/services/roles';

interface ConvertToUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: WaitlistEntry | null;
}

/** Map waitlist role to the system role name for pre-selection */
function getDefaultRoleName(waitlistRole: string): string | null {
  switch (waitlistRole) {
    case 'designer':
      return 'designer';
    case 'consumer':
      return 'client';
    default:
      return null;
  }
}

export function ConvertToUserDialog({ open, onOpenChange, entry }: ConvertToUserDialogProps) {
  const [displayName, setDisplayName] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const createUser = useCreateUser();
  const { data: roles = [] } = useRoles();
  const invalidateWaitlist = useInvalidateWaitlist();

  // Pre-select role based on waitlist entry
  useEffect(() => {
    if (open && entry && roles.length > 0) {
      setDisplayName('');
      const defaultRoleName = getDefaultRoleName(entry.role);
      if (defaultRoleName) {
        const matchedRole = roles.find((r: Role) => r.name === defaultRoleName);
        setSelectedRoleIds(matchedRole ? [matchedRole.id] : []);
      } else {
        setSelectedRoleIds([]);
      }
    }
  }, [open, entry, roles]);

  if (!entry) return null;

  const addRole = (roleId: string) => {
    if (!selectedRoleIds.includes(roleId)) {
      setSelectedRoleIds([...selectedRoleIds, roleId]);
    }
  };

  const removeRole = (roleId: string) => {
    setSelectedRoleIds(selectedRoleIds.filter((id) => id !== roleId));
  };

  const availableRoles = roles.filter((role: Role) => !selectedRoleIds.includes(role.id));
  const selectedRoles = roles.filter((role: Role) => selectedRoleIds.includes(role.id));

  const handleSubmit = async () => {
    try {
      const result = await createUser.mutateAsync({
        email: entry.email,
        displayName: displayName.trim() || undefined,
        roleIds: selectedRoleIds.length > 0 ? selectedRoleIds : undefined,
      });

      // The handle_new_user() trigger auto-converts the waitlist entry
      invalidateWaitlist();

      if (result?.invitationSent) {
        toast.success(`Invitation sent to ${entry.email}`, {
          description: 'Waitlist entry has been converted to a user account.',
        });
      } else {
        toast.warning('User created but invitation email may not have sent');
      }

      onOpenChange(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to convert user';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Convert to User
          </DialogTitle>
          <DialogDescription>
            Create a user account from this waitlist entry. An invitation email will be sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Attribution context */}
          <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted">
            <Badge variant="outline">{entry.role}</Badge>
            <Badge variant="secondary">{entry.source}</Badge>
            {entry.utmCampaign && (
              <Badge variant="secondary">campaign: {entry.utmCampaign}</Badge>
            )}
            <span className="text-xs text-muted-foreground self-center">
              Signed up {new Date(entry.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label>Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={entry.email}
                disabled
                className="pl-10 bg-muted"
              />
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name (optional)</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="displayName"
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="pl-10"
                disabled={createUser.isPending}
              />
            </div>
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <Label>Roles</Label>
            {selectedRoles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedRoles.map((role: Role) => (
                  <Badge key={role.id} variant="secondary" className="gap-1">
                    {role.name.replace(/_/g, ' ')}
                    <button
                      type="button"
                      onClick={() => removeRole(role.id)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {availableRoles.length > 0 && (
              <Select onValueChange={addRole} value="">
                <SelectTrigger>
                  <SelectValue placeholder="Add a role..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role: Role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              The user will receive an invitation email. Attribution data from the waitlist entry
              will be automatically synced to their profile.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createUser.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createUser.isPending}>
            {createUser.isPending ? 'Converting...' : 'Convert & Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
