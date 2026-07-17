'use client';

/**
 * Evidence-upload widget for the /evidence/[token] guest page (Back of House
 * S7). Posts straight to the fulfillment-evidence edge function (public,
 * token-gated in-code, verify_jwt=false) with the anon key — there is no
 * session and no server action here; the token minted for this exception IS
 * the authority the function checks. Content-Type is left to the browser so
 * the multipart boundary is set correctly (fetch computes it from the
 * FormData body; setting it manually breaks the boundary).
 */

import { useRef, useState } from 'react';
import { Button } from '@patina/design-system';

interface EvidenceUploaderProps {
  token: string;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export function EvidenceUploader({ token }: EvidenceUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<UploadState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (files.length === 0) {
      setState('error');
      setMessage('Choose at least one photo first.');
      return;
    }

    setState('uploading');
    setMessage(null);

    const formData = new FormData();
    formData.set('token', token);
    for (const file of files) formData.append('files', file);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/fulfillment-evidence`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: formData,
      });
      const body = await res.json().catch(() => ({}) as Record<string, unknown>);

      if (!res.ok) {
        setState('error');
        setMessage(typeof body?.error === 'string' ? body.error : 'Something went wrong — try again.');
        return;
      }

      const added = typeof body?.added === 'number' ? body.added : files.length;
      setState('success');
      setMessage(`Thank you — ${added} photo${added === 1 ? '' : 's'} received.`);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch {
      setState('error');
      setMessage('Something went wrong — try again.');
    }
  }

  if (state === 'success') {
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-6 text-center">
        <p className="type-body text-[var(--accent-primary)]">{message}</p>
        <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => setState('idle')}>
          Add more photos
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="type-body-small block text-[var(--text-muted)]">
        <span className="mb-1 block">Photos</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-sm"
        />
      </label>

      {files.length > 0 && (
        <p className="type-body-small text-[var(--text-muted)]">
          {files.length} photo{files.length === 1 ? '' : 's'} selected
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="min-h-[44px] w-full"
        disabled={state === 'uploading'}
        onClick={handleSubmit}
      >
        {state === 'uploading' ? 'Uploading…' : 'Upload'}
      </Button>

      {state === 'error' && message && <p className="type-body-small text-[var(--color-terracotta)]">{message}</p>}
    </div>
  );
}
