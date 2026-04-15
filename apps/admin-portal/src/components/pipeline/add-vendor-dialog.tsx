'use client';

import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateVendor } from '@/hooks/use-pipeline';
import { useToast } from '@/components/ui/use-toast';

const CATEGORY_OPTIONS = [
  'seating',
  'dining',
  'tables',
  'storage',
  'lighting',
  'bedroom',
  'textiles',
  'accessories',
  'outdoor',
];

export function AddVendorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const createVendor = useCreateVendor();

  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [priceLow, setPriceLow] = useState('');
  const [priceHigh, setPriceHigh] = useState('');
  const [source, setSource] = useState('manual');
  const [notes, setNotes] = useState('');
  const [autoScore, setAutoScore] = useState(true);

  const toggleCategory = (c: string) => {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const resetForm = () => {
    setName('');
    setWebsiteUrl('');
    setCity('');
    setState('');
    setCategories([]);
    setPriceLow('');
    setPriceHigh('');
    setSource('manual');
    setNotes('');
    setAutoScore(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }

    try {
      const vendor = await createVendor.mutateAsync({
        name: name.trim(),
        website_url: websiteUrl.trim() || null,
        location_city: city.trim() || null,
        location_state: state.trim() || null,
        product_categories: categories,
        price_range_low: priceLow ? Number(priceLow) : null,
        price_range_high: priceHigh ? Number(priceHigh) : null,
        source,
        notes: notes.trim() || null,
        auto_score: autoScore,
      });
      toast({ title: `Vendor "${vendor.name}" created` });
      resetForm();
      onOpenChange(false);
      router.push(`/pipeline/${vendor.slug}` as any);
    } catch (err) {
      toast({
        title: 'Failed to create vendor',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add vendor</DialogTitle>
          <DialogDescription>
            Create a new manufacturer record in the pipeline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="vendor-name">Name *</Label>
            <Input
              id="vendor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hillcrest Woodworks"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vendor-website">Website</Label>
              <Input
                id="vendor-website"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://"
              />
            </div>
            <div>
              <Label htmlFor="vendor-source">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="vendor-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cowork_scan">Cowork scan</SelectItem>
                  <SelectItem value="leah_existing">Leah&apos;s existing relationship</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vendor-city">City</Label>
              <Input
                id="vendor-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vendor-state">State</Label>
              <Input
                id="vendor-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="NC"
              />
            </div>
          </div>

          <div>
            <Label>Product categories</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    categories.includes(c)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vendor-price-low">Price range — low ($)</Label>
              <Input
                id="vendor-price-low"
                type="number"
                min="0"
                value={priceLow}
                onChange={(e) => setPriceLow(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vendor-price-high">Price range — high ($)</Label>
              <Input
                id="vendor-price-high"
                type="number"
                min="0"
                value={priceHigh}
                onChange={(e) => setPriceHigh(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="vendor-notes">Notes</Label>
            <Textarea
              id="vendor-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={autoScore}
              onCheckedChange={(v) => setAutoScore(v === true)}
            />
            Auto-score with Cowork after creation
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={createVendor.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createVendor.isPending}>
              {createVendor.isPending ? 'Creating…' : 'Create vendor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
