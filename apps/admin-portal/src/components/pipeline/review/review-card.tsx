'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useVendor, useSubmitLeahReview } from '@/hooks/use-pipeline';
import { useToast } from '@/components/ui/use-toast';
import { ScoreBadge } from '@/components/pipeline/score-badge';
import { DimensionSlider, LEAH_DIMENSIONS } from './dimension-slider';
import { VendorPipeline } from '@patina/types';

const { RUBRIC_DIMENSIONS } = VendorPipeline;

type DimIndex = 5 | 6 | 7 | 8;

export function ReviewCard({
  slug,
  onComplete,
}: {
  slug: string;
  onComplete: () => void;
}) {
  const { data: vendor, isLoading } = useVendor(slug);
  const { toast } = useToast();
  const submit = useSubmitLeahReview(slug);

  const [scores, setScores] = useState<Record<DimIndex, number>>({ 5: 3, 6: 3, 7: 3, 8: 3 });
  const [evidence, setEvidence] = useState<Record<DimIndex, string>>({ 5: '', 6: '', 7: '', 8: '' });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!vendor) return;
    // Pre-fill from existing scores if this vendor was partially reviewed
    const next: Record<DimIndex, number> = { 5: 3, 6: 3, 7: 3, 8: 3 };
    const nextEvidence: Record<DimIndex, string> = { 5: '', 6: '', 7: '', 8: '' };
    for (const s of vendor.scores ?? []) {
      if (s.scored_by === 'leah' && s.raw_score && [5, 6, 7, 8].includes(s.dimension)) {
        next[s.dimension as DimIndex] = s.raw_score;
        if (s.evidence) nextEvidence[s.dimension as DimIndex] = s.evidence;
      }
    }
    setScores(next);
    setEvidence(nextEvidence);
    setNotes(vendor.leah_notes ?? '');
  }, [vendor]);

  if (isLoading || !vendor) return null;

  const kodyScores = (vendor.scores ?? []).filter(
    (s) => s.scored_by === 'cowork' || s.scored_by === 'kody',
  );

  const handleSubmit = async () => {
    try {
      await submit.mutateAsync({
        scores: (Object.keys(scores) as unknown as DimIndex[]).map((dim) => ({
          dimension: Number(dim),
          raw_score: scores[dim],
          evidence: evidence[dim] || undefined,
        })),
        leah_notes: notes || undefined,
      });
      toast({ title: `${vendor.name} scored · moving to next` });
      onComplete();
    } catch (err) {
      toast({
        title: 'Failed to submit review',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 rounded-sm border bg-card p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold">{vendor.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {vendor.website_url && (
              <a
                href={vendor.website_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                {new URL(vendor.website_url).hostname}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {[vendor.location_city, vendor.location_state].filter(Boolean).join(', ') && (
              <span>· {[vendor.location_city, vendor.location_state].filter(Boolean).join(', ')}</span>
            )}
            {vendor.product_categories?.length > 0 && (
              <span>· {vendor.product_categories.slice(0, 4).join(', ')}</span>
            )}
          </div>
        </div>
        <ScoreBadge score={vendor.total_score} triage={vendor.triage_level} size="md" showLabel />
      </header>

      {kodyScores.length > 0 && (
        <section className="rounded-sm bg-muted/40 p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            Kody / Cowork context (dims 1–4)
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {kodyScores
              .filter((s) => [1, 2, 3, 4].includes(s.dimension))
              .sort((a, b) => a.dimension - b.dimension)
              .map((s) => {
                const def = RUBRIC_DIMENSIONS.find((d) => d.dimension === s.dimension);
                return (
                  <li key={s.id} className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">
                      {def?.name}{' '}
                      <span className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                        ×{def?.weight}
                      </span>
                    </span>
                    <span className="font-display text-lg tabular-nums">
                      {s.raw_score}
                      <span className="ml-1 text-xs text-muted-foreground">/5</span>
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <Separator />

      <section className="space-y-4">
        <div className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
          Your scores (dims 5–8)
        </div>
        {LEAH_DIMENSIONS.map((labels) => (
          <DimensionSlider
            key={labels.dimension}
            labels={labels}
            value={scores[labels.dimension]}
            evidence={evidence[labels.dimension]}
            onValueChange={(v) =>
              setScores((prev) => ({ ...prev, [labels.dimension]: v }))
            }
            onEvidenceChange={(v) =>
              setEvidence((prev) => ({ ...prev, [labels.dimension]: v }))
            }
          />
        ))}
      </section>

      <div>
        <Label htmlFor="leah-general-notes">General impressions</Label>
        <Textarea
          id="leah-general-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={submit.isPending} size="lg">
          {submit.isPending ? 'Submitting…' : 'Submit & next'}
        </Button>
      </div>
    </div>
  );
}
