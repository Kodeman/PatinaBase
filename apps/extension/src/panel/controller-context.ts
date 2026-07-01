/** Exposes the capture controller actions (refresh, mode switch) to deep children. */
import { createContext, useContext } from 'react';
import type { CaptureController } from '../hooks/use-capture-controller';

export const ControllerContext = createContext<CaptureController | null>(null);

export function useController(): CaptureController {
  const ctx = useContext(ControllerContext);
  if (!ctx) throw new Error('useController must be used within <PanelShell>');
  return ctx;
}
