export const OPEN_LIBRARY_CAPTURE_EVENT = "document:open-library-capture";

export function requestLibraryCapture(): void {
  window.dispatchEvent(new Event(OPEN_LIBRARY_CAPTURE_EVENT));
}

export function subscribeToLibraryCapture(onOpen: () => void): () => void {
  window.addEventListener(OPEN_LIBRARY_CAPTURE_EVENT, onOpen);
  return () => window.removeEventListener(OPEN_LIBRARY_CAPTURE_EVENT, onOpen);
}
