'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { registerProposalAutosave } from '@/lib/proposal-autosave-registry';

export type BufferedAutosaveState =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error';

interface BufferedAutosaveOptions<Key extends string, Patch extends object> {
  proposalId: string;
  /** Retires the old buffer generation when an editor changes identity. */
  generationKey?: string;
  save: (key: Key, patch: Patch) => Promise<unknown>;
  delay?: number;
}

interface BufferedAutosaveGeneration<
  Key extends string,
  Patch extends object,
> {
  proposalId: string;
  generationKey: string;
  save: (key: Key, patch: Patch) => Promise<unknown>;
  pending: Map<Key, Patch>;
  timers: Map<Key, ReturnType<typeof setTimeout>>;
  inFlight: Map<Key, Promise<void>>;
  errors: Map<Key, string>;
  mounted: boolean;
  notify: () => void;
  flush: (key: Key) => Promise<void>;
  flushAll: () => Promise<void>;
}

function createGeneration<Key extends string, Patch extends object>(
  proposalId: string,
  generationKey: string,
  save: (key: Key, patch: Patch) => Promise<unknown>,
): BufferedAutosaveGeneration<Key, Patch> {
  return {
    proposalId,
    generationKey,
    save,
    pending: new Map(),
    timers: new Map(),
    inFlight: new Map(),
    errors: new Map(),
    mounted: false,
    notify: () => {},
    flush: async () => {},
    flushAll: async () => {},
  };
}

function firstBufferedError<Key extends string>(
  errors: Map<Key, string>,
): string | null {
  return errors.values().next().value ?? null;
}

/**
 * Lossless keyed autosave for document editors.
 *
 * Patches queued for the same row are merged, saves for a row are serialized,
 * blur can flush explicitly, and unmount starts a final drain instead of
 * clearing the timer and dropping the designer's last keystrokes. Each
 * proposal/editor identity owns an isolated generation so a prop change can
 * never drain the old editor through the new editor's save callback or
 * registry handle.
 */
export function useBufferedAutosave<Key extends string, Patch extends object>({
  proposalId,
  generationKey = proposalId,
  save,
  delay = 600,
}: BufferedAutosaveOptions<Key, Patch>) {
  const generationRef = useRef<BufferedAutosaveGeneration<
    Key,
    Patch
  > | null>(null);
  if (
    !generationRef.current ||
    generationRef.current.proposalId !== proposalId ||
    generationRef.current.generationKey !== generationKey
  ) {
    generationRef.current = createGeneration(proposalId, generationKey, save);
  } else {
    // Same proposal, newer render: future drains may use the latest callback.
    // A drain snapshots this callback when it starts, and a proposal change
    // allocates another generation before this assignment can touch the old.
    generationRef.current.save = save;
  }
  const generation = generationRef.current;
  const activeGenerationRef = useRef(generation);
  activeGenerationRef.current = generation;

  const [state, setState] = useState<BufferedAutosaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const updateMountedState = useCallback(
    (
      target: BufferedAutosaveGeneration<Key, Patch>,
      nextState: BufferedAutosaveState,
      nextError: string | null,
    ) => {
      if (
        target.mounted &&
        activeGenerationRef.current === target
      ) {
        setState(nextState);
        setError(nextError);
      }
    },
    [],
  );

  const flush = useCallback(
    async (key: Key): Promise<void> => {
      const timer = generation.timers.get(key);
      if (timer) clearTimeout(timer);
      generation.timers.delete(key);

      const active = generation.inFlight.get(key);
      if (active) {
        await active;
        // A patch can arrive after the active drain's final `has(key)` check
        // but before its promise settles. Re-enter so no final patch strands.
        if (generation.pending.has(key)) {
          await generation.flush(key);
        }
        return;
      }
      if (!generation.pending.has(key)) return;

      generation.errors.delete(key);
      generation.notify();
      const remainingError = firstBufferedError(generation.errors);
      updateMountedState(
        generation,
        remainingError ? 'error' : 'saving',
        remainingError,
      );

      // Bind this entire serialized drain to the callback active for this
      // proposal generation when the drain began. A rerender cannot redirect
      // an already queued proposal A patch through proposal B's callback.
      const saveForDrain = generation.save;
      const drain = async () => {
        while (generation.pending.has(key)) {
          const patch = generation.pending.get(key)!;
          generation.pending.delete(key);
          try {
            await saveForDrain(key, patch);
          } catch (saveError) {
            // Keep failed fields queued. Any newer values win on retry.
            generation.pending.set(key, {
              ...patch,
              ...generation.pending.get(key),
            });
            const message =
              saveError instanceof Error
                ? saveError.message
                : 'The latest changes could not be saved.';
            generation.errors.set(key, message);
            generation.notify();
            updateMountedState(generation, 'error', message);
            return;
          }
        }

        const finalError = firstBufferedError(generation.errors);
        const otherRowsAreSaving = [...generation.inFlight.keys()].some(
          (activeKey) => activeKey !== key,
        );
        updateMountedState(
          generation,
          finalError
            ? 'error'
            : otherRowsAreSaving || generation.pending.size > 0
              ? 'saving'
              : 'saved',
          finalError,
        );
      };

      const promise = drain().finally(() => {
        if (generation.inFlight.get(key) === promise) {
          generation.inFlight.delete(key);
        }
        generation.notify();
      });
      generation.inFlight.set(key, promise);
      generation.notify();
      await promise;
    },
    [generation, updateMountedState],
  );
  generation.flush = flush;

  const queue = useCallback(
    (key: Key, patch: Patch) => {
      generation.pending.set(key, {
        ...generation.pending.get(key),
        ...patch,
      });
      generation.errors.delete(key);
      generation.notify();
      const remainingError = firstBufferedError(generation.errors);
      updateMountedState(
        generation,
        remainingError
          ? 'error'
          : generation.inFlight.has(key)
            ? 'saving'
            : 'dirty',
        remainingError,
      );

      const timer = generation.timers.get(key);
      if (timer) clearTimeout(timer);
      generation.timers.set(
        key,
        setTimeout(() => {
          void generation.flush(key);
        }, delay),
      );
    },
    [delay, generation, updateMountedState],
  );

  const flushAll = useCallback(async () => {
    const keys = new Set<Key>([
      ...generation.pending.keys(),
      ...generation.inFlight.keys(),
    ]);
    await Promise.all([...keys].map((key) => generation.flush(key)));
    const bufferedError = firstBufferedError(generation.errors);
    if (bufferedError) throw new Error(bufferedError);
    if (generation.pending.size > 0 || generation.inFlight.size > 0) {
      throw new Error('Proposal edits are still being saved.');
    }
  }, [generation]);
  generation.flushAll = flushAll;

  useEffect(() => {
    let detached = false;
    let registration: ReturnType<typeof registerProposalAutosave>;
    const handle = {
      getSnapshot: () => ({
        // An in-flight patch is still unsaved until persistence resolves.
        dirty: generation.pending.size > 0 || generation.inFlight.size > 0,
        flushing: generation.inFlight.size > 0,
        error: firstBufferedError(generation.errors),
      }),
      flush: async () => {
        registration.notify();
        try {
          await generation.flushAll();
          if (detached) registration.unregister();
        } finally {
          registration.notify();
        }
      },
    };
    registration = registerProposalAutosave(generation.proposalId, handle);
    generation.notify = registration.notify;
    generation.mounted = true;
    if (activeGenerationRef.current === generation) {
      setState('idle');
      setError(null);
    }

    return () => {
      generation.mounted = false;
      detached = true;
      for (const timer of generation.timers.values()) clearTimeout(timer);
      generation.timers.clear();
      // Keep a detached, failed generation registered. The SendSheet barrier
      // can retry it; unregister only after its final patch persists.
      void handle.flush().catch(() => registration.notify());
    };
  }, [generation]);

  return { queue, flush, flushAll, state, error };
}
