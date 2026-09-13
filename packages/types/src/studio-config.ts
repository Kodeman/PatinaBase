/**
 * Studio Staffing & Rolodex Vocabulary
 *
 * Canonical vocab for the Call Sheet program (staffing + vendor rolodex).
 * DB stores free TEXT, this is the UI vocabulary. Mirrors `field-config.ts`:
 * const arrays + union types + display-label maps, imported by every portal
 * so staff titles / vendor specialties / reach states stay consistent.
 */

// ============================================================================
// STAFF ROLES
// ============================================================================

export type StaffRole =
  | 'principal'
  | 'design_director'
  | 'senior_designer'
  | 'designer'
  | 'junior_designer'
  | 'design_assistant'
  | 'project_manager'
  | 'procurement'
  | 'studio_manager'
  | 'bookkeeper';

export const ALL_STAFF_ROLES: readonly StaffRole[] = [
  'principal',
  'design_director',
  'senior_designer',
  'designer',
  'junior_designer',
  'design_assistant',
  'project_manager',
  'procurement',
  'studio_manager',
  'bookkeeper',
] as const;

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  principal: 'Principal',
  design_director: 'Design Director',
  senior_designer: 'Senior Designer',
  designer: 'Designer',
  junior_designer: 'Junior Designer',
  design_assistant: 'Design Assistant',
  project_manager: 'Project Manager',
  procurement: 'Procurement / Expeditor',
  studio_manager: 'Studio Manager',
  bookkeeper: 'Bookkeeper',
};

/** Display label for a staff role; falls back to prettified raw value for unknowns. */
export function getStaffRoleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return STAFF_ROLE_LABELS[role as StaffRole] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Default organization tier for each staff role. */
export const STAFF_ROLE_DEFAULT_TIER: Record<StaffRole, 'owner' | 'admin' | 'member' | 'guest'> = {
  principal: 'owner',
  design_director: 'admin',
  senior_designer: 'member',
  designer: 'member',
  junior_designer: 'member',
  design_assistant: 'member',
  project_manager: 'member',
  procurement: 'member',
  studio_manager: 'admin',
  bookkeeper: 'member',
};

// ============================================================================
// VENDOR SPECIALTIES
// ============================================================================

export type VendorSpecialty =
  | 'furniture'
  | 'upholstery_workroom'
  | 'drapery_workroom'
  | 'lighting'
  | 'plumbing_fixtures'
  | 'tile_stone'
  | 'stone_slab'
  | 'appliances'
  | 'kitchen_bath_showroom'
  | 'art_framing'
  | 'antiques_vintage'
  | 'rugs_carpet'
  | 'wallpaper'
  | 'fabric_textiles'
  | 'millwork_fabrication'
  | 'metal_glass_fabrication'
  | 'hardware'
  | 'outdoor'
  | 'accessories_styling'
  | 'movers'
  | 'receiving_warehouse';

export const ALL_VENDOR_SPECIALTIES: readonly VendorSpecialty[] = [
  'furniture',
  'upholstery_workroom',
  'drapery_workroom',
  'lighting',
  'plumbing_fixtures',
  'tile_stone',
  'stone_slab',
  'appliances',
  'kitchen_bath_showroom',
  'art_framing',
  'antiques_vintage',
  'rugs_carpet',
  'wallpaper',
  'fabric_textiles',
  'millwork_fabrication',
  'metal_glass_fabrication',
  'hardware',
  'outdoor',
  'accessories_styling',
  'movers',
  'receiving_warehouse',
] as const;

export const VENDOR_SPECIALTY_LABELS: Record<VendorSpecialty, string> = {
  furniture: 'Furniture',
  upholstery_workroom: 'Upholstery workroom',
  drapery_workroom: 'Drapery workroom',
  lighting: 'Lighting',
  plumbing_fixtures: 'Plumbing fixtures',
  tile_stone: 'Tile & stone',
  stone_slab: 'Stone slab',
  appliances: 'Appliances',
  kitchen_bath_showroom: 'Kitchen & bath showroom',
  art_framing: 'Art & framing',
  antiques_vintage: 'Antiques & vintage',
  rugs_carpet: 'Rugs & carpet',
  wallpaper: 'Wallpaper',
  fabric_textiles: 'Fabric & textiles',
  millwork_fabrication: 'Millwork fabrication',
  metal_glass_fabrication: 'Metal & glass fabrication',
  hardware: 'Hardware',
  outdoor: 'Outdoor',
  accessories_styling: 'Accessories & styling',
  movers: 'Movers',
  receiving_warehouse: 'Receiving & warehouse',
};

/** Display label for a vendor specialty; falls back to prettified raw value for unknowns. */
export function getVendorSpecialtyLabel(specialty: string | null | undefined): string {
  if (!specialty) return '';
  return VENDOR_SPECIALTY_LABELS[specialty as VendorSpecialty] ?? specialty.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// CONTACT SCOPE
// ============================================================================

export type ContactScope = 'mine' | 'studio';

// ============================================================================
// ROSTER SOURCE
// ============================================================================

export type RosterSource = 'party' | 'team';

// ============================================================================
// REACH STATE
// ============================================================================

export type ReachState = 'account' | 'field_link' | 'on_paper';

export const REACH_STATE_LABELS: Record<ReachState, string> = {
  account: 'Account',
  field_link: 'Field link',
  on_paper: 'On paper',
};

export function getReachStateLabel(state: string | null | undefined): string {
  if (!state) return '';
  return REACH_STATE_LABELS[state as ReachState] ?? state;
}

// ============================================================================
// THE FOUR WORD FAMILIES (People room CRM — direction §3.8)
//
// Four families, one grammar: every state Patina prints in the People room is
// ONE WORD in ONE OF FOUR PIGMENTS. The word is always printed — colour never
// carries a state alone (SPEC §7 #9) — and the border pigment and the word
// always agree.
//
// `ReachState` above is the first family. The other three follow, plus the
// pigment table they all reduce through.
// ============================================================================

/** The four pigments a state word may wear. Never a fill — a border and text
 *  on a transparent ground (SPEC §8 #10). */
export type StateWordPigment = 'current' | 'pending' | 'blocked' | 'dormant';

/** Which family a word belongs to. Used by the shared `StateWord` primitive to
 *  reduce a raw value to its word and its pigment without the caller
 *  re-deriving either. */
export type StateWordFamily = 'reach' | 'consent' | 'stage' | 'paper';

/** The house-sheet token names each pigment resolves to. The alias block in
 *  the designer portal's `globals.css` maps these onto the shipped
 *  `--color-*` values (PR-v); SPEC §2.2's `.word--*` rules are the same four
 *  pairs, stated in CSS. */
export interface StateWordPigmentTokens {
  /** `border-color` for the bordered word box. */
  border: string;
  /** `color` for the word itself — always a text-grade ink. */
  color: string;
}

export const STATE_WORD_PIGMENTS: Record<StateWordPigment, StateWordPigmentTokens> = {
  current: { border: 'var(--sage)', color: 'var(--sage-ink)' },
  pending: { border: 'var(--golden)', color: 'var(--golden-ink)' },
  blocked: { border: 'var(--terracotta)', color: 'var(--terracotta-ink)' },
  dormant: { border: 'var(--hairline-strong)', color: 'var(--ink-faint)' },
};

// ── Reach (E6/E9) ───────────────────────────────────────────────────────────

export const REACH_STATE_PIGMENTS: Record<ReachState, StateWordPigment> = {
  account: 'current',
  field_link: 'pending',
  on_paper: 'dormant',
};

// ── Consent (E8) ────────────────────────────────────────────────────────────

/** The four consent WORDS. Distinct from `SmsConsentStatus`, which is the
 *  record's stored status (`not_asked | pending | granted | opted_out`): the
 *  studio reads "Texting", never "granted". */
export type ConsentWord = 'texting' | 'invited' | 'opted_out' | 'not_asked';

export const ALL_CONSENT_WORDS: readonly ConsentWord[] = [
  'texting',
  'invited',
  'opted_out',
  'not_asked',
] as const;

export const CONSENT_WORD_LABELS: Record<ConsentWord, string> = {
  texting: 'Texting',
  invited: 'Invited',
  opted_out: 'Opted out',
  not_asked: 'Not asked',
};

export const CONSENT_WORD_PIGMENTS: Record<ConsentWord, StateWordPigment> = {
  texting: 'current',
  invited: 'pending',
  opted_out: 'blocked',
  not_asked: 'dormant',
};

/** `studio_channel_consent.status` (through `channel_consent_status()`, which
 *  already folds `refusal_unanswered` into `opted_out`) → the printed word. */
const CONSENT_STATUS_TO_WORD: Record<string, ConsentWord> = {
  granted: 'texting',
  pending: 'invited',
  opted_out: 'opted_out',
  not_asked: 'not_asked',
};

/**
 * The consent word for a recorded status. Returns `null` for a NULL/absent
 * status — "no record" is its own fact and must not be printed as "Not asked"
 * (R-BB / w1b r8 MAJOR-1: a fail-open word over another studio's dated
 * refusal is exactly what this program removed).
 */
export function consentWordFor(status: string | null | undefined): ConsentWord | null {
  if (status === null || status === undefined || status === '') return null;
  return CONSENT_STATUS_TO_WORD[status] ?? null;
}

// ── Stage (E5/E14) ──────────────────────────────────────────────────────────

/** `project_parties.stage` — the twelve values the CHECK admits (00624). */
export type SeatStage =
  | 'prospect'
  | 'invited'
  | 'bidding'
  | 'declined'
  | 'no_response'
  | 'awarded'
  | 'mobilized'
  | 'active'
  | 'closeout'
  | 'warranty'
  | 'off_job'
  | 'retired';

export const ALL_SEAT_STAGES: readonly SeatStage[] = [
  'prospect',
  'invited',
  'bidding',
  'declined',
  'no_response',
  'awarded',
  'mobilized',
  'active',
  'closeout',
  'warranty',
  'off_job',
  'retired',
] as const;

/** The NINE stage WORDS direction §3.8 prints. Twelve stored stages reduce to
 *  nine words: `invited` reads as Bidding (the studio asked), `mobilized` and
 *  `active` both read as On the job, `retired` reads as Off the job. */
export type SeatStageWord =
  | 'on_the_job'
  | 'bidding'
  | 'awarded'
  | 'closing_out'
  | 'warranty'
  | 'prospect'
  | 'declined'
  | 'no_response'
  | 'off_the_job';

export const ALL_SEAT_STAGE_WORDS: readonly SeatStageWord[] = [
  'on_the_job',
  'bidding',
  'awarded',
  'closing_out',
  'warranty',
  'prospect',
  'declined',
  'no_response',
  'off_the_job',
] as const;

export const SEAT_STAGE_WORD_LABELS: Record<SeatStageWord, string> = {
  on_the_job: 'On the job',
  bidding: 'Bidding',
  awarded: 'Awarded',
  closing_out: 'Closing out',
  warranty: 'Warranty',
  prospect: 'Prospect',
  declined: 'Declined',
  no_response: 'No response',
  off_the_job: 'Off the job',
};

export const SEAT_STAGE_WORD_PIGMENTS: Record<SeatStageWord, StateWordPigment> = {
  on_the_job: 'current',
  bidding: 'pending',
  awarded: 'pending',
  closing_out: 'pending',
  // Direction §3.8: the stage family never uses the blocked pigment. A stage
  // is where the work stands, not a thing that holds the work up.
  warranty: 'dormant',
  prospect: 'dormant',
  declined: 'dormant',
  no_response: 'dormant',
  off_the_job: 'dormant',
};

const SEAT_STAGE_TO_WORD: Record<SeatStage, SeatStageWord> = {
  prospect: 'prospect',
  invited: 'bidding',
  bidding: 'bidding',
  declined: 'declined',
  no_response: 'no_response',
  awarded: 'awarded',
  mobilized: 'on_the_job',
  active: 'on_the_job',
  closeout: 'closing_out',
  warranty: 'warranty',
  off_job: 'off_the_job',
  retired: 'off_the_job',
};

/** The printed word for a stored stage. `null` for an absent or unknown
 *  stage — a seat with no stage is not a seat at Prospect. */
export function seatStageWordFor(stage: string | null | undefined): SeatStageWord | null {
  if (!stage) return null;
  return SEAT_STAGE_TO_WORD[stage as SeatStage] ?? null;
}

export function getSeatStageLabel(stage: string | null | undefined): string {
  const word = seatStageWordFor(stage);
  return word ? SEAT_STAGE_WORD_LABELS[word] : '';
}

// ── Paper (E10) ─────────────────────────────────────────────────────────────

/** `compliance_state()` / `identity_paper_state()` (00623, 00626). */
export type PaperState = 'current' | 'lapses_soon' | 'lapsed' | 'not_on_file';

export const ALL_PAPER_STATES: readonly PaperState[] = [
  'current',
  'lapses_soon',
  'lapsed',
  'not_on_file',
] as const;

export const PAPER_STATE_LABELS: Record<PaperState, string> = {
  current: 'Current',
  lapses_soon: 'Lapses in 30 days',
  lapsed: 'Lapsed',
  not_on_file: 'Not on file',
};

export const PAPER_STATE_PIGMENTS: Record<PaperState, StateWordPigment> = {
  current: 'current',
  lapses_soon: 'pending',
  lapsed: 'blocked',
  not_on_file: 'dormant',
};

export function paperStateFor(state: string | null | undefined): PaperState | null {
  if (!state) return null;
  return (ALL_PAPER_STATES as readonly string[]).includes(state)
    ? (state as PaperState)
    : null;
}

// ── The one reduction every surface uses ────────────────────────────────────

export interface StateWordResolution {
  family: StateWordFamily;
  /** The stable token (`on_the_job`, `texting`, …). */
  value: string;
  /** The word as the studio reads it. */
  label: string;
  pigment: StateWordPigment;
  tokens: StateWordPigmentTokens;
}

/**
 * Reduce any raw family value — a `reach_state`, a consent status, a stored
 * `stage`, a `paper_state` — to the word and the pigment it prints in.
 * Returns `null` when the value names no word in that family, which every
 * caller must render as NOTHING rather than as a guess (R-V: an absent fact
 * prints its own sentence, never a fabricated state).
 */
export function resolveStateWord(
  family: StateWordFamily,
  value: string | null | undefined,
): StateWordResolution | null {
  switch (family) {
    case 'reach': {
      if (!value || !(value in REACH_STATE_LABELS)) return null;
      const reach = value as ReachState;
      const pigment = REACH_STATE_PIGMENTS[reach];
      return {
        family,
        value: reach,
        label: REACH_STATE_LABELS[reach],
        pigment,
        tokens: STATE_WORD_PIGMENTS[pigment],
      };
    }
    case 'consent': {
      const word = consentWordFor(value);
      if (!word) return null;
      const pigment = CONSENT_WORD_PIGMENTS[word];
      return {
        family,
        value: word,
        label: CONSENT_WORD_LABELS[word],
        pigment,
        tokens: STATE_WORD_PIGMENTS[pigment],
      };
    }
    case 'stage': {
      const word = seatStageWordFor(value);
      if (!word) return null;
      const pigment = SEAT_STAGE_WORD_PIGMENTS[word];
      return {
        family,
        value: word,
        label: SEAT_STAGE_WORD_LABELS[word],
        pigment,
        tokens: STATE_WORD_PIGMENTS[pigment],
      };
    }
    case 'paper': {
      const state = paperStateFor(value);
      if (!state) return null;
      const pigment = PAPER_STATE_PIGMENTS[state];
      return {
        family,
        value: state,
        label: PAPER_STATE_LABELS[state],
        pigment,
        tokens: STATE_WORD_PIGMENTS[pigment],
      };
    }
    default:
      return null;
  }
}
