/** Reusable overlay sheet — header with a close action (CLOSE_OVERLAY) + body. */
import type { ReactNode } from 'react';
import { useCaptureDispatch } from '../state/CaptureProvider';

export function OverlaySheet({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dispatch = useCaptureDispatch();
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display text-[1.05rem] text-ink">{title}</h2>
          {subtitle && (
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-ink-soft">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLOSE_OVERLAY' })}
          className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-ink-soft hover:text-ink"
        >
          Done
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
      {footer && <div className="border-t border-line p-3">{footer}</div>}
    </div>
  );
}
