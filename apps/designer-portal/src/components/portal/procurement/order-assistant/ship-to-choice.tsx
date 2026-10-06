'use client';

/**
 * C-02 ship-to: an explicit choice with nothing preselected (R-PB3 — sending
 * is refused server-side when a PO has no ship-to). One radio group, two
 * homes: the order paper's header and PoPreview's "Ship-to not
 * set" band for an existing unsent PO.
 *
 * C-13: the studio's locations come first, receivers ahead of the rest, with
 * the default receiver marked but never preselected. Then the studio
 * address, the job site and "Somewhere else". A location is saved through
 * `set_purchase_order_ship_to_location` (00697), which writes the FK and the
 * printed snapshot; the other choices store their text through
 * `set_purchase_order_ship_to` (00690).
 */

import { useId } from 'react';
import {
  useOrganizations,
  useProject,
  useSetPurchaseOrderShipTo,
  useSetPurchaseOrderShipToLocation,
  useStudioIdentity,
  useStudioLocations,
  type PurchaseOrder,
  type StudioLocationRow,
} from '@patina/supabase';

export type ShipToKind = 'location' | 'studio' | 'site' | 'other';

export interface ShipToSelection {
  kind: ShipToKind | null;
  /** The "Somewhere else" free text; read only when kind is 'other'. */
  otherText: string;
  /** The chosen studio location; read only when kind is 'location'. */
  locationId?: string;
}

export type ShipToLocation = Pick<
  StudioLocationRow,
  'id' | 'kind' | 'label' | 'address' | 'is_default_receiver'
>;

export const EMPTY_SHIP_TO: ShipToSelection = { kind: null, otherText: '' };

export const SHIP_TO_REQUIRED_MESSAGE = 'Choose where this ships.';

export interface ShipToAddresses {
  /** The studio's live locations, receivers first. */
  locations: ShipToLocation[];
  /** organizations.address formatted on one line; null hides "The studio". */
  studioAddress: string | null;
  /** projects.site_address; null hides "The job site". */
  siteAddress: string | null;
}

const clean = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : '';

/**
 * organizations.address (00021 JSONB, OrganizationAddress
 * street/city/state/zip/country) on one line:
 * "1 Main St, Madison, WI 53703, US". Null when nothing usable is on file.
 */
export function formatStudioAddress(address: unknown): string | null {
  if (typeof address === 'string') return address.trim() || null;
  if (!address || typeof address !== 'object') return null;
  const a = address as Record<string, unknown>;
  const stateZip = [clean(a.state), clean(a.zip)].filter(Boolean).join(' ');
  const line = [clean(a.street), clean(a.city), stateZip, clean(a.country)]
    .filter(Boolean)
    .join(', ');
  return line || null;
}

/** A location on one line: its label, then its address. */
export function formatLocation(location: ShipToLocation): string {
  const address = formatStudioAddress(location.address);
  return address ? `${location.label}, ${address}` : location.label;
}

/** Receivers first; the hook's order (default receiver, then label) within. */
export function orderShipToLocations<T extends Pick<ShipToLocation, 'kind'>>(
  locations: readonly T[],
): T[] {
  return [
    ...locations.filter((l) => l.kind === 'receiver'),
    ...locations.filter((l) => l.kind !== 'receiver'),
  ];
}

/**
 * The text a selection shows, or null when no usable choice is made. For a
 * location this is the one-line preview; the server prints its own snapshot.
 */
export function resolveShipTo(
  selection: ShipToSelection,
  addresses: ShipToAddresses,
): string | null {
  switch (selection.kind) {
    case 'location': {
      const location = addresses.locations.find((l) => l.id === selection.locationId);
      return location ? formatLocation(location) : null;
    }
    case 'studio':
      return addresses.studioAddress;
    case 'site':
      return addresses.siteAddress;
    case 'other':
      return selection.otherText.trim() || null;
    default:
      return null;
  }
}

/**
 * What the choice can offer: the studio's live locations, then two addresses. The studio is the project's studio
 * (projects.studio_id), never the caller's first organization: a co-member or
 * a member of two studios would otherwise ship to the wrong studio. A legacy
 * project with no studio_id falls back to the owner's primary studio, the
 * precedence the brand resolver reads (00317/00320). The address comes from
 * the caller's own memberships, the only organizations RLS lets them read.
 * The job site is the project's site_address. Either is null while loading
 * or when not on file.
 */
export function useShipToAddresses(projectId: string | null | undefined): ShipToAddresses {
  const { data: orgs } = useOrganizations();
  const { data: project } = useProject(projectId ?? '');
  const p = project as
    | { studio_id?: string | null; designer_id?: string | null; site_address?: string | null }
    | undefined;
  const { data: ownerStudio } = useStudioIdentity({
    designerId: p && !p.studio_id ? p.designer_id : null,
  });
  const studioId = p?.studio_id || ownerStudio?.studioId || null;
  const { data: locations } = useStudioLocations(studioId);
  const org = studioId
    ? (orgs?.find((o) => o.id === studioId) as { address?: unknown } | undefined)
    : undefined;
  return {
    locations: orderShipToLocations(locations ?? []),
    studioAddress: formatStudioAddress(org?.address),
    siteAddress: p?.site_address?.trim() || null,
  };
}

/**
 * Save a selection onto a PO: a location through the location RPC (FK plus
 * snapshot), anything else as text. Resolves to the updated PO.
 */
export function useSaveShipTo() {
  const setShipTo = useSetPurchaseOrderShipTo({ errorSurface: 'inline' });
  const setShipToLocation = useSetPurchaseOrderShipToLocation({ errorSurface: 'inline' });
  return {
    isPending: setShipTo.isPending || setShipToLocation.isPending,
    save: (
      purchaseOrderId: string,
      selection: ShipToSelection,
      shipTo: string,
    ): Promise<PurchaseOrder> =>
      selection.kind === 'location' && selection.locationId
        ? setShipToLocation.mutateAsync({ purchaseOrderId, locationId: selection.locationId })
        : setShipTo.mutateAsync({ purchaseOrderId, shipTo }),
  };
}

export interface ShipToChoiceProps extends ShipToAddresses {
  value: ShipToSelection;
  onChange: (next: ShipToSelection) => void;
  disabled?: boolean;
  /** Marks the group invalid; the caller renders the words. */
  invalid?: boolean;
}

interface ShipToOption {
  key: string;
  kind: ShipToKind;
  locationId?: string;
  label: string;
  /** "Default receiver": a mark only, never a preselection (R-PB3). */
  mark?: string;
  detail: string | null;
}

export function ShipToChoice({
  locations,
  studioAddress,
  siteAddress,
  value,
  onChange,
  disabled,
  invalid,
}: ShipToChoiceProps) {
  const name = useId();
  const options: ShipToOption[] = locations.map((l) => ({
    key: `location:${l.id}`,
    kind: 'location',
    locationId: l.id,
    label: l.label,
    mark: l.is_default_receiver ? 'Default receiver' : undefined,
    detail: formatStudioAddress(l.address),
  }));
  if (studioAddress)
    options.push({ key: 'studio', kind: 'studio', label: 'The studio', detail: studioAddress });
  if (siteAddress)
    options.push({ key: 'site', kind: 'site', label: 'The job site', detail: siteAddress });
  options.push({ key: 'other', kind: 'other', label: 'Somewhere else', detail: null });

  const isChecked = (opt: ShipToOption) =>
    value.kind === opt.kind && (opt.kind !== 'location' || value.locationId === opt.locationId);
  const select = (opt: ShipToOption) =>
    onChange(
      opt.kind === 'location'
        ? { ...value, kind: 'location', locationId: opt.locationId }
        : { ...value, kind: opt.kind },
    );

  return (
    <fieldset disabled={disabled} aria-invalid={invalid || undefined}>
      <legend className="mb-2 type-meta-small text-[var(--text-primary)]">Ship to</legend>
      <div className="flex flex-col gap-1.5">
        {options.map((opt) => (
          <label key={opt.key} className="flex items-start gap-2 text-[0.7rem] text-[var(--text-primary)]">
            <input
              type="radio"
              name={name}
              value={opt.key}
              checked={isChecked(opt)}
              onChange={() => select(opt)}
              className="mt-[3px]"
            />
            <span>
              {opt.label}
              {opt.mark && <span className="text-[var(--text-muted)]"> · {opt.mark}</span>}
              {opt.detail && (
                <span className="block text-[var(--text-muted)]">{opt.detail}</span>
              )}
            </span>
          </label>
        ))}
        {value.kind === 'other' && (
          <input
            type="text"
            aria-label="Ship-to address"
            value={value.otherText}
            onChange={(e) => onChange({ ...value, otherText: e.target.value })}
            placeholder="Receiver, street, city, state, zip"
            className="ml-5 rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 text-[0.7rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
          />
        )}
      </div>
    </fieldset>
  );
}
