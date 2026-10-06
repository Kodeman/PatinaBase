'use client';

/**
 * C-02 ship-to: an explicit choice with nothing preselected (R-PB3 — sending
 * is refused server-side when a PO has no ship-to). One radio group, two
 * homes: the Order Assistant's Details step and PoPreview's "Ship-to not
 * set" band for an existing unsent PO. The chosen text is what
 * `set_purchase_order_ship_to` (00690) stores and the vendor paper prints.
 */

import { useId } from 'react';
import { useOrganizations, useProject, useStudioIdentity } from '@patina/supabase';

export type ShipToKind = 'studio' | 'site' | 'other';

export interface ShipToSelection {
  kind: ShipToKind | null;
  /** The "Somewhere else" free text; read only when kind is 'other'. */
  otherText: string;
}

export const EMPTY_SHIP_TO: ShipToSelection = { kind: null, otherText: '' };

export const SHIP_TO_REQUIRED_MESSAGE = 'Choose where this ships.';

export interface ShipToAddresses {
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

/** The text to store for a selection, or null when no usable choice is made. */
export function resolveShipTo(
  selection: ShipToSelection,
  addresses: ShipToAddresses,
): string | null {
  switch (selection.kind) {
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
 * The two addresses the choice can offer. The studio is the project's studio
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
  const org = studioId
    ? (orgs?.find((o) => o.id === studioId) as { address?: unknown } | undefined)
    : undefined;
  return {
    studioAddress: formatStudioAddress(org?.address),
    siteAddress: p?.site_address?.trim() || null,
  };
}

export interface ShipToChoiceProps extends ShipToAddresses {
  value: ShipToSelection;
  onChange: (next: ShipToSelection) => void;
  disabled?: boolean;
  /** Marks the group invalid; the caller renders the words. */
  invalid?: boolean;
}

export function ShipToChoice({
  studioAddress,
  siteAddress,
  value,
  onChange,
  disabled,
  invalid,
}: ShipToChoiceProps) {
  const name = useId();
  const options: Array<{ kind: ShipToKind; label: string; detail: string | null }> = [];
  if (studioAddress) options.push({ kind: 'studio', label: 'The studio', detail: studioAddress });
  if (siteAddress) options.push({ kind: 'site', label: 'The job site', detail: siteAddress });
  options.push({ kind: 'other', label: 'Somewhere else', detail: null });

  return (
    <fieldset disabled={disabled} aria-invalid={invalid || undefined}>
      <legend className="mb-2 type-meta-small text-[var(--text-primary)]">Ship to</legend>
      <div className="flex flex-col gap-1.5">
        {options.map((opt) => (
          <label key={opt.kind} className="flex items-start gap-2 text-[0.7rem] text-[var(--text-primary)]">
            <input
              type="radio"
              name={name}
              value={opt.kind}
              checked={value.kind === opt.kind}
              onChange={() => onChange({ ...value, kind: opt.kind })}
              className="mt-[3px]"
            />
            <span>
              {opt.label}
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
