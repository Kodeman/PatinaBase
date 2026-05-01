import { useMutation, useQuery } from '@tanstack/react-query';

import { createBrowserClient } from '../client';
import type { CommsMessageAttachment } from './use-comms';

const getSupabase = () => createBrowserClient();

const BUCKET = 'comms-attachments';
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Upload an attachment for use in an outgoing comms message. Returns the
 * attachment shape that should go into `comms_messages.attachments[]`.
 *
 * Path convention: `{thread_id}/{uuid}/{filename}` so the storage RLS policy
 * (which uses `(storage.foldername(name))[1]`) can validate thread membership.
 */
export function useUploadCommsAttachment() {
  return useMutation({
    mutationFn: async ({
      threadId,
      file,
    }: {
      threadId: string;
      file: File;
    }): Promise<CommsMessageAttachment> => {
      const supabase = getSupabase();
      const id = crypto.randomUUID();
      const path = `${threadId}/${id}/${file.name}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;

      const isImage = file.type.startsWith('image/');
      let width: number | undefined;
      let height: number | undefined;
      if (isImage && typeof window !== 'undefined') {
        try {
          const dims = await readImageDimensions(file);
          width = dims.width;
          height = dims.height;
        } catch {
          // best-effort; not fatal
        }
      }

      return {
        storage_path: path,
        mime: file.type,
        size: file.size,
        filename: file.name,
        kind: isImage ? 'image' : 'file',
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      };
    },
  });
}

/**
 * Resolve a comms attachment storage_path to a short-lived signed URL.
 * Caller renders an <img>, <a>, or download button using the result.
 */
export function useSignedCommsAttachmentUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: ['comms-attachment-url', storagePath],
    enabled: !!storagePath,
    staleTime: (SIGNED_URL_TTL_SECONDS - 5) * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!storagePath) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image dimensions'));
    };
    img.src = url;
  });
}
