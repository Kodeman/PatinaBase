'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { UserSearchPicker } from '@/components/shared/UserSearchPicker';
import { useCreateStudio } from '@/hooks/use-studios';
import { toast } from 'sonner';
import type { StudioOwner } from '@/types';

interface CreateStudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateStudioDialog({ open, onOpenChange }: CreateStudioDialogProps) {
  const router = useRouter();
  const [owner, setOwner] = useState<StudioOwner | null>(null);
  const [name, setName] = useState('');
  const createStudio = useCreateStudio();

  useEffect(() => {
    if (open) {
      setOwner(null);
      setName('');
      createStudio.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = !!owner && name.trim() !== '';

  const handleSubmit = async () => {
    if (!valid || !owner) return;
    try {
      const result = await createStudio.mutateAsync({ ownerUserId: owner.id, name: name.trim() });
      // mutateAsync resolves with whatever the mutationFn returns, so a
      // response shape drift (e.g. the API route changing its envelope) would
      // otherwise show the success toast and close the dialog while
      // router.push silently no-ops on `/studios/undefined` — which reads to
      // the admin as "nothing happened, still on /studios". Confirm we have a
      // real id before treating the create as navigable.
      if (!result?.studioId) {
        toast.error('Studio created, but no id was returned. Refresh to find it.');
        onOpenChange(false);
        return;
      }
      toast.success('Studio created');
      onOpenChange(false);
      router.push(`/studios/${result.studioId}` as any);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create studio');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Studio</DialogTitle>
          <DialogDescription>
            Provision a new design studio owned by an existing user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              Owner <span className="text-destructive">*</span>
            </Label>
            <UserSearchPicker value={owner} onChange={setOwner} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="studio-name">
              Studio Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="studio-name"
              placeholder="e.g. Aged Oak Interiors"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createStudio.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || createStudio.isPending}>
            {createStudio.isPending ? 'Creating...' : 'Create Studio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
