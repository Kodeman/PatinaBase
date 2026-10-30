/**
 * RC7-E8-4 — the round-8 paper's reveal marks, as a leaf module any landing can
 * import (the sampler that writes them in paper order is
 * `components/document/frame/use-chapter-reveal.ts`; round8.css holds every
 * paper child below the cover until it carries `data-paper-shown`).
 */

export const SHOWN_ATTRIBUTE = 'data-paper-shown';

/** The paper's held children, in paper order: everything below the cover. */
export function heldChildren(paper: Element): HTMLElement[] {
  return Array.from(paper.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.hasAttribute('data-paper-cover'),
  );
}

/** Mark every child up to and including the one holding `target`. */
export function revealThrough(paper: Element, target: Element | null): void {
  if (!target) return;
  const children = heldChildren(paper);
  const index = children.findIndex((child) => child.contains(target));
  for (let i = 0; i <= index; i++) children[i]!.setAttribute(SHOWN_ATTRIBUTE, '');
}

/** Reveal through `target` when it lies in a round-8 paper. A landing that
 *  scrolls on its own calls this before its scroll. */
export function revealPaperThrough(target: Element | null): void {
  const paper = target?.closest('[data-paper-renderer="round8"] [data-document-paper]');
  if (paper) revealThrough(paper, target);
}

/** `el.scrollIntoView(options)`, with its chapter and all above it revealed
 *  first — even when the scroll itself is a no-op (the target already sits in
 *  view). Every scroll to an element of the paper goes through here. */
export function scrollIntoRevealed(el: Element | null | undefined, options?: ScrollIntoViewOptions): void {
  if (!el) return;
  revealPaperThrough(el);
  el.scrollIntoView?.(options);
}
