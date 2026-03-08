'use client';

import { ReactNode } from 'react';

interface VendorsProviderProps {
  children: ReactNode;
}

export function VendorsProvider({ children }: VendorsProviderProps) {
  // Vendor state is managed by the zustand store (vendors-store.ts)
  // This provider is a thin wrapper for future context needs (e.g., prefetching)
  return <>{children}</>;
}
