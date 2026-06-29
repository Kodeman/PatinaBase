/**
 * React context wrapping the capture reducer. Replaces the legacy panel's ~52
 * useState vars + ~80-prop drilling — every region/screen/overlay reads state
 * via useCapture() and dispatches via useCaptureDispatch().
 */
import React, {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { captureReducer, initialCaptureState } from './reducer';
import type {
  CaptureState,
  CaptureAction,
  Prefs,
  DraftSlice,
  DraftField,
  DraftFieldKey,
} from './types';
import type { NavState } from './screens';

const StateCtx = createContext<CaptureState | null>(null);
const DispatchCtx = createContext<Dispatch<CaptureAction> | null>(null);

export function CaptureProvider({
  children,
  prefs,
  initial,
}: {
  children: ReactNode;
  prefs?: Prefs;
  /** Test/SSR seam — start from a prebuilt state. */
  initial?: CaptureState;
}) {
  const [state, dispatch] = useReducer(
    captureReducer,
    null,
    () => initial ?? initialCaptureState(prefs)
  );
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useCapture(): CaptureState {
  const ctx = useContext(StateCtx);
  if (!ctx) throw new Error('useCapture must be used within <CaptureProvider>');
  return ctx;
}

export function useCaptureDispatch(): Dispatch<CaptureAction> {
  const ctx = useContext(DispatchCtx);
  if (!ctx) {
    throw new Error('useCaptureDispatch must be used within <CaptureProvider>');
  }
  return ctx;
}

// ── Convenience selectors ─────────────────────────────────────────────────────

export function useNav(): NavState {
  return useCapture().nav;
}

export function useDraft(): DraftSlice | null {
  return useCapture().draft;
}

export function useDraftField<K extends DraftFieldKey>(
  key: K
): DraftSlice['fields'][K] | null {
  const draft = useDraft();
  return draft ? draft.fields[key] : null;
}

export type { DraftField };
