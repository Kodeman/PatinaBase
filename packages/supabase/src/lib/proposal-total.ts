/**
 * Recompute and persist proposals.total_amount.
 *
 * The headline total a client signs is the sum of the FF&E schedule
 * (Σ proposal_items.line_total_cents — fixed items use quantity × unit price,
 * allowances use the stored budget midpoint) PLUS the design phase fees
 * (Σ proposal_phases.fee_cents). Folding phase fees in keeps the editor total,
 * the scope-builder summary, the Send page, and the client investment table all
 * showing the same number.
 *
 * Extracted into a standalone helper so both use-proposals.ts (item mutations)
 * and use-scope-builder.ts (phase mutations) can call it without a circular
 * import between the two hook modules.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateProposalTotal(supabase: any, proposalId: string): Promise<number> {
  const [itemsRes, phasesRes] = await Promise.all([
    supabase.from('proposal_items').select('line_total_cents').eq('proposal_id', proposalId),
    supabase.from('proposal_phases').select('fee_cents').eq('proposal_id', proposalId),
  ]);

  const itemsTotal = (itemsRes.data ?? []).reduce(
    (sum: number, item: { line_total_cents: number | null }) => sum + (item.line_total_cents || 0),
    0
  );
  const phasesTotal = (phasesRes.data ?? []).reduce(
    (sum: number, phase: { fee_cents: number | null }) => sum + (phase.fee_cents || 0),
    0
  );

  const total = itemsTotal + phasesTotal;

  await supabase.from('proposals').update({ total_amount: total }).eq('id', proposalId);

  return total;
}
