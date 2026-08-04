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
  /** Write the latest snapshot now. `force` also writes an unchanged baseline on exit. */
  flush(force?: boolean): Promise<void>;
  /** Cancel pending derived work when the room unmounts. */
  dispose(): void;
}

/**
 * Coordinates the derived board cover independently from React rendering.
 * Structural edits debounce for 30 seconds; room exit can force the current
 * snapshot; writes serialize so a late completion cannot replace newer input.
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

  const flush = async (force = false): Promise<void> => {
    cancelTimer();

    if (inFlight) {
      try {
        await inFlight;
      } catch {
        // The owning flush reports the failure. Continue so a forced exit can retry.
      }
    }

    const snapshot = latest;
    if (!snapshot || (!force && snapshot.signature === lastWrittenSignature)) return;

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
