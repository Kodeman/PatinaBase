'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type BufferedAutosaveState =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error';

interface BufferedAutosaveOptions<Key extends string, Patch extends object> {
  save: (key: Key, patch: Patch) => Promise<unknown>;
  delay?: number;
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
 * clearing the timer and dropping the designer's last keystrokes.
 */
export function useBufferedAutosave<Key extends string, Patch extends object>({
  save,
  delay = 600,
}: BufferedAutosaveOptions<Key, Patch>) {
  const saveRef = useRef(save);
  saveRef.current = save;

  const pendingRef = useRef(new Map<Key, Patch>());
  const timersRef = useRef(
    new Map<Key, ReturnType<typeof setTimeout>>(),
  );
  const inFlightRef = useRef(new Map<Key, Promise<void>>());
  const errorsRef = useRef(new Map<Key, string>());
  const mountedRef = useRef(false);
  const flushRef = useRef<(key: Key) => Promise<void>>(async () => {});

  const [state, setState] = useState<BufferedAutosaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const flush = useCallback(async (key: Key): Promise<void> => {
    const timer = timersRef.current.get(key);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(key);

    const active = inFlightRef.current.get(key);
    if (active) {
      await active;
      // A patch can arrive after the active drain's final `has(key)` check but
      // before its promise settles. Re-enter after awaiting so blur, flushAll,
      // and unmount cannot strand that last patch with its timer cleared.
      if (pendingRef.current.has(key)) {
        await flushRef.current(key);
      }
      return;
    }
    if (!pendingRef.current.has(key)) return;

    errorsRef.current.delete(key);
    if (mountedRef.current) {
      const remainingError = firstBufferedError(errorsRef.current);
      setState(remainingError ? 'error' : 'saving');
      setError(remainingError);
    }

    const drain = async () => {
      while (pendingRef.current.has(key)) {
        const patch = pendingRef.current.get(key)!;
        pendingRef.current.delete(key);
        try {
          await saveRef.current(key, patch);
        } catch (saveError) {
          // Keep the failed fields queued. Any newer values win so a retry can
          // never roll the row back to the older failed patch.
          pendingRef.current.set(key, {
            ...patch,
            ...pendingRef.current.get(key),
          });
          const message =
            saveError instanceof Error
              ? saveError.message
              : 'The latest changes could not be saved.';
          errorsRef.current.set(key, message);
          if (mountedRef.current) {
            setState('error');
            setError(message);
          }
          return;
        }
      }

      if (mountedRef.current) {
        const remainingError = firstBufferedError(errorsRef.current);
        const otherRowsAreSaving = [...inFlightRef.current.keys()].some(
          (activeKey) => activeKey !== key,
        );
        setState(
          remainingError
            ? 'error'
            : otherRowsAreSaving || pendingRef.current.size > 0
              ? 'saving'
              : 'saved',
        );
        setError(remainingError);
      }
    };

    const promise = drain().finally(() => {
      if (inFlightRef.current.get(key) === promise) {
        inFlightRef.current.delete(key);
      }
    });
    inFlightRef.current.set(key, promise);
    await promise;
  }, []);

  flushRef.current = flush;

  const queue = useCallback(
    (key: Key, patch: Patch) => {
      pendingRef.current.set(key, {
        ...pendingRef.current.get(key),
        ...patch,
      });
      errorsRef.current.delete(key);
      if (mountedRef.current) {
        const remainingError = firstBufferedError(errorsRef.current);
        setState(
          remainingError
            ? 'error'
            : inFlightRef.current.has(key)
              ? 'saving'
              : 'dirty',
        );
        setError(remainingError);
      }

      const timer = timersRef.current.get(key);
      if (timer) clearTimeout(timer);
      timersRef.current.set(
        key,
        setTimeout(() => {
          void flushRef.current(key);
        }, delay),
      );
    },
    [delay],
  );

  const flushAll = useCallback(async () => {
    const keys = new Set<Key>([
      ...pendingRef.current.keys(),
      ...inFlightRef.current.keys(),
    ]);
    await Promise.all([...keys].map((key) => flushRef.current(key)));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    const pending = pendingRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      // React Query mutations outlive their observer. Start every outstanding
      // write before the component releases its hook instance.
      for (const key of pending.keys()) {
        void flushRef.current(key);
      }
    };
  }, []);

  return { queue, flush, flushAll, state, error };
}
