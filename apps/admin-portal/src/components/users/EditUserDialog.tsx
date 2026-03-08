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
import { Switch } from '@/components/ui/switch';
import { Mail, User, Image } from 'lucide-react';
import { useUpdateUser } from '@/hooks/use-users';
import { toast } from 'sonner';
import type { User as UserType } from '@/types';

interface EditUserDialogProps {
  user: UserType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const [email, setEmail] = useState(user.email || '');
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [errors, setErrors] = useState<{ email?: string; displayName?: string }>({});

  const updateUser = useUpdateUser();

  // Reset form when user changes or dialog opens
  useEffect(() => {
    if (open) {
      setEmail(user.email || '');
      setDisplayName(user.displayName || '');
      setAvatarUrl(user.avatarUrl || '');
      setEmailVerified(user.emailVerified);
      setErrors({});
    }
  }, [user, open]);

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

  const hasChanges = (): boolean => {
    const currentEmail = user.email || '';
    const currentDisplayName = user.displayName || '';
    const currentAvatarUrl = user.avatarUrl || '';
    const currentEmailVerified = user.emailVerified;

    return (
      email.trim() !== currentEmail ||
      displayName.trim() !== currentDisplayName ||
      avatarUrl.trim() !== currentAvatarUrl ||
      emailVerified !== currentEmailVerified
    );
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    if (!hasChanges()) {
      toast.info('No changes to save');
      return;
    }

    const updateData: {
      email?: string;
      displayName?: string;
      avatarUrl?: string;
      emailVerified?: boolean;
    } = {};

    // Only include changed fields
    if (email.trim() !== (user.email || '')) {
      updateData.email = email.trim().toLowerCase();
    }
    if (displayName.trim() !== (user.displayName || '')) {
      updateData.displayName = displayName.trim() || undefined;
    }
    if (avatarUrl.trim() !== (user.avatarUrl || '')) {
      updateData.avatarUrl = avatarUrl.trim() || undefined;
    }
    if (emailVerified !== user.emailVerified) {
      updateData.emailVerified = emailVerified;
    }

    try {
      await updateUser.mutateAsync({
        userId: user.id,
        data: updateData,
      });

      toast.success('User updated successfully');
      onOpenChange(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to update user';
      toast.error(message);
      console.error('Update user error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user information for {user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-email">
              Email Address <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="edit-email"
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
            <p className="text-xs text-muted-foreground">
              Changing the email will require re-verification.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-displayName">Display Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="edit-displayName"
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
            <Label htmlFor="edit-avatarUrl">Avatar URL</Label>
            <div className="relative">
              <Image className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="edit-avatarUrl"
                type="url"
                placeholder="https://example.com/avatar.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="edit-emailVerified">Email Verified</Label>
              <p className="text-xs text-muted-foreground">
                Mark whether the user's email has been verified
              </p>
            </div>
            <Switch
              id="edit-emailVerified"
              checked={emailVerified}
              onCheckedChange={setEmailVerified}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateUser.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateUser.isPending || !hasChanges()}
          >
            {updateUser.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
