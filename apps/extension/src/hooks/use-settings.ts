/** Loads persisted prefs into the store on mount and writes them back on change. */
import { useEffect, useRef } from 'react';
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { DEFAULT_PREFS } from '../state/reducer';
import { loadPrefs, savePrefs } from '../lib/settings';

export function useSettingsSync(): void {
  const { prefs } = useCapture();
  const dispatch = useCaptureDispatch();
  const loaded = useRef(false);

  useEffect(() => {
    loadPrefs().then((saved) => {
      if (saved) dispatch({ type: 'PREFS_LOADED', prefs: { ...DEFAULT_PREFS, ...saved } });
      loaded.current = true;
    });
  }, [dispatch]);

  useEffect(() => {
    if (loaded.current) void savePrefs(prefs);
  }, [prefs]);
}
