/**
 * Region D (footer) — Commit. Sticky save bar: Save-to-library (verdigris) vs
 * Send-to-inbox (brass), or Update when an exact-URL duplicate is matched.
 * Runs the save effects and drives the SAVE_* lifecycle.
 */
import { useContext, useState } from 'react';
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { selectValidation } from '../state/selectors';
import {
  reuseProductForSpecBookPlacement,
  retrySpecBookPlacement,
  saveToLibrary,
  saveToInbox,
  updateExisting,
  classifySaveError,
} from '../state/effects';
import type { CommitTarget } from '../state/types';
import { SpecBookPlacementError } from '../lib/spec-book-placement';
import { ControllerContext } from './controller-context';

type Kind = 'library' | 'inbox' | 'update' | 'reuse';

export function CommitBar() {
  const state = useCapture();
  const dispatch = useCaptureDispatch();
  // Read via context directly (not the throwing useController()) — some
  // CommitBar-only tests render it outside <PanelShell>'s provider.
  const controller = useContext(ControllerContext);
  const [busy, setBusy] = useState<Kind | null>(null);
  const { draft, routing, dedup, session, io } = state;

  if (!draft || state.nav.screen !== 'C2' || state.nav.overlay) return null;

  const user = session.user;
  const valid = selectValidation(state).isValid;
  const placementRoute = routing.specBookPlacement;
  const hasProjectPlacement = placementRoute !== null && placementRoute.kind !== 'library';
  const disabled =
    !valid || !routing.specBookPlacementValid || io.isSaving || !user || busy !== null;

  const run = async (kind: Kind) => {
    if (!user) return;
    const target: CommitTarget = kind === 'inbox' ? 'inbox' : 'library';
    setBusy(kind);
    dispatch({ type: 'SAVE_START', target, lastCommitKind: kind });
    const captureTimeMs =
      controller?.captureStartedAt != null ? Date.now() - controller.captureStartedAt : undefined;
    try {
      const duplicateMode =
        kind === 'library' && dedup.match ? ('create' as const) : ('reuse' as const);
      let productId: string;
      let placementOutcome = null;
      if (io.pendingPlacementProductId && hasProjectPlacement) {
        ({ productId, placementOutcome } = await retrySpecBookPlacement(
          io.pendingPlacementProductId,
          draft,
          routing,
          duplicateMode
        ));
      } else if (kind === 'reuse') {
        ({ productId, placementOutcome } = await reuseProductForSpecBookPlacement(
          dedup.match!.id,
          draft,
          routing
        ));
      } else if (kind === 'library') {
        ({ productId, placementOutcome } = await saveToLibrary(
          draft,
          routing,
          user,
          duplicateMode,
          captureTimeMs
        ));
      } else if (kind === 'update') {
        ({ productId, placementOutcome } = await updateExisting(
          dedup.match!.id,
          draft,
          routing,
          user,
          captureTimeMs
        ));
      } else {
        productId = await saveToInbox(draft, routing, user, captureTimeMs);
      }
      dispatch({
        type: 'SAVE_SUCCESS',
        productId,
        landed: kind === 'inbox' ? 'inbox' : 'library',
        placementOutcome,
      });
    } catch (e) {
      // All three classes (offline/auth/server) land on R5 with a live Retry
      // — an expired-session save is not a real sign-out (the portal cookie
      // may still be good, the extension client's JWT just needs a refresh
      // on the next attempt), so it doesn't get routed off the draft.
      const { message } = classifySaveError(e);
      const preserved =
        e instanceof SpecBookPlacementError ? { preservedProductId: e.productId } : {};
      dispatch({ type: 'SAVE_ERROR', error: message, ...preserved });
      dispatch({ type: 'NAV', screen: 'R5' });
    } finally {
      setBusy(null);
    }
  };

  if (dedup.match) {
    if (hasProjectPlacement) {
      return (
        <div className="space-y-2 border-t border-line bg-paper px-4 py-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => run('reuse')}
            className="w-full rounded-md bg-verdigris-ink py-3 text-[0.85rem] font-medium text-paper transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {busy === 'reuse'
              ? 'Placing…'
              : io.pendingPlacementProductId
                ? 'Retry saving to project'
                : `Use “${dedup.match.name}” here`}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => run('library')}
            className="w-full rounded-md border border-line py-2.5 text-[0.82rem] font-medium text-ink-soft transition-colors hover:border-ink-soft hover:text-ink disabled:opacity-50"
          >
            {busy === 'library' ? 'Saving & placing…' : 'Save as new'}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-2 border-t border-line bg-paper px-4 py-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => run('update')}
          className="w-full rounded-md bg-brass py-3 text-[0.85rem] font-medium text-paper transition-colors hover:bg-brass-2 disabled:opacity-50"
        >
          {busy === 'update' ? 'Updating…' : `Update “${dedup.match.name}”`}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => run('library')}
          className="w-full rounded-md border border-line py-2.5 text-[0.82rem] font-medium text-ink-soft transition-colors hover:border-ink-soft hover:text-ink disabled:opacity-50"
        >
          {busy === 'library' ? 'Saving…' : 'Save as new'}
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
        className="w-full rounded-md bg-verdigris-ink py-3 text-[0.85rem] font-medium text-paper transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {busy === 'library'
          ? hasProjectPlacement
            ? 'Saving & placing…'
            : 'Saving…'
          : io.pendingPlacementProductId
            ? 'Retry saving to project'
            : hasProjectPlacement
              ? placementRoute.kind === 'fill_slot'
                ? 'Save into this room'
                : placementRoute.kind === 'create_line'
                  ? 'Add to this room'
                  : 'Save to project inbox'
              : 'Save to library'}
      </button>
      {!hasProjectPlacement && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => run('inbox')}
          className="w-full rounded-md border border-brass bg-brass/5 py-2.5 text-[0.82rem] font-medium text-brass transition-colors hover:bg-brass/10 disabled:opacity-50"
        >
          {busy === 'inbox' ? 'Saving…' : 'Send to inbox'}
        </button>
      )}
      <button
        type="button"
        disabled={!valid || !routing.specBookPlacementValid || io.isSaving || !user}
        onClick={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'DEC' })}
        className="w-full py-1 text-center font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-soft transition-colors hover:text-brass disabled:opacity-40"
      >
        Send for client approval →
      </button>
    </div>
  );
}
