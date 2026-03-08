import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CampaignBuilderState {
  step: number;
  draftId: string | null;

  // Form fields
  name: string;
  subject: string;
  previewText: string;
  templateId: string;
  templateData: Record<string, unknown>;
  audienceType: 'all' | 'segment' | 'individual';
  audienceSegment: Record<string, unknown> | null;
  scheduledFor: string | null;

  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setDraftId: (id: string) => void;
  setField: <K extends keyof CampaignFormFields>(key: K, value: CampaignFormFields[K]) => void;
  setTemplateData: (data: Record<string, unknown>) => void;
  reset: () => void;
}

interface CampaignFormFields {
  name: string;
  subject: string;
  previewText: string;
  templateId: string;
  audienceType: 'all' | 'segment' | 'individual';
  audienceSegment: Record<string, unknown> | null;
  scheduledFor: string | null;
}

const TOTAL_STEPS = 6;

const initialFormState = {
  step: 0,
  draftId: null as string | null,
  name: '',
  subject: '',
  previewText: '',
  templateId: '',
  templateData: {} as Record<string, unknown>,
  audienceType: 'all' as const,
  audienceSegment: null as Record<string, unknown> | null,
  scheduledFor: null as string | null,
};

export const useCampaignBuilderStore = create<CampaignBuilderState>()(
  persist(
    (set) => ({
      ...initialFormState,

      setStep: (step) => set({ step: Math.max(0, Math.min(step, TOTAL_STEPS - 1)) }),
      nextStep: () => set((s) => ({ step: Math.min(s.step + 1, TOTAL_STEPS - 1) })),
      prevStep: () => set((s) => ({ step: Math.max(s.step - 1, 0) })),
      setDraftId: (id) => set({ draftId: id }),
      setField: (key, value) => set({ [key]: value }),
      setTemplateData: (data) => set({ templateData: data }),
      reset: () => set(initialFormState),
    }),
    {
      name: 'patina-campaign-builder',
      partialize: (state) => ({
        step: state.step,
        draftId: state.draftId,
        name: state.name,
        subject: state.subject,
        previewText: state.previewText,
        templateId: state.templateId,
        templateData: state.templateData,
        audienceType: state.audienceType,
        audienceSegment: state.audienceSegment,
        scheduledFor: state.scheduledFor,
      }),
    }
  )
);

// Selector hooks
export const useCampaignStep = () => useCampaignBuilderStore((s) => s.step);
export const useCampaignDraftId = () => useCampaignBuilderStore((s) => s.draftId);
