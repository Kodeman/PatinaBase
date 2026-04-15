'use client';

import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useUpdateVendor } from '@/hooks/use-pipeline';
import { useToast } from '@/components/ui/use-toast';

export function VendorNotes({
  slug,
  initialNotes,
  initialLeahNotes,
}: {
  slug: string;
  initialNotes: string | null;
  initialLeahNotes: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [leahNotes, setLeahNotes] = useState(initialLeahNotes ?? '');
  const updateVendor = useUpdateVendor(slug);
  const { toast } = useToast();

  useEffect(() => setNotes(initialNotes ?? ''), [initialNotes]);
  useEffect(() => setLeahNotes(initialLeahNotes ?? ''), [initialLeahNotes]);

  const persist = async (updates: { notes?: string; leah_notes?: string }) => {
    try {
      await updateVendor.mutateAsync(updates);
    } catch (err) {
      toast({
        title: 'Failed to save notes',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor="notes">General notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if ((initialNotes ?? '') !== notes) persist({ notes });
          }}
          rows={6}
          placeholder="Operational notes, outreach history, follow-ups…"
        />
      </div>
      <div>
        <Label htmlFor="leah-notes">Leah&rsquo;s notes</Label>
        <Textarea
          id="leah-notes"
          value={leahNotes}
          onChange={(e) => setLeahNotes(e.target.value)}
          onBlur={() => {
            if ((initialLeahNotes ?? '') !== leahNotes) persist({ leah_notes: leahNotes });
          }}
          rows={6}
          placeholder="Brand fit, relationship warmth, story…"
        />
      </div>
    </div>
  );
}
