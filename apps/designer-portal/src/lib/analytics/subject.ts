/**
 * US-34 F1 — analytics belong to the signed-in subject whose work they record.
 *
 * The subject boundary fences a retired QueryClient's attempts and handlers,
 * but not the components awaiting its `mutateAsync`: a save of A's still in
 * flight at a switch resolves afterwards, and a capture made then goes out
 * under B's PostHog identity. Take `forThisSubject()` when the action begins,
 * before it awaits, and capture through what it returns.
 */

/** Counts the signed-in subjects that have left (see `retireAnalyticsSubject`). */
let retired = 0;

/** Called by the subject boundary when the signed-in subject leaves. */
export function retireAnalyticsSubject(): void {
  retired += 1;
}

/**
 * Runs a capture only while the subject on screen when this was taken is
 * still signed in; one made after the subject left is dropped.
 */
export function forThisSubject(): <Args extends unknown[]>(
  capture: (...args: Args) => void,
  ...args: Args
) => void {
  const began = retired;
  return (capture, ...args) => {
    if (began === retired) capture(...args);
  };
}
