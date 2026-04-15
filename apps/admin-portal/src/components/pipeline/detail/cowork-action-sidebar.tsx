'use client';

import {
  Bot,
  FileText,
  Mail,
  Rocket,
  RefreshCcw,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCreateCoworkTask, useAdvanceStage } from '@/hooks/use-pipeline';
import { useToast } from '@/components/ui/use-toast';
import type { VendorPipeline } from '@patina/types';

type Vendor = VendorPipeline.Vendor;
type CoworkTaskType = VendorPipeline.CoworkTaskType;
type VendorStage = VendorPipeline.VendorStage;

const STAGE_OPTIONS: VendorStage[] = [
  'discovery',
  'qualification',
  'outreach',
  'negotiation',
  'onboarding',
  'live',
  'paused',
  'rejected',
];

export function CoworkActionSidebar({ vendor }: { vendor: Vendor }) {
  const { toast } = useToast();
  const createTask = useCreateCoworkTask();
  const advanceStage = useAdvanceStage(vendor.slug);

  const trigger = async (taskType: CoworkTaskType, label: string) => {
    try {
      await createTask.mutateAsync({
        task_type: taskType,
        vendor_id: vendor.id,
        input_payload: { vendor_slug: vendor.slug },
      });
      toast({ title: `${label} queued for Cowork` });
    } catch (err) {
      toast({
        title: 'Failed to queue task',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleBeginOnboarding = async () => {
    try {
      await advanceStage.mutateAsync('onboarding');
      await createTask.mutateAsync({
        task_type: 'ingest_feed',
        vendor_id: vendor.id,
        input_payload: { vendor_slug: vendor.slug },
      });
      toast({ title: 'Onboarding started · feed ingestion queued' });
    } catch (err) {
      toast({
        title: 'Failed to begin onboarding',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleStageChange = async (stage: VendorStage) => {
    try {
      await advanceStage.mutateAsync(stage);
      toast({ title: `Stage → ${stage}` });
    } catch (err) {
      toast({
        title: 'Failed to change stage',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <aside className="space-y-2">
      <div className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
        Cowork actions
      </div>
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => trigger('rescore', 'Rescore')}
        disabled={createTask.isPending}
      >
        <RefreshCcw className="mr-2 h-4 w-4" />
        Re-score with Cowork
      </Button>
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => trigger('generate_brief', 'Brief')}
        disabled={createTask.isPending}
      >
        <FileText className="mr-2 h-4 w-4" />
        Generate brief
      </Button>
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => trigger('draft_email', 'Outreach email')}
        disabled={createTask.isPending}
      >
        <Mail className="mr-2 h-4 w-4" />
        Draft outreach email
      </Button>
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => trigger('auto_score', 'Auto-score')}
        disabled={createTask.isPending}
      >
        <Bot className="mr-2 h-4 w-4" />
        Auto-score dims 1–4
      </Button>

      <div className="pt-4 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
        Stage
      </div>
      <Button
        className="w-full justify-start"
        onClick={handleBeginOnboarding}
        disabled={advanceStage.isPending || vendor.stage === 'onboarding' || vendor.stage === 'live'}
      >
        <Rocket className="mr-2 h-4 w-4" />
        Begin onboarding
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between" disabled={advanceStage.isPending}>
            Advance stage
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {STAGE_OPTIONS.filter((s) => s !== vendor.stage).map((s) => (
            <DropdownMenuItem key={s} onClick={() => handleStageChange(s)}>
              {s}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}
