'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/* Q3: a chapter's first three children rise 12px and fade in once, when the
   chapter first scrolls into view. The server render and anything already on
   screen are never hidden; reduced motion gets no reveal at all. */

type RevealState = 'idle' | 'pending' | 'shown';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches);
}

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RevealState>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState('pending');
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setState('shown');
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={['ed-reveal', className].filter(Boolean).join(' ')} data-reveal={state}>
      {children}
    </div>
  );
}
