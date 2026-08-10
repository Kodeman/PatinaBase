/**
 * The canonical residential design workflow used by Patina's designer-facing
 * Document. This is authored product language, not a projection of database
 * rows: project phases opt into it with an explicit canonical phase key.
 */

export const RESIDENTIAL_WORKFLOW_TRACK_KEYS = [
  'planning',
  'design',
  'procurement',
  'construction',
  'completion',
] as const;

export type ResidentialWorkflowTrackKey =
  (typeof RESIDENTIAL_WORKFLOW_TRACK_KEYS)[number];

export interface ResidentialWorkflowTrack {
  key: ResidentialWorkflowTrackKey;
  label: string;
  purpose: string;
}

export const RESIDENTIAL_WORKFLOW_TRACKS = [
  {
    key: 'planning',
    label: 'Planning',
    purpose:
      'Qualify the fit, understand the household, and establish the work.',
  },
  {
    key: 'design',
    label: 'Design',
    purpose: 'Turn the brief into an approved, documented design direction.',
  },
  {
    key: 'procurement',
    label: 'Procurement',
    purpose: 'Authorize, order, fabricate, and track the specified work.',
  },
  {
    key: 'construction',
    label: 'Construction',
    purpose: 'Protect design intent while the site work is executed.',
  },
  {
    key: 'completion',
    label: 'Completion',
    purpose: 'Install, close out, and learn from the lived result.',
  },
] as const satisfies readonly ResidentialWorkflowTrack[];

export const RESIDENTIAL_WORKFLOW_LANE_KEYS = [
  'client_household',
  'lead_designer_studio',
  'project_operations_procurement',
  'technical_build_partners',
  'makers_vendors_logistics',
  'patina_os',
] as const;

export type ResidentialWorkflowLaneKey =
  (typeof RESIDENTIAL_WORKFLOW_LANE_KEYS)[number];

export interface ResidentialWorkflowLane {
  key: ResidentialWorkflowLaneKey;
  label: string;
}

export const RESIDENTIAL_WORKFLOW_LANES = [
  { key: 'client_household', label: 'Client / household' },
  { key: 'lead_designer_studio', label: 'Lead designer / studio' },
  {
    key: 'project_operations_procurement',
    label: 'Project operations / procurement',
  },
  {
    key: 'technical_build_partners',
    label: 'Technical / build partners',
  },
  {
    key: 'makers_vendors_logistics',
    label: 'Makers / vendors / logistics',
  },
  { key: 'patina_os', label: 'Patina OS' },
] as const satisfies readonly ResidentialWorkflowLane[];

export const RESIDENTIAL_WORKFLOW_STAGE_KEYS = [
  'inquiry_qualification',
  'discovery_consultation',
  'scope_engagement',
  'kickoff_existing_conditions',
  'concept_schematic_design',
  'design_development',
  'documentation_budget_authorization',
  'procurement_fabrication',
  'renovation_construction_administration',
  'delivery_installation_styling',
  'closeout_post_occupancy',
] as const;

export type ResidentialWorkflowStageKey =
  (typeof RESIDENTIAL_WORKFLOW_STAGE_KEYS)[number];

export type ResidentialWorkflowStageNumber =
  | '01'
  | '02'
  | '03'
  | '04'
  | '05'
  | '06'
  | '07'
  | '08'
  | '09'
  | '10'
  | '11';

export interface ResidentialWorkflowStage {
  key: ResidentialWorkflowStageKey;
  ordinal: number;
  number: ResidentialWorkflowStageNumber;
  title: string;
  trackKey: ResidentialWorkflowTrackKey;
  purpose: string;
  expectedGate: string;
  expectedOutputs: readonly string[];
  defaultDeliverables: readonly string[];
  responsibleLaneKey: ResidentialWorkflowLaneKey;
  /**
   * Explicit project_phases.phase_key values that may activate this stage.
   * Names and labels are intentionally excluded: legacy rows must not be
   * guessed into the canonical workflow.
   */
  canonicalPhaseKeys: readonly string[];
}

export const RESIDENTIAL_WORKFLOW_STAGES = [
  {
    key: 'inquiry_qualification',
    ordinal: 1,
    number: '01',
    title: 'Inquiry & Qualification',
    trackKey: 'planning',
    purpose: 'Confirm the household, project, timing, budget, and studio fit.',
    expectedGate: 'Qualified opportunity and mutual fit confirmed',
    expectedOutputs: [
      'Qualified lead record',
      'Initial project fit assessment',
    ],
    defaultDeliverables: ['Inquiry summary', 'Qualification notes'],
    responsibleLaneKey: 'lead_designer_studio',
    canonicalPhaseKeys: [],
  },
  {
    key: 'discovery_consultation',
    ordinal: 2,
    number: '02',
    title: 'Discovery & Consultation',
    trackKey: 'planning',
    purpose: 'Understand how the household lives, what must change, and why.',
    expectedGate: 'Discovery findings acknowledged by the household',
    expectedOutputs: ['Household brief', 'Needs, constraints, and priorities'],
    defaultDeliverables: ['Discovery notes', 'Consultation recap'],
    responsibleLaneKey: 'lead_designer_studio',
    canonicalPhaseKeys: [],
  },
  {
    key: 'scope_engagement',
    ordinal: 3,
    number: '03',
    title: 'Scope & Engagement',
    trackKey: 'planning',
    purpose:
      'Define the service, responsibilities, commercial terms, and authority.',
    expectedGate: 'Agreement signed and engagement authorized',
    expectedOutputs: ['Approved scope', 'Executed service agreement'],
    defaultDeliverables: ['Proposal', 'Service agreement'],
    responsibleLaneKey: 'lead_designer_studio',
    canonicalPhaseKeys: [],
  },
  {
    key: 'kickoff_existing_conditions',
    ordinal: 4,
    number: '04',
    title: 'Kickoff & Existing Conditions',
    trackKey: 'planning',
    purpose:
      'Align the team and establish a reliable record of the existing home.',
    expectedGate: 'Brief, site record, and project working plan accepted',
    expectedOutputs: ['Confirmed project brief', 'Existing-conditions record'],
    defaultDeliverables: [
      'Kickoff record',
      'Measured survey / site documentation',
    ],
    responsibleLaneKey: 'lead_designer_studio',
    canonicalPhaseKeys: ['consultation', 'kickoff_existing_conditions'],
  },
  {
    key: 'concept_schematic_design',
    ordinal: 5,
    number: '05',
    title: 'Concept / Schematic Design',
    trackKey: 'design',
    purpose:
      'Establish the spatial, material, and aesthetic direction of the work.',
    expectedGate: 'One concept direction approved for development',
    expectedOutputs: ['Concept direction', 'Schematic plan and material story'],
    defaultDeliverables: ['Concept presentation', 'Preliminary selections'],
    responsibleLaneKey: 'lead_designer_studio',
    canonicalPhaseKeys: ['concept_development', 'concept_schematic_design'],
  },
  {
    key: 'design_development',
    ordinal: 6,
    number: '06',
    title: 'Design Development',
    trackKey: 'design',
    purpose:
      'Resolve the approved concept into coordinated, buildable decisions.',
    expectedGate: 'Developed design and primary selections approved',
    expectedOutputs: [
      'Coordinated developed design',
      'Resolved specifications',
    ],
    defaultDeliverables: [
      'Design development presentation',
      'Updated selection schedule',
    ],
    responsibleLaneKey: 'lead_designer_studio',
    canonicalPhaseKeys: ['design_refinement', 'design_development'],
  },
  {
    key: 'documentation_budget_authorization',
    ordinal: 7,
    number: '07',
    title: 'Documentation & Budget Authorization',
    trackKey: 'design',
    purpose:
      'Document the work and authorize the cost basis used to execute it.',
    expectedGate: 'Documents, budget, and procurement authority approved',
    expectedOutputs: ['Issued design documents', 'Authorized project budget'],
    defaultDeliverables: [
      'Drawing / specification set',
      'Budget authorization',
    ],
    responsibleLaneKey: 'lead_designer_studio',
    canonicalPhaseKeys: ['documentation_budget_authorization', 'documentation'],
  },
  {
    key: 'procurement_fabrication',
    ordinal: 8,
    number: '08',
    title: 'Procurement & Fabrication',
    trackKey: 'procurement',
    purpose:
      'Release approved goods and custom work, then manage them to readiness.',
    expectedGate: 'Orders authorized and critical lead times accepted',
    expectedOutputs: [
      'Committed order ledger',
      'Fabrication and logistics plan',
    ],
    defaultDeliverables: ['Purchase orders', 'Procurement status ledger'],
    responsibleLaneKey: 'project_operations_procurement',
    canonicalPhaseKeys: ['procurement', 'procurement_fabrication'],
  },
  {
    key: 'renovation_construction_administration',
    ordinal: 9,
    number: '09',
    title: 'Renovation / Construction Administration',
    trackKey: 'construction',
    purpose:
      'Coordinate the field team, answer issues, and protect approved design intent.',
    expectedGate: 'Site work accepted as ready for installation',
    expectedOutputs: ['Resolved field decisions', 'Installation-ready site'],
    defaultDeliverables: ['Site observation record', 'Field clarification log'],
    responsibleLaneKey: 'technical_build_partners',
    canonicalPhaseKeys: [
      'renovation_construction_administration',
      'construction_administration',
    ],
  },
  {
    key: 'delivery_installation_styling',
    ordinal: 10,
    number: '10',
    title: 'Delivery, Installation & Styling',
    trackKey: 'completion',
    purpose: 'Receive, install, inspect, and compose the completed interior.',
    expectedGate: 'Installation complete and punch items recorded',
    expectedOutputs: ['Installed interior', 'Punch and exception record'],
    defaultDeliverables: ['Installation plan', 'Styled-room record'],
    responsibleLaneKey: 'project_operations_procurement',
    canonicalPhaseKeys: ['installation', 'delivery_installation_styling'],
  },
  {
    key: 'closeout_post_occupancy',
    ordinal: 11,
    number: '11',
    title: 'Closeout & Post-Occupancy',
    trackKey: 'completion',
    purpose:
      'Close the record, transfer care knowledge, and learn from lived use.',
    expectedGate: 'Final acceptance and care handoff complete',
    expectedOutputs: ['Accepted closeout record', 'Post-occupancy learning'],
    defaultDeliverables: [
      'Care and warranty folio',
      'Final walkthrough record',
    ],
    responsibleLaneKey: 'lead_designer_studio',
    canonicalPhaseKeys: ['final_walkthrough', 'closeout_post_occupancy'],
  },
] as const satisfies readonly ResidentialWorkflowStage[];
