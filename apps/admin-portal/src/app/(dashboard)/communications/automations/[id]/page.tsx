'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  useAutomation,
  useUpdateAutomation,
  useActivateAutomation,
  usePauseAutomation,
  useSequenceEnrollments,
} from '@patina/supabase/hooks';
import {
  ChevronLeft,
  Zap,
  Mail,
  Clock,
  GitBranch,
  Square,
  Plus,
  Trash2,
  ChevronDown,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  Users,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SequenceTriggerType,
  SequenceStep,
  SequenceStepType,
  SequenceTriggerConfig,
  SequenceStatus,
  SegmentRule,
} from '@patina/shared/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS: { value: SequenceTriggerType; label: string; description: string }[] = [
  { value: 'account_created', label: 'Account Created', description: 'When a new user signs up' },
  { value: 'style_quiz_completed', label: 'Style Quiz Completed', description: 'When a user finishes the style quiz' },
  { value: 'consultation_completed', label: 'Consultation Completed', description: 'After a consultation session' },
  { value: 'purchase_completed', label: 'Purchase Completed', description: 'After a purchase is made' },
  { value: 'no_activity', label: 'No Activity', description: 'When a user is inactive for N days' },
  { value: 'abandoned_scan', label: 'Abandoned Scan', description: 'When a room scan is left incomplete' },
];

const STEP_TYPE_OPTIONS: { value: SequenceStepType; label: string; icon: React.ReactNode }[] = [
  { value: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { value: 'wait', label: 'Wait', icon: <Clock className="w-4 h-4" /> },
  { value: 'condition', label: 'Condition', icon: <GitBranch className="w-4 h-4" /> },
  { value: 'end', label: 'End', icon: <Square className="w-4 h-4" /> },
];

const CONDITION_TYPES = [
  { value: 'user_property', label: 'User Property' },
  { value: 'event_occurred', label: 'Event Occurred' },
  { value: 'time_elapsed', label: 'Time Elapsed' },
  { value: 'engagement_check', label: 'Engagement Check' },
];

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Step Node Components ────────────────────────────────────────────────────

function TriggerNode({
  triggerType,
  triggerConfig,
  onChangeTriggerType,
  onChangeTriggerConfig,
}: {
  triggerType: SequenceTriggerType;
  triggerConfig: Record<string, unknown>;
  onChangeTriggerType: (type: SequenceTriggerType) => void;
  onChangeTriggerConfig: (config: Record<string, unknown>) => void;
}) {
  return (
    <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 w-full max-w-md">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
          <Zap className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Trigger</p>
          <p className="text-sm font-semibold text-patina-charcoal">When this happens...</p>
        </div>
      </div>

      <select
        value={triggerType}
        onChange={(e) => onChangeTriggerType(e.target.value as SequenceTriggerType)}
        className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 mb-2"
      >
        {TRIGGER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <p className="text-xs text-patina-clay-beige mb-2">
        {TRIGGER_OPTIONS.find((o) => o.value === triggerType)?.description}
      </p>

      {triggerType === 'no_activity' && (
        <div className="mt-2">
          <label className="text-xs font-medium text-patina-charcoal">Inactive for (days)</label>
          <input
            type="number"
            min={1}
            value={(triggerConfig.days as number) || 30}
            onChange={(e) =>
              onChangeTriggerConfig({ ...triggerConfig, days: parseInt(e.target.value) || 30 })
            }
            className="mt-1 w-full px-3 py-1.5 text-sm border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
      )}

      {triggerType === 'account_created' && (
        <div className="mt-2">
          <label className="text-xs font-medium text-patina-charcoal">Role filter (optional)</label>
          <select
            value={(triggerConfig.role as string) || ''}
            onChange={(e) =>
              onChangeTriggerConfig({ ...triggerConfig, role: e.target.value || undefined })
            }
            className="mt-1 w-full px-3 py-1.5 text-sm border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            <option value="">All roles</option>
            <option value="consumer">Consumer</option>
            <option value="designer">Designer</option>
          </select>
        </div>
      )}
    </div>
  );
}

function EmailStepNode({ step, index, onUpdate, onDelete }: { step: SequenceStep; index: number; onUpdate: (config: Record<string, unknown>) => void; onDelete: () => void }) {
  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 w-full max-w-md relative group">
      <button onClick={onDelete} className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><Mail className="w-4 h-4 text-blue-600" /></div>
        <div><p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Step {index + 1}</p><p className="text-sm font-semibold text-patina-charcoal">Send Email</p></div>
      </div>
      <div className="space-y-2">
        <div><label className="text-xs font-medium text-patina-charcoal">Template ID</label><input type="text" value={(step.config.template_id as string) || ''} onChange={(e) => onUpdate({ ...step.config, template_id: e.target.value })} placeholder="e.g., welcome-consumer" className="mt-1 w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
        <div><label className="text-xs font-medium text-patina-charcoal">Subject Line</label><input type="text" value={(step.config.subject as string) || ''} onChange={(e) => onUpdate({ ...step.config, subject: e.target.value })} placeholder="Email subject" className="mt-1 w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
        <div><label className="text-xs font-medium text-patina-charcoal">Delay (days from enrollment)</label><input type="number" min={0} value={(step.config.delay_days as number) || 0} onChange={(e) => onUpdate({ ...step.config, delay_days: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
      </div>
    </div>
  );
}

function WaitStepNode({ step, index, onUpdate, onDelete }: { step: SequenceStep; index: number; onUpdate: (config: Record<string, unknown>) => void; onDelete: () => void }) {
  return (
    <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 w-full max-w-md relative group">
      <button onClick={onDelete} className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center"><Clock className="w-4 h-4 text-purple-600" /></div>
        <div><p className="text-xs font-medium text-purple-600 uppercase tracking-wider">Step {index + 1}</p><p className="text-sm font-semibold text-patina-charcoal">Wait</p></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className="text-xs font-medium text-patina-charcoal">Days</label><input type="number" min={0} value={(step.config.delay_days as number) || 0} onChange={(e) => onUpdate({ ...step.config, delay_days: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-1.5 text-sm border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" /></div>
        <div><label className="text-xs font-medium text-patina-charcoal">Hours</label><input type="number" min={0} max={23} value={(step.config.delay_hours as number) || 0} onChange={(e) => onUpdate({ ...step.config, delay_hours: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-1.5 text-sm border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" /></div>
        <div><label className="text-xs font-medium text-patina-charcoal">Minutes</label><input type="number" min={0} max={59} value={(step.config.delay_minutes as number) || 0} onChange={(e) => onUpdate({ ...step.config, delay_minutes: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-1.5 text-sm border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" /></div>
      </div>
    </div>
  );
}

function ConditionStepNode({ step, index, onUpdate, onDelete }: { step: SequenceStep; index: number; onUpdate: (config: Record<string, unknown>) => void; onDelete: () => void }) {
  const conditionType = (step.config.type as string) || 'user_property';
  return (
    <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 w-full max-w-md relative group">
      <button onClick={onDelete} className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center"><GitBranch className="w-4 h-4 text-orange-600" /></div>
        <div><p className="text-xs font-medium text-orange-600 uppercase tracking-wider">Step {index + 1}</p><p className="text-sm font-semibold text-patina-charcoal">Condition</p></div>
      </div>
      <div className="space-y-2">
        <div><label className="text-xs font-medium text-patina-charcoal">Condition Type</label><select value={conditionType} onChange={(e) => onUpdate({ ...step.config, type: e.target.value })} className="mt-1 w-full px-3 py-1.5 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">{CONDITION_TYPES.map((ct) => (<option key={ct.value} value={ct.value}>{ct.label}</option>))}</select></div>
        {conditionType === 'user_property' && (<><div><label className="text-xs font-medium text-patina-charcoal">Field</label><input type="text" value={(step.config.field as string) || ''} onChange={(e) => onUpdate({ ...step.config, field: e.target.value })} placeholder="e.g., role" className="mt-1 w-full px-3 py-1.5 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" /></div><div><label className="text-xs font-medium text-patina-charcoal">Value</label><input type="text" value={(step.config.value as string) || ''} onChange={(e) => onUpdate({ ...step.config, value: e.target.value })} placeholder="e.g., designer" className="mt-1 w-full px-3 py-1.5 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" /></div></>)}
        {conditionType === 'event_occurred' && (<div><label className="text-xs font-medium text-patina-charcoal">Event Name</label><input type="text" value={(step.config.event as string) || ''} onChange={(e) => onUpdate({ ...step.config, event: e.target.value })} placeholder="e.g., style_quiz_completed" className="mt-1 w-full px-3 py-1.5 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>)}
        {conditionType === 'time_elapsed' && (<div><label className="text-xs font-medium text-patina-charcoal">Days elapsed</label><input type="number" min={1} value={(step.config.days as number) || 7} onChange={(e) => onUpdate({ ...step.config, days: parseInt(e.target.value) || 7 })} className="mt-1 w-full px-3 py-1.5 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>)}
        {conditionType === 'engagement_check' && (<div><label className="text-xs font-medium text-patina-charcoal">Expected Tier</label><select value={(step.config.tier as string) || 'high'} onChange={(e) => onUpdate({ ...step.config, tier: e.target.value })} className="mt-1 w-full px-3 py-1.5 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="minimal">Minimal</option><option value="dormant">Dormant</option></select></div>)}
      </div>
    </div>
  );
}

function EndStepNode({ index, onDelete }: { index: number; onDelete: () => void }) {
  return (
    <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 w-full max-w-md relative group">
      <button onClick={onDelete} className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center"><Square className="w-4 h-4 text-gray-500" /></div>
        <div><p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Step {index + 1}</p><p className="text-sm font-semibold text-patina-charcoal">End Sequence</p></div>
      </div>
    </div>
  );
}

function AddStepButton({ onAdd }: { onAdd: (type: SequenceStepType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-patina-mocha-brown bg-patina-off-white border border-patina-clay-beige/30 rounded-lg hover:bg-patina-clay-beige/10 transition-colors">
        <Plus className="w-3.5 h-3.5" />Add Step<ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-patina-clay-beige/20 rounded-lg shadow-lg py-1 z-10 min-w-[160px]">
          {STEP_TYPE_OPTIONS.map((opt) => (<button key={opt.value} onClick={() => { onAdd(opt.value); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-patina-charcoal hover:bg-patina-off-white transition-colors">{opt.icon}{opt.label}</button>))}
        </div>
      )}
    </div>
  );
}

function ConnectorLine() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-0.5 h-6 bg-patina-clay-beige/40" />
      <div className="w-2 h-2 rounded-full bg-patina-clay-beige/40" />
      <div className="w-0.5 h-6 bg-patina-clay-beige/40" />
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

const statusColors: Record<SequenceStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  archived: 'bg-gray-100 text-gray-500',
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function EditAutomationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: automation, isLoading: isLoadingAutomation } = useAutomation(id);
  const { data: enrollments } = useSequenceEnrollments(id);
  const updateMutation = useUpdateAutomation();
  const activateMutation = useActivateAutomation();
  const pauseMutation = usePauseAutomation();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<SequenceTriggerType>('account_created');
  const [triggerExtraConfig, setTriggerExtraConfig] = useState<Record<string, unknown>>({});
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (automation && !initialized) {
      setName(automation.name || '');
      setDescription(automation.description || '');
      if (automation.trigger_config?.type) {
        setTriggerType(automation.trigger_config.type);
        const conditions = automation.trigger_config.conditions || [];
        const extra: Record<string, unknown> = {};
        for (const cond of conditions) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = cond as any;
          if (c.field === 'days') extra.days = c.value;
          if (c.field === 'role') extra.role = c.value;
        }
        setTriggerExtraConfig(extra);
      }
      setSteps(
        (automation.steps_json || []).map((s) => ({
          ...s,
          id: s.id || generateStepId(),
        }))
      );
      setInitialized(true);
    }
  }, [automation, initialized]);

  const buildTriggerConfig = useCallback((): SequenceTriggerConfig => {
    const conditions: unknown[] = [];
    if (triggerType === 'no_activity' && triggerExtraConfig.days) {
      conditions.push({ field: 'days', operator: 'eq', value: triggerExtraConfig.days });
    }
    if (triggerType === 'account_created' && triggerExtraConfig.role) {
      conditions.push({ field: 'role', operator: 'eq', value: triggerExtraConfig.role });
    }
    return { type: triggerType, conditions: conditions as SegmentRule[] };
  }, [triggerType, triggerExtraConfig]);

  const addStep = (type: SequenceStepType) => {
    const newStep: SequenceStep = { id: generateStepId(), type, config: type === 'condition' ? { type: 'user_property' } : {} };
    setSteps([...steps, newStep]);
  };

  const insertStepBefore = (index: number, type: SequenceStepType) => {
    const newStep: SequenceStep = { id: generateStepId(), type, config: type === 'condition' ? { type: 'user_property' } : {} };
    const updated = [...steps];
    updated.splice(index, 0, newStep);
    setSteps(updated);
  };

  const updateStepConfig = (index: number, config: Record<string, unknown>) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], config };
    setSteps(updated);
  };

  const deleteStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const hasEmailStep = steps.some((s) => s.type === 'email');

  const handleSave = async () => {
    if (!name.trim()) return;
    updateMutation.mutate({
      id,
      name: name.trim(),
      description: description.trim() || null,
      trigger_config: buildTriggerConfig(),
      steps_json: steps,
    });
  };

  const handleActivate = () => {
    updateMutation.mutate({
      id,
      name: name.trim(),
      description: description.trim() || null,
      trigger_config: buildTriggerConfig(),
      steps_json: steps,
      status: 'active',
    });
  };

  const handlePause = () => {
    pauseMutation.mutate(id);
  };

  const completionRate =
    automation && automation.total_enrolled > 0
      ? Math.round((automation.total_completed / automation.total_enrolled) * 100)
      : 0;

  if (isLoadingAutomation) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-patina-clay-beige/50 mx-auto mb-4" />
          <p className="text-patina-clay-beige">Automation not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <button onClick={() => router.push('/communications/automations')} className="flex items-center gap-1 text-sm text-patina-clay-beige hover:text-patina-charcoal mb-3">
          <ChevronLeft className="w-4 h-4" />Back to Automations
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-patina-charcoal">Edit Automation</h1>
            <p className="text-sm text-patina-clay-beige mt-1">{automation.name}</p>
          </div>
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium capitalize', statusColors[automation.status])}>{automation.status}</span>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="flex gap-6">
          {/* Left panel */}
          <div className="w-80 shrink-0 space-y-4">
            <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-patina-charcoal">Sequence Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Consumer Welcome Series" className="mt-1.5 w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown" />
              </div>
              <div>
                <label className="text-sm font-medium text-patina-charcoal">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..." rows={3} className="mt-1.5 w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-patina-charcoal">Trigger Type</label>
                <select value={triggerType} onChange={(e) => { setTriggerType(e.target.value as SequenceTriggerType); setTriggerExtraConfig({}); }} className="mt-1.5 w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown">
                  {TRIGGER_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
                <p className="text-xs text-patina-clay-beige mt-1">{TRIGGER_OPTIONS.find((o) => o.value === triggerType)?.description}</p>
              </div>
              {triggerType === 'no_activity' && (<div><label className="text-sm font-medium text-patina-charcoal">Inactive for (days)</label><input type="number" min={1} value={(triggerExtraConfig.days as number) || 30} onChange={(e) => setTriggerExtraConfig({ ...triggerExtraConfig, days: parseInt(e.target.value) || 30 })} className="mt-1.5 w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown" /></div>)}
              {triggerType === 'account_created' && (<div><label className="text-sm font-medium text-patina-charcoal">Role filter</label><select value={(triggerExtraConfig.role as string) || ''} onChange={(e) => setTriggerExtraConfig({ ...triggerExtraConfig, role: e.target.value || undefined })} className="mt-1.5 w-full px-3 py-2 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"><option value="">All roles</option><option value="consumer">Consumer</option><option value="designer">Designer</option></select></div>)}
            </div>
            <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
              <h3 className="text-sm font-semibold text-patina-charcoal mb-3">Summary</h3>
              <div className="space-y-2 text-xs text-patina-clay-beige">
                <p><span className="font-medium text-patina-charcoal">{steps.length}</span> step{steps.length !== 1 ? 's' : ''} configured</p>
                <p><span className="font-medium text-patina-charcoal">{steps.filter((s) => s.type === 'email').length}</span> email{steps.filter((s) => s.type === 'email').length !== 1 ? 's' : ''}</p>
                <p><span className="font-medium text-patina-charcoal">{steps.filter((s) => s.type === 'wait').length}</span> wait step{steps.filter((s) => s.type === 'wait').length !== 1 ? 's' : ''}</p>
                <p><span className="font-medium text-patina-charcoal">{steps.filter((s) => s.type === 'condition').length}</span> condition{steps.filter((s) => s.type === 'condition').length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          {/* Center panel */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-8 min-h-[600px]">
              <div className="flex flex-col items-center">
                <TriggerNode triggerType={triggerType} triggerConfig={triggerExtraConfig} onChangeTriggerType={(type) => { setTriggerType(type); setTriggerExtraConfig({}); }} onChangeTriggerConfig={setTriggerExtraConfig} />
                {steps.map((step, i) => (
                  <div key={step.id} className="flex flex-col items-center w-full">
                    <ConnectorLine />
                    <div className="mb-2"><AddStepButton onAdd={(type) => insertStepBefore(i, type)} /></div>
                    <ConnectorLine />
                    {step.type === 'email' && <EmailStepNode step={step} index={i} onUpdate={(config) => updateStepConfig(i, config)} onDelete={() => deleteStep(i)} />}
                    {step.type === 'wait' && <WaitStepNode step={step} index={i} onUpdate={(config) => updateStepConfig(i, config)} onDelete={() => deleteStep(i)} />}
                    {step.type === 'condition' && <ConditionStepNode step={step} index={i} onUpdate={(config) => updateStepConfig(i, config)} onDelete={() => deleteStep(i)} />}
                    {step.type === 'end' && <EndStepNode index={i} onDelete={() => deleteStep(i)} />}
                  </div>
                ))}
                <ConnectorLine />
                <AddStepButton onAdd={addStep} />
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="w-72 shrink-0 space-y-4">
            <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
              <div className="flex items-center gap-2 mb-4"><BarChart3 className="w-4 h-4 text-patina-mocha-brown" /><h3 className="text-sm font-semibold text-patina-charcoal">Performance</h3></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-patina-off-white rounded-lg p-3 text-center"><Users className="w-4 h-4 text-patina-mocha-brown mx-auto mb-1" /><p className="text-lg font-semibold text-patina-charcoal">{automation.total_enrolled}</p><p className="text-xs text-patina-clay-beige">Enrolled</p></div>
                <div className="bg-patina-off-white rounded-lg p-3 text-center"><CheckCircle2 className="w-4 h-4 text-green-600 mx-auto mb-1" /><p className="text-lg font-semibold text-patina-charcoal">{automation.total_completed}</p><p className="text-xs text-patina-clay-beige">Completed</p></div>
                <div className="bg-patina-off-white rounded-lg p-3 text-center"><Mail className="w-4 h-4 text-blue-600 mx-auto mb-1" /><p className="text-lg font-semibold text-patina-charcoal">{automation.total_emails_sent}</p><p className="text-xs text-patina-clay-beige">Emails Sent</p></div>
                <div className="bg-patina-off-white rounded-lg p-3 text-center"><BarChart3 className="w-4 h-4 text-purple-600 mx-auto mb-1" /><p className="text-lg font-semibold text-patina-charcoal">{completionRate}%</p><p className="text-xs text-patina-clay-beige">Completion</p></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
              <h3 className="text-sm font-semibold text-patina-charcoal mb-3">Recent Enrollments</h3>
              {(!enrollments || enrollments.length === 0) ? (
                <p className="text-xs text-patina-clay-beige">No enrollments yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {enrollments.slice(0, 10).map((enrollment) => (
                    <div key={enrollment.id} className="flex items-center justify-between py-1.5 border-b border-patina-clay-beige/10 last:border-0">
                      <div className="min-w-0"><p className="text-xs font-medium text-patina-charcoal truncate">{enrollment.user_id.slice(0, 8)}...</p><p className="text-[10px] text-patina-clay-beige">Step {enrollment.current_step + 1}</p></div>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium capitalize', enrollment.status === 'active' ? 'bg-green-100 text-green-700' : enrollment.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>{enrollment.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-6 bg-white rounded-xl border border-patina-clay-beige/20 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-patina-clay-beige">
            {!name.trim() && (<span className="flex items-center gap-1 text-amber-600"><AlertCircle className="w-3.5 h-3.5" />Enter a name to save</span>)}
            {name.trim() && !hasEmailStep && automation.status !== 'active' && (<span className="flex items-center gap-1 text-amber-600"><AlertCircle className="w-3.5 h-3.5" />Add at least one email step to activate</span>)}
          </div>
          <div className="flex items-center gap-3">
            {(updateMutation.isError || activateMutation.isError || pauseMutation.isError) && (<span className="text-xs text-red-600">{updateMutation.error?.message || activateMutation.error?.message || pauseMutation.error?.message}</span>)}
            {updateMutation.isSuccess && (<span className="text-xs text-green-600">Saved</span>)}
            <button onClick={handleSave} disabled={!name.trim() || updateMutation.isPending} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-patina-charcoal bg-patina-off-white border border-patina-clay-beige/30 rounded-lg hover:bg-patina-clay-beige/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Save Changes
            </button>
            {automation.status === 'active' ? (
              <button onClick={handlePause} disabled={pauseMutation.isPending} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50">
                {pauseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}Pause
              </button>
            ) : (
              <button onClick={handleActivate} disabled={!name.trim() || !hasEmailStep || updateMutation.isPending} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-patina-mocha-brown rounded-lg hover:bg-patina-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Activate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
