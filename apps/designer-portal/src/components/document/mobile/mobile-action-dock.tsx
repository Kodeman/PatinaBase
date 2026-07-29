'use client';

import { DocumentAction } from '../document-action';
import { useMobileShell } from './mobile-shell';

export function MobileActionDock() {
  const { primaryAction, sheet } = useMobileShell();

  if (!primaryAction || sheet) return null;

  const shared = {
    actionKey: primaryAction.actionKey,
    surfaceKey: primaryAction.surfaceKey,
    regionKey: primaryAction.regionKey,
    variant: 'primary' as const,
    presentation: 'mobile_dock' as const,
    disabled: primaryAction.disabled,
    loading: primaryAction.loading,
    loadingLabel: primaryAction.loading ? `${primaryAction.label}…` : undefined,
    className: 'min-h-12 w-full',
    children: primaryAction.label,
  };

  return (
    <>
      <div
        aria-hidden
        data-testid="mobile-action-dock-clearance"
        className="h-[calc(120px+env(safe-area-inset-bottom,0px))] min-[980px]:hidden"
      />
      <div
        data-testid="mobile-action-dock"
        className="fixed inset-x-0 z-[39] border-t border-[var(--color-pearl)] bg-[var(--bg-primary)] px-3 py-2 bottom-[calc(56px+max(0.45rem,env(safe-area-inset-bottom)))] min-[980px]:hidden"
      >
        {primaryAction.target.kind === 'href' ? (
          <DocumentAction {...shared} href={primaryAction.target.href} />
        ) : (
          <DocumentAction {...shared} onClick={primaryAction.target.onPress} />
        )}
      </div>
    </>
  );
}
