import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database, Json } from '../database.types';
import { invalidateFfeCaches, type PurchaseOrder } from './use-procurement';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO BUYING — US-16 Phase 1 (SQ-402; migrations 00696, 00697, 00713)
//
//   studio_vendor_accounts  the studio's own card over a shared vendors row
//                           (C-12, R-PB4). Read through
//                           get_studio_vendor_accounts, which returns
//                           trade_discount_pct only when the caller can see
//                           the studio's margin (R1); written through
//                           upsert_studio_vendor_account.
//   studio_locations        receiver / studio / workroom / storage / site,
//                           one default receiver per studio (C-13).
//   margin visibility       organizations.margin_visibility, everyone by
//                           default; an owner/admin seat may restrict it to
//                           owners and admins (R1, R-PB6).
// ═══════════════════════════════════════════════════════════════════════════

type PublicSchema = Database['public'];

/** A studio_vendor_accounts row as get_studio_vendor_accounts returns it.
 *  `trade_discount_pct` is null when the caller cannot see the studio's
 *  margin. */
export type StudioVendorAccountRow = PublicSchema['Tables']['studio_vendor_accounts']['Row'];
export type StudioLocationRow = PublicSchema['Tables']['studio_locations']['Row'];
export type StudioMarginVisibility = 'everyone' | 'owners_admins';
export type StudioLocationKind = 'receiver' | 'studio' | 'workroom' | 'storage' | 'site';
export type StudioVendorTransmission = 'email' | 'portal' | 'phone' | 'showroom';
export type StudioInspectionWindowMode = 'parcel' | 'ltl' | 'white_glove' | 'concealed_carrier';

/**
 * Patch for upsert_studio_vendor_account. A key that is present sets the
 * column (null clears it); an omitted key leaves it unchanged. Setting
 * `tradeDiscountPct` is refused for a caller who cannot see the margin.
 * Claim windows left null read as the R-PB9 defaults (72 h vendor, 5 days
 * concealed carrier).
 */
export interface StudioVendorAccountRequest {
  studioContactId?: string | null;
  accountStatus?: PublicSchema['Enums']['account_status'];
  accountNumber?: string | null;
  accountOpenedOn?: string | null;
  tierLabel?: string | null;
  repContactId?: string | null;
  creditLimitCents?: number | null;
  paymentPattern?: PublicSchema['Enums']['purchase_order_payment_pattern'] | null;
  depositPct?: number | null;
  netDays?: number | null;
  tradeDiscountPct?: number | null;
  paymentMethodId?: string | null;
  transmission?: StudioVendorTransmission | null;
  ordersEmailOverride?: string | null;
  portalUrl?: string | null;
  leadTimeDays?: number | null;
  quoteValidityDays?: number | null;
  changeWindowDays?: number | null;
  claimsWindowDays?: number | null;
  inspectionWindowDays?: Partial<Record<StudioInspectionWindowMode, number>> | null;
  restockingPct?: number | null;
  freightPolicy?: string | null;
  blindShip?: boolean;
  resaleCertOnFileOn?: string | null;
  resaleCertState?: string | null;
  notes?: string | null;
  /** true archives the account, false restores it. */
  archived?: boolean;
}

/** organizations.address shape. */
export interface StudioLocationAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

/**
 * Request for upsert_studio_location. Without `id` it creates a location
 * (`kind` and `label` required); with `id` it patches the keys present.
 * `isDefaultReceiver: true` moves the default off the studio's other
 * location.
 */
export interface StudioLocationRequest {
  id?: string;
  kind?: StudioLocationKind;
  studioContactId?: string | null;
  label?: string;
  address?: StudioLocationAddress | null;
  receivingHours?: string | null;
  hasDock?: boolean | null;
  needsLiftgate?: boolean | null;
  storageFreeDays?: number | null;
  storageRateCentsMonth?: number | null;
  receivingFeeCentsPiece?: number | null;
  instructions?: string | null;
  isDefaultReceiver?: boolean;
}

export const studioBuyingKeys = {
  vendorAccounts: (organizationId: string) => ['studio-vendor-accounts', organizationId] as const,
  vendorAccount: (organizationId: string, vendorId: string) =>
    ['studio-vendor-accounts', organizationId, vendorId] as const,
  locations: (organizationId: string) => ['studio-locations', organizationId] as const,
  marginVisibility: (organizationId: string) =>
    ['studio-margin-visibility', organizationId] as const,
  canSeeMargin: (organizationId: string) => ['studio-can-see-margin', organizationId] as const,
};

// ─── Vendor accounts ─────────────────────────────────────────────────────────

/** The studio's vendor accounts, archived ones included (archived_at set). */
export function useStudioVendorAccounts(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: studioBuyingKeys.vendorAccounts(organizationId ?? ''),
    queryFn: async (): Promise<StudioVendorAccountRow[]> => {
      const { data, error } = await getSupabase().rpc('get_studio_vendor_accounts', {
        p_org: organizationId as string,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });
}

/** The studio's account with one vendor, or null when it has none yet. */
export function useStudioVendorAccount(
  organizationId: string | null | undefined,
  vendorId: string | null | undefined,
) {
  return useQuery({
    queryKey: studioBuyingKeys.vendorAccount(organizationId ?? '', vendorId ?? ''),
    queryFn: async (): Promise<StudioVendorAccountRow | null> => {
      const { data, error } = await getSupabase().rpc('get_studio_vendor_accounts', {
        p_org: organizationId as string,
        p_vendor_id: vendorId as string,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!organizationId && !!vendorId,
  });
}

export interface UpsertStudioVendorAccountInput {
  organizationId: string;
  vendorId: string;
  request: StudioVendorAccountRequest;
}

/** Create or patch the studio's account with a vendor. */
export function useUpsertStudioVendorAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      vendorId,
      request,
    }: UpsertStudioVendorAccountInput): Promise<StudioVendorAccountRow> => {
      const { data, error } = await getSupabase().rpc('upsert_studio_vendor_account', {
        p_org: organizationId,
        p_vendor_id: vendorId,
        p_request: request as Json,
      });
      if (error) throw error;
      return data as StudioVendorAccountRow;
    },
    onSuccess: (_row, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: studioBuyingKeys.vendorAccounts(organizationId) });
    },
  });
}

export interface ResolveOrCreateVendorInput {
  name?: string | null;
  website?: string | null;
}

/**
 * Find the shared vendors row by website host, then exact name, and create
 * one only when neither matches (R-PB4). Resolves to the vendor id.
 */
export function useResolveOrCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, website }: ResolveOrCreateVendorInput): Promise<string> => {
      const { data, error } = await getSupabase().rpc('resolve_or_create_vendor', {
        p_name: name ?? '',
        p_website: website ?? '',
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

// ─── Locations ───────────────────────────────────────────────────────────────

/** The studio's locations: the default receiver first, then by label.
 *  Archived ones only when asked for. */
export function useStudioLocations(
  organizationId: string | null | undefined,
  options?: { includeArchived?: boolean },
) {
  const includeArchived = options?.includeArchived ?? false;
  return useQuery({
    queryKey: [...studioBuyingKeys.locations(organizationId ?? ''), { includeArchived }],
    queryFn: async (): Promise<StudioLocationRow[]> => {
      let query = getSupabase()
        .from('studio_locations')
        .select('*')
        .eq('organization_id', organizationId as string);
      if (!includeArchived) query = query.is('archived_at', null);
      const { data, error } = await query
        .order('is_default_receiver', { ascending: false })
        .order('label', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });
}

export interface UpsertStudioLocationInput {
  organizationId: string;
  request: StudioLocationRequest;
}

/** Create or patch a studio location. */
export function useUpsertStudioLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      request,
    }: UpsertStudioLocationInput): Promise<StudioLocationRow> => {
      const { data, error } = await getSupabase().rpc('upsert_studio_location', {
        p_org: organizationId,
        p_request: request as Json,
      });
      if (error) throw error;
      return data as StudioLocationRow;
    },
    onSuccess: (_row, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: studioBuyingKeys.locations(organizationId) });
    },
  });
}

/** Archive a location (it stops being the default receiver), or restore it. */
export function useArchiveStudioLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      locationId,
      archived = true,
    }: {
      locationId: string;
      archived?: boolean;
    }): Promise<StudioLocationRow> => {
      const { data, error } = await getSupabase().rpc('archive_studio_location', {
        p_location_id: locationId,
        p_archived: archived,
      });
      if (error) throw error;
      return data as StudioLocationRow;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: studioBuyingKeys.locations(row.organization_id) });
    },
  });
}

export interface SetPurchaseOrderShipToLocationInput {
  purchaseOrderId: string;
  /** null clears both the location and the printed ship-to. */
  locationId: string | null;
}

/**
 * Point a PO at a studio location: the server writes ship_to_location_id and
 * the printed ship_to snapshot together. Same rule as useSetPurchaseOrderShipTo:
 * after send, a missing ship-to may be filled but one on the paper is fixed.
 */
export function useSetPurchaseOrderShipToLocation(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      purchaseOrderId,
      locationId,
    }: SetPurchaseOrderShipToLocationInput): Promise<PurchaseOrder> => {
      const { data, error } = await getSupabase().rpc('set_purchase_order_ship_to_location', {
        p_po_id: purchaseOrderId,
        // The RPC accepts NULL (clear); the generated arg type is non-null.
        p_location_id: locationId as string,
      });
      if (error) {
        throw new Error(
          `Failed to set purchase_order ship-to location for ${purchaseOrderId}: ${
            error.message ?? String(error)
          }`,
        );
      }
      return data as unknown as PurchaseOrder;
    },
    onSuccess: (po) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', po.id] });
      invalidateFfeCaches(queryClient, po.project_id);
    },
  });
}

// ─── Margin visibility ───────────────────────────────────────────────────────

/** The studio's margin setting; 'everyone' unless an owner/admin restricted it. */
export function useStudioMarginVisibility(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: studioBuyingKeys.marginVisibility(organizationId ?? ''),
    queryFn: async (): Promise<StudioMarginVisibility> => {
      const { data, error } = await getSupabase()
        .from('organizations')
        .select('margin_visibility')
        .eq('id', organizationId as string)
        .single();
      if (error) throw error;
      return data.margin_visibility as StudioMarginVisibility;
    },
    enabled: !!organizationId,
  });
}

/** Change who sees margin. Owner/admin seat only; the server refuses others. */
export function useSetStudioMarginVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      visibility,
    }: {
      organizationId: string;
      visibility: StudioMarginVisibility;
    }): Promise<StudioMarginVisibility> => {
      const { data, error } = await getSupabase().rpc('set_studio_margin_visibility', {
        p_org: organizationId,
        p_visibility: visibility,
      });
      if (error) throw error;
      return data as StudioMarginVisibility;
    },
    onSuccess: (_value, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: studioBuyingKeys.marginVisibility(organizationId) });
      queryClient.invalidateQueries({ queryKey: studioBuyingKeys.canSeeMargin(organizationId) });
      // trade_discount_pct masking follows the setting.
      queryClient.invalidateQueries({ queryKey: studioBuyingKeys.vendorAccounts(organizationId) });
    },
  });
}

/** Whether the signed-in user may see this studio's margin (R1 + R-PB6). */
export function useCanSeeStudioMargin(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: studioBuyingKeys.canSeeMargin(organizationId ?? ''),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getSupabase().rpc('can_see_studio_margin', {
        p_org: organizationId as string,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: !!organizationId,
  });
}
