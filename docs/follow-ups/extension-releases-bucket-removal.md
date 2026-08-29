# Extension-Releases Bucket Removal

Migration 00541 closes public access (`public = false`) to the `extension-releases` bucket but cannot delete it—Supabase blocks direct `DELETE` on storage tables (42501 error: "Use the Storage API instead").

Full bucket removal (if desired) requires the [Supabase Storage API](https://supabase.com/docs/reference/javascript/storage-from-remove) or Dashboard step: navigate to Storage → `extension-releases` → Delete bucket.

Status: Not required for launch; defer as operational step if needed.
