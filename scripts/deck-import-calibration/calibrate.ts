/// <reference lib="deno.ns" />
// SQ-362 calibration · steps 3-5 against the LOCAL Supabase only.
//
//   deno run -A scripts/deck-import-calibration/calibrate.ts seed      products + a calibration import
//   deno run -A scripts/deck-import-calibration/calibrate.ts embed     the aesthete-embed-worker path
//   deno run -A scripts/deck-import-calibration/calibrate.ts measure   RPC kNN + dHash + pairing → metrics.json
//   deno run -A scripts/deck-import-calibration/calibrate.ts cleanup   removes everything seed wrote
//
// Env: CAL_DIR (as crawl.ts), SUPABASE_URL (default http://127.0.0.1:54321),
// SUPABASE_SERVICE_ROLE_KEY (local key), INFERENCE_URL, INFERENCE_TOKEN.
// Refuses any SUPABASE_URL that is not loopback. Take the shared local DB
// lock (/tmp/patina-local-supabase-db.lock.d) around seed..cleanup.
//
// What is measured, per tier, with the resolver's own code where it exists:
//   T1 exact cosine   board_deck_import_match_image_knn top hit vs τ_exact
//   T1 phash          crop_signature.ts dHash of each query vs the "kept"
//                     crops (designer_confirmed stand-ins) — Hamming
//   T2 image-only     board_deck_import_match_image_knn (00681/00684)
//   T2 fused          board_deck_import_match_knn (00679/00683)
//   pairing           pairing.ts pairByLook on simulated slides: link page
//                     photo (the product's first picture vector, as the
//                     worker stored it) vs the slide's crops
// The import is created with created_by NULL, so only catalog-layer products
// are visible to the kNN twins — the seeded catalog plus whatever catalog
// products the local database already holds (they count as wrong answers).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createInferenceClient } from '../../supabase/functions/_shared/aesthete.ts';
import { runEmbedBatch } from '../../supabase/functions/aesthete-embed-worker/lib.ts';
import { cropSignature } from '../../supabase/functions/board-deck-import-resolve/crop_signature.ts';
import { hamming } from '../../supabase/functions/board-deck-import-resolve/phash.ts';
import { cosine, pairByLook } from '../../supabase/functions/board-deck-import-resolve/pairing.ts';

const HOME = Deno.env.get('HOME') ?? '.';
const CAL_DIR = Deno.env.get('CAL_DIR') ?? `${HOME}/patina-deck-samples/calibration`;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TAG = 'sq362-calibration';

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPABASE_URL)) {
  throw new Error(`refusing non-local SUPABASE_URL ${SUPABASE_URL}`);
}
const db = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

interface CatalogEntry {
  key: string;
  domain: string;
  category: string | null;
  name: string;
  catalog_images: string[];
  role: 'catalog' | 'negative';
}
interface Query {
  qid: string;
  product_key: string;
  domain: string;
  kind: string;
  file: string;
  kept_file?: string;
}
interface Seeded {
  import_id: string;
  board_id: string;
  products: Record<string, string>; // key → product id
}

const readJson = async <T>(name: string): Promise<T> => JSON.parse(await Deno.readTextFile(`${CAL_DIR}/${name}`));
const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── seed / cleanup ──────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const catalog = (await readJson<CatalogEntry[]>('catalog.json')).filter((c) => c.role === 'catalog');
  // A board of its own on any local project (boards need an owner); cleanup
  // deletes it and the import cascades. created_by NULL keeps the kNN scope
  // to the catalog layer whatever the project's studio is.
  const project = must(await db.from('projects').select('id').limit(1), 'project') as { id: string }[];
  if (!project.length) throw new Error('no local project to hang the calibration board on');
  const board = must(
    await db.from('proposal_boards').insert({ name: TAG, project_id: project[0].id }).select('id').single(),
    'board',
  ) as { id: string };
  const imp = must(
    await db.from('board_deck_imports').insert({
      board_id: board.id,
      created_by: null,
      source_format: 'deck',
      file_name: `${TAG}.pptx`,
      file_sha256: await sha256Hex(`${TAG}:${Date.now()}`),
    }).select('id').single(),
    'import',
  ) as { id: string };
  const products: Record<string, string> = {};
  const now = new Date().toISOString();
  for (let i = 0; i < catalog.length; i += 50) {
    const rows = catalog.slice(i, i + 50).map((c) => ({
      name: c.name.slice(0, 200),
      layer: 'catalog',
      category: c.category?.toLowerCase().slice(0, 80) ?? null,
      images: c.catalog_images,
      description: TAG,
      captured_at: now,
    }));
    const data = must(await db.from('products').insert(rows).select('id'), 'products') as { id: string }[];
    data.forEach((row, j) => (products[catalog[i + j].key] = row.id));
  }
  const seeded: Seeded = { import_id: imp.id, board_id: board.id, products };
  await Deno.writeTextFile(`${CAL_DIR}/seeded.json`, JSON.stringify(seeded, null, 1));
  console.log(`seeded ${Object.keys(products).length} products, import ${imp.id}`);
}

async function cleanup(): Promise<void> {
  const seeded = await readJson<Seeded>('seeded.json');
  const ids = Object.values(seeded.products);
  for (let i = 0; i < ids.length; i += 100) {
    must(await db.from('aesthete_jobs').delete().in('product_id', ids.slice(i, i + 100)), 'jobs');
    must(await db.from('products').delete().in('id', ids.slice(i, i + 100)).eq('description', TAG), 'products');
  }
  must(await db.from('board_deck_imports').delete().eq('id', seeded.import_id), 'import');
  must(await db.from('proposal_boards').delete().eq('id', seeded.board_id).eq('name', TAG), 'board');
  const left = must(await db.from('products').select('id', { count: 'exact', head: true }).eq('description', TAG), 'count');
  console.log(`removed ${ids.length} products and the import; tagged rows left: ${JSON.stringify(left)}`);
}

// ── embed: the worker's own drain ───────────────────────────────────────────

async function embed(): Promise<void> {
  const inference = createInferenceClient({
    url: Deno.env.get('INFERENCE_URL') ?? 'http://127.0.0.1:8765',
    token: Deno.env.get('INFERENCE_TOKEN') ?? '',
    timeoutMs: 120_000,
  });
  const totals = { claimed: 0, done: 0, failed: 0 };
  for (let round = 0; round < 400; round++) {
    // deno-lint-ignore no-explicit-any
    const result = await runEmbedBatch({ db: db as any, inference, batchSize: 16, log: () => {} });
    totals.claimed += result.claimed;
    totals.done += result.done;
    totals.failed += result.failed;
    if (round % 5 === 0) console.log(JSON.stringify({ round, ...totals }));
    if (result.claimed === 0) break;
  }
  const seeded = await readJson<Seeded>('seeded.json');
  const ids = Object.values(seeded.products);
  let pictured = 0;
  let fused = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const pics = must(await db.from('product_image_vectors').select('product_id').in('product_id', slice), 'pics') as {
      product_id: string;
    }[];
    pictured += new Set(pics.map((p) => p.product_id)).size;
    const f = must(
      await db.from('products').select('id').in('id', slice).not('aesthete_vector', 'is', null),
      'fused',
    ) as unknown[];
    fused += f.length;
  }
  const summary = { ...totals, products: ids.length, with_fused_vector: fused, with_picture_vectors: pictured };
  await Deno.writeTextFile(`${CAL_DIR}/embed.json`, JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary));
}

// ── measure ─────────────────────────────────────────────────────────────────

function readNpy(bytes: Uint8Array): Float32Array[] {
  const headerLen = bytes[8] | (bytes[9] << 8);
  const header = new TextDecoder().decode(bytes.subarray(10, 10 + headerLen));
  const shape = /'shape': \((\d+), (\d+)\)/.exec(header)!;
  const [n, d] = [Number(shape[1]), Number(shape[2])];
  const data = new Float32Array(bytes.slice(10 + headerLen).buffer);
  return Array.from({ length: n }, (_, i) => data.subarray(i * d, (i + 1) * d));
}

interface Hit {
  product_id: string;
  rank: number;
}
interface QueryResult {
  qid: string;
  kind: string;
  domain: string;
  positive: boolean;
  target: string | null; // product id
  image: Hit[];
  fused: Hit[];
  phash: { distance: number; product_id: string }[]; // all kept crops, closest first
}

async function measure(): Promise<void> {
  const seeded = await readJson<Seeded>('seeded.json');
  const queries = await readJson<Query[]>('queries.json');
  const vectors = readNpy(await Deno.readFile(`${CAL_DIR}/query_vectors.npy`));
  const toPg = (v: ArrayLike<number>) => `[${Array.from(v).join(',')}]`;

  // Kept crops (designer_confirmed stand-ins) and every query's dHash.
  const sig = async (file: string) => {
    const s = await cropSignature(new Uint8Array(await Deno.readFile(`${CAL_DIR}/${file}`)));
    return s.phash == null ? null : BigInt.asUintN(64, BigInt(s.phash));
  };
  const kept: { product_id: string; hash: bigint }[] = [];
  for (const q of queries) {
    if (!q.kept_file) continue;
    const hash = await sig(q.kept_file);
    if (hash != null) kept.push({ product_id: seeded.products[q.product_key], hash });
  }

  // Products the worker could not embed (it refused every picture) are not
  // in the index; their queries are reported apart, not scored.
  const indexed = new Set<string>();
  const all = Object.values(seeded.products);
  for (let i = 0; i < all.length; i += 100) {
    const rows = must(
      await db.from('product_image_vectors').select('product_id').in('product_id', all.slice(i, i + 100)),
      'indexed',
    ) as { product_id: string }[];
    for (const row of rows) indexed.add(row.product_id);
  }

  const results: QueryResult[] = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const seededId = seeded.products[q.product_key] ?? null;
    if (seededId && !indexed.has(seededId)) {
      results.push({ qid: q.qid, kind: `unindexed_${q.kind}`, domain: q.domain, positive: false, target: seededId,
        image: [], fused: [], phash: [] });
      continue;
    }
    const target = seededId;
    const [image, fused] = await Promise.all([
      db.rpc('board_deck_import_match_image_knn', {
        p_import_id: seeded.import_id, p_embedding: toPg(vectors[i]), p_limit: 10, p_category: null,
      }),
      db.rpc('board_deck_import_match_knn', {
        p_import_id: seeded.import_id, p_embedding: toPg(vectors[i]), p_limit: 10, p_category: null,
      }),
    ]);
    const hash = await sig(q.file);
    results.push({
      qid: q.qid,
      kind: q.kind,
      domain: q.domain,
      positive: target != null,
      target,
      image: (must(image, 'image_knn') as Hit[]).map((h) => ({ product_id: h.product_id, rank: Number(h.rank) })),
      fused: (must(fused, 'knn') as Hit[]).map((h) => ({ product_id: h.product_id, rank: Number(h.rank) })),
      phash: hash == null ? [] : kept
        .map((k) => ({ distance: hamming(hash, k.hash), product_id: k.product_id }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5),
    });
    if (i % 100 === 0) console.log(`measured ${i}/${queries.length}`);
  }
  await Deno.writeTextFile(`${CAL_DIR}/results.json`, JSON.stringify(results));

  // Pairing: the link's page photo is the product's first picture as the
  // worker stored it (image_hash = sha256(url)).
  const catalog = (await readJson<CatalogEntry[]>('catalog.json')).filter((c) => c.role === 'catalog');
  const heroHash = new Map<string, string>();
  for (const c of catalog) heroHash.set(seeded.products[c.key], await sha256Hex(c.catalog_images[0]));
  const page = new Map<string, number[]>();
  const ids = Object.values(seeded.products);
  for (let i = 0; i < ids.length; i += 50) {
    const rows = must(
      await db.from('product_image_vectors').select('product_id, image_hash, vector')
        .in('product_id', ids.slice(i, i + 50)).eq('source', 'product_image'),
      'page vectors',
    ) as { product_id: string; image_hash: string; vector: string }[];
    for (const row of rows) {
      if (heroHash.get(row.product_id) === row.image_hash) page.set(row.product_id, JSON.parse(row.vector));
    }
  }
  const qv = new Map(queries.map((q, i) => [q.qid, Array.from(vectors[i])]));
  const pairable = results.filter((r) => r.positive && page.has(r.target!) && !r.kind.startsWith('negative'));
  const negatives = results.filter((r) => !r.positive);
  // Deterministic slides: 2..6 linked pieces, sometimes an extra crop with no
  // link (a picture of something not linked) and an extra link whose page
  // photo matches no crop (a linked piece pictured elsewhere).
  let seedState = 362;
  const rand = () => ((seedState = (seedState * 1103515245 + 12345) % 2147483648) / 2147483648);
  const slides: { sim: number[][]; truth: number[] }[] = [];
  for (let s = 0; s < 400; s++) {
    const k = 2 + Math.floor(rand() * 5);
    const picked = new Map<string, QueryResult>();
    while (picked.size < k) {
      const r = pairable[Math.floor(rand() * pairable.length)];
      if (!picked.has(r.target!)) picked.set(r.target!, r);
    }
    const pieces = [...picked.values()];
    const crops = pieces.map((r) => qv.get(r.qid)!);
    const links = pieces.map((r) => page.get(r.target!)!);
    const truth = pieces.map((_, i) => i); // link i ↔ crop i
    if (rand() < 0.5) crops.push(qv.get(negatives[Math.floor(rand() * negatives.length)].qid)!);
    if (rand() < 0.3) {
      const other = pairable[Math.floor(rand() * pairable.length)];
      if (!picked.has(other.target!)) {
        links.push(page.get(other.target!)!);
        truth.push(-1);
      }
    }
    slides.push({ sim: links.map((l) => crops.map((c) => cosine(l, c))), truth });
  }
  const pairing: { tau: number; margin: number; assigned: number; correct: number; possible: number }[] = [];
  const possible = slides.reduce((n, s) => n + s.truth.filter((t) => t >= 0).length, 0);
  for (let tau = 0.5; tau <= 0.96; tau += 0.01) {
    for (const margin of [0, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15]) {
      let assigned = 0;
      let correct = 0;
      for (const slide of slides) {
        for (const a of pairByLook(slide.sim, tau, margin)) {
          assigned++;
          if (slide.truth[a.link] === a.crop) correct++;
        }
      }
      pairing.push({ tau: Math.round(tau * 100) / 100, margin, assigned, correct, possible });
    }
  }
  // True-pair page-photo similarity, for the og:image look-check.
  const pageAgree = pairable.map((r) => ({ kind: r.kind, sim: cosine(page.get(r.target!)!, qv.get(r.qid)!) }));
  await Deno.writeTextFile(
    `${CAL_DIR}/pairing.json`,
    JSON.stringify({ slides: slides.length, pairing, pageAgree }),
  );
  console.log(`measured ${results.length} queries, ${kept.length} kept crops, ${slides.length} slides`);
}

const command = Deno.args[0];
if (command === 'seed') await seed();
else if (command === 'embed') await embed();
else if (command === 'measure') await measure();
else if (command === 'cleanup') await cleanup();
else console.error('usage: calibrate.ts seed|embed|measure|cleanup');
