import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AudienceCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface AudienceRules {
  logic: 'and' | 'or';
  conditions: AudienceCondition[];
}

export interface CampaignWizardState {
  // Step tracking
  step: number; // 0-4
  draftId: string | null;
  isDirty: boolean;
  lastSavedAt: string | null;

  // Step 1: Template
  templateId: string | null;
  emailTemplateId: string | null;

  // Step 2: Content
  subject: string;
  subjectB: string;
  previewText: string;
  body: string;
  headline: string;
  ctaText: string;
  ctaUrl: string;
  heroImageUrl: string;
  contentJson: Record<string, unknown>;
  abEnabled: boolean;

  // Step 3: Audience
  audienceType: 'all' | 'segment' | 'individual';
  audienceSegmentId: string | null;
  audienceRules: AudienceRules;
  estimatedRecipients: number;

  // Step 5: Schedule
  sendOption: 'now' | 'later';
  scheduledFor: string | null;
  name: string;

  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setField: <K extends keyof CampaignWizardFields>(field: K, value: CampaignWizardFields[K]) => void;
  setDraftId: (id: string) => void;
  markSaved: () => void;
  markDirty: () => void;
  reset: () => void;
}

type CampaignWizardFields = Omit<
  CampaignWizardState,
  | 'setStep'
  | 'nextStep'
  | 'prevStep'
  | 'setField'
  | 'setDraftId'
  | 'markSaved'
  | 'markDirty'
  | 'reset'
>;

const TOTAL_STEPS = 5;

const initialState: Omit<
  CampaignWizardState,
  'setStep' | 'nextStep' | 'prevStep' | 'setField' | 'setDraftId' | 'markSaved' | 'markDirty' | 'reset'
> = {
  step: 0,
  draftId: null,
  isDirty: false,
  lastSavedAt: null,

  templateId: null,
  emailTemplateId: null,

  subject: '',
  subjectB: '',
  previewText: '',
  body: '',
  headline: '',
  ctaText: '',
  ctaUrl: '',
  heroImageUrl: '',
  contentJson: {},
  abEnabled: false,

  audienceType: 'all',
  audienceSegmentId: null,
  audienceRules: { logic: 'and', conditions: [] },
  estimatedRecipients: 0,

  sendOption: 'now',
  scheduledFor: null,
  name: '',
};

export const useCampaignWizardStore = create<CampaignWizardState>()(
  persist(
    (set) => ({
      ...initialState,

      setStep: (step) =>
        set({ step: Math.max(0, Math.min(step, TOTAL_STEPS - 1)) }),

      nextStep: () =>
        set((s) => ({ step: Math.min(s.step + 1, TOTAL_STEPS - 1) })),

      prevStep: () =>
        set((s) => ({ step: Math.max(s.step - 1, 0) })),

      setField: (field, value) =>
        set({ [field]: value, isDirty: true }),

      setDraftId: (id) =>
        set({ draftId: id }),

      markSaved: () =>
        set({ isDirty: false, lastSavedAt: new Date().toISOString() }),

      markDirty: () =>
        set({ isDirty: true }),

      reset: () =>
        set(initialState),
    }),
    {
      name: 'patina-campaign-wizard',
      partialize: (state) => ({
        step: state.step,
        draftId: state.draftId,
        isDirty: state.isDirty,
        lastSavedAt: state.lastSavedAt,
        templateId: state.templateId,
        emailTemplateId: state.emailTemplateId,
        subject: state.subject,
        subjectB: state.subjectB,
        previewText: state.previewText,
        body: state.body,
        headline: state.headline,
        ctaText: state.ctaText,
        ctaUrl: state.ctaUrl,
        heroImageUrl: state.heroImageUrl,
        contentJson: state.contentJson,
        abEnabled: state.abEnabled,
        audienceType: state.audienceType,
        audienceSegmentId: state.audienceSegmentId,
        audienceRules: state.audienceRules,
        estimatedRecipients: state.estimatedRecipients,
        sendOption: state.sendOption,
        scheduledFor: state.scheduledFor,
        name: state.name,
      }),
    }
  )
);

// Selector hooks
export const useWizardStep = () => useCampaignWizardStore((s) => s.step);
export const useWizardDraftId = () => useCampaignWizardStore((s) => s.draftId);
export const useWizardIsDirty = () => useCampaignWizardStore((s) => s.isDirty);
