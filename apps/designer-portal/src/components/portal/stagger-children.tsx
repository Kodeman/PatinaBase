'use client';

import { Children, cloneElement, isValidElement, type ReactNode } from 'react';

interface StaggerChildrenProps {
  children: ReactNode;
  interval?: number;
  baseDelay?: number;
  className?: string;
}

export function StaggerChildren({
  children,
  interval = 60,
  baseDelay = 0,
  className,
}: StaggerChildrenProps) {
  return (
    <div className={className}>
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;
        return (
          <div
            className="min-w-0 animate-section-enter"
            style={{ animationDelay: `${baseDelay + index * interval}ms` }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
