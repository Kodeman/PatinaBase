import { useState, useEffect, useCallback } from 'react';
import type { UpdateState } from '../lib/update-checker';
import { getUpdateInfo, dismissUpdate as dismissUpdateLib } from '../lib/update-checker';

export function useUpdateCheck() {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);

  // Read cached update info on mount
  useEffect(() => {
    getUpdateInfo().then(setUpdateState);
  }, []);

  // Listen for messages from the background worker about new updates
  useEffect(() => {
    const handler = (message: { type: string; updateState?: UpdateState }) => {
      if (message.type === 'UPDATE_AVAILABLE' && message.updateState) {
        setUpdateState(message.updateState);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const dismissUpdate = useCallback(async () => {
    if (!updateState?.versionInfo) return;
    await dismissUpdateLib(updateState.versionInfo.version);
    setUpdateState(prev => prev ? { ...prev, hasUpdate: false } : null);
  }, [updateState]);

  return {
    hasUpdate: updateState?.hasUpdate ?? false,
    updateInfo: updateState?.versionInfo ?? null,
    dismissUpdate,
  };
}
