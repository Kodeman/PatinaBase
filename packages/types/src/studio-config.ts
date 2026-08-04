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
