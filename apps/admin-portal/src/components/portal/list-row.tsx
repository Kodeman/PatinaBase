'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode, MouseEventHandler } from 'react';

interface ListRowProps {
  title: ReactNode;
  /** Secondary meta — strings are joined with ·; ReactNodes render verbatim */
  meta?: Array<string | ReactNode | undefined | null | false>;
  /** Right-aligned content: action buttons, status dot, or a score */
  right?: ReactNode;
  /** Navigate to href on click (string) */
  href?: string;
  /** Custom click handler */
  onClick?: MouseEventHandler<HTMLDivElement>;
  /** Optional leading element (avatar, thumbnail) */
  leading?: ReactNode;
  className?: string;
}

export function ListRow({
  title,
  meta,
  right,
  href,
  onClick,
  leading,
  className = '',
}: ListRowProps) {
  const router = useRouter();

  const metaItems = (meta ?? []).filter((m): m is string | ReactNode => Boolean(m));

  const handleClick: MouseEventHandler<HTMLDivElement> = (e) => {
    if (onClick) return onClick(e);
    if (href) router.push(href as any);
  };

  const clickable = !!(href || onClick);

  return (
    <div
      onClick={clickable ? handleClick : undefined}
      className={`group relative grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-[var(--border-subtle)] bg-transparent px-0 py-5 transition-all ${
        clickable
          ? 'cursor-pointer hover:-translate-y-[1px] hover:bg-[var(--bg-hover)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
          : ''
      } ${className}`}
      style={{ transitionDuration: 'var(--duration-fast)' }}
    >
      {leading ? <div className="flex-shrink-0">{leading}</div> : <div />}
      <div className="min-w-0">
        <div className="type-item-name truncate">{title}</div>
        {metaItems.length > 0 && (
          <div className="type-label-secondary mt-0.5 truncate">
            {metaItems.map((m, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1.5 text-[var(--text-subtle)]">·</span>}
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
      {right && <div className="flex items-center gap-4">{right}</div>}
    </div>
  );
}
