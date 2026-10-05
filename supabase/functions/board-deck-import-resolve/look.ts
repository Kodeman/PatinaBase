// board-deck-import-resolve · the look tier (PURE; inference and the
// database come in through LookDeps).
//
//   og:image look-check  a picture whose link page was read: the page photo
//                        and the deck crop are embedded and compared. When
//                        they disagree (cosine < τ_look) the link candidate
//                        drops one band; either way evidence.look_checked.
//   T2 look              a picture with no strong candidate: its crop is
//                        embedded and matched against the importer's visible
//                        library with the 00679 kNN twin. "likely" needs
//                        top1 ≥ τ_likely and top1 − top2 ≥ τ_margin, else
//                        "possible"; hits on the fused aesthete_vector are
//                        capped at "possible" (contract).
//
// Runs only for imports that asked for photo match (options.photo_match, set
// while the board-photo-match flag is on), after a /healthz probe, and before
// record, while the claim's lease still holds. T2 also needs the importer to
// see LOOK_MIN_VISIBLE_VECTORS products with a vector. Anything unavailable
// skips quietly: the links and words results are recorded as they are. A 429
// that outlasts the client's own backoff stops embedding for this run but
// never turns a piece back to pending, so no claim attempt is spent on it.

import { type Band, type Candidate, type ClaimedItem, finalizeCandidates } from './core.ts';
import { cosine } from './pairing.ts';
import { LOOK_MIN_VISIBLE_VECTORS, LOOK_THRESHOLDS } from './thresholds.ts';

/** /embed/image batch cap (INFERENCE_MAX_BATCH, _shared/aesthete.ts). */
export const LOOK_EMBED_BATCH = 16;

export interface KnnHit {
  product_id: string;
  /** Cosine similarity, as aesthete_ask_knn ranks it. */
  rank: number;
  layer: string | null;
}

export interface LookGate {
  photo_match: boolean;
  visible_vectors: number;
}

export interface LookDeps {
  /** The /healthz probe: false when the worker is down, not warmed, or not configured. */
  healthy(): Promise<boolean>;
  gate(importId: string): Promise<LookGate>;
  /** Signed URLs (10 min) for the pieces' own pins, board bucket only.
   *  A piece with no usable picture is simply absent. */
  cropUrls(itemIds: string[]): Promise<Map<string, string>>;
  knn(importId: string, vector: number[], limit: number, category: string | null): Promise<KnnHit[]>;
}

export interface LookSummary {
  /** not_asked: no import in this run asked for photo match.
   *  unavailable: asked, but inference or the visible library could not serve it. */
  status: 'not_asked' | 'unavailable' | 'ran';
  matched: number;
  checked: number;
  downgraded: number;
  throttled: boolean;
  threshold_version: string;
}

export function emptyLookSummary(): LookSummary {
  return {
    status: 'not_asked',
    matched: 0,
    checked: 0,
    downgraded: 0,
    throttled: false,
    threshold_version: LOOK_THRESHOLDS.threshold_version,
  };
}

export interface LookEntry {
  view: { item: ClaimedItem; isLinkItem: boolean };
  outcome: { state: 'found' | 'not_found' | 'pending'; candidates: Candidate[]; pageImage: string | null };
}

interface LookRunDeps {
  look?: LookDeps | null;
  embedImages: ((inputs: { id: string; url: string }[]) => Promise<Map<string, number[]>>) | null;
  log(event: string, fields?: Record<string, unknown>): void;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

const DOWN: Record<Band, Band> = { strong: 'likely', likely: 'possible', possible: 'possible' };

function boost(layer: string | null): number {
  return (layer && LOOK_THRESHOLDS.libraryBoost[layer]) || 0;
}

/**
 * T2 banding. Hits are ranked by similarity; the top one is "likely" only
 * when it is clear (τ_likely and τ_margin) and not from a fused vector. The
 * shown hits are then ordered with the designer's own library first
 * (personal +0.15, studio +0.10) — order only, never the band.
 */
export function bandLook(hits: KnnHit[], options: { fused: boolean }): Omit<Candidate, 'rank'>[] {
  const sorted = [...hits].sort((a, b) => b.rank - a.rank || a.product_id.localeCompare(b.product_id));
  if (sorted.length === 0) return [];
  const top1 = sorted[0].rank;
  const top2 = sorted[1]?.rank ?? 0;
  const margin = top1 - top2;
  const clear = top1 >= LOOK_THRESHOLDS.likely && margin >= LOOK_THRESHOLDS.margin;
  return sorted
    .slice(0, LOOK_THRESHOLDS.shown)
    .map((hit, index) => {
      const uncapped: Band = index === 0 && clear ? 'likely' : 'possible';
      const band: Band = options.fused ? LOOK_THRESHOLDS.fusedCap : uncapped;
      return {
        candidate: {
          source: 'look' as const,
          product_id: hit.product_id,
          band,
          evidence: {
            similarity: round(hit.rank),
            ...(index === 0 ? { margin: round(margin) } : {}),
            layer: hit.layer,
            fused: options.fused,
            band_uncapped: uncapped,
            threshold_version: LOOK_THRESHOLDS.threshold_version,
          },
        },
        order: hit.rank + boost(hit.layer),
      };
    })
    .sort((a, b) => b.order - a.order)
    .map(({ candidate }) => candidate);
}

/** The og:image check on a read link candidate; returns the updated candidate. */
export function lookCheckCandidate(candidate: Omit<Candidate, 'rank'>, similarity: number): Omit<Candidate, 'rank'> {
  const agrees = similarity >= LOOK_THRESHOLDS.pageAgrees;
  return {
    ...candidate,
    band: agrees ? candidate.band : DOWN[candidate.band],
    evidence: {
      ...candidate.evidence,
      look_checked: true,
      look_agrees: agrees,
      look_similarity: round(similarity),
      threshold_version: LOOK_THRESHOLDS.threshold_version,
    },
  };
}

function categoryOf(extracted: Record<string, unknown>): string | null {
  const caption = extracted.caption && typeof extracted.caption === 'object'
    ? extracted.caption as Record<string, unknown>
    : {};
  const value = extracted.category ?? caption.category;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const isPageRead = (c: Pick<Candidate, 'source' | 'evidence'>) =>
  c.source === 'link' && c.evidence?.page_read === true;

async function embedAll(
  inputs: { id: string; url: string }[],
  embed: NonNullable<LookRunDeps['embedImages']>,
  deps: LookRunDeps,
  summary: LookSummary,
): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>();
  for (let i = 0; i < inputs.length; i += LOOK_EMBED_BATCH) {
    try {
      for (const [id, v] of await embed(inputs.slice(i, i + LOOK_EMBED_BATCH))) vectors.set(id, v);
    } catch (error) {
      if ((error as { status?: unknown })?.status === 429) {
        // The client already backed off (Retry-After). Stop here; the pieces
        // keep their links and words results and no attempt is spent.
        summary.throttled = true;
        deps.log('look_throttled', { embedded: vectors.size, asked: inputs.length });
        break;
      }
      deps.log('look_embed_failed', { error: String(error).slice(0, 200) });
    }
  }
  return vectors;
}

/**
 * The look tier for one run: updates the outcomes in place (candidates,
 * state) before they are recorded.
 */
export async function applyLookTier(
  entries: LookEntry[],
  deps: LookRunDeps,
  summary: LookSummary,
  pastDeadline: () => boolean = () => false,
): Promise<void> {
  const look = deps.look ?? null;
  if (!look) return;
  const pictures = entries.filter(({ view, outcome }) =>
    !view.isLinkItem && view.item.role === 'product' && view.item.board_item_id != null &&
    outcome.state !== 'pending');
  if (pictures.length === 0) return;

  // Which imports asked for photo match, and may they use the kNN?
  const gates = new Map<string, { asked: boolean; knn: boolean }>();
  for (const { view } of pictures) {
    const importId = view.item.import_id;
    if (gates.has(importId)) continue;
    let gate: LookGate = { photo_match: false, visible_vectors: 0 };
    try {
      gate = await look.gate(importId);
    } catch (error) {
      deps.log('look_gate_failed', { import_id: importId, error: String(error).slice(0, 200) });
    }
    gates.set(importId, {
      asked: gate.photo_match,
      knn: gate.photo_match && gate.visible_vectors >= LOOK_MIN_VISIBLE_VECTORS,
    });
  }
  const asked = pictures.filter(({ view }) => gates.get(view.item.import_id)!.asked);
  if (asked.length === 0) return;
  // Too small a visible library: the look tier is unavailable for that
  // import; links and words are unaffected.
  let unavailable = [...gates.values()].some((gate) => gate.asked && !gate.knn);
  const settle = () => {
    summary.status = unavailable ? 'unavailable' : 'ran';
  };

  // Past the run's start budget the pieces are recorded as they stand, so
  // the run still ends inside the pg_net window and the lease.
  const embed = deps.embedImages;
  if (pastDeadline() || !embed || !(await look.healthy().catch(() => false))) {
    unavailable = true;
    settle();
    deps.log('look_unavailable', { reason: pastDeadline() ? 'out_of_time' : embed ? 'unhealthy' : 'not_configured' });
    return;
  }

  // Who needs what: a page check, a kNN match, or both.
  const wantsPage = (entry: LookEntry) =>
    entry.outcome.pageImage != null && entry.outcome.candidates.some(isPageRead);
  const work = asked.filter((entry) =>
    wantsPage(entry) ||
    (gates.get(entry.view.item.import_id)!.knn && !entry.outcome.candidates.some((c) => c.band === 'strong')));
  if (work.length === 0) {
    settle();
    return;
  }

  // Crop URLs are minted only for pieces this run holds the lease on.
  const crops = await look.cropUrls(work.map(({ view }) => view.item.item_id));
  const inputs: { id: string; url: string }[] = [];
  for (const entry of work) {
    const crop = crops.get(entry.view.item.item_id);
    if (!crop) continue;
    inputs.push({ id: `crop:${entry.view.item.item_id}`, url: crop });
    if (wantsPage(entry)) inputs.push({ id: `page:${entry.view.item.item_id}`, url: entry.outcome.pageImage! });
  }
  const vectors = inputs.length ? await embedAll(inputs, embed, deps, summary) : new Map<string, number[]>();
  if (inputs.length && vectors.size === 0) unavailable = true;
  settle();

  for (const { view, outcome } of work) {
    const item = view.item;
    const crop = vectors.get(`crop:${item.item_id}`);
    if (!crop) continue;
    let list: Omit<Candidate, 'rank'>[] = outcome.candidates.map(({ rank: _rank, ...c }) => c);

    // og:image look-check on the read link candidate.
    const page = vectors.get(`page:${item.item_id}`);
    if (page) {
      const similarity = cosine(page, crop);
      list = list.map((c) => {
        if (!isPageRead(c)) return c;
        const checked = lookCheckCandidate(c, similarity);
        summary.checked++;
        if (checked.band !== c.band) summary.downgraded++;
        return checked;
      });
    }

    // T2: no strong candidate (after the check) and a big enough library.
    if (gates.get(item.import_id)!.knn && !list.some((c) => c.band === 'strong') && !pastDeadline()) {
      try {
        const hits = await look.knn(item.import_id, crop, LOOK_THRESHOLDS.knnLimit, categoryOf(item.extracted));
        const matches = bandLook(hits, { fused: true });
        if (matches.length) summary.matched++;
        list = [...list, ...matches];
      } catch (error) {
        deps.log('look_knn_failed', { item_id: item.item_id, error: String(error).slice(0, 200) });
      }
    }

    outcome.candidates = finalizeCandidates(list);
    outcome.state = outcome.candidates.length ? 'found' : 'not_found';
  }
}
