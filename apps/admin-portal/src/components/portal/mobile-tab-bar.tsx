'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ZONES } from '@/config/navigation';

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border-default)] bg-[var(--bg-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex h-[52px] items-center justify-around">
        {ZONES.map((zone) => {
          const isActive = zone.paths.some(
            (p) => pathname === p || pathname.startsWith(p + '/')
          );
          const Icon = zone.icon;

          return (
            <Link
              key={zone.key}
              href={zone.href as any}
              className={`relative flex flex-col items-center gap-[3px] no-underline ${
                isActive
                  ? 'text-[var(--accent-primary)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.5} />
              <span className="type-meta-small">{zone.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
