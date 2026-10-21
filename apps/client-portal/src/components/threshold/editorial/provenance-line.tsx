export interface ProvenanceLineProps {
  /** The project's `show_makers` switch; off means no line at all. */
  showMakers: boolean;
  maker: string | null | undefined;
  town?: string | null;
  /** Already written as a date: "12 September 2026". */
  inProductionSince?: string | null;
  photographed?: string | null;
}

/** maker · town · in production since <date> · photographed <date>. */
export function ProvenanceLine({ showMakers, maker, town, inProductionSince, photographed }: ProvenanceLineProps) {
  if (!showMakers || !maker) return null;
  const parts = [
    maker,
    town,
    inProductionSince ? `in production since ${inProductionSince}` : null,
    photographed ? `photographed ${photographed}` : null,
  ].filter((p): p is string => Boolean(p));
  return <p className="ed-provenance">{parts.join(' · ')}</p>;
}
