'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useActiveZone } from '@/hooks/use-active-zone';
import { ZONES } from '@/config/navigation';
import { UtilityBar } from './utility-bar';

export function TopBar() {
  const { zone: activeZoneKey } = useActiveZone();
  const prefersReducedMotion = useReducedMotion();

  return (
    <header className="hidden border-b border-[var(--border-default)] bg-[var(--bg-surface)] md:block">
      <div className="flex h-[52px] items-center px-5 lg:px-8">
        {/* Logo */}
        <Link
          href="/portal"
          className="mr-8 flex-shrink-0 font-heading text-[0.72rem] font-medium uppercase tracking-[0.2em] text-[var(--text-primary)] no-underline"
        >
          Patina
        </Link>

        {/* Primary Navigation — 4 Zones */}
        <nav className="flex h-full flex-1 items-stretch gap-0">
          {ZONES.map((zone) => {
            const isActive = activeZoneKey === zone.key;
            return (
              <Link
                key={zone.key}
                href={zone.href}
                className={`relative flex items-center whitespace-nowrap border-b-2 px-[0.85rem] text-[0.75rem] no-underline transition-colors ${
                  isActive
                    ? 'border-[var(--accent-primary)] font-medium text-[var(--text-primary)]'
                    : 'border-transparent font-normal text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {zone.label}
                {isActive && (
                  <motion.span
                    layoutId="zone-indicator"
                    className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--accent-primary)]"
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 380, damping: 30 }
                    }
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Utility Bar — Search, Notifications, Messages, Profile */}
        <UtilityBar />
      </div>
    </header>
  );
}
