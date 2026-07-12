'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVendors } from '@patina/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

interface UploadResult {
  batch: { id: string; status: string };
  deduped: boolean;
}

async function uploadFeed(vendorId: string, file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('vendorId', vendorId);
  formData.append('source', 'upload');
  formData.append('file', file);

  const res = await fetch('/api/admin/catalog/feed-batches', {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? `Upload failed (${res.status})`);
  }
  return json.data as UploadResult;
}

export function FeedUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: vendorsResult, isLoading: vendorsLoading } = useVendors();
  const vendors = vendorsResult?.data ?? [];

  const [vendorId, setVendorId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      if (!vendorId) throw new Error('Select a vendor first');
      if (!file) throw new Error('Choose a feed file first');
      return uploadFeed(vendorId, file);
    },
    onSuccess: (result) => {
      toast({
        title: result.deduped
          ? 'Feed already uploaded — reusing the existing batch'
          : 'Feed uploaded — queued for normalization',
        description: `Batch ${result.batch.id.slice(0, 8)}… (${result.batch.status})`,
      });
      queryClient.invalidateQueries({ queryKey: ['catalog-feed-batches'] });
      setVendorId('');
      setFile(null);
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        title: 'Feed upload failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upload.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload feed</DialogTitle>
          <DialogDescription>
            Stage a vendor catalog file (CSV or JSON) for the nightly Catalog Normalizer to
            parse, classify, and dedupe against your existing catalog.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="feed-vendor">Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="feed-vendor">
                <SelectValue placeholder={vendorsLoading ? 'Loading vendors…' : 'Select a vendor'} />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v: { id: string; name: string }) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="feed-file">Feed file (.csv or .json) *</Label>
            <input
              id="feed-file"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-sm file:border file:border-[var(--border-default)] file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
            />
            {file && (
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                {file.name} — {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={upload.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={upload.isPending || !vendorId || !file}>
              {upload.isPending ? 'Uploading…' : 'Upload feed'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
