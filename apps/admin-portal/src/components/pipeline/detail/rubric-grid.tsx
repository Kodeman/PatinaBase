import { VendorPipeline } from '@patina/types';
import { RubricItem } from './rubric-item';

const { RUBRIC_DIMENSIONS } = VendorPipeline;

export function RubricGrid({ scores }: { scores: VendorPipeline.VendorScore[] }) {
  const byDimension = new Map(scores.map((s) => [s.dimension, s]));

  return (
    <div className="grid gap-x-8 md:grid-cols-2">
      {RUBRIC_DIMENSIONS.map((def) => (
        <RubricItem
          key={def.dimension}
          def={def}
          score={byDimension.get(def.dimension) ?? null}
        />
      ))}
    </div>
  );
}
