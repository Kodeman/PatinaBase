// board-deck-import-resolve · retailer names by domain.
//
// A copy of RETAILER_MAP from apps/extension/src/lib/extraction/retailer.ts:
// the edge bundle cannot reach the workspace. Keep the two in step. The
// studio's own vendors.website entries are looked up in the database and win.

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
  'bebitalia.com': 'B&B Italia',
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

/** Exact domain, then a subdomain of a known retailer (shop.westelm.com). */
export function retailerName(host: string | null): string | null {
  if (!host) return null;
  if (RETAILER_MAP[host]) return RETAILER_MAP[host];
  for (const [domain, name] of Object.entries(RETAILER_MAP)) {
    if (host.endsWith(`.${domain}`)) return name;
  }
  return null;
}
