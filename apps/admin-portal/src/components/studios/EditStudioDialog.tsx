'use client';

import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateStudio } from '@/hooks/use-studios';
import { toast } from 'sonner';
import type { Studio } from '@/types';

interface EditStudioDialogProps {
  studio: Studio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  name: string;
  slug: string;
  website: string;
  description: string;
  email: string;
  phone: string;
  logoUrl: string;
  subscriptionTier: string;
}

function toFormState(studio: Studio): FormState {
  return {
    name: studio.name ?? '',
    slug: studio.slug ?? '',
    website: studio.website ?? '',
    description: studio.description ?? '',
    email: studio.email ?? '',
    phone: studio.phone ?? '',
    logoUrl: studio.logoUrl ?? '',
    subscriptionTier: studio.subscriptionTier,
  };
}

export function EditStudioDialog({ studio, open, onOpenChange }: EditStudioDialogProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(studio));
  const updateStudio = useUpdateStudio();

  useEffect(() => {
    if (open) {
      setForm(toFormState(studio));
      updateStudio.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio, open]);

  const hasChanges = () => {
    const current = toFormState(studio);
    return (Object.keys(form) as (keyof FormState)[]).some((key) => form[key] !== current[key]);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Studio name is required');
      return;
    }
    if (!hasChanges()) {
      toast.info('No changes to save');
      return;
    }

    const current = toFormState(studio);
    const updates: Record<string, unknown> = {};
    if (form.name !== current.name) updates.name = form.name.trim();
    if (form.slug !== current.slug) updates.slug = form.slug.trim();
    // null (not undefined) for a cleared field — the PATCH route drops
    // undefined keys, so `undefined` here silently kept the old value.
    if (form.website !== current.website) updates.website = form.website.trim() || null;
    if (form.description !== current.description)
      updates.description = form.description.trim() || null;
    if (form.email !== current.email) updates.email = form.email.trim() || null;
    if (form.phone !== current.phone) updates.phone = form.phone.trim() || null;
    if (form.logoUrl !== current.logoUrl) updates.logoUrl = form.logoUrl.trim() || null;
    if (form.subscriptionTier !== current.subscriptionTier)
      updates.subscriptionTier = form.subscriptionTier;

    try {
      await updateStudio.mutateAsync({ studioId: studio.id, data: updates });
      toast.success('Studio updated');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update studio');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Studio</DialogTitle>
          <DialogDescription>Update profile details for {studio.name}.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="edit-studio-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-studio-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-studio-slug">Slug</Label>
            <Input
              id="edit-studio-slug"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-studio-tier">Tier</Label>
            <Select
              value={form.subscriptionTier}
              onValueChange={(v) => setForm((f) => ({ ...f, subscriptionTier: v }))}
            >
              <SelectTrigger id="edit-studio-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-studio-website">Website</Label>
            <Input
              id="edit-studio-website"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-studio-email">Email</Label>
            <Input
              id="edit-studio-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-studio-phone">Phone</Label>
            <Input
              id="edit-studio-phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-studio-logo">Logo URL</Label>
            <Input
              id="edit-studio-logo"
              value={form.logoUrl}
              onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
            />
          </div>

          <div className="col-span-2 space-y-2">
            <Label htmlFor="edit-studio-description">Description</Label>
            <Input
              id="edit-studio-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateStudio.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateStudio.isPending || !hasChanges()}
          >
            {updateStudio.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
