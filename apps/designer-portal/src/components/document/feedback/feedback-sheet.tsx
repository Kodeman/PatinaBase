'use client';

/**
 * The capture sheet (R7.2) — a focused, screen-agnostic overlay: one of four
 * buckets (required), an optional note, the auto-captured screen shown
 * read-only, plus two optional dials (screenshot, weight). Built on DocSheet
 * (charcoal, Esc/backdrop/focus-trap), like the other document overlays.
 *
 * Opened from anywhere via {@link openFeedbackSheet} (the FAB, ⌘K, ⌘⇧F), which
 * also kicks off the screenshot of the underlying screen and delivers it back
 * on `document:feedback-screenshot` once ready — so the sheet appears instantly
 * and the shot fills in a beat later, never blocking capture.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { toast, ToastAction } from '@patina/design-system';
import { useCreateFeedback, type FeedbackBucket, type FeedbackWeight } from '@patina/supabase';
import { DocSheet } from '../overlays/doc-sheet';
import {
  BUCKETS,
  WEIGHTS,
  bucketMeta,
  captureContext,
  captureScreenshot,
} from '@/lib/document/feedback';

interface OpenDetail {
  bucket?: FeedbackBucket;
}

/**
 * Open the capture sheet from anywhere in the document model, and start the
 * screenshot in parallel. `bucket` pre-selects (e.g. a one-tap "Working").
 */
export function openFeedbackSheet(opts?: OpenDetail) {
  window.dispatchEvent(new CustomEvent('document:open-feedback', { detail: opts ?? {} }));
  captureScreenshot().then((blob) => {
    window.dispatchEvent(new CustomEvent('document:feedback-screenshot', { detail: blob }));
  });
}

export function FeedbackSheet() {
  const pathname = usePathname();
  const create = useCreateFeedback();

  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState<FeedbackBucket | null>(null);
  const [note, setNote] = useState('');
  const [weight, setWeight] = useState<FeedbackWeight | null>(null);
  const [includeShot, setIncludeShot] = useState(true);
  const [shot, setShot] = useState<Blob | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const firstBucketRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail ?? {};
      setBucket(detail.bucket ?? null);
      setNote('');
      setWeight(null);
      setIncludeShot(true);
      setShot(null);
      setCapturing(true);
      setError(null);
      setConfirmingDiscard(false);
      setOpen(true);
    };
    const onShot = (e: Event) => {
      setShot((e as CustomEvent<Blob | null>).detail ?? null);
      setCapturing(false);
    };
    window.addEventListener('document:open-feedback', onOpen);
    window.addEventListener('document:feedback-screenshot', onShot);
    return () => {
      window.removeEventListener('document:open-feedback', onOpen);
      window.removeEventListener('document:feedback-screenshot', onShot);
    };
  }, []);

  // Focus the bucket row on open (R7.2.8).
  useEffect(() => {
    if (open) firstBucketRef.current?.focus();
  }, [open]);

  // Thumbnail object URL for the captured shot; revoked on change/close.
  const shotUrl = useMemo(() => (shot ? URL.createObjectURL(shot) : null), [shot]);
  useEffect(() => () => { if (shotUrl) URL.revokeObjectURL(shotUrl); }, [shotUrl]);

  const dirty = note.trim().length > 0 || bucket !== null;
  const context = captureContext(pathname);

  function close() {
    setOpen(false);
    setConfirmingDiscard(false);
    // Let the FAB reappear (it hides itself while the sheet is up).
    window.dispatchEvent(new CustomEvent('document:feedback-closed'));
  }

  function requestClose() {
    if (dirty && !confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    close();
  }

  async function submit() {
    if (!bucket || create.isPending) return;
    setError(null);
    try {
      await create.mutateAsync({
        bucket,
        note: note.trim() || null,
        weight,
        screen_name: context.screen_name,
        route: context.route,
        app_version: context.app_version,
        viewport: context.viewport,
        screenshot: includeShot ? shot : null,
      });
      close();
      toast({
        variant: 'success',
        title: 'Noted — thanks.',
        description: 'It’s in the Feedback ledger.',
        action: (
          <ToastAction
            altText="Open the Feedback ledger"
            // The Studio Drawer owns ledger sheets; open ours by event (avoids a
            // command-bar ↔ feedback-sheet import cycle).
            onClick={() => window.dispatchEvent(new CustomEvent('document:open-ledger', { detail: 'feedback' }))}
          >
            See it →
          </ToastAction>
        ),
      });
    } catch {
      // Never lose what she wrote (R7.2 error state): inline, note preserved.
      setError('Couldn’t leave the note. It’s still here — try again.');
    }
  }

  const activeBucket = bucket ? bucketMeta(bucket) : null;

  return (
    <DocSheet open={open} onClose={requestClose} title="Leave a note" variant="center">
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-xl text-[var(--color-charcoal)]">Leave a note</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            on <span className="text-[var(--color-clay)]">{context.screen_name}</span>
          </span>
        </div>

        {/* Bucket — single-select, required (R7.2.1). */}
        <div role="radiogroup" aria-label="Bucket" className="flex flex-wrap gap-2">
          {BUCKETS.map((b, i) => {
            const on = bucket === b.key;
            return (
              <button
                key={b.key}
                ref={i === 0 ? firstBucketRef : undefined}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setBucket(on ? null : b.key)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors"
                style={{
                  borderColor: on ? b.colorVar : 'var(--color-pearl)',
                  color: on ? 'var(--color-charcoal)' : 'var(--color-aged-oak)',
                  background: on ? `color-mix(in srgb, ${b.colorVar} 22%, transparent)` : 'transparent',
                }}
              >
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: b.colorVar }} />
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Note — optional (R7.2.2). Placeholder adapts to the bucket. */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={activeBucket?.placeholder ?? 'Anything you want to say…'}
          className="mt-3 w-full resize-y rounded-lg border border-[var(--color-pearl)] bg-white px-3 py-2.5 text-[14px] leading-relaxed text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
        />

        {/* Optional dials: screenshot + weight. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={includeShot}
            onClick={() => setIncludeShot((v) => !v)}
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]"
          >
            <span
              aria-hidden
              className="relative h-[18px] w-[30px] rounded-full transition-colors"
              style={{ background: includeShot ? 'var(--color-sage)' : 'var(--color-pearl)' }}
            >
              <span
                className="absolute top-[3px] h-3 w-3 rounded-full bg-white transition-all"
                style={{ left: includeShot ? '15px' : '3px' }}
              />
            </span>
            Screenshot
            {shotUrl && includeShot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shotUrl} alt="" className="ml-1 h-5 w-8 rounded border border-[var(--color-pearl)] object-cover" />
            )}
            {capturing && includeShot && <span className="text-[var(--color-aged-oak)]">capturing…</span>}
          </button>

          <div role="radiogroup" aria-label="Weight" className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            <span>Weight</span>
            {WEIGHTS.map((w) => {
              const on = weight === w.key;
              return (
                <button
                  key={w.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setWeight(on ? null : w.key)}
                  className="rounded-md border px-2 py-1 transition-colors"
                  style={{
                    borderColor: on ? 'var(--color-golden-hour)' : 'var(--color-pearl)',
                    color: on ? 'var(--color-charcoal)' : 'var(--color-aged-oak)',
                    background: on ? 'color-mix(in srgb, var(--color-golden-hour) 20%, transparent)' : 'transparent',
                  }}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="mt-3 text-[13px] text-[var(--color-terracotta)]">{error}</p>}

        {/* Actions. */}
        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={submit}
            disabled={!bucket || create.isPending}
            className="rounded-lg bg-[var(--color-clay)] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)] transition-opacity disabled:opacity-40"
          >
            {create.isPending ? 'Leaving…' : 'Leave note'}
          </button>
          {confirmingDiscard ? (
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
              Discard?
              <button type="button" onClick={close} className="text-[var(--color-terracotta)]">Discard</button>
              <button type="button" onClick={() => setConfirmingDiscard(false)} className="text-[var(--color-charcoal)]">Keep</button>
            </span>
          ) : (
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg border border-[var(--color-pearl)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </DocSheet>
  );
}
