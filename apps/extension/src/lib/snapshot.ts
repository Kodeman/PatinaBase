/**
 * Snapshot fallback (R2) — when a page blocks extraction, grab the visible
 * viewport and upload it to Supabase Storage so the capture still has an image.
 * Reuses the existing `product-images` bucket (migration 00057): public read,
 * authenticated insert, per-user-folder RLS keyed on `${user.id}/…`.
 */
import { supabase } from './supabase';

const BUCKET = 'product-images';

/** Capture the active tab's visible viewport as a JPEG data URL. */
export function captureSnapshot(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          reject(new Error(chrome.runtime.lastError?.message || 'Could not capture the page'));
          return;
        }
        resolve(dataUrl);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Snapshot failed'));
    }
  });
}

export function dataURLtoBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bytes = atob(body);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Upload a snapshot data URL; returns the public URL. Path must start with the
 *  user id to satisfy the bucket's per-user-folder RLS. */
export async function uploadSnapshot(dataUrl: string, userId: string): Promise<string> {
  const path = `${userId}/snapshots/${crypto.randomUUID()}.jpg`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, dataURLtoBlob(dataUrl), {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
}
