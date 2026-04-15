'use client';

import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { VendorTable } from '@/components/pipeline/vendor-table';
import type { VendorListFilters } from '@/services/vendor-pipeline';

export default function OnboardingPage() {
  const [sortBy, setSortBy] = useState<NonNullable<VendorListFilters['sort_by']>>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSortChange = (key: NonNullable<VendorListFilters['sort_by']>) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Rocket className="h-7 w-7" />
          Onboarding
        </h1>
        <p className="text-muted-foreground">
          Vendors actively being onboarded to Patina.
        </p>
      </div>
      <VendorTable
        filters={{ stage: 'onboarding', sort_by: sortBy, sort_dir: sortDir }}
        onSortChange={handleSortChange}
        emptyLabel="No vendors are currently onboarding."
      />
    </div>
  );
}
