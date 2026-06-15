import { createBrowserClient } from '@patina/supabase';

/**
 * Uploads a file to the `proposal-assets` storage bucket under
 * `{proposalId}/{randomUUID}.{ext}` and returns its public URL (or null on
 * failure). Lifted out of `proposal-section-editor.tsx` so other proposal
 * surfaces can reuse the same upload path.
 */
export async function uploadProposalAsset(
  proposalId: string,
  file: File,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient() as any;
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${proposalId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage
    .from('proposal-assets')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error || !data) {
    console.error('Proposal asset upload failed', error);
    return null;
  }
  const { data: pub } = supabase.storage.from('proposal-assets').getPublicUrl(data.path);
  return pub?.publicUrl ?? null;
}
