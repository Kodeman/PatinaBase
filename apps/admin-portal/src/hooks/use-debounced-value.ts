'use client';

import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value (a search input) so downstream queries
 * fire once the user pauses rather than on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
