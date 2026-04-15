'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
  value: controlledValue,
  onValueChange,
  defaultValue,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || '');
  const value = controlledValue ?? internalValue;
  const handleValueChange = onValueChange ?? setInternalValue;

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-stretch gap-0 border-b border-[var(--border-default)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within Tabs');

  const isActive = context.value === value;

  return (
    <button
      type="button"
      onClick={() => context.onValueChange(value)}
      className={cn(
        'relative inline-flex items-center whitespace-nowrap px-[0.85rem] py-2.5 text-[0.75rem] transition-colors first:pl-0',
        'focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'font-medium text-[var(--text-primary)] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-[var(--accent-primary)]'
          : 'font-normal text-[var(--text-muted)] hover:text-[var(--text-primary)]',
        className
      )}
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');

  if (context.value !== value) return null;

  return (
    <div
      className={cn(
        'mt-6 focus-visible:outline-none',
        className
      )}
    >
      {children}
    </div>
  );
}
