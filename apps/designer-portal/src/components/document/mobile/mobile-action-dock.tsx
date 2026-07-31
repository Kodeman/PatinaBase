'use client';

/**
 * Compatibility mount for the former second mobile action shelf.
 *
 * The active action now renders inside MobileBar so the thumb edge has one
 * owner. Keeping this no-op component lets the document layout roll forward
 * without creating a second fixed band for existing callers.
 */
export function MobileActionDock() {
  return null;
}
