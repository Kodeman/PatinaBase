-- Drop extension-releases bucket (created in 00059 for self-hosted beta sideloads; public, no policies, zero objects; distribution now Chrome Web Store + GitHub prereleases only)
delete from storage.objects where bucket_id = 'extension-releases';
delete from storage.buckets where id = 'extension-releases';
