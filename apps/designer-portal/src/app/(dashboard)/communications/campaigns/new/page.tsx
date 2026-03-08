'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  LayoutTemplate,
  FileText,
  Users,
  Eye,
  Clock,
  Check,
  Mail,
  Megaphone,
  Heart,
  Zap,
  Monitor,
  Smartphone,
  Send,
  Calendar,
  Save,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  useTemplates,
  useTemplate,
  useTemplatePreview,
  useAudienceSegments,
  useEstimateAudienceSize,
  useCreateCampaign,
  useUpdateCampaign,
  useSendCampaign,
} from '@patina/supabase/hooks';
import type { EmailTemplateCategory, SegmentRules, AudienceSegment } from '@patina/types/types';
import { cn } from '@/lib/utils';
import { useCampaignWizardStore } from '@/stores/campaign-wizard-store';
import type { AudienceCondition } from '@/stores/campaign-wizard-store';
import { PreSendChecklist, useChecklistAllPassed } from '@/components/communications/PreSendChecklist';

// ─── Constants ──────────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Template', icon: LayoutTemplate },
  { label: 'Content', icon: FileText },
  { label: 'Audience', icon: Users },
  { label: 'Preview', icon: Eye },
  { label: 'Schedule', icon: Clock },
] as const;

const CATEGORY_CONFIG: Record<
  EmailTemplateCategory,
  { label: string; color: string; icon: React.ReactNode }
> = {
  transactional: {
    label: 'Transactional',
    color: 'bg-gray-100 text-gray-700',
    icon: <Mail className="w-3 h-3" />,
  },
  engagement: {
    label: 'Engagement',
    color: 'bg-blue-100 text-blue-700',
    icon: <Heart className="w-3 h-3" />,
  },
  campaign: {
    label: 'Campaign',
    color: 'bg-green-100 text-green-700',
    icon: <Megaphone className="w-3 h-3" />,
  },
  sequence: {
    label: 'Sequence',
    color: 'bg-purple-100 text-purple-700',
    icon: <Zap className="w-3 h-3" />,
  },
};

const TEMPLATE_FILTER_TABS: { key: 'all' | EmailTemplateCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'sequence', label: 'Sequence' },
];

const SEGMENT_FIELDS = [
  { value: 'role', label: 'Role' },
  { value: 'founding_circle', label: 'Founding Circle' },
  { value: 'engagement_tier', label: 'Engagement Tier' },
  { value: 'engagement_score', label: 'Engagement Score' },
  { value: 'last_active_at', label: 'Last Active' },
  { value: 'created_at', label: 'Signed Up' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'has_completed_quiz', label: 'Completed Quiz' },
  { value: 'has_active_project', label: 'Has Active Project' },
  { value: 'total_orders', label: 'Total Orders' },
  { value: 'total_spent', label: 'Total Spent' },
] as const;

const SEGMENT_OPERATORS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' },
] as const;

const AUTO_SAVE_INTERVAL = 30_000;

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter();
  const store = useCampaignWizardStore();
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const sendCampaign = useSendCampaign();

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Auto-save logic
  const handleAutoSave = useCallback(async () => {
    if (!store.isDirty) return;
    if (!store.subject && !store.templateId && !store.name) return;

    const payload = {
      name: store.name || 'Untitled Campaign',
      subject: store.subject,
      template_id: store.templateId || '',
      audience_type: store.audienceType,
      preview_text: store.previewText || undefined,
      template_data: {
        headline: store.headline,
        body: store.body,
        ctaText: store.ctaText,
        ctaUrl: store.ctaUrl,
        heroImageUrl: store.heroImageUrl,
        abEnabled: store.abEnabled,
        subjectB: store.subjectB,
        ...store.contentJson,
      },
      audience_segment: store.audienceSegmentId
        ? { segment_id: store.audienceSegmentId, rules: store.audienceRules }
        : store.audienceRules.conditions.length > 0
          ? { rules: store.audienceRules }
          : undefined,
      scheduled_for: store.scheduledFor || undefined,
    };

    try {
      if (store.draftId) {
        await updateCampaign.mutateAsync({ id: store.draftId, ...payload });
      } else {
        const result = await createCampaign.mutateAsync(payload);
        if (result?.id) {
          store.setDraftId(result.id);
        }
      }
      store.markSaved();
    } catch {
      // Silent fail for auto-save, user can manually retry
    }
  }, [
    store.isDirty,
    store.subject,
    store.templateId,
    store.name,
    store.audienceType,
    store.previewText,
    store.headline,
    store.body,
    store.ctaText,
    store.ctaUrl,
    store.heroImageUrl,
    store.abEnabled,
    store.subjectB,
    store.contentJson,
    store.audienceSegmentId,
    store.audienceRules,
    store.scheduledFor,
    store.draftId,
    createCampaign,
    updateCampaign,
    store,
  ]);

  useEffect(() => {
    autoSaveTimerRef.current = setInterval(handleAutoSave, AUTO_SAVE_INTERVAL);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [handleAutoSave]);

  // Navigation guards
  const canAdvance = useCallback(
    (fromStep: number): boolean => {
      switch (fromStep) {
        case 0:
          return !!store.templateId;
        case 1:
          return store.subject.trim().length > 0;
        case 2:
          return (
            store.audienceType === 'all' ||
            (store.audienceType === 'segment' && !!store.audienceSegmentId) ||
            store.audienceType === 'individual'
          );
        case 3:
          return true;
        default:
          return true;
      }
    },
    [store.templateId, store.subject, store.audienceType, store.audienceSegmentId]
  );

  const handleNext = () => {
    if (canAdvance(store.step)) {
      store.nextStep();
    }
  };

  const handleBack = () => {
    store.prevStep();
  };

  const handleCreateCampaign = async () => {
    setIsCreating(true);
    try {
      const payload = {
        name: store.name || 'Untitled Campaign',
        subject: store.subject,
        template_id: store.templateId || '',
        audience_type: store.audienceType,
        preview_text: store.previewText || undefined,
        template_data: {
          headline: store.headline,
          body: store.body,
          ctaText: store.ctaText,
          ctaUrl: store.ctaUrl,
          heroImageUrl: store.heroImageUrl,
          abEnabled: store.abEnabled,
          subjectB: store.subjectB,
          ...store.contentJson,
        },
        audience_segment: store.audienceSegmentId
          ? { segment_id: store.audienceSegmentId, rules: store.audienceRules }
          : store.audienceRules.conditions.length > 0
            ? { rules: store.audienceRules }
            : undefined,
        scheduled_for: store.sendOption === 'later' ? store.scheduledFor || undefined : undefined,
      };

      let campaignId = store.draftId;

      if (campaignId) {
        await updateCampaign.mutateAsync({ id: campaignId, ...payload });
      } else {
        const result = await createCampaign.mutateAsync(payload);
        campaignId = result?.id;
      }

      if (store.sendOption === 'now' && campaignId) {
        await sendCampaign.mutateAsync(campaignId);
      }

      store.reset();
      router.push('/communications/campaigns');
    } catch {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-patina-off-white flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/communications/campaigns')}
              className="flex items-center gap-1 text-sm text-patina-clay-beige hover:text-patina-charcoal mb-2 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Campaigns
            </button>
            <h1 className="text-2xl font-display font-semibold text-patina-charcoal">
              New Campaign
            </h1>
          </div>
          <AutoSaveIndicator
            isDirty={store.isDirty}
            lastSavedAt={store.lastSavedAt}
            isSaving={createCampaign.isPending || updateCampaign.isPending}
          />
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-4">
        <StepIndicator currentStep={store.step} onStepClick={store.setStep} canAdvance={canAdvance} />
      </div>

      {/* Step content */}
      <div className="flex-1 px-8 py-6 overflow-y-auto">
        {store.step === 0 && <StepTemplate />}
        {store.step === 1 && <StepContent />}
        {store.step === 2 && <StepAudience />}
        {store.step === 3 && <StepPreview />}
        {store.step === 4 && <StepSchedule />}
      </div>

      {/* Footer navigation */}
      <div className="bg-white border-t border-patina-clay-beige/20 px-8 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={store.step === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
              store.step === 0
                ? 'text-patina-clay-beige/40 cursor-not-allowed'
                : 'text-patina-clay-beige hover:text-patina-charcoal hover:bg-patina-off-white'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAutoSave}
              disabled={!store.isDirty}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-patina-clay-beige hover:text-patina-charcoal hover:bg-patina-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              Save Draft
            </button>

            {store.step < 4 ? (
              <button
                onClick={handleNext}
                disabled={!canAdvance(store.step)}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  canAdvance(store.step)
                    ? 'bg-patina-mocha-brown text-white hover:bg-patina-charcoal'
                    : 'bg-patina-clay-beige/20 text-patina-clay-beige/60 cursor-not-allowed'
                )}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={isCreating}
                className="flex items-center gap-2 px-5 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors disabled:opacity-60"
              >
                {isCreating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {store.sendOption === 'now' ? 'Send Campaign' : 'Schedule Campaign'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <ConfirmModal
          sendOption={store.sendOption}
          scheduledFor={store.scheduledFor}
          name={store.name}
          subject={store.subject}
          estimatedRecipients={store.estimatedRecipients}
          isCreating={isCreating}
          onConfirm={handleCreateCampaign}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </div>
  );
}

// ─── Step Indicator ─────────────────────────────────────────────────────────────

function StepIndicator({
  currentStep,
  onStepClick,
  canAdvance,
}: {
  currentStep: number;
  onStepClick: (step: number) => void;
  canAdvance: (fromStep: number) => boolean;
}) {
  return (
    <div className="flex items-center justify-center">
      {STEPS.map((step, i) => {
        const StepIcon = step.icon;
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;
        const isClickable = i <= currentStep || (i === currentStep + 1 && canAdvance(currentStep));

        return (
          <div key={step.label} className="flex items-center">
            <button
              onClick={() => isClickable && onStepClick(i)}
              disabled={!isClickable}
              className={cn(
                'flex items-center gap-2 transition-all',
                isClickable ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all',
                  isActive
                    ? 'bg-patina-mocha-brown text-white shadow-sm'
                    : isCompleted
                      ? 'bg-green-100 text-green-700'
                      : 'bg-patina-off-white text-patina-clay-beige'
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <StepIcon className="w-3.5 h-3.5" />
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium hidden sm:inline transition-colors',
                  isActive
                    ? 'text-patina-charcoal'
                    : isCompleted
                      ? 'text-green-700'
                      : 'text-patina-clay-beige'
                )}
              >
                {step.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-8 lg:w-16 h-px mx-2 transition-colors',
                  i < currentStep ? 'bg-green-300' : 'bg-patina-clay-beige/20'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Auto-save Indicator ────────────────────────────────────────────────────────

function AutoSaveIndicator({
  isDirty,
  lastSavedAt,
  isSaving,
}: {
  isDirty: boolean;
  lastSavedAt: string | null;
  isSaving: boolean;
}) {
  if (isSaving) {
    return (
      <div className="flex items-center gap-2 text-xs text-patina-clay-beige">
        <div className="w-3 h-3 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
        Saving...
      </div>
    );
  }

  if (isDirty) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Unsaved changes
      </div>
    );
  }

  if (lastSavedAt) {
    const date = new Date(lastSavedAt);
    const timeStr = date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600">
        <Check className="w-3 h-3" />
        Draft saved at {timeStr}
      </div>
    );
  }

  return null;
}

// ─── Step 1: Template Selection ─────────────────────────────────────────────────

function StepTemplate() {
  const store = useCampaignWizardStore();
  const [filter, setFilter] = useState<'all' | EmailTemplateCategory>('all');
  const { data: templates, isLoading } = useTemplates(
    filter === 'all' ? undefined : filter
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-lg font-display font-semibold text-patina-charcoal">
          Choose a Template
        </h2>
        <p className="text-sm text-patina-clay-beige mt-1">
          Select the email template for your campaign.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white rounded-lg p-1 border border-patina-clay-beige/20 w-fit">
        {TEMPLATE_FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              filter === tab.key
                ? 'bg-patina-mocha-brown text-white'
                : 'text-patina-clay-beige hover:text-patina-charcoal'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (templates || []).length === 0 ? (
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-12 text-center">
          <LayoutTemplate className="w-12 h-12 text-patina-clay-beige/50 mx-auto mb-4" />
          <h3 className="text-lg font-display font-semibold text-patina-charcoal mb-2">
            No templates found
          </h3>
          <p className="text-sm text-patina-clay-beige">
            {filter !== 'all'
              ? 'No templates in this category. Try a different filter.'
              : 'Create a template first before building a campaign.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(templates || []).map((template) => {
            const config = CATEGORY_CONFIG[template.category];
            const isSelected = store.templateId === template.id;

            return (
              <button
                key={template.id}
                onClick={() => {
                  store.setField('templateId', template.id);
                  store.setField('emailTemplateId', template.id);
                  if (template.subject_default && !store.subject) {
                    store.setField('subject', template.subject_default);
                  }
                }}
                className={cn(
                  'bg-white rounded-xl border-2 overflow-hidden text-left transition-all group',
                  isSelected
                    ? 'border-patina-mocha-brown ring-2 ring-patina-mocha-brown/20 shadow-md'
                    : 'border-patina-clay-beige/20 hover:border-patina-clay-beige/40 hover:shadow-sm'
                )}
              >
                {/* Preview area */}
                <div className="h-28 bg-gradient-to-br from-patina-off-white to-patina-clay-beige/10 flex items-center justify-center relative">
                  <LayoutTemplate className="w-8 h-8 text-patina-clay-beige/30" />
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-patina-mocha-brown rounded-full flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3
                      className={cn(
                        'text-sm font-semibold line-clamp-1 transition-colors',
                        isSelected
                          ? 'text-patina-mocha-brown'
                          : 'text-patina-charcoal group-hover:text-patina-mocha-brown'
                      )}
                    >
                      {template.name}
                    </h3>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 flex items-center gap-1',
                        config.color
                      )}
                    >
                      {config.icon}
                      {config.label}
                    </span>
                  </div>
                  {template.description && (
                    <p className="text-xs text-patina-clay-beige line-clamp-2">
                      {template.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Content Compose ────────────────────────────────────────────────────

function StepContent() {
  const store = useCampaignWizardStore();
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const templateData = useMemo(
    () => ({
      headline: store.headline,
      body: store.body,
      ctaText: store.ctaText,
      ctaUrl: store.ctaUrl,
      heroImageUrl: store.heroImageUrl,
    }),
    [store.headline, store.body, store.ctaText, store.ctaUrl, store.heroImageUrl]
  );

  const { data: previewHtml } = useTemplatePreview(store.templateId, templateData);
  const { data: templateInfo } = useTemplate(store.templateId);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-display font-semibold text-patina-charcoal">
          Compose Content
        </h2>
        <p className="text-sm text-patina-clay-beige mt-1">
          Write your email subject, preview text, and body content.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-5">
          {/* Subject line */}
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-patina-charcoal">
                  Subject Line
                </label>
                <span
                  className={cn(
                    'text-xs',
                    store.subject.length > 200
                      ? 'text-red-500'
                      : store.subject.length > 150
                        ? 'text-amber-500'
                        : 'text-patina-clay-beige'
                  )}
                >
                  {store.subject.length}/200
                </span>
              </div>
              <input
                type="text"
                value={store.subject}
                onChange={(e) => store.setField('subject', e.target.value)}
                placeholder="Enter your subject line..."
                maxLength={200}
                className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
              />
            </div>

            {/* A/B toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-patina-charcoal">
                  A/B Test Subject
                </span>
                <p className="text-xs text-patina-clay-beige">
                  Test two subject lines to see which performs better.
                </p>
              </div>
              <button
                onClick={() => store.setField('abEnabled', !store.abEnabled)}
                className="text-patina-mocha-brown"
              >
                {store.abEnabled ? (
                  <ToggleRight className="w-8 h-8" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-patina-clay-beige/50" />
                )}
              </button>
            </div>

            {store.abEnabled && (
              <div>
                <label className="text-sm font-medium text-patina-charcoal mb-1.5 block">
                  Subject B (Variant)
                </label>
                <input
                  type="text"
                  value={store.subjectB}
                  onChange={(e) => store.setField('subjectB', e.target.value)}
                  placeholder="Enter variant subject line..."
                  maxLength={200}
                  className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
                />
              </div>
            )}

            {/* Preview text */}
            <div>
              <label className="text-sm font-medium text-patina-charcoal mb-1.5 block">
                Preview Text
              </label>
              <input
                type="text"
                value={store.previewText}
                onChange={(e) => store.setField('previewText', e.target.value)}
                placeholder="Text shown after the subject in inbox..."
                className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
              />
            </div>
          </div>

          {/* Body content */}
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-patina-charcoal">
              Email Body
            </h3>

            <div>
              <label className="text-xs font-medium text-patina-clay-beige uppercase tracking-wider mb-1.5 block">
                Headline
              </label>
              <input
                type="text"
                value={store.headline}
                onChange={(e) => store.setField('headline', e.target.value)}
                placeholder="Main headline..."
                className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-patina-clay-beige uppercase tracking-wider mb-1.5 block">
                Body
              </label>
              <textarea
                value={store.body}
                onChange={(e) => store.setField('body', e.target.value)}
                placeholder="Write your email body content..."
                rows={8}
                className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-patina-clay-beige uppercase tracking-wider mb-1.5 block">
                  CTA Text
                </label>
                <input
                  type="text"
                  value={store.ctaText}
                  onChange={(e) => store.setField('ctaText', e.target.value)}
                  placeholder="e.g. Shop Now"
                  className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-patina-clay-beige uppercase tracking-wider mb-1.5 block">
                  CTA URL
                </label>
                <input
                  type="url"
                  value={store.ctaUrl}
                  onChange={(e) => store.setField('ctaUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-patina-clay-beige uppercase tracking-wider mb-1.5 block">
                Hero Image URL
              </label>
              <input
                type="url"
                value={store.heroImageUrl}
                onChange={(e) => store.setField('heroImageUrl', e.target.value)}
                placeholder="https://... (optional)"
                className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
              />
            </div>
          </div>

          {/* Send test email */}
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-patina-charcoal">
                  Send Test Email
                </h3>
                <p className="text-xs text-patina-clay-beige mt-0.5">
                  Preview how your email looks in an inbox.
                </p>
              </div>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-patina-clay-beige/30 text-patina-charcoal hover:bg-patina-off-white transition-colors">
                <Mail className="w-3.5 h-3.5" />
                Send Test
              </button>
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-patina-charcoal">
              Preview
            </h3>
            <div className="flex gap-1 bg-white rounded-lg p-0.5 border border-patina-clay-beige/20">
              <button
                onClick={() => setPreviewMode('desktop')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  previewMode === 'desktop'
                    ? 'bg-patina-mocha-brown text-white'
                    : 'text-patina-clay-beige hover:text-patina-charcoal'
                )}
              >
                <Monitor className="w-3 h-3" />
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  previewMode === 'mobile'
                    ? 'bg-patina-mocha-brown text-white'
                    : 'text-patina-clay-beige hover:text-patina-charcoal'
                )}
              >
                <Smartphone className="w-3 h-3" />
                Mobile
              </button>
            </div>
          </div>

          {/* Subject preview */}
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-patina-mocha-brown/10 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-patina-mocha-brown" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-patina-clay-beige">From: Patina</p>
                <p className="text-sm font-semibold text-patina-charcoal truncate">
                  {store.subject || 'Subject line preview'}
                </p>
                <p className="text-xs text-patina-clay-beige truncate">
                  {store.previewText || 'Preview text will appear here...'}
                </p>
              </div>
            </div>
          </div>

          {/* Template preview */}
          <div
            className={cn(
              'bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden mx-auto transition-all',
              previewMode === 'mobile' ? 'max-w-[375px]' : 'w-full'
            )}
          >
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                className="w-full border-0"
                style={{ height: '500px' }}
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="h-[500px] flex flex-col items-center justify-center text-center p-8">
                <LayoutTemplate className="w-12 h-12 text-patina-clay-beige/30 mb-3" />
                <p className="text-sm text-patina-clay-beige">
                  {store.templateId
                    ? 'Loading preview...'
                    : 'Select a template to see preview'}
                </p>
                {templateInfo && (
                  <p className="text-xs text-patina-clay-beige/60 mt-1">
                    Using: {templateInfo.name}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Audience ───────────────────────────────────────────────────────────

function StepAudience() {
  const store = useCampaignWizardStore();
  const { data: segments, isLoading: segmentsLoading } = useAudienceSegments();
  const [showCustomBuilder, setShowCustomBuilder] = useState(
    store.audienceType === 'segment' && !store.audienceSegmentId && store.audienceRules.conditions.length > 0
  );

  const estimateRules: SegmentRules | null = useMemo(() => {
    if (store.audienceType === 'all') return { logic: 'and', conditions: [] };
    if (store.audienceSegmentId) {
      const seg = (segments || []).find((s) => s.id === store.audienceSegmentId);
      return seg?.rules || null;
    }
    if (store.audienceRules.conditions.length > 0) {
      return store.audienceRules as SegmentRules;
    }
    return null;
  }, [store.audienceType, store.audienceSegmentId, store.audienceRules, segments]);

  const { data: estimatedCount } = useEstimateAudienceSize(
    store.audienceType === 'all'
      ? { logic: 'and', conditions: [{ field: 'channels_email' as const, operator: 'eq' as const, value: true }] }
      : estimateRules
  );

  useEffect(() => {
    if (estimatedCount !== undefined) {
      store.setField('estimatedRecipients', estimatedCount);
    }
  }, [estimatedCount]);

  const presetSegments = (segments || []).filter((s) => s.is_preset);
  const customSegments = (segments || []).filter((s) => !s.is_preset);

  const selectSegment = (segment: AudienceSegment | null) => {
    if (!segment) {
      store.setField('audienceType', 'all');
      store.setField('audienceSegmentId', null);
      store.setField('audienceRules', { logic: 'and', conditions: [] });
      setShowCustomBuilder(false);
      return;
    }
    store.setField('audienceType', 'segment');
    store.setField('audienceSegmentId', segment.id);
    store.setField('audienceRules', segment.rules as { logic: 'and' | 'or'; conditions: AudienceCondition[] });
    setShowCustomBuilder(false);
  };

  const addCondition = () => {
    const updated = {
      ...store.audienceRules,
      conditions: [
        ...store.audienceRules.conditions,
        { field: 'role', operator: 'eq', value: '' },
      ],
    };
    store.setField('audienceRules', updated);
    store.setField('audienceType', 'segment');
    store.setField('audienceSegmentId', null);
  };

  const updateCondition = (index: number, updates: Partial<AudienceCondition>) => {
    const conditions = [...store.audienceRules.conditions];
    conditions[index] = { ...conditions[index], ...updates };
    store.setField('audienceRules', { ...store.audienceRules, conditions });
  };

  const removeCondition = (index: number) => {
    const conditions = store.audienceRules.conditions.filter((_, i) => i !== index);
    store.setField('audienceRules', { ...store.audienceRules, conditions });
    if (conditions.length === 0 && !store.audienceSegmentId) {
      store.setField('audienceType', 'all');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-display font-semibold text-patina-charcoal">
          Select Audience
        </h2>
        <p className="text-sm text-patina-clay-beige mt-1">
          Choose who receives this campaign.
        </p>
      </div>

      {/* Recipient count */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-patina-mocha-brown/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-patina-mocha-brown" />
            </div>
            <div>
              <p className="text-sm font-medium text-patina-charcoal">
                Estimated Recipients
              </p>
              <p className="text-xs text-patina-clay-beige">
                {store.audienceType === 'all'
                  ? 'All subscribers with email enabled'
                  : store.audienceSegmentId
                    ? 'Based on selected segment'
                    : store.audienceRules.conditions.length > 0
                      ? 'Based on custom rules'
                      : 'Select an audience below'}
              </p>
            </div>
          </div>
          <p className="text-2xl font-display font-semibold text-patina-charcoal">
            {store.estimatedRecipients.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Quick segment buttons */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-patina-charcoal">
          Quick Select
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => selectSegment(null)}
            className={cn(
              'px-4 py-3 rounded-xl border-2 text-left transition-all',
              store.audienceType === 'all'
                ? 'border-patina-mocha-brown bg-patina-mocha-brown/5 ring-1 ring-patina-mocha-brown/20'
                : 'border-patina-clay-beige/20 bg-white hover:border-patina-clay-beige/40'
            )}
          >
            <p className="text-sm font-medium text-patina-charcoal">All Subscribers</p>
            <p className="text-xs text-patina-clay-beige mt-0.5">Everyone opted in</p>
          </button>

          {segmentsLoading ? (
            <div className="col-span-3 flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            presetSegments.map((segment) => (
              <button
                key={segment.id}
                onClick={() => selectSegment(segment)}
                className={cn(
                  'px-4 py-3 rounded-xl border-2 text-left transition-all',
                  store.audienceSegmentId === segment.id
                    ? 'border-patina-mocha-brown bg-patina-mocha-brown/5 ring-1 ring-patina-mocha-brown/20'
                    : 'border-patina-clay-beige/20 bg-white hover:border-patina-clay-beige/40'
                )}
              >
                <p className="text-sm font-medium text-patina-charcoal line-clamp-1">
                  {segment.name}
                </p>
                <p className="text-xs text-patina-clay-beige mt-0.5">
                  ~{segment.estimated_size.toLocaleString()} recipients
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Saved custom segments */}
      {customSegments.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-patina-charcoal">
            Saved Segments
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customSegments.map((segment) => (
              <button
                key={segment.id}
                onClick={() => selectSegment(segment)}
                className={cn(
                  'px-4 py-3 rounded-xl border-2 text-left transition-all',
                  store.audienceSegmentId === segment.id
                    ? 'border-patina-mocha-brown bg-patina-mocha-brown/5 ring-1 ring-patina-mocha-brown/20'
                    : 'border-patina-clay-beige/20 bg-white hover:border-patina-clay-beige/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-patina-charcoal line-clamp-1">
                    {segment.name}
                  </p>
                  <span className="text-xs text-patina-clay-beige shrink-0">
                    ~{segment.estimated_size.toLocaleString()}
                  </span>
                </div>
                {segment.description && (
                  <p className="text-xs text-patina-clay-beige mt-0.5 line-clamp-1">
                    {segment.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom segment builder */}
      <div className="space-y-3">
        {!showCustomBuilder ? (
          <button
            onClick={() => {
              setShowCustomBuilder(true);
              store.setField('audienceSegmentId', null);
              if (store.audienceRules.conditions.length === 0) {
                addCondition();
              }
            }}
            className="flex items-center gap-2 text-sm font-medium text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
          >
            <Plus className="w-4 h-4" />
            Build Custom Segment
          </button>
        ) : (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-patina-charcoal">
                Custom Segment Rules
              </h3>
              <button
                onClick={() => {
                  setShowCustomBuilder(false);
                  store.setField('audienceRules', { logic: 'and', conditions: [] });
                  store.setField('audienceType', 'all');
                }}
                className="text-xs text-patina-clay-beige hover:text-red-500 transition-colors"
              >
                Clear Rules
              </button>
            </div>

            {/* Logic toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-patina-clay-beige">Match</span>
              <div className="flex gap-1 bg-patina-off-white rounded-md p-0.5">
                <button
                  onClick={() =>
                    store.setField('audienceRules', { ...store.audienceRules, logic: 'and' })
                  }
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    store.audienceRules.logic === 'and'
                      ? 'bg-white shadow-sm text-patina-charcoal'
                      : 'text-patina-clay-beige'
                  )}
                >
                  All rules (AND)
                </button>
                <button
                  onClick={() =>
                    store.setField('audienceRules', { ...store.audienceRules, logic: 'or' })
                  }
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    store.audienceRules.logic === 'or'
                      ? 'bg-white shadow-sm text-patina-charcoal'
                      : 'text-patina-clay-beige'
                  )}
                >
                  Any rule (OR)
                </button>
              </div>
            </div>

            {/* Rule rows */}
            <div className="space-y-2">
              {store.audienceRules.conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={condition.field}
                    onChange={(e) => updateCondition(index, { field: e.target.value })}
                    className="flex-1 px-2.5 py-2 text-xs border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
                  >
                    {SEGMENT_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(index, { operator: e.target.value })}
                    className="w-36 px-2.5 py-2 text-xs border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
                  >
                    {SEGMENT_OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  {condition.operator !== 'is_set' && condition.operator !== 'is_not_set' && (
                    <input
                      type="text"
                      value={String(condition.value ?? '')}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      placeholder="Value..."
                      className="flex-1 px-2.5 py-2 text-xs border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
                    />
                  )}

                  <button
                    onClick={() => removeCondition(index)}
                    className="p-1.5 text-patina-clay-beige hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addCondition}
              className="flex items-center gap-1.5 text-xs font-medium text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Condition
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 4: Preview & Test ─────────────────────────────────────────────────────

function StepPreview() {
  const store = useCampaignWizardStore();

  const templateData = useMemo(
    () => ({
      headline: store.headline,
      body: store.body,
      ctaText: store.ctaText,
      ctaUrl: store.ctaUrl,
      heroImageUrl: store.heroImageUrl,
    }),
    [store.headline, store.body, store.ctaText, store.ctaUrl, store.heroImageUrl]
  );

  const { data: previewHtml } = useTemplatePreview(store.templateId, templateData);
  const { data: templateInfo } = useTemplate(store.templateId);

  const checklistProps = {
    subject: store.subject,
    previewText: store.previewText,
    body: store.body,
    headline: store.headline,
    templateId: store.templateId,
    audienceType: store.audienceType,
    audienceSegmentId: store.audienceSegmentId,
    estimatedRecipients: store.estimatedRecipients,
    ctaUrl: store.ctaUrl,
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-display font-semibold text-patina-charcoal">
          Preview & Verify
        </h2>
        <p className="text-sm text-patina-clay-beige mt-1">
          Review your campaign before sending.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Email preview (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          {/* Subject bar */}
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-patina-mocha-brown/10 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-patina-mocha-brown" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-patina-clay-beige">From: Patina</p>
                <p className="text-sm font-semibold text-patina-charcoal">
                  {store.subject || '(No subject)'}
                </p>
                <p className="text-xs text-patina-clay-beige">
                  {store.previewText || '(No preview text)'}
                </p>
              </div>
            </div>
          </div>

          {/* Full preview */}
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden mx-auto" style={{ maxWidth: '600px' }}>
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="Full email preview"
                className="w-full border-0"
                style={{ height: '600px' }}
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="h-[600px] flex flex-col items-center justify-center text-center p-8">
                <LayoutTemplate className="w-12 h-12 text-patina-clay-beige/30 mb-3" />
                <p className="text-sm text-patina-clay-beige">
                  {store.templateId
                    ? 'Generating preview...'
                    : 'No template selected'}
                </p>
                {templateInfo && (
                  <p className="text-xs text-patina-clay-beige/60 mt-1">
                    Template: {templateInfo.name}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Checklist (2 cols) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5 sticky top-6">
            <PreSendChecklist {...checklistProps} />

            {/* Campaign summary */}
            <div className="mt-6 pt-5 border-t border-patina-clay-beige/20 space-y-3">
              <h3 className="text-sm font-semibold text-patina-charcoal">
                Campaign Summary
              </h3>
              <div className="space-y-2">
                <SummaryRow label="Template" value={templateInfo?.name || 'Not selected'} />
                <SummaryRow label="Subject" value={store.subject || '(empty)'} />
                {store.abEnabled && (
                  <SummaryRow label="Subject B" value={store.subjectB || '(empty)'} />
                )}
                <SummaryRow
                  label="Audience"
                  value={
                    store.audienceType === 'all'
                      ? 'All Subscribers'
                      : store.audienceSegmentId
                        ? 'Selected Segment'
                        : 'Custom Rules'
                  }
                />
                <SummaryRow
                  label="Recipients"
                  value={store.estimatedRecipients.toLocaleString()}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-patina-clay-beige">{label}</span>
      <span className="text-patina-charcoal font-medium truncate max-w-[180px] text-right">
        {value}
      </span>
    </div>
  );
}

// ─── Step 5: Schedule & Confirm ─────────────────────────────────────────────────

function StepSchedule() {
  const store = useCampaignWizardStore();
  const { data: templateInfo } = useTemplate(store.templateId);

  const checklistProps = {
    subject: store.subject,
    previewText: store.previewText,
    body: store.body,
    headline: store.headline,
    templateId: store.templateId,
    audienceType: store.audienceType,
    audienceSegmentId: store.audienceSegmentId,
    estimatedRecipients: store.estimatedRecipients,
    ctaUrl: store.ctaUrl,
  };

  const allPassed = useChecklistAllPassed(checklistProps);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-lg font-display font-semibold text-patina-charcoal">
          Schedule & Confirm
        </h2>
        <p className="text-sm text-patina-clay-beige mt-1">
          Name your campaign and choose when to send it.
        </p>
      </div>

      {/* Campaign name */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
        <label className="text-sm font-medium text-patina-charcoal mb-1.5 block">
          Campaign Name (internal)
        </label>
        <input
          type="text"
          value={store.name}
          onChange={(e) => store.setField('name', e.target.value)}
          placeholder="e.g. March Product Launch, Spring Sale Announcement..."
          className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
        />
        <p className="text-xs text-patina-clay-beige mt-1.5">
          This name is for your reference only. Recipients will not see it.
        </p>
      </div>

      {/* Send option */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-patina-charcoal">
          When to Send
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              store.setField('sendOption', 'now');
              store.setField('scheduledFor', null);
            }}
            className={cn(
              'px-4 py-4 rounded-xl border-2 text-left transition-all',
              store.sendOption === 'now'
                ? 'border-patina-mocha-brown bg-patina-mocha-brown/5 ring-1 ring-patina-mocha-brown/20'
                : 'border-patina-clay-beige/20 hover:border-patina-clay-beige/40'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-patina-mocha-brown" />
              <span className="text-sm font-medium text-patina-charcoal">Send Now</span>
            </div>
            <p className="text-xs text-patina-clay-beige">
              Send immediately after creating the campaign.
            </p>
          </button>

          <button
            onClick={() => store.setField('sendOption', 'later')}
            className={cn(
              'px-4 py-4 rounded-xl border-2 text-left transition-all',
              store.sendOption === 'later'
                ? 'border-patina-mocha-brown bg-patina-mocha-brown/5 ring-1 ring-patina-mocha-brown/20'
                : 'border-patina-clay-beige/20 hover:border-patina-clay-beige/40'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-patina-mocha-brown" />
              <span className="text-sm font-medium text-patina-charcoal">Schedule Later</span>
            </div>
            <p className="text-xs text-patina-clay-beige">
              Pick a date and time for automatic sending.
            </p>
          </button>
        </div>

        {store.sendOption === 'later' && (
          <div>
            <label className="text-sm font-medium text-patina-charcoal mb-1.5 block">
              Scheduled Date & Time
            </label>
            <input
              type="datetime-local"
              value={store.scheduledFor || ''}
              onChange={(e) => store.setField('scheduledFor', e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full max-w-xs px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
            />
          </div>
        )}
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-patina-charcoal">
          Campaign Summary
        </h3>
        <div className="space-y-3">
          <SummaryRow
            label="Campaign Name"
            value={store.name || 'Untitled Campaign'}
          />
          <SummaryRow
            label="Template"
            value={templateInfo?.name || 'Not selected'}
          />
          <SummaryRow
            label="Subject"
            value={store.subject || '(empty)'}
          />
          {store.abEnabled && (
            <SummaryRow
              label="Subject B"
              value={store.subjectB || '(empty)'}
            />
          )}
          <SummaryRow
            label="Audience"
            value={
              store.audienceType === 'all'
                ? 'All Subscribers'
                : store.audienceSegmentId
                  ? 'Selected Segment'
                  : 'Custom Rules'
            }
          />
          <SummaryRow
            label="Recipients"
            value={`~${store.estimatedRecipients.toLocaleString()}`}
          />
          <SummaryRow
            label="Send"
            value={
              store.sendOption === 'now'
                ? 'Immediately'
                : store.scheduledFor
                  ? new Date(store.scheduledFor).toLocaleString()
                  : 'Not scheduled'
            }
          />
        </div>

        {!allPassed && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              Some required checks have not passed. Please go back and complete all required fields.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Confirmation Modal ─────────────────────────────────────────────────────────

function ConfirmModal({
  sendOption,
  scheduledFor,
  name,
  subject,
  estimatedRecipients,
  isCreating,
  onConfirm,
  onCancel,
}: {
  sendOption: 'now' | 'later';
  scheduledFor: string | null;
  name: string;
  subject: string;
  estimatedRecipients: number;
  isCreating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl border border-patina-clay-beige/20 shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-semibold text-patina-charcoal">
            {sendOption === 'now' ? 'Send Campaign?' : 'Schedule Campaign?'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-patina-off-white transition-colors"
          >
            <X className="w-5 h-5 text-patina-clay-beige" />
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-patina-clay-beige">
            {sendOption === 'now'
              ? 'This will immediately send the campaign to all selected recipients. This action cannot be undone.'
              : `This will schedule the campaign to be sent on ${
                  scheduledFor
                    ? new Date(scheduledFor).toLocaleString()
                    : 'the selected date'
                }.`}
          </p>

          <div className="bg-patina-off-white rounded-lg p-3 space-y-2">
            <SummaryRow label="Name" value={name || 'Untitled Campaign'} />
            <SummaryRow label="Subject" value={subject || '(empty)'} />
            <SummaryRow
              label="Recipients"
              value={`~${estimatedRecipients.toLocaleString()}`}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-patina-clay-beige hover:text-patina-charcoal hover:bg-patina-off-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isCreating}
            className="flex items-center gap-2 px-5 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors disabled:opacity-60"
          >
            {isCreating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : sendOption === 'now' ? (
              <Send className="w-4 h-4" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            {sendOption === 'now' ? 'Send Now' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
