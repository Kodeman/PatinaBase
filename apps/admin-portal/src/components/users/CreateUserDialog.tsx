'use client';

import { useState } from 'react';
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
import { Mail, User, X, Plus } from 'lucide-react';
import { useCreateUser } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { toast } from 'sonner';
import type { Role } from '@/services/roles';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ email?: string; displayName?: string }>({});

  const createUser = useCreateUser();
  const { data: roles = [] } = useRoles();

  const validateForm = (): boolean => {
    const newErrors: { email?: string; displayName?: string } = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (displayName && displayName.trim().length < 2) {
      newErrors.displayName = 'Display name must be at least 2 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      const result = await createUser.mutateAsync({
        email: email.trim().toLowerCase(),
        displayName: displayName.trim() || undefined,
        roleIds: selectedRoleIds.length > 0 ? selectedRoleIds : undefined,
      });

      if (result?.invitationSent) {
        toast.success(`Invitation sent to ${email}`, {
          description: 'The user will receive an email to set up their account.',
        });
      } else {
        toast.warning('User created but invitation email failed to send', {
          description: 'You may need to resend the invitation.',
        });
      }

      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to create user';
      toast.error(message);
      console.error('Create user error:', error);
    }
  };

  const resetForm = () => {
    setEmail('');
    setDisplayName('');
    setSelectedRoleIds([]);
    setErrors({});
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Create a new user account. An invitation email will be sent for them to set their
            password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">
              Email Address <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name (optional)</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="displayName"
                type="text"
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (errors.displayName) setErrors({ ...errors, displayName: undefined });
                }}
                className={`pl-10 ${errors.displayName ? 'border-destructive' : ''}`}
              />
            </div>
            {errors.displayName && (
              <p className="text-sm text-destructive">{errors.displayName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Initial Roles (optional)</Label>
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
                      {role.description && (
                        <span className="text-muted-foreground ml-2">- {role.description}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Roles can also be assigned after the user is created.
            </p>
          </div>

          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              The user will receive an email invitation with a link to set their password. The
              invitation expires after 7 days.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={createUser.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createUser.isPending}>
            {createUser.isPending ? 'Creating...' : 'Create & Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
