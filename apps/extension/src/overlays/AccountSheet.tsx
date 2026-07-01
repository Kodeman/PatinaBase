/** T2 — Account. Identity, version + update status, sign out. Single workspace. */
import { useCapture } from '../state/CaptureProvider';
import { OverlaySheet } from '../panel/OverlaySheet';
import { useUpdateCheck } from '../hooks/use-update-check';
import { supabase } from '../lib/supabase';
import { resetAnalytics } from '../lib/analytics';

export function AccountSheet() {
  const { session } = useCapture();
  const update = useUpdateCheck();
  const version = chrome.runtime.getManifest().version;
  const email = session.user?.email ?? '—';

  const signOut = async () => {
    resetAnalytics();
    await supabase.auth.signOut();
  };

  return (
    <OverlaySheet title="Account">
      <dl className="space-y-0">
        <div className="flex items-center justify-between border-b border-line py-3">
          <dt className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-soft">
            Signed in
          </dt>
          <dd className="text-[0.85rem] text-ink">{email}</dd>
        </div>
        <div className="flex items-center justify-between border-b border-line py-3">
          <dt className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-soft">
            Version
          </dt>
          <dd className="text-[0.85rem] text-ink">
            v{version}
            {update.hasUpdate ? (
              <span className="ml-2 text-verdigris">update available</span>
            ) : (
              <span className="ml-2 text-ink-soft">up to date</span>
            )}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={signOut}
        className="mt-5 w-full rounded-md border border-line py-2.5 text-[0.85rem] font-medium text-rust transition-colors hover:border-rust hover:bg-rust/5"
      >
        Sign out
      </button>
    </OverlaySheet>
  );
}
