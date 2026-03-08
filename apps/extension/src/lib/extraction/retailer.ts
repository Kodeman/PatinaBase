/**
 * Retailer extraction from current domain
 */

import type { VendorMatchConfidence } from '@patina/shared';

// Known furniture retailers and their display names
// Imported conceptually from metadata.ts but defined here for direct access
export const RETAILER_MAP: Record<string, string> = {
  'restorationhardware.com': 'Restoration Hardware',
  'rh.com': 'Restoration Hardware',
  'cb2.com': 'CB2',
  'crateandbarrel.com': 'Crate & Barrel',
  'westelm.com': 'West Elm',
  'potterybarn.com': 'Pottery Barn',
  'potterybarnkids.com': 'Pottery Barn Kids',
  'arhaus.com': 'Arhaus',
  'roomandboard.com': 'Room & Board',
  'article.com': 'Article',
  'wayfair.com': 'Wayfair',
  'allmodern.com': 'AllModern',
  'jossandmain.com': 'Joss & Main',
  'birchlane.com': 'Birch Lane',
  'ethanallen.com': 'Ethan Allen',
  'bassettfurniture.com': 'Bassett',
  'haverty.com': "Haverty's",
  'ikea.com': 'IKEA',
  'target.com': 'Target',
  'amazon.com': 'Amazon',
  'overstock.com': 'Overstock',
  'homedepot.com': 'The Home Depot',
  'lowes.com': "Lowe's",
  'williams-sonoma.com': 'Williams Sonoma',
  'serenaandlily.com': 'Serena & Lily',
  'ballarddesigns.com': 'Ballard Designs',
  'anthropologie.com': 'Anthropologie',
  'urbanoutfitters.com': 'Urban Outfitters',
  'zgallerie.com': 'Z Gallerie',
  'lumens.com': 'Lumens',
  'ylighting.com': 'YLighting',
  'design-within-reach.com': 'Design Within Reach',
  'dwr.com': 'Design Within Reach',
  'hermanmiller.com': 'Herman Miller',
  'knoll.com': 'Knoll',
  'vitra.com': 'Vitra',
  'hay.dk': 'HAY',
  'muuto.com': 'Muuto',
  'fritzhansen.com': 'Fritz Hansen',
  'kartell.com': 'Kartell',
  'flos.com': 'Flos',
  'artek.fi': 'Artek',
  'cassina.com': 'Cassina',
  'bfremodern.com': 'B&B Italia',
  'poliform.com': 'Poliform',
  'minotti.com': 'Minotti',
  'flexform.it': 'Flexform',
  'ligne-roset.com': 'Ligne Roset',
  'natuzzi.com': 'Natuzzi',
  'burkedecor.com': 'Burke Decor',
  '1stdibs.com': '1stDibs',
  'chairish.com': 'Chairish',
  'luluandgeorgia.com': 'Lulu and Georgia',
  'mcgeeandco.com': 'McGee & Co.',
  'rejuvenation.com': 'Rejuvenation',
  'schoolhouse.com': 'Schoolhouse',
  'interiordefine.com': 'Interior Define',
  'joybird.com': 'Joybird',
  'burrow.com': 'Burrow',
  'floyd.com': 'Floyd',
  'inside-weather.com': 'Inside Weather',
  'apt2b.com': 'Apt2B',
};

export interface ExtractedRetailer {
  name: string;
  website: string;
  isKnownRetailer: boolean;
  confidence: VendorMatchConfidence;
}

/**
 * Extract hostname from URL, removing www. prefix
 */
function getCleanHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Check if hostname matches a known retailer domain
 */
function findKnownRetailer(hostname: string): string | null {
  // Direct match
  if (RETAILER_MAP[hostname]) {
    return RETAILER_MAP[hostname];
  }

  // Check for subdomain matches (e.g., shop.westelm.com)
  for (const [domain, name] of Object.entries(RETAILER_MAP)) {
    if (hostname.endsWith('.' + domain)) {
      return name;
    }
  }

  return null;
}

/**
 * Extract a readable name from hostname when not a known retailer
 */
function extractNameFromHostname(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    // Get the main domain name (e.g., "westelm" from "shop.westelm.com")
    const mainPart = parts[parts.length - 2];
    // Capitalize first letter and handle common patterns
    return mainPart
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  return hostname;
}

/**
 * Extract retailer information from current page URL
 */
export function extractRetailer(url: string): ExtractedRetailer {
  const hostname = getCleanHostname(url);
  const knownRetailerName = findKnownRetailer(hostname);

  if (knownRetailerName) {
    return {
      name: knownRetailerName,
      website: `https://${hostname}`,
      isKnownRetailer: true,
      confidence: 'exact',
    };
  }

  // Unknown retailer - extract name from hostname
  return {
    name: extractNameFromHostname(hostname),
    website: `https://${hostname}`,
    isKnownRetailer: false,
    confidence: 'low',
  };
}

/**
 * Check if a domain is in the known retailer list
 */
export function isKnownRetailer(url: string): boolean {
  const hostname = getCleanHostname(url);
  return findKnownRetailer(hostname) !== null;
}

/**
 * Get retailer name if known, otherwise null
 */
export function getKnownRetailerName(url: string): string | null {
  const hostname = getCleanHostname(url);
  return findKnownRetailer(hostname);
}
