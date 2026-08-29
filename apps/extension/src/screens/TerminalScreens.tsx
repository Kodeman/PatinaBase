/** Terminal + error screens: S4 (saved to library), S5 (sent to inbox), R5 (error). */
import { useState } from "react";
import { useCapture, useCaptureDispatch } from "../state/CaptureProvider";
import { useController } from "../panel/controller-context";
import { KNOWN_BAD_DOMAIN_MESSAGE } from "../lib/mode-detection";
import {
  runCommit,
  classifySaveError,
  deriveRetryKind,
} from "../state/effects";
import { SpecBookPlacementError } from "../lib/spec-book-placement";
import type { CommitTarget } from "../state/types";

function NextActions() {
  const dispatch = useCaptureDispatch();
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: "CAPTURE_NEXT" })}
      className="mt-5 rounded-md bg-verdigris px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink"
    >
      Capture another
    </button>
  );
}

function Terminal({
  tone,
  title,
  sub,
}: {
  tone: "verdigris" | "brass";
  title: string;
  sub: string;
}) {
  const ring = tone === "verdigris" ? "text-verdigris" : "text-brass";
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className={`font-display text-[1.6rem] ${ring}`}>✓</span>
      <h2 className="mt-2 font-display text-[1.3rem] text-ink">{title}</h2>
      <p className="mt-1 max-w-[28ch] text-[0.85rem] text-ink-soft">{sub}</p>
      <NextActions />
    </div>
  );
}

export function SavedScreen() {
  const { io } = useCapture();
  const dispatch = useCaptureDispatch();
  const placementMessage = io.lastPlacementOutcome
    ? io.lastPlacementOutcome.outcome === "reused"
      ? "The piece is in your library and its existing project selection was reused."
      : io.lastPlacementOutcome.outcome === "filled"
        ? "The piece is in your library and filled the selected project need."
        : io.lastPlacementOutcome.outcome === "held"
          ? "The piece is in your library and its project placement is held for review."
          : "The piece is in your library and a project selection was created."
    : "The piece is in your library, ready to place.";
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="font-display text-[1.6rem] text-verdigris">✓</span>
      <h2 className="mt-2 font-display text-[1.3rem] text-ink">
        Saved to your library
      </h2>
      <p className="mt-1 max-w-[28ch] text-[0.85rem] text-ink-soft">
        {placementMessage}
      </p>
      <button
        type="button"
        onClick={() => dispatch({ type: "CAPTURE_NEXT" })}
        className="mt-5 rounded-md bg-verdigris px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink"
      >
        Capture another
      </button>
    </div>
  );
}

export function InboxSavedScreen() {
  return (
    <Terminal
      tone="brass"
      title="Sent to your inbox"
      sub="Tucked into the inbox to sort when you're back at the desk."
    />
  );
}

/**
 * R5 serves two distinct failures that share one screen: an EXTRACTION_ERROR
 * (no draft yet — state.draft is null, Retry re-extracts) and a SAVE_ERROR
 * routed here by CommitBar (a draft is present — Retry re-runs the same
 * commit target instead, via effects.ts's runCommit/deriveRetryKind so the
 * branch order matches CommitBar's own precedence exactly). Snapshot/By-hand
 * are extraction-only escapes — offering them on a save error would discard
 * the very draft the user is trying to save.
 */
export function ErrorScreen() {
  const { refresh, currentUrl, captureStartedAt } = useController();
  const { io, draft, routing, dedup, session } = useCapture();
  const dispatch = useCaptureDispatch();
  const [retrying, setRetrying] = useState(false);
  // CL-R14: a known-bad domain will never extract, so retrying is a dead end —
  // only Snapshot and by-hand remain.
  const isKnownBad = io.error === KNOWN_BAD_DOMAIN_MESSAGE;
  const isSaveError = draft !== null;

  const retrySave = async () => {
    if (!draft || !session.user) return;
    setRetrying(true);
    const kind = deriveRetryKind(
      routing,
      !!dedup.match,
      io.pendingPlacementProductId,
    );
    const target: CommitTarget = kind === "inbox" ? "inbox" : "library";
    dispatch({ type: "SAVE_START", target });
    const captureTimeMs =
      captureStartedAt != null ? Date.now() - captureStartedAt : undefined;
    try {
      const duplicateMode =
        kind === "library" && dedup.match
          ? ("create" as const)
          : ("reuse" as const);
      const { productId, placementOutcome } = await runCommit(kind, {
        draft,
        routing,
        user: session.user,
        dedupMatchId: dedup.match?.id ?? null,
        pendingPlacementProductId: io.pendingPlacementProductId,
        duplicateMode,
        captureTimeMs,
      });
      dispatch({
        type: "SAVE_SUCCESS",
        productId,
        landed: kind === "inbox" ? "inbox" : "library",
        placementOutcome,
      });
    } catch (e) {
      const { errorClass, message } = classifySaveError(e);
      const preserved =
        e instanceof SpecBookPlacementError
          ? { preservedProductId: e.productId }
          : {};
      dispatch({ type: "SAVE_ERROR", error: message, ...preserved });
      if (errorClass === "auth") {
        // Same as CommitBar's catch — SESSION_RESOLVED(null), not SIGNED_OUT,
        // so the draft isn't wiped by this transition (see the gap note below).
        dispatch({ type: "SESSION_RESOLVED", user: null });
      }
      // else: stay on R5 — io.error already carries the new message.
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="font-display text-[1.4rem] text-rust">—</span>
      <h2 className="mt-2 font-display text-[1.2rem] text-ink">
        {isSaveError ? "Couldn't save" : "Couldn't read this page"}
      </h2>
      <p className="mt-1 max-w-[30ch] text-[0.85rem] text-ink-soft">
        {io.error ||
          "The page blocked extraction or timed out. Try again, or capture it by hand."}
      </p>
      <div className="mt-5 flex gap-2">
        {isSaveError ? (
          <button
            type="button"
            disabled={retrying}
            onClick={retrySave}
            className="rounded-md bg-verdigris px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        ) : (
          <>
            {!isKnownBad && (
              <button
                type="button"
                onClick={refresh}
                className="rounded-md bg-verdigris px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => dispatch({ type: "NAV", screen: "R2" })}
              className="rounded-md border border-line px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-soft hover:border-ink-soft"
            >
              Snapshot
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: "MANUAL_START", url: currentUrl })
              }
              className="rounded-md border border-line px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-soft hover:border-ink-soft"
            >
              By hand
            </button>
          </>
        )}
      </div>
    </div>
  );
}
