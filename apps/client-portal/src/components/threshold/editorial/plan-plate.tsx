'use client';

import type { PlanKeyGeometry } from '@/lib/threshold/plan-key';
import type { CaptionTriplet } from '@/lib/editorial/types';

import { PlanKeyDrawing } from '../plan-key';
import { PlateCaption } from './plate';

export interface PlanPlateProps {
  geometry: PlanKeyGeometry;
  caption: CaptionTriplet;
}

/**
 * The drawn key plan at full measure on stock: the cover when no photograph
 * meets the floor. The drawing only; the `#key` section stays PlanKey's.
 */
export function PlanPlate({ geometry, caption }: PlanPlateProps) {
  return (
    <figure className="ed-plate ed-plan" data-plate="plan" data-never-dim="">
      <div className="ed-plate__frame ed-stock">
        <PlanKeyDrawing geometry={geometry} />
      </div>
      <PlateCaption caption={caption} />
    </figure>
  );
}
