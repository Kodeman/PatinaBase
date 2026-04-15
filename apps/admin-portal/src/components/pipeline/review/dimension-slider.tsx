'use client';

import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export interface DimensionSliderLabels {
  dimension: 5 | 6 | 7 | 8;
  name: string;
  low: string;
  high: string;
}

export function DimensionSlider({
  labels,
  value,
  evidence,
  onValueChange,
  onEvidenceChange,
}: {
  labels: DimensionSliderLabels;
  value: number;
  evidence: string;
  onValueChange: (next: number) => void;
  onEvidenceChange: (next: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-sm border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold">
            Dim {labels.dimension} · {labels.name}
          </div>
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            {labels.low} → {labels.high}
          </div>
        </div>
        <div className="font-display text-3xl font-bold tabular-nums">{value}</div>
      </div>
      <Slider
        min={1}
        max={5}
        step={1}
        value={[value]}
        onValueChange={(v) => onValueChange(v[0] ?? 3)}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>1 · {labels.low}</span>
        <span>5 · {labels.high}</span>
      </div>
      <div>
        <Label htmlFor={`evidence-${labels.dimension}`} className="text-xs">
          Notes (optional)
        </Label>
        <Textarea
          id={`evidence-${labels.dimension}`}
          value={evidence}
          onChange={(e) => onEvidenceChange(e.target.value)}
          rows={2}
          placeholder="Why this score?"
        />
      </div>
    </div>
  );
}

export const LEAH_DIMENSIONS: DimensionSliderLabels[] = [
  { dimension: 5, name: 'Brand Alignment', low: 'Not Our World', high: 'This Is Patina' },
  { dimension: 6, name: 'Category Value', low: 'Redundant', high: 'Critical Gap' },
  { dimension: 7, name: 'Sustainability & Craft', low: 'No Story', high: 'Founding Partner Material' },
  { dimension: 8, name: 'Relationship Warmth', low: 'Cold Outreach', high: 'Existing Relationship' },
];
