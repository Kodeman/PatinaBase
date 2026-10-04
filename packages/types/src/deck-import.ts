/**
 * Bring in a Deck (US-15) — camelCase domain types for a PowerPoint brought
 * onto a board (migration 00676: board_deck_imports, board_deck_import_items).
 *
 * The browser parses the deck and materializes every pin itself; the server
 * holds the import, the resolver's candidates and the designer's decision,
 * and answers every decision with a PinPatch the client applies through the
 * room command path. The server never writes proposal_board_items.
 */

export type DeckImportStatus = 'laying_out' | 'resolving' | 'ready' | 'failed' | 'abandoned';

/** `pin` is a single-pin "Find this piece" job: no file, keyed by its pin. */
export type DeckImportSourceFormat = 'deck' | 'pin';

export type DeckImportItemRole = 'product' | 'reference';

export type DeckImportItemState =
  | 'pending'
  | 'found'
  | 'not_found'
  | 'kept'
  | 'reference'
  | 'removed';

/** How a piece was found: "From the link on the slide", "Named on the slide",
 * "Likely/Possible, by look", "Found on the web". */
export type DeckImportFoundBy = 'link' | 'words' | 'look' | 'web';

export type DeckImportCandidateSource = 'link_existing' | 'link' | 'sku' | 'words' | 'look' | 'web';

export type DeckImportCandidateBand = 'strong' | 'likely' | 'possible';

export type DeckImportLinkSource = 'text' | 'notes' | 'legend' | 'overlay' | 'pasted';

/** A link read off the deck that no picture claimed. */
export interface DeckImportLink {
  url: string;
  textContext?: string;
  source?: DeckImportLinkSource;
}

/** A product page the resolver read but that is not a product yet. Prices are
 * retail (R-DI4); every value stays unconfirmed until Keep. */
export interface DeckImportExtractedPage {
  name?: string;
  brand?: string;
  priceCents?: number;
  images?: string[];
  sourceUrl?: string;
}

/** One resolver result. Exactly one of productId / extracted is set. At most
 * five per piece. */
export interface DeckImportCandidate {
  source: DeckImportCandidateSource;
  productId?: string;
  extracted?: DeckImportExtractedPage;
  band: DeckImportCandidateBand;
  rank: number;
  evidence?: Record<string, unknown>;
}

export interface DeckImport {
  id: string;
  boardId: string;
  createdBy: string | null;
  sourceFormat: DeckImportSourceFormat;
  /** Set only for a `pin` job. */
  boardItemId: string | null;
  fileName: string | null;
  fileSha256: string | null;
  slideCount: number;
  options: Record<string, unknown>;
  links: {
    deckLinks: DeckImportLink[];
    slideLinks: { slideIndex: number; unpairedLinks: DeckImportLink[] }[];
  };
  status: DeckImportStatus;
  createdAt: string;
  finishedAt: string | null;
}

export interface DeckImportItem {
  id: string;
  importId: string;
  /** Slide part + shape id; unique within the import. */
  elementKey: string;
  /** NULL until the pin is attached, or for a link with no picture. */
  boardItemId: string | null;
  slideIndex: number;
  slideTitle: string | null;
  role: DeckImportItemRole;
  /** What the slide said: caption, alt text, links, maker/price/sku text. */
  extracted: Record<string, unknown>;
  state: DeckImportItemState;
  foundBy: DeckImportFoundBy | null;
  candidates: DeckImportCandidate[];
  chosenProductId: string | null;
  attempts: number;
  keptBy: string | null;
  keptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The pin `data.deck_import.state` a patch writes. */
export type PinDeckImportState = 'to_confirm' | 'kept' | 'reference';

/**
 * What Keep / Swap / Keep as reference / Unkeep return: a patch for ONE pin,
 * applied by the client through the room command path (so it can be undone).
 * `data` keys are the pin's own `data` keys (snake_case, merged as-is); a
 * `null` value clears that key. `boardItemId` null means the piece has no
 * pin yet and the client creates a new one.
 */
export interface PinPatch {
  itemId: string;
  boardItemId: string | null;
  type: 'capture' | 'product' | 'image';
  productId: string | null;
  captureId: string | null;
  data: {
    name: string | null;
    vendor_name: string | null;
    price_cents: number | null;
    source_url: string | null;
    product_image_url: string | null;
    provenance?: 'imported_deck';
    deck_import: {
      state: PinDeckImportState;
      found_by: DeckImportFoundBy | null;
    };
  };
}

/** One placed picture in the manifest sent to register. */
export interface DeckImportManifestItem {
  elementKey: string;
  slideIndex: number;
  slideTitle?: string;
  role: DeckImportItemRole;
  extracted?: Record<string, unknown>;
}

export interface DeckImportManifest {
  slideCount?: number;
  options?: Record<string, unknown>;
  items: DeckImportManifestItem[];
  deckLinks?: DeckImportLink[];
  slides?: { slideIndex?: number; unpairedLinks?: DeckImportLink[] }[];
}

/** register_board_deck_import's answer. `resumed` is true when the same deck
 * (same sha-256) was already brought onto this board. */
export interface DeckImportRegistration {
  importId: string;
  resumed: boolean;
  status: DeckImportStatus;
  items: {
    itemId: string;
    elementKey: string;
    boardItemId: string | null;
    state: DeckImportItemState;
  }[];
}

/** Why Unkeep / Swap / Keep as reference refused (Postgres HINT). */
export type DeckImportRefusalReason = 'promoted' | 'on_schedule';
