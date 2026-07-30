/**
 * Project Activation Wizard — 7-step state.
 *
 * Two entry paths:
 *   1. From a signed proposal → activate_proposal_as_project RPC pre-fills
 *      basics + scope, wizard jumps to step 03 (Schedule).
 *   2. Manual from the ⌘K "Open a project" verb on the Desk → blank wizard
 *      from step 01. (Pre-dissolve this was the /portal/projects/new route.)
 *
 * Drafts auto-persist to localStorage; full save creates a `projects` row
 * with status='draft' (via useUpdateProject) so the row appears in Pipeline
 * as "Activation Incomplete".
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WizardRoom {
  id: string; // client-side UUID until persisted
  name: string;
  roomType: string;
  dimensions: string;
  budgetCents: number;
  ffeCategories: string[];
  notes: string;
}

export interface WizardPhase {
  id: string;
  name: string;
  durationWeeks: number;
  feeCents: number;
  gateCondition: string;
}

export interface WizardMilestone {
  id: string;
  label: string;
  percentage: number;
  amountCents: number;
  triggerCondition: string;
  phaseId?: string;
}

export interface WizardTeamMember {
  userId: string;
  name: string;
  role: 'lead_designer' | 'support_designer' | 'bookkeeper';
}

export interface WizardVendorAssignment {
  ffeCategory: string;
  vendorId: string;
  vendorName: string;
}

export type ClientVisibilityTier = 'full' | 'milestone' | 'curated';

export interface ActivationWizardState {
  step: WizardStep;
  draftProjectId: string | null;
  fromProposalId: string | null;
  isDirty: boolean;
  lastSavedAt: string | null;

  // Step 01 — Basics
  name: string;
  address: string;
  clientId: string | null;
  clientName: string;
  leadDesignerId: string | null;
  leadDesignerName: string;
  studioId: string | null;

  // Step 02 — Scope & Rooms
  rooms: WizardRoom[];

  // Step 03 — Schedule & Phases
  kickoffDate: string;
  phases: WizardPhase[];
  expectedCompletionDate: string | null;

  // Step 04 — Financials
  budgetTotalCents: number;
  designFeeCents: number;
  contingencyPercent: number;
  milestones: WizardMilestone[];

  // Step 05 — Team & Vendors
  team: WizardTeamMember[];
  vendorAssignments: WizardVendorAssignment[];

  // Step 06 — Client Access
  visibilityTier: ClientVisibilityTier;

  // Actions
  setStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setField: <K extends keyof ActivationWizardFields>(field: K, value: ActivationWizardFields[K]) => void;
  setDraftId: (id: string) => void;
  markSaved: () => void;
  markDirty: () => void;
  hydrateFromProposal: (data: Partial<ActivationWizardFields> & { fromProposalId: string }) => void;
  reset: () => void;
}

type ActivationWizardFields = Omit<
  ActivationWizardState,
  'setStep' | 'nextStep' | 'prevStep' | 'setField' | 'setDraftId' | 'markSaved' | 'markDirty' | 'hydrateFromProposal' | 'reset'
>;

const TOTAL_STEPS = 7;

const initialState: ActivationWizardFields = {
  step: 1,
  draftProjectId: null,
  fromProposalId: null,
  isDirty: false,
  lastSavedAt: null,

  name: '',
  address: '',
  clientId: null,
  clientName: '',
  leadDesignerId: null,
  leadDesignerName: '',
  studioId: null,

  rooms: [],

  kickoffDate: new Date().toISOString().split('T')[0],
  phases: [
    { id: 'p1', name: 'Initiation', durationWeeks: 2, feeCents: 0, gateCondition: 'Kickoff approved' },
    { id: 'p2', name: 'Design Development', durationWeeks: 6, feeCents: 0, gateCondition: 'Design package signed' },
    { id: 'p3', name: 'Procurement', durationWeeks: 8, feeCents: 0, gateCondition: 'POs issued' },
    { id: 'p4', name: 'Production', durationWeeks: 12, feeCents: 0, gateCondition: 'Items produced' },
    { id: 'p5', name: 'Installation', durationWeeks: 3, feeCents: 0, gateCondition: 'On-site complete' },
    { id: 'p6', name: 'Close-out', durationWeeks: 1, feeCents: 0, gateCondition: 'Final walkthrough' },
  ],
  expectedCompletionDate: null,

  budgetTotalCents: 0,
  designFeeCents: 0,
  contingencyPercent: 10,
  milestones: [],

  team: [],
  vendorAssignments: [],

  visibilityTier: 'milestone',
};

export const useActivationWizard = create<ActivationWizardState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => set({ step }),
      nextStep: () => {
        const { step } = get();
        if (step < TOTAL_STEPS) set({ step: (step + 1) as WizardStep });
      },
      prevStep: () => {
        const { step } = get();
        if (step > 1) set({ step: (step - 1) as WizardStep });
      },

      setField: (field, value) =>
        set({ [field]: value, isDirty: true } as Partial<ActivationWizardState>),

      setDraftId: (id) => set({ draftProjectId: id }),
      markSaved: () => set({ isDirty: false, lastSavedAt: new Date().toISOString() }),
      markDirty: () => set({ isDirty: true }),

      hydrateFromProposal: (data) =>
        set({ ...initialState, ...data, step: 3, isDirty: false }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'patina:activation-wizard',
      // Persist all step state but not the action functions (zustand handles this)
    }
  )
);

export const TOTAL_WIZARD_STEPS = TOTAL_STEPS;

export const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Basics',
  2: 'Scope',
  3: 'Schedule',
  4: 'Financials',
  5: 'Team',
  6: 'Access',
  7: 'Review',
};
