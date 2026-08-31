import type { MoodBoardRasterInput } from '@patina/design-system';

export const MOOD_BOARD_COVER_DEBOUNCE_MS = 30_000;

export interface MoodBoardCoverSnapshot {
  boardId: string;
  signature: string;
  input: MoodBoardRasterInput;
}

export interface MoodBoardCoverLifecycle {
  /** Observe the latest persisted composition. The first snapshot is a baseline. */
  update(snapshot: MoodBoardCoverSnapshot): void;
  /**
   * Write the latest snapshot now instead of waiting for the debounce timer.
   * `force` never bypasses the unchanged-content check: a snapshot whose
   * signature already equals the last write is still a no-op, forced or not
   * — otherwise every room exit re-renders and re-uploads a byte-identical
   * cover under a fresh random storage path, forever (board-paths D6).
   */
  flush(force?: boolean): Promise<void>;
  /** Cancel pending derived work when the room unmounts. */
  dispose(): void;
}

/**
 * Coordinates the derived board cover independently from React rendering.
 * Structural edits debounce for 30 seconds; room exit can force an immediate
 * write instead of waiting out the timer, but never a redundant one — a
 * snapshot identical to the last write is always skipped; writes serialize so
 * a late completion cannot replace newer input.
 */
export function createMoodBoardCoverLifecycle(options: {
  write(snapshot: MoodBoardCoverSnapshot): Promise<void>;
  onError?: (error: unknown) => void;
  delayMs?: number;
}): MoodBoardCoverLifecycle {
  const delayMs = options.delayMs ?? MOOD_BOARD_COVER_DEBOUNCE_MS;
  let latest: MoodBoardCoverSnapshot | null = null;
  let observedSignature: string | null = null;
  let lastWrittenSignature: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const cancelTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  // `force` is accepted for call-site clarity (an exit wants "now," not "after
  // the debounce timer") but deliberately does nothing else: cancelTimer()
  // below already runs unconditionally, so calling flush() directly (rather
  // than waiting for the timer) is the entire "override the timing" behavior
  // force provides. It must never reach the signature-equality check — an
  // unchanged snapshot is a no-op on every path, forced or not.
  const flush = async (_force = false): Promise<void> => {
    cancelTimer();

    if (inFlight) {
      try {
        await inFlight;
      } catch {
        // The owning flush reports the failure. Continue so a forced exit can retry.
      }
    }

    const snapshot = latest;
    if (!snapshot || snapshot.signature === lastWrittenSignature) return;

    const task = options.write(snapshot);
    inFlight = task;
    try {
      await task;
      lastWrittenSignature = snapshot.signature;
    } catch (error) {
      // Covers are derived convenience. The canonical board remains persisted.
      options.onError?.(error);
    } finally {
      if (inFlight === task) inFlight = null;
    }
  };

  return {
    update(snapshot) {
      latest = snapshot;
      if (observedSignature === null) {
        observedSignature = snapshot.signature;
        return;
      }
      if (snapshot.signature === observedSignature) return;

      observedSignature = snapshot.signature;
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delayMs);
    },
    flush,
    dispose: cancelTimer,
  };
}
