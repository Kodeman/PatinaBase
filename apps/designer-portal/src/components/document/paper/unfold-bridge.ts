/**
 * The round-8 unfold, reachable from legacy-path code without loading it.
 *
 * The mounted round-8 frame registers `openUnfold` for the document it prints;
 * a shared component (the margin's note context) asks for that document's
 * opener at click time. No runtime import of round-8 code lives here, so the
 * legacy route's first-load chunks never carry the instrument (G5). With no
 * opener registered for the document, the caller follows its native link.
 */
import type { ReturnContextInput } from '@/lib/document/paper/return-context';
import type { UnfoldAddress } from '@/lib/document/paper/unfold-url';

export type UnfoldOpener = (
  address: UnfoldAddress,
  context: ReturnContextInput,
  opener: Element | null,
) => void;

let registered: { documentId: string; open: UnfoldOpener } | null = null;

/** Register `open` for `documentId`; the returned clear suits an effect cleanup. */
export function registerUnfoldOpener(documentId: string, open: UnfoldOpener): () => void {
  const entry = { documentId, open };
  registered = entry;
  return () => {
    // A frame mounted since keeps its own registration.
    if (registered === entry) registered = null;
  };
}

/** The opener registered for `documentId`, or `null`. */
export function unfoldOpenerFor(documentId: string): UnfoldOpener | null {
  return registered?.documentId === documentId ? registered.open : null;
}
