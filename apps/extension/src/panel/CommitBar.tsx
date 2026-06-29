/**
 * Region D (footer) — Commit. Sticky save bar: Save-to-library (verdigris) vs
 * Send-to-inbox (brass), or Update when an exact-URL duplicate is matched.
 * Runs the save effects and drives the SAVE_* lifecycle.
 */
import { useState } from 'react';
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { selectValidation } from '../state/selectors';
import { saveToLibrary, saveToInbox, updateExisting } from '../state/effects';
import type { CommitTarget } from '../state/types';

type Kind = 'library' | 'inbox' | 'update';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const x = e as { message?: string; details?: string; hint?: string; code?: string };
    const m = x.message || x.details || x.hint || JSON.stringify(e);
    return x.code ? `[${x.code}] ${m}` : m;
  }
  return 'Save failed';
}

export function CommitBar() {
  const state = useCapture();
  const dispatch = useCaptureDispatch();
  const [busy, setBusy] = useState<Kind | null>(null);
  const { draft, routing, dedup, session, io } = state;

  if (!draft || state.nav.screen !== 'C2' || state.nav.overlay) return null;

  const user = session.user;
  const valid = selectValidation(state).isValid;
  const disabled = !valid || io.isSaving || !user || busy !== null;

  const run = async (kind: Kind) => {
    if (!user) return;
    const target: CommitTarget = kind === 'inbox' ? 'inbox' : 'library';
    setBusy(kind);
    dispatch({ type: 'SAVE_START', target });
    try {
      const productId =
        kind === 'library'
          ? await saveToLibrary(draft, routing, user)
          : kind === 'inbox'
            ? await saveToInbox(draft, routing, user)
            : await updateExisting(dedup.match!.id, draft, routing, user);
      dispatch({
        type: 'SAVE_SUCCESS',
        productId,
        landed: kind === 'inbox' ? 'inbox' : 'library',
      });
    } catch (e) {
      dispatch({ type: 'SAVE_ERROR', error: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  if (dedup.match) {
    return (
      <div className="border-t border-line bg-paper px-4 py-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => run('update')}
          className="w-full rounded-md bg-brass py-3 text-[0.85rem] font-medium text-paper transition-colors hover:bg-brass-2 disabled:opacity-50"
        >
          {busy === 'update' ? 'Updating…' : 'Update in library'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-line bg-paper px-4 py-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => run('library')}
        className="w-full rounded-md bg-verdigris py-3 text-[0.85rem] font-medium text-paper transition-colors hover:bg-verdigris-ink disabled:opacity-50"
      >
        {busy === 'library' ? 'Saving…' : 'Save to library'}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => run('inbox')}
        className="w-full rounded-md border border-brass bg-brass/5 py-2.5 text-[0.82rem] font-medium text-brass transition-colors hover:bg-brass/10 disabled:opacity-50"
      >
        {busy === 'inbox' ? 'Saving…' : 'Send to inbox'}
      </button>
    </div>
  );
}
