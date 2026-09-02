'use client';

/**
 * The New-note tab of the Tester Notes widget — the capture form lifted out of
 * the old DocSheet-based feedback sheet: one of four buckets (required), an
 * optional note, the auto-captured screen, plus three dials (screenshot,
 * weight, file-as-a-bug).
 *
 * Deliberately un-Patina: system font, plain controls, no design-system
 * components. This is a tester instrument sitting on top of the product, and it
 * should never be mistaken for part of it.
 *
 * The screenshot arrives asynchronously on `document:feedback-screenshot`,
 * dispatched by {@link openFeedbackSheet} when the panel opens.
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  useCreateFeedback,
  type FeedbackBucket,
  type FeedbackWeight,
} from '@patina/supabase';
import { BUCKETS, WEIGHTS, bucketMeta, captureContext } from '@/lib/document/feedback';

const YELLOW = '#ffd60a';

export function FeedbackForm({
  /** Pre-selected bucket from a one-tap doorway (`document:open-feedback`). */
  initialBucket = null,
}: {
  initialBucket?: FeedbackBucket | null;
}) {
  const pathname = usePathname();
  const create = useCreateFeedback();

  // The widget remounts this form on every open, so the initial bucket is the
  // whole of the pre-selection: no effect syncs it afterwards.
  const [bucket, setBucket] = useState<FeedbackBucket | null>(initialBucket);
  const [note, setNote] = useState('');
  const [weight, setWeight] = useState<FeedbackWeight | null>(null);
  const [includeShot, setIncludeShot] = useState(true);
  const [isBug, setIsBug] = useState(initialBucket === 'not_working');
  // Once she touches the switch, "Not working" stops flipping it for her.
  const [bugTouched, setBugTouched] = useState(false);
  const [shot, setShot] = useState<Blob | null>(null);
  const [capturing, setCapturing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'note' | 'bug' | null>(null);

  useEffect(() => {
    const onShot = (e: Event) => {
      setShot((e as CustomEvent<Blob | null>).detail ?? null);
      setCapturing(false);
    };
    window.addEventListener('document:feedback-screenshot', onShot);
    return () => {
      window.removeEventListener('document:feedback-screenshot', onShot);
    };
  }, []);

  const shotUrl = useMemo(() => (shot ? URL.createObjectURL(shot) : null), [shot]);
  useEffect(
    () => () => {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
    },
    [shotUrl],
  );

  function chooseBucket(key: FeedbackBucket) {
    const next = bucket === key ? null : key;
    setDone(null);
    setBucket(next);
    if (!bugTouched) setIsBug(next === 'not_working');
  }

  const context = captureContext(pathname);
  const activeBucket = bucket ? bucketMeta(bucket) : null;

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
        report_kind: isBug ? 'bug' : 'note',
        user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      setDone(isBug ? 'bug' : 'note');
      setBucket(null);
      setNote('');
      setWeight(null);
      setIsBug(false);
      setBugTouched(false);
      // The panel stays open after a send, so the next note starts from a
      // clean form — including the screenshot, which belonged to the screen
      // she reported, not to whatever she looks at next.
      setShot(null);
      setIncludeShot(true);
    } catch {
      // Never lose what she wrote: inline error, note preserved.
      setError('Couldn’t leave the note. It’s still here — try again.');
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13, color: '#eaeaea' }}>
      {done && (
        <div
          role="status"
          style={{
            marginBottom: 12,
            border: `1px solid ${YELLOW}`,
            padding: '8px 10px',
            color: YELLOW,
            fontSize: 12,
          }}
        >
          {done === 'bug'
            ? 'Filed. Check Past notes for the GitHub link.'
            : 'Noted. It’s in Past notes.'}
        </div>
      )}

      <div role="radiogroup" aria-label="Bucket" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {BUCKETS.map((b) => {
          const on = bucket === b.key;
          return (
            <button
              key={b.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => chooseBucket(b.key)}
              style={{
                minHeight: 34,
                padding: '4px 10px',
                border: `1px solid ${on ? YELLOW : '#555'}`,
                background: on ? YELLOW : 'transparent',
                color: on ? '#000' : '#ccc',
                fontFamily: 'inherit',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => {
          // The confirmation belongs to the note she just sent; the moment she
          // starts the next one it would be lying.
          setDone(null);
          setNote(e.target.value);
        }}
        rows={4}
        aria-label="Note"
        placeholder={activeBucket?.placeholder ?? 'What happened?'}
        style={{
          marginTop: 10,
          width: '100%',
          resize: 'vertical',
          background: '#111',
          border: '1px solid #555',
          color: '#eaeaea',
          fontFamily: 'inherit',
          fontSize: 13,
          padding: 8,
        }}
      />

      <label
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#ccc',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          role="switch"
          checked={isBug}
          onChange={(e) => {
            setBugTouched(true);
            setIsBug(e.target.checked);
          }}
        />
        File as a bug (opens a GitHub issue)
      </label>

      <label
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#ccc',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          role="switch"
          checked={includeShot}
          onChange={(e) => setIncludeShot(e.target.checked)}
        />
        Screenshot
        {includeShot && capturing && <span style={{ color: '#888' }}>capturing…</span>}
        {includeShot && shotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shotUrl} alt="" style={{ height: 20, width: 32, objectFit: 'cover', border: '1px solid #555' }} />
        )}
      </label>

      <div
        role="radiogroup"
        aria-label="Weight"
        style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ccc' }}
      >
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
              style={{
                minHeight: 30,
                padding: '2px 8px',
                border: `1px solid ${on ? YELLOW : '#555'}`,
                background: 'transparent',
                color: on ? YELLOW : '#ccc',
                fontFamily: 'inherit',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      <p style={{ marginTop: 10, fontSize: 11, color: '#888' }}>
        {context.screen_name} · {context.route} · {context.viewport}
      </p>

      {error && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12, color: '#ff6b6b' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!bucket || create.isPending}
        style={{
          marginTop: 12,
          width: '100%',
          minHeight: 38,
          border: 'none',
          background: !bucket || create.isPending ? '#444' : YELLOW,
          color: !bucket || create.isPending ? '#999' : '#000',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          cursor: !bucket || create.isPending ? 'default' : 'pointer',
        }}
      >
        {create.isPending ? 'Sending…' : isBug ? 'Send bug report' : 'Leave note'}
      </button>
    </div>
  );
}
