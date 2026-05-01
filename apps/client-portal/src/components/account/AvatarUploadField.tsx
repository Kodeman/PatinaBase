'use client';

import { useId, useRef, useState } from 'react';

import { createBrowserClient, useUpdateProfile } from '@patina/supabase';
import { Avatar, Button } from '@patina/design-system';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface AvatarUploadFieldProps {
  userId: string;
  currentUrl: string | null;
  displayName?: string;
}

export function AvatarUploadField({
  userId,
  currentUrl,
  displayName,
}: AvatarUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const updateProfile = useUpdateProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);

  async function handleFileSelected(file: File) {
    setError(null);

    if (!ACCEPTED.has(file.type)) {
      setError('Please upload a PNG, JPEG, or WebP image.');
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
      const path = `${userId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      await updateProfile.mutateAsync({ avatar_url: publicUrl });
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
      await updateProfile.mutateAsync({ avatar_url: null });
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove avatar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar
        size="lg"
        src={previewUrl ?? undefined}
        name={displayName || undefined}
        alt={displayName || 'Profile picture'}
      />
      <div className="flex flex-col gap-2">
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void handleFileSelected(file);
            }
            e.target.value = '';
          }}
          data-testid="account-avatar-input"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            data-testid="account-avatar-upload"
          >
            {busy ? 'Uploading…' : previewUrl ? 'Change photo' : 'Upload photo'}
          </Button>
          {previewUrl && !busy && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRemove}
              data-testid="account-avatar-remove"
            >
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-[#7A736C]">PNG, JPEG, or WebP — up to 2MB.</p>
        {error && (
          <p className="text-xs text-[#C45B4A]" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
