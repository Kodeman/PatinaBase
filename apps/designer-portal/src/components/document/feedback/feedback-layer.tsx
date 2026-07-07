'use client';

/**
 * The feedback layer's mount point — the persistent button + the capture sheet,
 * wrapped in a single data-feedback-layer element so the screenshotter excludes
 * the whole layer (the shot is the screen, never the button or sheet, R7.2.4).
 * Mounted once in the (document) layout, so it rides every Desk screen.
 */

import { FeedbackButton } from './feedback-button';
import { FeedbackSheet } from './feedback-sheet';
import { FeedbackNudge } from './feedback-nudge';

export function FeedbackLayer() {
  return (
    <div data-feedback-layer>
      <FeedbackButton />
      <FeedbackNudge />
      <FeedbackSheet />
    </div>
  );
}
