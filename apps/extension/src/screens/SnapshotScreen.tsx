/**
 * R2 — Snapshot fallback. Captures the visible viewport, uploads it to the
 * product-images bucket, and drops into manual entry (C2) with the snapshot
 * attached. Degrades to a retry/by-hand choice on failure.
 */
import { useEffect, useRef, useState } from 'react';
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { useController } from '../panel/controller-context';
import { captureSnapshot, uploadSnapshot } from '../lib/snapshot';
import { LoadingStrata } from '../components/LoadingStrata';

export function SnapshotScreen() {
  const { session } = useCapture();
  const { currentUrl } = useController();
  const dispatch = useCaptureDispatch();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!session.user) return;
      try {
        const dataUrl = await captureSnapshot();
        const publicUrl = await uploadSnapshot(dataUrl, session.user.id);
        dispatch({ type: 'SNAPSHOT_CAPTURED', sourceUrl: currentUrl, imageUrl: publicUrl });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Snapshot failed');
      }
    })();
  }, [dispatch, session.user, currentUrl]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="font-display text-[1.3rem] text-rust">—</span>
        <h2 className="mt-2 font-display text-[1.15rem] text-ink">Snapshot didn't take</h2>
        <p className="mt-1 max-w-[30ch] text-[0.82rem] text-ink-soft">{error}</p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'MANUAL_START', url: currentUrl })}
          className="mt-5 rounded-md border border-line px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-soft hover:border-ink-soft"
        >
          Add by hand instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <LoadingStrata size="md" />
      <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-ink-soft">
        Taking a snapshot…
      </p>
    </div>
  );
}
