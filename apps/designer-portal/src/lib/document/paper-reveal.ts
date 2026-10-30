/**
 * RC7-E8-4 — the round-8 paper's reveal marks, as a leaf module any landing can
 * import (the sampler that writes them in paper order is
 * `components/document/frame/use-chapter-reveal.ts`; round8.css holds every
 * paper child below the cover until it carries `data-paper-shown`).
 */

export const SHOWN_ATTRIBUTE = 'data-paper-shown';
/** round8.css's per-chapter `doc-fade` delay: nothing is held past it. */
export const REVEAL_FAILSAFE_MS = 3500;

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

/**
 * RC7-E8-5 — call `onReady` once the round-8 paper's own progressive reveal has
 * reached `target`: the child holding it carries the shown mark (so everything
 * above it has settled), or the lens has resolved the whole paper, or
 * `REVEAL_FAILSAFE_MS` has passed (by then the CSS failsafe shows every child).
 * It never reveals anything itself. A landing that is not the reader's own act
 * waits here instead of force-revealing chapters whose bodies are still
 * loading, which then grow and shove the target. Outside a round-8 paper, or
 * for the cover (never held), it is ready at once. Returns the cancel.
 */
export function whenRevealedThrough(target: Element, onReady: () => void): () => void {
  const paper = target.closest('[data-paper-renderer="round8"] [data-document-paper]');
  const shell = paper?.closest('[data-document-shell]') ?? null;
  const holder = paper ? heldChildren(paper).find((child) => child.contains(target)) : undefined;
  const ready = () =>
    !holder || holder.hasAttribute(SHOWN_ATTRIBUTE) || !!shell?.hasAttribute('data-lens-resolved');
  if (ready()) {
    onReady();
    return () => {};
  }
  let settled = false;
  const stop = () => {
    settled = true;
    observer.disconnect();
    window.clearTimeout(timer);
  };
  const finish = () => {
    if (settled) return;
    stop();
    onReady();
  };
  const observer = new MutationObserver(() => {
    if (ready()) finish();
  });
  observer.observe(holder!, { attributes: true, attributeFilter: [SHOWN_ATTRIBUTE] });
  if (shell) observer.observe(shell, { attributes: true, attributeFilter: ['data-lens-resolved'] });
  const timer = window.setTimeout(finish, REVEAL_FAILSAFE_MS);
  return stop;
}
