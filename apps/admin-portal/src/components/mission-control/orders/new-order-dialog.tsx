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
import { useToast } from '@/components/ui/use-toast';
import { useCreateConciergeOrder } from '@/hooks/use-concierge-orders';

// "New concierge order" entry point for the Transaction Tracker. Title is the
// only required field — an order can be created bare and linked to its source
// documents (PO / invoice / direct order) later. The po_draft checklist is
// seeded server-side by the 00308 insert trigger.
export function NewOrderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const create = useCreateConciergeOrder();

  const [title, setTitle] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [projectId, setProjectId] = useState('');

  const reset = () => {
    setTitle('');
    setVendorId('');
    setPurchaseOrderId('');
    setProjectId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    try {
      const order = await create.mutateAsync({
        title: title.trim(),
        vendor_id: vendorId.trim() || null,
        purchase_order_id: purchaseOrderId.trim() || null,
        project_id: projectId.trim() || null,
      });
      toast({ title: `Order "${order.title}" created` });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Failed to create order', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New concierge order</DialogTitle>
          <DialogDescription>
            Starts in PO Draft with its checklist seeded. Link source documents now or later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="order-title">Title *</Label>
            <Input
              id="order-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ellis dining table — Oak & Iron"
              required
            />
          </div>
          <div>
            <Label htmlFor="order-vendor">Vendor / maker id (optional)</Label>
            <Input id="order-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <Label htmlFor="order-po">Purchase order id (optional)</Label>
            <Input
              id="order-po"
              value={purchaseOrderId}
              onChange={(e) => setPurchaseOrderId(e.target.value)}
              placeholder="uuid"
            />
          </div>
          <div>
            <Label htmlFor="order-project">Project id (optional)</Label>
            <Input id="order-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="uuid" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
