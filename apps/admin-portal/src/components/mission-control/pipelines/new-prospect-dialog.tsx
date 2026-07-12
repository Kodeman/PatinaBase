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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateDesignerProspect } from '@/hooks/use-pipelines';
import { useToast } from '@/components/ui/use-toast';
import type { ProspectOwner } from '@/services/pipelines';

// Mirrors pipeline/add-vendor-dialog.tsx's shape (same ui/ primitives, same
// controlled-form-state pattern) for the Designers board's "New prospect"
// entry point.

export function NewProspectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const createProspect = useCreateDesignerProspect();

  const [fullName, setFullName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [email, setEmail] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [marketCity, setMarketCity] = useState('');
  const [marketState, setMarketState] = useState('');
  const [source, setSource] = useState('manual');
  const [owner, setOwner] = useState<ProspectOwner>('kody');
  const [nextAction, setNextAction] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setFullName('');
    setStudioName('');
    setEmail('');
    setPortfolioUrl('');
    setInstagram('');
    setMarketCity('');
    setMarketState('');
    setSource('manual');
    setOwner('kody');
    setNextAction('');
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }

    try {
      const prospect = await createProspect.mutateAsync({
        full_name: fullName.trim(),
        studio_name: studioName.trim() || null,
        email: email.trim() || null,
        portfolio_url: portfolioUrl.trim() || null,
        instagram: instagram.trim() || null,
        market_city: marketCity.trim() || null,
        market_state: marketState.trim() || null,
        source,
        owner,
        next_action: nextAction.trim() || null,
        notes: notes.trim() || null,
      });
      toast({ title: `Prospect "${prospect.full_name}" created` });
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to create prospect',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New prospect</DialogTitle>
          <DialogDescription>Add a designer to the recruiting pipeline.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="prospect-name">Name *</Label>
            <Input
              id="prospect-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jordan Ellis"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prospect-studio">Studio</Label>
              <Input
                id="prospect-studio"
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="prospect-owner">Owner</Label>
              <Select value={owner} onValueChange={(v) => setOwner(v as ProspectOwner)}>
                <SelectTrigger id="prospect-owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kody">Kody</SelectItem>
                  <SelectItem value="leah">Leah</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prospect-email">Email</Label>
              <Input
                id="prospect-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="prospect-source">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="prospect-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cowork_scan">Cowork scan</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prospect-portfolio">Portfolio URL</Label>
              <Input
                id="prospect-portfolio"
                type="url"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://"
              />
            </div>
            <div>
              <Label htmlFor="prospect-instagram">Instagram</Label>
              <Input
                id="prospect-instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@studioname"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prospect-city">Market city</Label>
              <Input
                id="prospect-city"
                value={marketCity}
                onChange={(e) => setMarketCity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="prospect-state">Market state</Label>
              <Input
                id="prospect-state"
                value={marketState}
                onChange={(e) => setMarketState(e.target.value)}
                placeholder="NC"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="prospect-next-action">Next action</Label>
            <Input
              id="prospect-next-action"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Send intro email"
            />
          </div>

          <div>
            <Label htmlFor="prospect-notes">Notes</Label>
            <Textarea
              id="prospect-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={createProspect.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createProspect.isPending}>
              {createProspect.isPending ? 'Creating…' : 'Create prospect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
