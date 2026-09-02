/**
 * The one doorway into "leave a note", from anywhere: dispatches
 * `document:open-feedback` (the Tester Notes widget opens on its New tab) and
 * kicks off the screenshot in parallel, delivering it back on
 * `document:feedback-screenshot` — so the panel appears instantly and the shot
 * fills in a beat later, never blocking capture.
 *
 * Lives in its own module (not beside a component) so ⌘K, the widget, and the
 * ledger can all reach it without an import cycle.
 */

import type { FeedbackBucket } from '@patina/supabase';
import { captureScreenshot } from '@/lib/document/feedback';

interface OpenDetail {
  bucket?: FeedbackBucket;
}

/** `bucket` pre-selects (e.g. a one-tap "Working"). */
export function openFeedbackSheet(opts?: OpenDetail) {
  // Capture starts first, but the open is still dispatched synchronously: the
  // panel (and with it the form's screenshot listener) is mounted before the
  // blob can resolve a beat later.
  const shot = captureScreenshot();
  window.dispatchEvent(
    new CustomEvent('document:open-feedback', { detail: opts ?? {} }),
  );
  shot.then((blob) => {
    window.dispatchEvent(
      new CustomEvent('document:feedback-screenshot', { detail: blob }),
    );
  });
}
