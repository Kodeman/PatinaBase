/**
 * SQ-2213 (SQ-2211 F1) — who answers for an FF&E line. A line carrying an
 * external fulfilment (C5) is someone else's to buy and pay for: it is never
 * a studio-priced line, never billed by the studio, and it stays visible as
 * external responsibility (DECISIONS K3). Every studio money consumer of
 * `useProjectFFEItems` (the schedule, the Bill composer, the Price lens) asks
 * this one question.
 */
export interface ResponsibilityLine {
  external_fulfilment_id?: string | null;
}

export function isExternalResponsibility(line: ResponsibilityLine): boolean {
  return line.external_fulfilment_id != null;
}

/** Split lines into the studio's own and those under external responsibility. */
export function partitionByResponsibility<T extends ResponsibilityLine>(
  lines: readonly T[],
): { studio: T[]; external: T[] } {
  const studio: T[] = [];
  const external: T[] = [];
  for (const line of lines) {
    (isExternalResponsibility(line) ? external : studio).push(line);
  }
  return { studio, external };
}
