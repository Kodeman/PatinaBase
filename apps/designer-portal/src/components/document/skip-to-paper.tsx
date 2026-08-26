'use client';

/**
 * F55 — the program's one skip-navigation doorway (WCAG 2.4.1). Mounted as
 * the very first focusable element in the (document) layout, ahead of the
 * Studio Drawer, ⌘K, and every other piece of chrome, so Tab from a cold
 * load reaches it first.
 *
 * Its target is resolved at activation time by attribute/tag rather than an
 * id: the paper `<main data-document-paper>` on `/doc/[id]`
 * (page.tsx:1070–1075) carries the attribute; `/desk`, `/doc/[id]/plans` and
 * `/doc/[id]/spec-book` each render a plain `<main>` with none. page.tsx
 * belongs to no A2 lane, so this link does the finding rather than the page
 * growing an id it doesn't otherwise need.
 */

const PAPER_SELECTOR = '[data-document-paper], main';

function skipToPaper(event: React.MouseEvent | React.KeyboardEvent) {
  event.preventDefault();
  const paper = document.querySelector<HTMLElement>(PAPER_SELECTOR);
  if (!paper) return;
  if (!paper.hasAttribute('tabindex')) paper.setAttribute('tabindex', '-1');
  paper.focus({ preventScroll: false });
}

export function SkipToPaper() {
  return (
    <a
      href="#"
      onClick={skipToPaper}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[999] focus-visible:rounded-[3px] focus-visible:bg-[var(--bg-primary)] focus-visible:px-4 focus-visible:py-2 focus-visible:font-mono focus-visible:text-[12px] focus-visible:uppercase focus-visible:tracking-[0.08em] focus-visible:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
    >
      Skip to the paper
    </a>
  );
}
