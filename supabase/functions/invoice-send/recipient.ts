/**
 * The client's designer_clients row in the invoice designer's book, newest
 * first. Relationship history keeps more than one row per pair, so a bare
 * maybeSingle() over the pair errors once there is history; this is the same
 * read the folio's readiness makes (useDesignerClientForClientUser).
 */
// deno-lint-ignore no-explicit-any
export async function newestDesignerClient(admin: any, designerId: string, clientUserId: string) {
  const { data, error } = await admin
    .from('designer_clients')
    .select('client_email, client_name')
    .eq('designer_id', designerId)
    .eq('client_id', clientUserId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    row: (data as { client_email: string | null; client_name: string | null } | null) ?? null,
    error: error as { message: string } | null,
  };
}
