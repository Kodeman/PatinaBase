'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { consumeCheckoutReturn } from '@/lib/threshold/checkout-return';
import { galleryRoute, type GalleryRoute } from '@/lib/threshold/gallery-route';
import { useScrollLock } from './use-scroll-lock';
import './gallery.css';

function overlayRoute(route: GalleryRoute): boolean {
  return !['page', 'scroll'].includes(route.kind);
}

function modifiedClick(event: MouseEvent): boolean {
  return event.defaultPrevented || event.button !== 0 || [event.metaKey, event.ctrlKey, event.shiftKey, event.altKey].some(Boolean);
}

function localAnchor(event: MouseEvent): string | null {
  if (modifiedClick(event) || !(event.target instanceof Element)) return null;
  const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
  if (!link) return null;
  if (link.matches('[target="_blank"], [download]')) return null;
  return link.getAttribute('href');
}

function scrollRoute(route: GalleryRoute) {
  if (route.kind !== 'scroll') return;
  requestAnimationFrame(() => document.getElementById(route.anchor)?.scrollIntoView());
}

function syncDialog(node: HTMLDialogElement | null, open: boolean) {
  if (!node || node.open === open) return;
  if (open) node.showModal();
  else node.close();
}

function revealAnchor(node: HTMLDialogElement | null, anchor?: string) {
  if (!node || !anchor) return;
  const target = document.getElementById(anchor);
  if (target && node.contains(target)) target.scrollIntoView({ block: 'start' });
}

/** One history entry for an overlay, including navigation between its contents. */
export function useGalleryRoute() {
  const [route, setRoute] = useState<GalleryRoute>({ kind: 'page' });
  const opener = useRef<HTMLElement | null>(null);
  const historyKey = useId();
  const active = overlayRoute(route);

  const restoreFocus = useCallback(() => {
    const target = opener.current;
    opener.current = null;
    requestAnimationFrame(() => { if (target?.isConnected) target.focus(); });
  }, []);

  const navigate = useCallback((hash: string) => {
    const next = galleryRoute(hash, consumeCheckoutReturn());
    const open = overlayRoute(next);
    if (!active) opener.current = document.activeElement as HTMLElement;
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    const state = { ...window.history.state, gallery: open ? historyKey : null };
    if (active) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
    setRoute(next);
    if (!open) {
      restoreFocus();
      scrollRoute(next);
    }
  }, [active, historyKey, restoreFocus]);

  const dismiss = useCallback(() => {
    if (window.history.state?.gallery === historyKey) window.history.back();
    else {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
      setRoute({ kind: 'page' });
      restoreFocus();
    }
  }, [historyKey, restoreFocus]);

  useEffect(() => {
    const read = () => {
      const next = galleryRoute(window.location.hash, consumeCheckoutReturn());
      setRoute(next);
      if (!overlayRoute(next)) restoreFocus();
    };
    read();
    window.addEventListener('hashchange', read);
    window.addEventListener('popstate', read);
    return () => {
      window.removeEventListener('hashchange', read);
      window.removeEventListener('popstate', read);
    };
  }, [restoreFocus]);

  useEffect(() => {
    const follow = (event: MouseEvent) => {
      const hash = localAnchor(event);
      if (!hash) return;
      if (!active && !overlayRoute(galleryRoute(hash))) return;
      event.preventDefault();
      navigate(hash);
    };
    document.addEventListener('click', follow);
    return () => document.removeEventListener('click', follow);
  }, [active, navigate]);

  return { route, active, navigate, dismiss };
}

/** Native dialog supplies modal focus containment and makes the page behind inert. */
export function GalleryDrawer({ open, title, onDismiss, anchor, children }: {
  open: boolean;
  title: string;
  onDismiss: () => void;
  anchor?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useScrollLock(open);
  useLayoutEffect(() => {
    const node = dialog.current;
    syncDialog(node, open);
    if (open) revealAnchor(node, anchor);
  }, [open, anchor]);
  return <dialog ref={dialog} aria-labelledby={heading} className="gallery-drawer"
    onCancel={(event) => { event.preventDefault(); onDismiss(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onDismiss(); }}>
    <div className="gallery-drawer-paper">
      <header className="gallery-drawer-head">
        <h2 id={heading}>{title}</h2>
        <button type="button" onClick={onDismiss} autoFocus>Close</button>
      </header>
      {children}
    </div>
  </dialog>;
}
