import type { CaptionTriplet, PaletteSwatch } from '@/lib/editorial/types';

import { PlateCaption } from './plate';

export function swatchLabel(swatch: PaletteSwatch): string {
  return [swatch.brand, swatch.name].filter(Boolean).join(', ') || swatch.hex;
}

export interface SwatchStripProps {
  swatches: readonly PaletteSwatch[];
  caption?: CaptionTriplet | null;
}

/** 40 × 40 paint chips, each named by brand and colour. */
export function SwatchStrip({ swatches, caption }: SwatchStripProps) {
  if (swatches.length === 0) return null;
  const list = (
    <ul className="ed-swatches">
      {swatches.map((s) => (
        <li key={`${s.hex}-${s.brand ?? ''}-${s.name ?? ''}`} className="ed-swatch">
          <span aria-hidden="true" className="ed-swatch__chip" style={{ backgroundColor: s.hex }} />
          <span className="ed-swatch__label">{swatchLabel(s)}</span>
        </li>
      ))}
    </ul>
  );
  if (!caption) return list;
  return (
    <figure className="ed-plate ed-swatch-strip" data-plate="swatch" data-never-dim="">
      {list}
      <PlateCaption caption={caption} />
    </figure>
  );
}
