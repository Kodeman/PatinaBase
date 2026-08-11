/**
 * Canonical residential workflow vocabulary shared by product surfaces.
 *
 * Stage keys and track keys are persistence contracts defined by migration
 * 00434. Schedule lanes and responsibility lanes are deliberately separate:
 * schedule lanes describe graph topology, while responsibility lanes describe
 * who owns the work.
 */

export const RESIDENTIAL_WORKFLOW_TRACK_KEYS = [
  'core',
  'ffe',
  'construction',
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
    key: 'core',
    label: 'Core',
    purpose: 'The shared client, design, authorization, and closeout spine.',
  },
  {
    key: 'ffe',
    label: 'FF&E',
    purpose: 'The furnishings, fixtures, equipment, and installation workstream.',
  },
  {
    key: 'construction',
    label: 'Construction',
    purpose: 'The permitting, field execution, and contract-administration workstream.',
  },
] as const satisfies readonly ResidentialWorkflowTrack[];

export const RESIDENTIAL_WORKFLOW_SCHEDULE_LANE_KEYS = [
  'main',
  'thread',
] as const;

export type ResidentialWorkflowScheduleLaneKey =
  (typeof RESIDENTIAL_WORKFLOW_SCHEDULE_LANE_KEYS)[number];

export const RESIDENTIAL_WORKFLOW_RESPONSIBILITY_LANE_KEYS = [
  'client_household',
  'lead_designer_studio',
  'project_operations_procurement',
  'technical_build_partners',
  'makers_vendors_logistics',
  'patina_os',
] as const;

export type ResidentialWorkflowResponsibilityLaneKey =
  (typeof RESIDENTIAL_WORKFLOW_RESPONSIBILITY_LANE_KEYS)[number];

export interface ResidentialWorkflowResponsibilityLane {
  key: ResidentialWorkflowResponsibilityLaneKey;
  label: string;
}

export const RESIDENTIAL_WORKFLOW_RESPONSIBILITY_LANES = [
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
] as const satisfies readonly ResidentialWorkflowResponsibilityLane[];

export const RESIDENTIAL_WORKFLOW_STAGE_KEYS = [
  'inquiry_qualification',
  'discovery_programming',
  'scope_engagement',
  'kickoff_existing_conditions',
  'concept_schematic',
  'design_development',
  'documentation_authorization',
  'bidding_permitting_procurement',
  'contract_administration',
  'delivery_installation',
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
  purpose: string;
  expectedGate: string;
  expectedOutputs: readonly string[];
  defaultDeliverables: readonly string[];
  responsibleLaneKey: ResidentialWorkflowResponsibilityLaneKey;
}

export const RESIDENTIAL_WORKFLOW_STAGES = [
  {
    key: 'inquiry_qualification',
    ordinal: 1,
    number: '01',
    title: 'Inquiry & Qualification',
    purpose: 'Confirm the household, project, timing, budget, and studio fit.',
    expectedGate: 'Qualified opportunity and mutual fit confirmed',
    expectedOutputs: ['Qualified lead record', 'Initial project fit assessment'],
    defaultDeliverables: ['Inquiry summary', 'Qualification notes'],
    responsibleLaneKey: 'lead_designer_studio',
  },
  {
    key: 'discovery_programming',
    ordinal: 2,
    number: '02',
    title: 'Discovery & Programming',
    purpose: 'Understand how the household lives, what must change, and why.',
    expectedGate: 'Discovery findings and project program acknowledged',
    expectedOutputs: ['Household brief', 'Needs, constraints, and priorities'],
    defaultDeliverables: ['Discovery notes', 'Project program'],
    responsibleLaneKey: 'lead_designer_studio',
  },
  {
    key: 'scope_engagement',
    ordinal: 3,
    number: '03',
    title: 'Scope & Engagement',
    purpose: 'Define the service, responsibilities, commercial terms, and authority.',
    expectedGate: 'Agreement signed and engagement confirmed',
    expectedOutputs: ['Approved scope', 'Executed service agreement'],
    defaultDeliverables: ['Proposal', 'Service agreement'],
    responsibleLaneKey: 'lead_designer_studio',
  },
  {
    key: 'kickoff_existing_conditions',
    ordinal: 4,
    number: '04',
    title: 'Kickoff & Existing Conditions',
    purpose: 'Align the team and establish a reliable record of the existing home.',
    expectedGate: 'Brief, site record, and project working plan accepted',
    expectedOutputs: ['Confirmed project brief', 'Existing-conditions record'],
    defaultDeliverables: ['Kickoff record', 'Measured survey / site documentation'],
    responsibleLaneKey: 'lead_designer_studio',
  },
  {
    key: 'concept_schematic',
    ordinal: 5,
    number: '05',
    title: 'Concept / Schematic',
    purpose: 'Establish the spatial, material, and aesthetic direction of the work.',
    expectedGate: 'One concept direction approved for development',
    expectedOutputs: ['Concept direction', 'Schematic plan and material story'],
    defaultDeliverables: ['Concept presentation', 'Preliminary selections'],
    responsibleLaneKey: 'lead_designer_studio',
  },
  {
    key: 'design_development',
    ordinal: 6,
    number: '06',
    title: 'Design Development',
    purpose: 'Resolve the approved concept into coordinated, buildable decisions.',
    expectedGate: 'Developed design and primary selections approved',
    expectedOutputs: ['Coordinated developed design', 'Resolved specifications'],
    defaultDeliverables: ['Design development presentation', 'Updated selection schedule'],
    responsibleLaneKey: 'lead_designer_studio',
  },
  {
    key: 'documentation_authorization',
    ordinal: 7,
    number: '07',
    title: 'Documentation / Authorization',
    purpose: 'Document the work and authorize the cost basis used to execute it.',
    expectedGate: 'Documents and budget snapshot approved',
    expectedOutputs: ['Issued design documents', 'Authorized project budget'],
    defaultDeliverables: ['Drawing / specification set', 'Budget authorization'],
    responsibleLaneKey: 'lead_designer_studio',
  },
  {
    key: 'bidding_permitting_procurement',
    ordinal: 8,
    number: '08',
    title: 'Bidding, Permitting & Procurement',
    purpose: 'Secure approvals, pricing, goods, and custom work for execution.',
    expectedGate: 'Bids, permits, orders, and critical lead times accepted',
    expectedOutputs: ['Committed execution ledger', 'Permitting and logistics plan'],
    defaultDeliverables: ['Bid / permit record', 'Procurement status ledger'],
    responsibleLaneKey: 'project_operations_procurement',
  },
  {
    key: 'contract_administration',
    ordinal: 9,
    number: '09',
    title: 'Contract Administration',
    purpose: 'Answer field issues and protect approved design intent during execution.',
    expectedGate: 'Site work accepted as ready for installation',
    expectedOutputs: ['Resolved field decisions', 'Installation-ready site'],
    defaultDeliverables: ['Site observation record', 'Field clarification log'],
    responsibleLaneKey: 'technical_build_partners',
  },
  {
    key: 'delivery_installation',
    ordinal: 10,
    number: '10',
    title: 'Delivery, Installation & Styling',
    purpose: 'Receive, install, inspect, and compose the completed interior.',
    expectedGate: 'Installation complete and punch items recorded',
    expectedOutputs: ['Installed interior', 'Punch and exception record'],
    defaultDeliverables: ['Installation plan', 'Styled-room record'],
    responsibleLaneKey: 'project_operations_procurement',
  },
  {
    key: 'closeout_post_occupancy',
    ordinal: 11,
    number: '11',
    title: 'Closeout & Post-Occupancy',
    purpose: 'Close the record, transfer care knowledge, and learn from lived use.',
    expectedGate: 'Final acceptance and care handoff complete',
    expectedOutputs: ['Accepted closeout record', 'Post-occupancy learning'],
    defaultDeliverables: ['Care and warranty folio', 'Final walkthrough record'],
    responsibleLaneKey: 'lead_designer_studio',
  },
] as const satisfies readonly ResidentialWorkflowStage[];
