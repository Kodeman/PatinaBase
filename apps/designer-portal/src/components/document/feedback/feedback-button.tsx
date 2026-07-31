'use client';

/**
 * Keyboard doorway for feedback. The visible invitation now lives in the
 * mobile More menu and the desktop Studio-books hub, so feedback no longer
 * competes with the active work as a persistent floating button.
 */

import { useEffect } from 'react';
import { openFeedbackSheet } from './feedback-sheet';

export function FeedbackButton() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === 'f' || e.key === 'F')
      ) {
        e.preventDefault();
        openFeedbackSheet();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return null;
}
