'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { LoadingStrata, EmptyState } from '@/components/portal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useDesignerProspects, useMovePipelineStage } from '@/hooks/use-pipelines';
import {
  DESIGNER_PROSPECT_STAGE_LABELS,
  designerProspectColumns,
} from '@/lib/pipeline-stages';
import { PipelineDndBoard, type PipelineColumnDef } from './pipeline-dnd-board';
import { DesignerProspectCard } from './designer-prospect-card';
import { NewProspectDialog } from './new-prospect-dialog';
import type { DesignerProspect } from '@/services/pipelines';

export function DesignersBoard() {
  const [showArchived, setShowArchived] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const { data: prospects, isLoading, isError, error } = useDesignerProspects();
  const moveStage = useMovePipelineStage();
  const { toast } = useToast();

  const columns: PipelineColumnDef[] = designerProspectColumns(showArchived).map((stage) => ({
    id: stage,
    label: DESIGNER_PROSPECT_STAGE_LABELS[stage],
  }));

  const handleMove = (entityId: string, toStage: string) => {
    moveStage.mutate(
      { entityType: 'designer_prospect', entityId, toStage },
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
            data-testid="designers-show-archived"
          />
          Show archived (passed)
        </label>
        <Button onClick={() => setNewOpen(true)} data-testid="new-prospect-button">
          <Plus className="mr-2 h-4 w-4" />
          New prospect
        </Button>
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : isError ? (
        <EmptyState label="Error" message={(error as Error)?.message ?? 'Failed to load prospects'} />
      ) : !prospects || prospects.length === 0 ? (
        <EmptyState
          label="No prospects"
          message="No designer prospects yet. Add one to start the recruiting pipeline."
        />
      ) : (
        <PipelineDndBoard<DesignerProspect>
          columns={columns}
          items={prospects}
          getId={(p) => p.id}
          getStage={(p) => p.stage}
          onMove={handleMove}
          renderCard={(prospect, { dragHandleProps }) => (
            <DesignerProspectCard
              prospect={prospect}
              dragHandleProps={dragHandleProps}
              onMove={(toStage) => handleMove(prospect.id, toStage)}
              moving={moveStage.isPending}
            />
          )}
        />
      )}

      <NewProspectDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
