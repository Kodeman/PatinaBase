'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Local tab strip for Mission Control (Inbox | Runs). Styled to match the
// portal FilterTabs (hairline underline, DM-Mono-ish meta) but these are real
// route links, not filter toggles. The Runs page ships in W1.D — the link may
// 404 locally until then, which is expected.

const TABS: { label: string; href: string; exact: boolean }[] = [
  { label: 'Inbox', href: '/mission-control', exact: true },
  { label: 'Runs', href: '/mission-control/runs', exact: false },
];

export function MissionControlTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-stretch gap-0 border-b border-[var(--border-default)]">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href as any}
            data-testid={`mc-tab-${tab.label.toLowerCase()}`}
            className={`relative flex items-center whitespace-nowrap px-[0.85rem] py-2.5 text-[0.75rem] no-underline transition-colors first:pl-0 ${
              active
                ? 'font-medium text-[var(--text-primary)]'
                : 'font-normal text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {tab.label}
            {active && (
              <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--accent-primary)]" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
