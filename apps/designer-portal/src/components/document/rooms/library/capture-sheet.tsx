'use client';

/**
 * Capture — bring something into My Library (R32). A paper sheet over the Room;
 * captures land RAW on the personal shelf (no taxonomy, no queue), taught when
 * ready. Reuses the real captureProduct mutation; URL paste + a named manual
 * entry are the web-doable sources (the Chrome extension and photo capture
 * arrive through their own surfaces and land on the same shelf).
 */

import { useState } from 'react';
import { useCaptureProduct } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { RoomSheet } from '../room-sheet';

export function CaptureSheet({
  open,
  onClose,
  onCaptured,
}: {
  open: boolean;
  onClose: () => void;
  onCaptured?: (name: string) => void;
}) {
  const { user } = useAuth();
  const capture = useCaptureProduct();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setUrl('');
    setName('');
    setError(null);
  };

  const submit = async () => {
    setError(null);
    const trimmedUrl = url.trim();
    const trimmedName = name.trim();
    if (!user?.id) {
      setError('Your session is still resolving — try again in a moment.');
      return;
    }
    if (!trimmedUrl && !trimmedName) {
      setError('Paste a URL or name the piece first.');
      return;
    }
    try {
      await capture.mutateAsync({
        ownerUserId: user.id,
        name: trimmedName || null,
        sourceUrl: trimmedUrl || null,
        captureSource: trimmedUrl ? 'url_paste' : 'manual',
        destination: { type: 'personal' },
      });
      // Match the mutation's own fallback (captureProduct stores
      // `name || 'Untitled Product'`) so the toast and the shelf card agree.
      onCaptured?.(trimmedName || 'Untitled Product');
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capture failed. Try again.');
    }
  };

  return (
    <RoomSheet open={open} onClose={onClose} title="Capture into My Library">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay)]">
        Capture · into My Library
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        Bring something in
      </h2>
      <p className="mb-5 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
        Captures land on your shelf raw — no taxonomy, no queue. You teach them
        when you’re ready.
      </p>

      <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        Paste a product URL
      </label>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className="mb-4 w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
      />

      <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        …or name it by hand
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Heirloom oak dining table"
        className="w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
      />

      <p className="mt-3 text-[0.66rem] italic text-[var(--color-aged-oak)]">
        The Chrome extension and photo capture land on this same shelf.
      </p>

      {error && (
        <p className="mt-3 text-[0.72rem] text-[var(--color-terracotta)]">
          {error}
        </p>
      )}

      <DocumentActionGroup
        surfaceKey="library"
        regionKey="capture-sheet"
        className="mt-5 border-t border-[var(--color-pearl)] pt-4"
      >
        <DocumentAction
          actionKey="capture-piece"
          variant="primary"
          loading={capture.isPending}
          loadingLabel="Capturing…"
          onClick={() => void submit()}
        >
          Capture to My Library
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-capture"
          variant="tertiary"
          onClick={onClose}
        >
          Cancel
        </DocumentAction>
      </DocumentActionGroup>
    </RoomSheet>
  );
}
