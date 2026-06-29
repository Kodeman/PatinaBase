/** Panel header — mark, product/vendor toggle, re-read, sign out. */
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { useController } from './controller-context';

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] transition-colors ${
        active ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

export function ConnectionStrip() {
  const { nav } = useCapture();
  const dispatch = useCaptureDispatch();
  const { refresh, switchToVendor, switchToProduct, currentUrl } = useController();
  const isVendor = nav.screen === 'vendor';

  return (
    <header className="border-b border-line px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-display text-[1.05rem] text-ink">
          <span
            className="inline-block h-[14px] w-[14px] rounded-sm"
            style={{
              background:
                'conic-gradient(from 210deg, var(--brass-2), var(--verdigris), var(--rust-2), var(--brass-2))',
            }}
          />
          Patina
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refresh}
            disabled={!currentUrl}
            title="Re-read this page"
            className="text-[0.95rem] text-ink-soft hover:text-ink disabled:opacity-40"
          >
            ⟳
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'U1' })}
            title="Recent captures"
            className="font-mono text-[0.85rem] text-ink-soft hover:text-ink"
          >
            ◷
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'T1' })}
            title="Settings"
            className="text-[0.95rem] text-ink-soft hover:text-ink"
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'T2' })}
            title="Account"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[0.6rem] text-ink-soft hover:border-ink-soft hover:text-ink"
          >
            ◓
          </button>
        </div>
      </div>
      <div className="mt-2 flex gap-1 rounded-md border border-line p-0.5">
        <Toggle active={!isVendor} onClick={switchToProduct}>
          Product
        </Toggle>
        <Toggle active={isVendor} onClick={switchToVendor}>
          Vendor
        </Toggle>
      </div>
    </header>
  );
}
