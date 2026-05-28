'use client';

import { useCallback, useState } from 'react';
import { createBrowserClient } from '@patina/supabase';
import { validateFile } from '@/lib/media-utils';

interface UploadResult {
  imageUrl: string;
  [key: string]: unknown;
}

interface UseImageUploadReturn {
  /** Upload a single File to `endpoint` (POST FormData). Returns the public URL, or null on failure. */
  upload: (endpoint: string, file: File) => Promise<string | null>;
  /**
   * Upload a single File directly to a public Supabase Storage bucket and
   * return its public URL. Used where no resource-scoped API route exists yet
   * (e.g. a decision option that has no backing product id). The path is
   * prefixed with the current user id so per-user bucket RLS is satisfied.
   */
  uploadToBucket: (bucket: string, pathPrefix: string, file: File) => Promise<string | null>;
  isUploading: boolean;
  error: string | null;
}

/**
 * Reusable client hook for uploading an image File to a server route that
 * accepts FormData (`file` field) and responds with `{ data: { imageUrl } }`.
 * Mirrors the existing avatar/product image upload contract.
 */
export function useImageUpload(): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (endpoint: string, file: File): Promise<string | null> => {
    setError(null);

    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid file');
      return null;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const body = (await res.json().catch(() => null)) as
        | { data?: UploadResult; message?: string }
        | null;

      if (!res.ok) {
        const message = body?.message ?? `Upload failed (${res.status})`;
        setError(message);
        return null;
      }

      const imageUrl = body?.data?.imageUrl ?? null;
      if (!imageUrl) {
        setError('Upload succeeded but no URL was returned');
        return null;
      }
      return imageUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const uploadToBucket = useCallback(
    async (bucket: string, pathPrefix: string, file: File): Promise<string | null> => {
      setError(null);

      const validation = validateFile(file);
      if (!validation.valid) {
        setError(validation.error ?? 'Invalid file');
        return null;
      }

      setIsUploading(true);
      try {
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError('Authentication required');
          return null;
        }

        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const cleanPrefix = pathPrefix.replace(/^\/+|\/+$/g, '');
        // First segment is the user id so the bucket's per-user update/delete
        // RLS (storage.foldername(name)[1] = auth.uid()) is satisfied.
        const filePath = `${user.id}/${cleanPrefix ? `${cleanPrefix}/` : ''}${crypto.randomUUID()}.${ext}`;

        const { data, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          setError(uploadError.message);
          return null;
        }

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
        return urlData.publicUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  return { upload, uploadToBucket, isUploading, error };
}
