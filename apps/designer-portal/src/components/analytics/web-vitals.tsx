'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { captureAnalyticsEvent } from '@/lib/analytics/posthog';

const SAMPLE_RATE = 0.1;
const sampled = Math.random() < SAMPLE_RATE;

const ROUTE_TEMPLATES: Array<[RegExp, string]> = [
  [/^\/doc\/[^/]+\/pieces\/finishes\/print$/, '/doc/[id]/pieces/finishes/print'],
  [/^\/doc\/[^/]+\/pieces\/finishes$/, '/doc/[id]/pieces/finishes'],
  [/^\/doc\/[^/]+\/spec-book$/, '/doc/[id]/spec-book'],
  [/^\/doc\/[^/]+\/plans$/, '/doc/[id]/plans'],
  [/^\/doc\/[^/]+\/pieces$/, '/doc/[id]/pieces'],
  [/^\/doc\/[^/]+\/boards$/, '/doc/[id]/boards'],
  [/^\/doc\/[^/]+$/, '/doc/[id]'],
  [/^\/invoices\/[^/]+\/print$/, '/invoices/[invoiceId]/print'],
  [/^\/invoices\/[^/]+$/, '/invoices/[invoiceId]'],
  [/^\/board\/[^/]+$/, '/board/[boardId]'],
  [/^\/ceremony\/[^/]+$/, '/ceremony/[leadId]'],
  [/^\/library\/[^/]+$/, '/library/[id]'],
  [/^\/room\/[^/]+\/file$/, '/room/[id]/file'],
  [/^\/room\/[^/]+$/, '/room/[id]'],
  [/^\/drafting\/[^/]+$/, '/drafting/[proposalId]'],
  [/^\/help\/topic\/[^/]+$/, '/help/topic/[prefix]'],
  [/^\/help\/[^/]+$/, '/help/[surfaceKey]'],
];

const STATIC_ROUTES = new Set([
  '/', '/desk', '/preferences', '/invoices', '/board', '/ceremony', '/library',
  '/room', '/drafting', '/boards', '/compose', '/people', '/auth/signin',
  '/auth/signup', '/auth/forgot-password', '/auth/reset-password', '/help',
  '/privacy', '/terms', '/pilot-terms',
]);

export function routeTemplate(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0] || '/';
  return ROUTE_TEMPLATES.find(([pattern]) => pattern.test(path))?.[1] ??
    (STATIC_ROUTES.has(path) ? path : '/[other]');
}

export function webVitalProperties(
  metric: { name: string; value: number; rating: string; navigationType: string },
  pathname: string,
) {
  return {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
    route: routeTemplate(pathname),
  };
}

function send(event: string, properties: Record<string, string | number>) {
  if (!sampled) return;
  captureAnalyticsEvent(event, properties);
}

export function WebVitals() {
  useReportWebVitals((metric) => {
    send('portal_web_vital', webVitalProperties(metric, window.location.pathname));
  });

  return <PortalUsable />;
}

function PortalUsable() {
  const pathname = usePathname();
  const route = routeTemplate(pathname || '/');
  const currentNavigation = useRef<{ kind: 'hard' | 'spa'; route: string; id: number } | null>(null);
  const navigationId = useRef(0);

  useEffect(() => {
    // Hard-load denominator. A later pathname change is a separate SPA navigation.
    if (!currentNavigation.current) {
      currentNavigation.current = { kind: 'hard', route, id: ++navigationId.current };
      send('portal_nav_started', { route, kind: 'hard' });
    }
  }, [pathname, route]);

  useEffect(() => {
    const start = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === '_blank') return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || target.pathname === window.location.pathname) return;
      const nextRoute = routeTemplate(target.pathname);
      const id = ++navigationId.current;
      currentNavigation.current = { kind: 'spa', route: nextRoute, id };
      send('portal_nav_started', { route: nextRoute, kind: 'spa' });
    };
    document.addEventListener('click', start, true);
    return () => document.removeEventListener('click', start, true);
  }, []);

  useEffect(() => {
    const nav = currentNavigation.current;
    if (!nav || nav.route !== route) return;
    let fired = false;
    let frame = 0;
    const checkUsable = () => {
      const main = document.querySelector('main');
      const held = document.documentElement.classList.contains('arr-pre') ||
        document.documentElement.classList.contains('arr-on') ||
        Boolean(main?.querySelector('[data-arrival-held]'));
      const busySelector = '[aria-busy="true"], .animate-pulse, .strata-sweep, [data-skeleton]';
      const busyPlaceholder = main && Array.from(main.querySelectorAll(busySelector)).some((element) => {
        const rect = element.getBoundingClientRect();
        const visible = typeof element.checkVisibility !== 'function' ||
          element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
        return visible && rect.height > 0;
      });
      const busy = Boolean(busyPlaceholder) || /Picking up/.test(document.body.innerText || '');
      // Mirrors baseline/harness/lab.mjs's usability gate: after route commit,
      // wait for arrival holds and visible busy placeholders to clear. Main presence is the route-agnostic
      // committed-content signal in place of the harness's scenario selector.
      if (!fired && main && !main.hasAttribute('aria-busy') && !main.querySelector('[aria-busy="true"]') && !held && !busy) {
        fired = true;
        send('portal_usable', { route: nav.route, kind: nav.kind });
      }
      if (!fired && currentNavigation.current?.id === nav.id) frame = requestAnimationFrame(checkUsable);
    };
    frame = requestAnimationFrame(checkUsable);
    return () => cancelAnimationFrame(frame);
  }, [pathname, route]);

  return null;
}
