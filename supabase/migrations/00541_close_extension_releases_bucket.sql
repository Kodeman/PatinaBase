-- Close public access to extension-releases bucket (created in 00059 for self-hosted beta sideloads)
-- Bucket: public, no policies, no code references, zero objects. Distribution now Chrome Web Store + GitHub prereleases only.
-- Direct DELETE on storage tables is blocked by Supabase (42501 "Use the Storage API instead"); full removal is a Storage API/dashboard step (see docs/follow-ups/extension-releases-bucket-removal.md).
UPDATE storage.buckets SET public = false WHERE id = 'extension-releases';
