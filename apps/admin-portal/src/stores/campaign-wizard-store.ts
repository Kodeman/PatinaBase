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
  step: number;
  draftId: string | null;
  isDirty: boolean;
  lastSavedAt: string | null;

  templateId: string | null;
  emailTemplateId: string | null;

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

  audienceType: 'all' | 'segment' | 'individual';
  audienceSegmentId: string | null;
  audienceRules: AudienceRules;
  estimatedRecipients: number;

  sendOption: 'now' | 'later';
  scheduledFor: string | null;
  name: string;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setField: <K extends keyof CampaignWizardFields>(field: K, value: CampaignWizardFields[K]) => void;
  setDraftId: (id: string) => void;
  markSaved: () => void;
  markDirty: () => void;
  reset: () => void;
  loadCampaign: (campaign: Record<string, unknown>) => void;
}

type CampaignWizardFields = Omit<
  CampaignWizardState,
  'setStep' | 'nextStep' | 'prevStep' | 'setField' | 'setDraftId' | 'markSaved' | 'markDirty' | 'reset' | 'loadCampaign'
>;

const TOTAL_STEPS = 5;

const initialState: Omit<
  CampaignWizardState,
  'setStep' | 'nextStep' | 'prevStep' | 'setField' | 'setDraftId' | 'markSaved' | 'markDirty' | 'reset' | 'loadCampaign'
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
      setStep: (step) => set({ step: Math.max(0, Math.min(step, TOTAL_STEPS - 1)) }),
      nextStep: () => set((s) => ({ step: Math.min(s.step + 1, TOTAL_STEPS - 1) })),
      prevStep: () => set((s) => ({ step: Math.max(s.step - 1, 0) })),
      setField: (field, value) => set({ [field]: value, isDirty: true }),
      setDraftId: (id) => set({ draftId: id }),
      markSaved: () => set({ isDirty: false, lastSavedAt: new Date().toISOString() }),
      markDirty: () => set({ isDirty: true }),
      reset: () => set(initialState),
      loadCampaign: (campaign: Record<string, unknown>) => {
        const templateData = (campaign.template_data || {}) as Record<string, unknown>;
        const audienceSegment = (campaign.audience_segment || {}) as Record<string, unknown>;
        set({
          ...initialState,
          draftId: campaign.id as string,
          name: (campaign.name as string) || '',
          subject: (campaign.subject as string) || '',
          previewText: (campaign.preview_text as string) || '',
          templateId: (campaign.template_id as string) || null,
          emailTemplateId: (campaign.email_template_id as string) || null,
          headline: (templateData.headline as string) || '',
          body: (templateData.body as string) || '',
          ctaText: (templateData.ctaText as string) || '',
          ctaUrl: (templateData.ctaUrl as string) || '',
          heroImageUrl: (templateData.heroImageUrl as string) || '',
          contentJson: (campaign.content_json as Record<string, unknown>) || {},
          abEnabled: (campaign.ab_enabled as boolean) || false,
          subjectB: (campaign.ab_subject_b as string) || '',
          audienceType: (campaign.audience_type as 'all' | 'segment' | 'individual') || 'all',
          audienceSegmentId: (campaign.audience_segment_id as string) || (audienceSegment.segment_id as string) || null,
          audienceRules: (audienceSegment.rules as AudienceRules) || { logic: 'and' as const, conditions: [] },
          sendOption: campaign.scheduled_for ? 'later' : 'now',
          scheduledFor: (campaign.scheduled_for as string) || null,
          step: 0,
          isDirty: false,
          lastSavedAt: null,
        });
      },
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

export const useWizardStep = () => useCampaignWizardStore((s) => s.step);
export const useWizardDraftId = () => useCampaignWizardStore((s) => s.draftId);
export const useWizardIsDirty = () => useCampaignWizardStore((s) => s.isDirty);
