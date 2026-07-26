'use client';

/**
 * Studio logo upload — direct-to-storage, modeled on the client-portal
 * `AvatarUploadField`. 2MB max; png/jpeg/webp/svg (the `studio-logos` bucket,
 * 00320, allows svg). Optimistic local preview, `?v=${Date.now()}` cache-bust
 * on the stored URL. Bucket `studio-logos`, path `${studioId}/${Date.now()}.ext`
 * — the bucket RLS keys writes on org owner/admin (not `auth.uid()`), so this is
 * rendered only when the caller can manage the studio. On success the public URL
 * is written to `organizations.logo_url` via `useUpdateOrganization`, which also
 * invalidates `['studio-identity']`.
 */

import { useId, useRef, useState } from 'react';
import { createBrowserClient, useUpdateOrganization } from '@patina/supabase';
import { monogramOf } from '@/lib/document/account-identity';
import { DocumentAction, DocumentActionGroup } from '../document-action';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

interface StudioLogoUploadFieldProps {
  studioId: string;
  currentUrl: string | null;
  name: string | null;
}

export function StudioLogoUploadField({
  studioId,
  currentUrl,
  name,
}: StudioLogoUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const updateOrg = useUpdateOrganization();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);

  async function handleFileSelected(file: File) {
    setError(null);

    if (!ACCEPTED.has(file.type)) {
      setError('Please upload a PNG, JPEG, WebP, or SVG image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be 2MB or smaller.');
      return;
    }

    setBusy(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    try {
      const supabase = createBrowserClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `${studioId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('studio-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('studio-logos')
        .getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      await updateOrg.mutateAsync({ id: studioId, logo_url: publicUrl });
      setPreviewUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPreviewUrl(currentUrl);
    } finally {
      setBusy(false);
      URL.revokeObjectURL(localPreview);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      await updateOrg.mutateAsync({ id: studioId, logo_url: null });
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove logo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-[var(--color-pearl)] bg-[var(--color-parchment,transparent)]">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={name ? `${name} logo` : 'Studio logo'}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="font-mono text-[13px] uppercase tracking-wider text-[var(--color-mocha)]">
            {monogramOf(name, '')}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void handleFileSelected(file);
            }
            e.target.value = '';
          }}
          data-testid="studio-logo-input"
        />
        <DocumentActionGroup surfaceKey="account" regionKey="studio-logo">
          <DocumentAction
            actionKey="upload-studio-logo"
            variant="primary"
            disabled={busy}
            loading={busy}
            loadingLabel="Uploading…"
            onClick={() => inputRef.current?.click()}
            data-testid="studio-logo-upload"
          >
            {previewUrl ? 'Change logo' : 'Upload logo'}
          </DocumentAction>
          {previewUrl && !busy && (
            <DocumentAction
              actionKey="remove-studio-logo"
              variant="tertiary"
              onClick={handleRemove}
              className="text-[var(--color-terracotta)]"
              data-testid="studio-logo-remove"
            >
              Remove
            </DocumentAction>
          )}
        </DocumentActionGroup>
        <p className="text-[11px] leading-relaxed text-[var(--color-aged-oak)]">
          PNG, JPEG, WebP, or SVG — up to 2MB. Shown on invoices, client emails,
          and the client app.
        </p>
        {error && (
          <p
            className="text-[11px] text-[var(--color-terracotta)]"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
