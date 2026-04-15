'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PipelineMetricsRow } from '@/components/pipeline/pipeline-metrics';
import { LeahQueueBanner } from '@/components/pipeline/leah-queue-banner';
import { VendorTable } from '@/components/pipeline/vendor-table';
import { AddVendorDialog } from '@/components/pipeline/add-vendor-dialog';
import { CoworkStatusIndicator } from '@/components/pipeline/cowork-status-indicator';
import { PageHeader, Section } from '@/components/portal';
import type { VendorListFilters } from '@/services/vendor-pipeline';
import type { VendorPipeline } from '@patina/types';

type VendorStage = VendorPipeline.VendorStage;
type TriageLevel = VendorPipeline.TriageLevel;

export default function PipelinePage() {
  const [stage, setStage] = useState<VendorStage | 'all'>('all');
  const [triage, setTriage] = useState<TriageLevel | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] =
    useState<NonNullable<VendorListFilters['sort_by']>>('total_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [addOpen, setAddOpen] = useState(false);

  const filters: VendorListFilters = {
    stage: stage === 'all' ? undefined : stage,
    triage_level: triage === 'all' ? undefined : triage,
    sort_by: sortBy,
    sort_dir: sortDir,
    search: search.trim() || undefined,
  };

  const handleSortChange = (nextKey: NonNullable<VendorListFilters['sort_by']>) => {
    if (sortBy === nextKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(nextKey);
      setSortDir(nextKey === 'total_score' ? 'desc' : 'asc');
    }
  };

  return (
    <div>
      <PageHeader
        title="Vendor"
        accent="Pipeline"
        description="Track furniture manufacturers from discovery to live partnership."
        actions={
          <div className="flex items-center gap-2">
            <CoworkStatusIndicator />
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add vendor
            </Button>
          </div>
        }
      />

      <div className="mt-10">
        <PipelineMetricsRow />
      </div>

      <div className="mt-6">
        <LeahQueueBanner />
      </div>

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Select value={stage} onValueChange={(v) => setStage(v as VendorStage | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              <SelectItem value="discovery">Discovery</SelectItem>
              <SelectItem value="qualification">Qualification</SelectItem>
              <SelectItem value="outreach">Outreach</SelectItem>
              <SelectItem value="negotiation">Negotiation</SelectItem>
              <SelectItem value="onboarding">Onboarding</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={triage} onValueChange={(v) => setTriage(v as TriageLevel | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All triage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All triage levels</SelectItem>
              <SelectItem value="green">Green (400+)</SelectItem>
              <SelectItem value="yellow">Yellow (300–399)</SelectItem>
              <SelectItem value="orange">Orange (200–299)</SelectItem>
              <SelectItem value="red">Red (below 200)</SelectItem>
            </SelectContent>
          </Select>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors…"
            className="max-w-xs"
          />
        </div>

        <VendorTable filters={filters} onSortChange={handleSortChange} />
      </Section>

      <AddVendorDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
