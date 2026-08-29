-- Drop extension-releases bucket (created in 00059 for self-hosted beta sideloads)
-- Bucket was public with no policies, no code references, zero objects.
-- Distribution is now Chrome Web Store + GitHub prereleases only.

do $$
begin
  delete from storage.objects where bucket_id = 'extension-releases';
  delete from storage.buckets where id = 'extension-releases';
exception when others then
  null;
end $$;
