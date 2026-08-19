'use client';

/**
 * The Splat projection's dev-only URL override (Rendered Room v2, W2).
 *
 * `?splatUrl=<url>` puts a splat file in front of the stage without a Room File, a
 * trained artifact, or the W2 read path — which is the only way to drive the viewer
 * today, and will stay the way to drive it against a fixture afterwards. A committed
 * fixture lives at `/fixtures/splat/room-fixture.ply`, so:
 *
 *     http://localhost:3000/room/<id>?splatUrl=/fixtures/splat/room-fixture.ply
 *
 * DEV ONLY, AND THAT IS ENFORCED HERE, ONCE. `process.env.NODE_ENV` is inlined at
 * build time, so the production bundle folds the guard to a constant `null` and the
 * parameter is inert in prod — it can never be used to point a designer's stage at
 * an attacker-supplied URL.
 *
 * Only same-origin relative paths are accepted. An absolute URL is refused for the
 * same reason: even in dev, `?splatUrl=https://…` would be a fetch of a third-party
 * host from the portal's origin, which is exactly what the portal's CSP forbids and
 * what the vendored-decoder rule (`public/three/README.md`) exists to prevent.
 */

import { useEffect, useState } from 'react';

/**
 * The override carried by a query string, or null. Pure and total — safe to call
 * with anything, including the empty string.
 */
export function devSplatUrlOverride(search: string): string | null {
  if (process.env.NODE_ENV === 'production') return null;

  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get('splatUrl');
  } catch {
    return null;
  }
  if (!value) return null;

  // Same-origin relative paths only (see the header). `//host/path` is a
  // protocol-relative absolute URL, so a second leading slash disqualifies it.
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/**
 * The override for the live location, resolved after mount.
 *
 * Deliberately not `useSearchParams()`: this reads a dev affordance, and the state
 * starts null on both the server render and the first client render, so it can
 * never cause a hydration mismatch — where a render-time `window.location` read
 * would.
 */
export function useDevSplatUrl(): string | null {
  const [override, setOverride] = useState<string | null>(null);

  useEffect(() => {
    setOverride(devSplatUrlOverride(window.location.search));
  }, []);

  return override;
}
