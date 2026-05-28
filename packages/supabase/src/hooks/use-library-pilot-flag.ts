'use client';

import { useMemo } from 'react';
import { useOrganizations } from './use-organizations';

const FLAG_KEY = 'three_layer_catalog_enabled';

/**
 * PRD §14 / S3.12 pilot launch gate. Reads
 * `organizations.settings.three_layer_catalog_enabled` for each design
 * studio the caller belongs to. Returns true when ANY of the user's
 * design_studio orgs has the flag set — multi-studio users (e.g.
 * Patina internal accounts active across pilot orgs) inherit access
 * if any of their orgs is in the pilot.
 *
 * Default: false (i.e. flag absent or false ⇒ no pilot access). The
 * ProductsZone routes can opt in via this hook; default-off keeps
 * non-pilot designers on the existing /portal/catalog single-tier
 * surface until Kody flips the flag globally.
 *
 * Operations
 * ──────────
 * To toggle on for Leah's studio:
 *
 *   UPDATE organizations
 *      SET settings = settings || '{"three_layer_catalog_enabled": true}'
 *    WHERE slug = 'middlewest-studio';
 *
 * To turn off again:
 *
 *   UPDATE organizations
 *      SET settings = settings - 'three_layer_catalog_enabled'
 *    WHERE slug = 'middlewest-studio';
 *
 * Once stable for the pilot cohort, flip the default in the consuming
 * surface (`useLibraryPilotEnabled` callsites) and drop the flag.
 */
export function useLibraryPilotEnabled(): {
  enabled: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useOrganizations();

  const enabled = useMemo(() => {
    if (!data) return false;
    return data.some((org) => {
      const settings = (org as { settings?: Record<string, unknown> | null }).settings;
      const type = (org as { type?: string }).type;
      return type === 'design_studio' && Boolean(settings?.[FLAG_KEY]);
    });
  }, [data]);

  return { enabled, isLoading };
}
