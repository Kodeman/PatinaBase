'use client';

import { useState } from 'react';
import { LoadingStrata, EmptyState } from '@/components/portal';
import { useToast } from '@/components/ui/use-toast';
import { usePipelineVendorsBoard, useMovePipelineStage } from '@/hooks/use-pipelines';
import { VENDOR_STAGE_LABELS, VENDOR_STAGE_SUBLABELS, vendorColumns } from '@/lib/pipeline-stages';
import { PipelineDndBoard, type PipelineColumnDef } from './pipeline-dnd-board';
import { MakerVendorCard } from './maker-vendor-card';
import type { VendorPipeline } from '@patina/types';

type Vendor = VendorPipeline.Vendor;

export function MakersBoard() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: vendors, isLoading, isError, error } = usePipelineVendorsBoard();
  const moveStage = useMovePipelineStage();
  const { toast } = useToast();

  const columns: PipelineColumnDef[] = vendorColumns(showArchived).map((stage) => ({
    id: stage,
    label: VENDOR_STAGE_LABELS[stage],
    sublabel: VENDOR_STAGE_SUBLABELS[stage],
  }));

  const handleMove = (entityId: string, toStage: string) => {
    moveStage.mutate(
      { entityType: 'pipeline_vendor', entityId, toStage },
      {
        onError: (err) => {
          toast({
            title: 'Move failed',
            description: (err as Error).message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <label className="flex items-center gap-2 text-[0.72rem] text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            data-testid="makers-show-archived"
          />
          Show archived (paused, rejected)
        </label>
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : isError ? (
        <EmptyState label="Error" message={(error as Error)?.message ?? 'Failed to load vendors'} />
      ) : !vendors || vendors.length === 0 ? (
        <EmptyState
          label="No vendors"
          message="No maker pipeline vendors yet. Add one from the Vendor Pipeline page."
        />
      ) : (
        <PipelineDndBoard<Vendor>
          columns={columns}
          items={vendors}
          getId={(v) => v.id}
          getStage={(v) => v.stage}
          onMove={handleMove}
          renderCard={(vendor, { dragHandleProps }) => (
            <MakerVendorCard
              vendor={vendor}
              dragHandleProps={dragHandleProps}
              onMove={(toStage) => handleMove(vendor.id, toStage)}
              moving={moveStage.isPending}
            />
          )}
        />
      )}
    </div>
  );
}
