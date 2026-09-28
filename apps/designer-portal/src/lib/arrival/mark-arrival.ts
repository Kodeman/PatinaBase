/**
 * US-14 arrival — the write-only anchor (CONTRACT D3). Fire-and-forget: a plain rpc with every
 * outcome swallowed. Never a react-query mutation (react-query.ts raises the red toast on any
 * mutation error without `meta.errorSurface`), never a throw, never a toast.
 */
import { createBrowserClient } from '@patina/supabase';
import type { Surface } from './types';

type LooseRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<unknown>;

const noop = () => {};

export function markArrival(surface: Surface, engagementId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    // `mark_arrival` (00675) is newer than the generated RPC names; database.types.ts is not regenerated in W2.
    const supabase = createBrowserClient() as unknown as { rpc: LooseRpc };
    supabase.rpc('mark_arrival', {
      p_scope: surface,
      p_engagement_id: surface === 'desk' ? null : engagementId,
    }).then(noop, noop);
  } catch {
    /* no client, no network: the anchor simply is not written */
  }
}
