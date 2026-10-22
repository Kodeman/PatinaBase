// client-edition-compose (US-49): composes a homeowner page edition from the
// project's editorial facts. Pure given the facts, a callClaude-shaped function
// and a database port; index.ts supplies the real ones.
//
// Per request: facts → skip when nothing changed → begin_client_edition →
// A1 perception (unperceived pictures) → A2 hero pick (inside the top R142
// tier) → B words → C voice lint (one regeneration) → finish_client_edition.

import type { CallClaudeOptions, CallClaudeResult, ModelResponse } from "../_shared/claude.ts";
import type { ClaudeRole } from "../_shared/claude-models.ts";
import { fetchAddress, type PlateRequest, shortenError, type SourceAuthority } from "../client-plate-copy/lib.ts";
import { lintPieces } from "./lint.ts";
import {
  A1_BATCH,
  A2_CANDIDATES,
  allowedFacts,
  assetLabel,
  buildHeroRequest,
  buildJudgeRequest,
  buildPerceptionRequest,
  buildWordsRequest,
  type EditorialFacts,
  type FactsAsset,
  type FactsRoom,
  FEATURE,
  type ImageInput,
  PROMPT_VERSION,
  type WordsChapter,
  type WordsInput,
} from "./prompts.ts";
import { type Perception, readJudgement, validateHero, validatePerception, validateWords, type Words } from "./validate.ts";

export const CLAIM_LIMIT = 5;
export const CALL_TIMEOUT_MS = 60_000;

/** Photographs of her home reach a model only once the client privacy page is live (V2-5). */
export function privacyPageLive(getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key)): boolean {
  return getEnv("CLIENT_PRIVACY_PAGE_LIVE") === "true";
}

// ── Database port ──────────────────────────────────────────────────────────

export interface DbError {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

export interface EditionRequest {
  id: string;
  project_id: string;
  lease_token: string;
}

export interface Composition {
  sourceHash: string;
  voice: "model" | "deterministic";
  hero: { assetId: string; why: string | null } | null;
  held: string[];
  chapters: { key: string; headline: string; standing: string | null }[];
  doorstep: { standing: string | null };
  notice: string | null;
}

export interface CurrentEdition {
  id: string;
  source_hash: string | null;
  composition: Partial<Composition> | null;
  facts: { assets?: { sha256?: string }[] } | null;
}

/** A done client_plate_requests row: where an asset's bytes were copied from. */
export interface PlateSourceRow {
  project_id: string;
  source_kind: string;
  source_ref: { table?: string; id?: string } | null;
  source_url: string;
  asset_id: string;
}

export interface Db {
  rpc(fn: string, args?: Record<string, unknown>): Promise<DbResult<unknown>>;
  /** The project's approved edition, if any (client_editions, status 'approved'). */
  approvedEdition(projectId: string): Promise<DbResult<CurrentEdition>>;
  plateSources(projectId: string, assetIds: string[]): Promise<DbResult<PlateSourceRow[]>>;
  sign(bucket: string, path: string): Promise<string>;
}

export type Claude = (opts: CallClaudeOptions) => Promise<CallClaudeResult>;

export interface ComposeDeps {
  db: Db;
  claude: Claude;
  privacyLive: boolean;
  supabaseUrl: string;
}

/** The ownership check client-plate-copy uses before signing a private object. */
export function sourceAuthority(db: Db): SourceAuthority {
  return {
    async owned(request) {
      const { data, error } = await db.rpc("client_plate_source_owned", {
        p_project_id: request.project_id,
        p_table: request.source_ref?.table ?? null,
        p_id: request.source_ref?.id ?? null,
        p_source_url: request.source_url,
      });
      if (error) throw new Error(`ownership check failed: ${error.message}`);
      return data === true;
    },
    sign: (bucket, path) => db.sign(bucket, path),
  };
}

// ── R142 rank and hero floors (ported from client-portal lib/editorial) ────

const SOURCE_TIER: Record<string, number> = { installed: 0, scan: 1, board: 1, sheet: 1, upload: 1, maker: 2 };
const CATALOGUE_TIER = 3;
const SILHOUETTE_TIER = 4;

/** A maker photograph on a white ground is a catalogue clipping. Null for a concept. */
export function tierOf(asset: Pick<FactsAsset, "sourceKind" | "ground">): number | null {
  if (asset.sourceKind === "maker" && asset.ground === "white") return CATALOGUE_TIER;
  return SOURCE_TIER[asset.sourceKind] ?? null;
}

function rankTier(asset: FactsAsset): number {
  return tierOf(asset) ?? SILHOUETTE_TIER;
}

function compareCodepoints(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Better tier first, then more pixels, then sha256 so the order never wobbles. */
export function compareAssets(a: FactsAsset, b: FactsAsset): number {
  return rankTier(a) - rankTier(b) || b.width * b.height - a.width * a.height || compareCodepoints(a.sha256, b.sha256);
}

const MAX_DISCARD = 0.5;

type Size = { w: number; h: number };

/** The largest box of `aspect` inside the source, in whole pixels. */
function cropBox(aspect: number, { width, height }: FactsAsset): Size {
  if (width / height > aspect) return { w: Math.floor(height * aspect), h: height };
  return { w: width, h: Math.floor(width / aspect) };
}

function holdsSubject(box: Size, { width, height, subjectBox }: FactsAsset): boolean {
  if (!subjectBox) return true;
  return subjectBox[2] <= box.w / width + 1e-9 && subjectBox[3] <= box.h / height + 1e-9;
}

function meetsCrop(aspect: number, floor: Size, asset: FactsAsset): boolean {
  const box = cropBox(aspect, asset);
  const keepsEnough = box.w * box.h >= (1 - MAX_DISCARD) * asset.width * asset.height;
  return keepsEnough && holdsSubject(box, asset) && box.w >= floor.w && box.h >= floor.h;
}

function meetsDesktop(asset: FactsAsset): boolean {
  const portrait = asset.height > asset.width && asset.width >= 1040;
  return meetsCrop(1.6, { w: 1600, h: 1000 }, asset) || meetsCrop(1.6, { w: 1248, h: 0 }, asset) || portrait;
}

/** The phone cover (39:34, 780×680) and a desktop layout (bleed, measure or portrait). */
export function meetsHero(asset: FactsAsset): boolean {
  const sized = asset.width > 0 && asset.height > 0;
  return sized && meetsDesktop(asset) && meetsCrop(39 / 34, { w: 780, h: 680 }, asset);
}

// ── Phase 1 deterministic headlines (copied from client-portal chapters.ts;
//    lib.test.ts holds the shared fixture) ─────────────────────────────────

const MATERIALS: readonly string[] = [
  "walnut", "oak", "ash", "maple", "cherry", "birch", "elm", "hickory", "pine", "cedar", "teak",
  "linen", "wool", "bouclé", "boucle", "leather", "velvet", "mohair", "cotton", "silk", "jute",
  "cane", "rattan", "brass", "bronze", "copper", "iron", "steel", "marble", "travertine",
  "limestone", "slate", "stone", "terrazzo", "plaster", "glass", "ceramic", "concrete",
];
const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const IN_TRANSIT = /order|production|transit|ship|fabricat/i;
const MATERIAL_PATTERNS = MATERIALS.map((material) => ({
  word: material === "boucle" ? "bouclé" : material,
  pattern: new RegExp(`(^|[^\\p{L}])${material}([^\\p{L}]|$)`, "u"),
}));

function series(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function roomHeadline(room: FactsRoom): string {
  const found = room.items.flatMap((item) =>
    MATERIAL_PATTERNS.filter(({ pattern }) => pattern.test(item.nameAsSigned.toLowerCase())).map(({ word }) => word)
  );
  const materials = [...new Set(found)].slice(0, 3);
  if (!materials.length) return room.name;
  const text = series(materials);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function coverHeadline(phase: string | null, rooms: readonly FactsRoom[]): string {
  switch (phase) {
    case "procurement": {
      const moving = rooms.find((r) => r.items.some((i) => i.status && IN_TRANSIT.test(i.status)));
      return moving ? `The ${moving.name.toLowerCase()} is on its way` : "The pieces are on their way";
    }
    case "installation":
      return "The rooms are going in";
    case "final_walkthrough":
      return "The house, as finished";
    default:
      return "The rooms, as drawn";
  }
}

function houseHeadline(count: number): string {
  if (count === 1) return "One room, read from the front door";
  return `${NUMBER_WORDS[count] ?? "The"} rooms, read from the front door`;
}

/** The cover, house, room and progress headlines Phase 1 writes from the record alone. */
export function deterministicHeadlines(facts: EditorialFacts): { key: string; headline: string }[] {
  return [
    { key: "cover", headline: coverHeadline(facts.project.phase, facts.rooms) },
    { key: "house", headline: houseHeadline(facts.rooms.length) },
    ...facts.rooms.map((room) => ({ key: room.anchor, headline: roomHeadline(room) })),
    { key: "progress", headline: "In production, then on the truck, then here" },
  ];
}

// ── Source hash ────────────────────────────────────────────────────────────

/** sha256 of the allowlisted facts: what the words are written from. */
export async function sourceHash(facts: EditorialFacts): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(allowedFacts(facts)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function imageSet(assets: readonly { sha256?: string }[] | undefined): string {
  return JSON.stringify((assets ?? []).map((asset) => asset.sha256 ?? "").sort());
}

/** The same facts and the same pictures as the approved edition: nothing to compose. */
export function unchanged(current: CurrentEdition | null, hash: string, facts: EditorialFacts): boolean {
  if (!current || current.source_hash !== hash || !current.facts?.assets) return false;
  return imageSet(current.facts.assets) === imageSet(facts.assets);
}

// ── One edition ────────────────────────────────────────────────────────────

/** A model call was denied (kill switch, disabled feature, budget): composition stops. */
export class ComposeStopped extends Error {}

interface Ctx {
  facts: EditorialFacts;
  deps: ComposeDeps;
  spend: { usd: number };
  model: string | null;
  sources: Map<string, PlateSourceRow[]>;
  authority: SourceAuthority;
  urls: Map<string, string | null>;
}

type Answer = { ok: true; response: ModelResponse } | { ok: false; error: string };

async function ask(ctx: Ctx, role: ClaudeRole, params: Record<string, unknown>): Promise<Answer> {
  const result = await ctx.deps.claude({
    feature: FEATURE,
    role,
    studioId: ctx.facts.project.studio?.id ?? null,
    userId: null,
    promptVersion: PROMPT_VERSION,
    params,
    timeoutMs: CALL_TIMEOUT_MS,
  });
  if (result.ok) {
    ctx.spend.usd += result.usd;
    // The edition records the model that wrote it, not the judge's.
    if (role !== "judge") ctx.model = result.model;
    return { ok: true, response: result.response };
  }
  if ("denied" in result) throw new ComposeStopped(`claude ${result.denied}`);
  return { ok: false, error: result.error };
}

const NEVER_SENT = new Set(["sheet", "board"]);
const HER_HOME = new Set(["scan", "installed"]);

function kindSendable(kind: string, privacyLive: boolean): boolean {
  if (NEVER_SENT.has(kind)) return false;
  return HER_HOME.has(kind) ? privacyLive : true;
}

/** Sheets and boards never; scans and installed photographs only once the privacy page is live. */
function sendable(ctx: Ctx, asset: FactsAsset): boolean {
  const live = ctx.deps.privacyLive;
  const rows = ctx.sources.get(asset.id) ?? [];
  return kindSendable(asset.sourceKind, live) && rows.every((row) => kindSendable(row.source_kind, live));
}

function conceptSeen(ctx: Ctx, asset: FactsAsset): boolean {
  return asset.sourceKind === "concept" || (ctx.sources.get(asset.id) ?? []).some((row) => row.source_kind === "concept");
}

function plateRequest(row: PlateSourceRow): PlateRequest {
  return { id: "", project_id: row.project_id, source_kind: row.source_kind, source_ref: row.source_ref, source_url: row.source_url, lease_token: "" };
}

/** The address the asset was copied from, through client-plate-copy's resolver; null when none resolves. */
async function imageUrl(ctx: Ctx, asset: FactsAsset): Promise<string | null> {
  if (ctx.urls.has(asset.id)) return ctx.urls.get(asset.id)!;
  let url: string | null = null;
  for (const row of ctx.sources.get(asset.id) ?? []) {
    url = await fetchAddress(plateRequest(row), ctx.deps.supabaseUrl, ctx.authority).catch(() => null);
    if (url) break;
  }
  ctx.urls.set(asset.id, url);
  return url;
}

interface Sendable {
  asset: FactsAsset;
  url: string;
}

async function firstWithUrls(ctx: Ctx, assets: readonly FactsAsset[], limit = Infinity): Promise<Sendable[]> {
  const ready: Sendable[] = [];
  for (const asset of assets) {
    if (ready.length >= limit) break;
    const url = sendable(ctx, asset) ? await imageUrl(ctx, asset) : null;
    if (url) ready.push({ asset, url });
  }
  return ready;
}

function imageInput(ctx: Ctx, entry: Sendable): ImageInput {
  return { url: entry.url, label: assetLabel(ctx.facts, entry.asset.id) };
}

async function applyPerception(ctx: Ctx, asset: FactsAsset, perception: Perception): Promise<void> {
  const { error } = await ctx.deps.db.rpc("record_plate_perception", {
    p_asset_id: asset.id,
    p_subject_box: perception.subjectBox,
    p_focal: perception.focal,
    p_flags: perception.flags,
    p_alt: perception.alt,
    p_prompt_version: PROMPT_VERSION,
  });
  if (error) {
    console.error(`client-edition-compose: perception ${asset.id}: ${shortenError(error.message)}`);
    return;
  }
  Object.assign(asset, { subjectBox: perception.subjectBox, focal: perception.focal, alt: perception.alt, perceivedPromptVersion: PROMPT_VERSION });
}

/** Call A1 over unperceived pictures, eight at a time. A rejected answer leaves its pictures to code crops. */
async function perceive(ctx: Ctx): Promise<void> {
  const targets = ctx.facts.assets.filter((asset) => !asset.perceivedPromptVersion && asset.focalOrigin !== "designer");
  const ready = await firstWithUrls(ctx, targets);
  for (let start = 0; start < ready.length; start += A1_BATCH) {
    const batch = ready.slice(start, start + A1_BATCH);
    const answer = await ask(ctx, "perceive", buildPerceptionRequest(batch.map((entry) => imageInput(ctx, entry))));
    const checked = answer.ok ? validatePerception(answer.response, batch.length) : null;
    if (!checked?.ok) continue;
    for (const perception of checked.value) await applyPerception(ctx, batch[perception.index].asset, perception);
  }
}

export interface HeroChoice {
  asset: FactsAsset;
  why: string | null;
  held: FactsAsset[];
}

function heroEligible(ctx: Ctx, asset: FactsAsset): boolean {
  return tierOf(asset) !== null && asset.sourceKind !== "sheet" && !conceptSeen(ctx, asset) && meetsHero(asset);
}

/** Call A2 inside the top tier; any answer the validator rejects falls back to the code pick (rank order). */
async function pickHero(ctx: Ctx): Promise<HeroChoice | null> {
  const eligible = ctx.facts.assets.filter((asset) => heroEligible(ctx, asset)).sort(compareAssets);
  if (!eligible.length) return null;
  const code: HeroChoice = { asset: eligible[0], why: null, held: [] };
  const top = tierOf(eligible[0]);
  const pool = await firstWithUrls(ctx, eligible.filter((asset) => tierOf(asset) === top), A2_CANDIDATES);
  if (pool.length < 2) return code;
  const answer = await ask(ctx, "draft", buildHeroRequest(pool.map((entry) => imageInput(ctx, entry)), allowedFacts(ctx.facts)));
  const checked = answer.ok ? validateHero(answer.response, pool.length) : null;
  if (!checked?.ok) return code;
  return { asset: pool[checked.value.index].asset, why: checked.value.why, held: checked.value.held.map((i) => pool[i].asset) };
}

interface ChapterPlan {
  chapters: WordsChapter[];
  keys: string[];
  /** Call B's key → the composition's chapter key (a room's anchor). */
  anchorOf: Map<string, string>;
}

/** Rooms travel by position, never by id. */
export function chapterPlan(facts: EditorialFacts): ChapterPlan {
  const chapters: WordsChapter[] = [
    { key: "cover", about: "The opening of the page: where the whole job stands" },
    { key: "house", about: "All the rooms together" },
    ...facts.rooms.map((room, i) => ({ key: `room-${i + 1}`, about: `The ${room.name}` })),
    { key: "progress", about: "What is being made, shipped and delivered" },
  ];
  const anchorOf = new Map(chapters.map((chapter) => [chapter.key, chapter.key]));
  facts.rooms.forEach((room, i) => anchorOf.set(`room-${i + 1}`, room.anchor));
  return { chapters, keys: chapters.map((chapter) => chapter.key), anchorOf };
}

/** The approved page's words, rekeyed by position, for Call B to keep what is still true. */
function currentWords(current: CurrentEdition | null, plan: ChapterPlan): unknown | null {
  const composition = current?.composition;
  if (!composition?.chapters) return null;
  const keyOf = new Map([...plan.anchorOf].map(([key, anchor]) => [anchor, key]));
  return {
    chapters: composition.chapters.filter((c) => keyOf.has(c.key)).map((c) => ({ ...c, key: keyOf.get(c.key) })),
    doorstep: composition.doorstep ?? null,
    notice: composition.notice ?? null,
  };
}

function opening(facts: EditorialFacts, hero: HeroChoice | null, current: CurrentEdition | null) {
  const before = current?.composition?.hero?.assetId;
  const known = before && facts.assets.some((asset) => asset.id === before);
  return {
    now: hero ? assetLabel(facts, hero.asset.id) : "the drawn cover",
    before: known ? assetLabel(facts, before) : current?.composition ? "the drawn cover" : null,
  };
}

function wordPieces(words: Words): string[] {
  return [...words.chapters.flatMap((c) => [c.headline, c.standing]), words.doorstep.standing, words.notice];
}

/** Call C: the lexicon regex, then the judge. The term to name in a regeneration, or null. */
async function voiceHit(ctx: Ctx, words: Words): Promise<string | null> {
  const hit = lintPieces(wordPieces(words));
  if (hit) return hit.term;
  const answer = await ask(ctx, "judge", buildJudgeRequest(words));
  return answer.ok ? readJudgement(answer.response) : null;
}

type WordsBrief = Omit<WordsInput, "avoid">;

/** One Call B draft: its words when valid, and the term to avoid when it must be written again. */
async function draftWords(ctx: Ctx, plan: ChapterPlan, brief: WordsBrief, avoid?: string): Promise<{ words: Words | null; avoid: string | null }> {
  const answer = await ask(ctx, "draft", buildWordsRequest({ ...brief, avoid }));
  if (!answer.ok) throw new Error(`words: ${answer.error}`);
  const checked = validateWords(answer.response, plan.keys);
  if (!checked.ok) return { words: null, avoid: checked.term ?? null };
  return { words: checked.value, avoid: await voiceHit(ctx, checked.value) };
}

/**
 * Call B, linted. A banned word or a lint hit earns one regeneration naming the
 * term; a second hit, or any other rejected answer, leaves the deterministic
 * headlines. A failed call fails the edition.
 */
async function writeWords(ctx: Ctx, plan: ChapterPlan, brief: WordsBrief): Promise<Words | null> {
  const first = await draftWords(ctx, plan, brief);
  if (!first.avoid) return first.words;
  const second = await draftWords(ctx, plan, brief, first.avoid);
  return second.avoid ? null : second.words;
}

function chaptersFor(plan: ChapterPlan, words: Words | null, facts: EditorialFacts): Composition["chapters"] {
  if (!words) return deterministicHeadlines(facts).map((c) => ({ ...c, standing: null }));
  return words.chapters.map((c) => ({ key: plan.anchorOf.get(c.key)!, headline: c.headline, standing: c.standing }));
}

function heroPart(hero: HeroChoice | null): Pick<Composition, "hero" | "held"> {
  if (!hero) return { hero: null, held: [] };
  return { hero: { assetId: hero.asset.id, why: hero.why }, held: hero.held.map((asset) => asset.id) };
}

function wordsPart(words: Words | null): Pick<Composition, "doorstep" | "notice"> {
  if (!words) return { doorstep: { standing: null }, notice: null };
  return { doorstep: { standing: words.doorstep.standing }, notice: words.notice };
}

function buildComposition(hash: string, plan: ChapterPlan, words: Words | null, hero: HeroChoice | null, facts: EditorialFacts): Composition {
  return {
    sourceHash: hash,
    voice: words ? "model" : "deterministic",
    ...heroPart(hero),
    chapters: chaptersFor(plan, words, facts),
    ...wordsPart(words),
  };
}

/** Headlines, standings, doorstep and notice, byte for byte. */
function wordsKey(composition: Partial<Composition>): string {
  return JSON.stringify({
    chapters: (composition.chapters ?? []).map((c) => [c.key, c.headline, c.standing ?? null]),
    doorstep: composition.doorstep?.standing ?? null,
    notice: composition.notice ?? null,
  });
}

export interface ImageRow {
  asset_id: string;
  plate_role: "hero" | "held";
  crop_key: "none";
  rank: number;
  chapter_key: string;
  alt: string | null;
  caption_what: string | null;
  caption_whose: string | null;
  caption_when: string | null;
}

function roomAnchorOf(facts: EditorialFacts, assetId: string): string | null {
  const room = facts.rooms.find((r) =>
    r.conceptAssetId === assetId || r.scanAssetIds?.includes(assetId) || r.items.some((i) => i.assetIds?.includes(assetId))
  );
  return room?.anchor ?? null;
}

function imageRow(facts: EditorialFacts, assetId: string, role: ImageRow["plate_role"], rank: number, chapter: string): ImageRow {
  const asset = facts.assets.find((a) => a.id === assetId);
  return {
    asset_id: assetId,
    plate_role: role,
    crop_key: "none",
    rank,
    chapter_key: chapter,
    alt: asset?.alt ?? null,
    caption_what: asset?.caption?.what ?? null,
    caption_whose: asset?.caption?.whose ?? null,
    caption_when: asset?.caption?.when ?? null,
  };
}

export function imageRows(facts: EditorialFacts, composition: Composition): ImageRow[] {
  const hero = composition.hero ? [imageRow(facts, composition.hero.assetId, "hero", 0, "cover")] : [];
  const held = composition.held.map((id, i) => imageRow(facts, id, "held", i + 1, roomAnchorOf(facts, id) ?? "house"));
  return [...hero, ...held];
}

export interface EditionDraft {
  status: "awaiting_review" | "approved" | "failed";
  kind: "full" | "plates_only";
  composition: Partial<Composition>;
  images: ImageRow[];
  model: string | null;
  error: string | null;
}

function bySourceAsset(rows: readonly PlateSourceRow[]): Map<string, PlateSourceRow[]> {
  const sources = new Map<string, PlateSourceRow[]>();
  for (const row of rows) sources.set(row.asset_id, [...(sources.get(row.asset_id) ?? []), row]);
  return sources;
}

async function context(facts: EditorialFacts, deps: ComposeDeps, spend: { usd: number }): Promise<Ctx> {
  const { data, error } = await deps.db.plateSources(facts.project.id, facts.assets.map((asset) => asset.id));
  if (error) throw new Error(`plate sources: ${error.message}`);
  const sources = bySourceAsset(data ?? []);
  return { facts, deps, spend, model: null, sources, authority: sourceAuthority(deps.db), urls: new Map() };
}

/**
 * One edition's draft. Words identical to the approved edition's publish as
 * plates only; anything else waits for the designer.
 */
export async function composeEdition(
  facts: EditorialFacts,
  current: CurrentEdition | null,
  hash: string,
  deps: ComposeDeps,
  spend: { usd: number },
): Promise<EditionDraft> {
  const ctx = await context(facts, deps, spend);
  await perceive(ctx);
  const hero = await pickHero(ctx);
  const plan = chapterPlan(facts);
  const words = await writeWords(ctx, plan, {
    facts: allowedFacts(facts),
    chapters: plan.chapters,
    current: currentWords(current, plan),
    opening: opening(facts, hero, current),
  });
  const composition = buildComposition(hash, plan, words, hero, facts);
  const platesOnly = !!current?.composition && wordsKey(current.composition) === wordsKey(composition);
  return {
    status: platesOnly ? "approved" : "awaiting_review",
    kind: platesOnly ? "plates_only" : "full",
    composition,
    images: imageRows(facts, composition),
    model: ctx.model,
    error: null,
  };
}

// ── One request ────────────────────────────────────────────────────────────

export interface RequestOutcome {
  requestId: string;
  result: "composed" | "skipped" | "failed";
  reason: string | null;
  usd: number;
}

const DAILY_LIMIT = /client_edition_daily_limit|two.?per.?day|daily.?limit/i;

export function isDailyLimit(error: DbError): boolean {
  return [error.message, error.details, error.hint].some((text) => !!text && DAILY_LIMIT.test(text));
}

async function readFacts(db: Db, projectId: string): Promise<EditorialFacts> {
  const { data, error } = await db.rpc("get_project_editorial_facts", { p_project_id: projectId });
  if (error || !data) throw new Error(`facts: ${error?.message ?? "none"}`);
  return data as EditorialFacts;
}

async function readCurrent(db: Db, projectId: string): Promise<CurrentEdition | null> {
  const { data, error } = await db.approvedEdition(projectId);
  if (error) throw new Error(`approved edition: ${error.message}`);
  return data;
}

async function closeRequest(db: Db, request: EditionRequest, reason: string): Promise<RequestOutcome> {
  const { error } = await db.rpc("close_client_edition_request", {
    p_request_id: request.id,
    p_lease_token: request.lease_token,
    p_reason: reason,
  });
  if (error) console.error(`client-edition-compose: close ${request.id}: ${shortenError(error.message)}`);
  return { requestId: request.id, result: "skipped", reason, usd: 0 };
}

/** The new edition's id, or null when the project already has two today. */
async function beginEdition(db: Db, request: EditionRequest): Promise<string | null> {
  const { data, error } = await db.rpc("begin_client_edition", { p_request_id: request.id, p_lease_token: request.lease_token });
  if (error) {
    if (isDailyLimit(error)) return null;
    throw new Error(`begin: ${error.message}`);
  }
  if (typeof data !== "string") throw new Error("begin returned no edition");
  return data;
}

async function finishEdition(
  db: Db,
  editionId: string,
  request: EditionRequest,
  facts: EditorialFacts,
  draft: EditionDraft,
  usd: number,
): Promise<boolean> {
  const { error } = await db.rpc("finish_client_edition", {
    p_edition_id: editionId,
    p_lease_token: request.lease_token,
    p_status: draft.status,
    p_kind: draft.kind,
    p_composition: draft.composition,
    p_facts: facts,
    p_images: draft.images,
    p_prompt_version: PROMPT_VERSION,
    p_model: draft.model,
    p_cost_usd: Number(usd.toFixed(6)),
    p_error: draft.error,
  });
  if (error) console.error(`client-edition-compose: finish ${editionId}: ${shortenError(error.message)}`);
  return !error;
}

function failedDraft(hash: string, cause: unknown): EditionDraft {
  return { status: "failed", kind: "full", composition: { sourceHash: hash }, images: [], model: null, error: shortenError(cause) };
}

async function draftOrFailure(
  facts: EditorialFacts,
  current: CurrentEdition | null,
  hash: string,
  deps: ComposeDeps,
  spend: { usd: number },
): Promise<EditionDraft> {
  try {
    return await composeEdition(facts, current, hash, deps, spend);
  } catch (cause) {
    return failedDraft(hash, cause);
  }
}

function outcomeOf(request: EditionRequest, draft: EditionDraft, finished: boolean, usd: number): RequestOutcome {
  if (!finished) return { requestId: request.id, result: "failed", reason: draft.error ?? "finish failed", usd };
  return { requestId: request.id, result: draft.status === "failed" ? "failed" : "composed", reason: draft.error, usd };
}

export async function composeRequest(request: EditionRequest, deps: ComposeDeps): Promise<RequestOutcome> {
  const facts = await readFacts(deps.db, request.project_id);
  const current = await readCurrent(deps.db, request.project_id);
  const hash = await sourceHash(facts);
  if (unchanged(current, hash, facts)) return await closeRequest(deps.db, request, "unchanged");
  const editionId = await beginEdition(deps.db, request);
  if (editionId === null) return await closeRequest(deps.db, request, "daily_limit");
  const spend = { usd: 0 };
  const draft = await draftOrFailure(facts, current, hash, deps, spend);
  const finished = await finishEdition(deps.db, editionId, request, facts, draft, spend.usd);
  return outcomeOf(request, draft, finished, spend.usd);
}

// ── One run ────────────────────────────────────────────────────────────────

export interface BatchSummary {
  claimed: number;
  composed: number;
  skipped: number;
  failed: number;
  cost_usd: number;
  outcomes: { request_id: string; result: RequestOutcome["result"]; reason: string | null }[];
}

export async function runBatch(deps: ComposeDeps): Promise<BatchSummary> {
  const { data, error } = await deps.db.rpc("claim_client_edition_requests", { p_limit: CLAIM_LIMIT });
  if (error) throw new Error(`claim failed: ${error.message}`);
  const requests = (data ?? []) as EditionRequest[];
  const summary: BatchSummary = { claimed: requests.length, composed: 0, skipped: 0, failed: 0, cost_usd: 0, outcomes: [] };
  for (const request of requests) {
    const outcome = await composeRequest(request, deps).catch((cause): RequestOutcome => ({
      requestId: request.id,
      result: "failed",
      reason: shortenError(cause),
      usd: 0,
    }));
    summary[outcome.result] += 1;
    summary.cost_usd = Number((summary.cost_usd + outcome.usd).toFixed(6));
    summary.outcomes.push({ request_id: outcome.requestId, result: outcome.result, reason: outcome.reason });
  }
  return summary;
}

/** finish_client_edition_compose_run's status and error for a run. */
export function runStatus(summary: BatchSummary): { status: "succeeded" | "failed" | "skipped"; error: string | null } {
  if (summary.claimed === 0) return { status: "skipped", error: null };
  if (summary.failed === summary.claimed) return { status: "failed", error: `all ${summary.failed} editions failed` };
  return { status: "succeeded", error: null };
}
