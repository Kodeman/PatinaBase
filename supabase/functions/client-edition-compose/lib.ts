// client-edition-compose (US-49): composes a homeowner page edition from the
// project's editorial facts. Pure given the facts, a callClaude-shaped function,
// a database port, the media worker and a clock; index.ts supplies the real ones.
//
// Per run: one time budget for the whole invocation, and a request is claimed
// only while an edition still fits in it. Every database, ledger and model
// await is bounded inside that budget. Per request: facts → skip when nothing
// the page freezes changed → begin_client_edition → A1 perception (unperceived
// pictures) → A2 hero pick (inside the top R142 tier) → B words → C judge (one
// regeneration) → finish_client_edition. Every path settles the request with
// its spend, or reports it unsettled with the sweep that recovers it.

import { type CallClaudeOptions, type CallClaudeResult, LEDGER_SETTLE_MS, type ModelResponse } from "../_shared/claude.ts";
import type { ClaudeRole } from "../_shared/claude-models.ts";
import { shortenError } from "../client-plate-copy/lib.ts";
import { lintText } from "./lint.ts";
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
import { type Media, readRendition, RENDITION_TIMEOUT_MS, type RenditionUse } from "./renditions.ts";
import {
  type Box,
  type HeroAnswer,
  headlineFault,
  isPlainObject,
  JUDGE_UNAVAILABLE,
  type Judgement,
  type Perception,
  type Point,
  readJudgement,
  validateHero,
  validatePerception,
  validateWords,
  type Words,
} from "./validate.ts";

// ── Time budget ────────────────────────────────────────────────────────────

/** The whole invocation: inside the edge host's 150 s limit; the SQL leases (ten minutes) outlast it. */
export const RUN_BUDGET_MS = 120_000;
export const CALL_TIMEOUT_MS = 60_000;
/** A model call is made only when it can have at least this long. */
export const MIN_CALL_MS = 15_000;
/** Kept back for finish_client_edition, its retries and the reads that reconcile them. */
export const FINISH_RESERVE_MS = 10_000;
/** Kept back from perception and the hero pick for Call B and its judge. */
export const WORDS_RESERVE_MS = 60_000;
/** A request is claimed only while this much of the run is left. */
export const EDITION_MIN_MS = 90_000;
/** An edition stops this long before its claim lease ends. */
export const LEASE_MARGIN_MS = 30_000;
/** One database read or write, at most. */
export const DB_CALL_MS = 8_000;
/**
 * Kept after a model call's own timeout for settling its ledger row: callClaude
 * settles within LEDGER_SETTLE_MS and then returns, so a paid answer and its
 * cost arrive inside this window even when the ledger never answers.
 */
export const LEDGER_MS = LEDGER_SETTLE_MS + 1_000;
/** One finish (or close) attempt, or one read reconciling it, at most. */
export const SETTLE_CALL_MS = 3_000;

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
  lease_expires_at?: string | null;
  closing?: boolean;
  closing_facts?: unknown;
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

/** The designer's corrections to an approved edition; a null field restores the composed text. */
export interface EditionOverrides {
  heroAssetId?: string | null;
  chapters?: Record<string, { headline?: string | null; standing?: string | null } | null> | null;
  captions?: unknown;
}

export interface CurrentEdition {
  id: string;
  source_hash: string | null;
  composition: Partial<Composition> | null;
  facts: unknown;
  overrides?: EditionOverrides | null;
}

/** One client_plate_requests row, whatever its status: a kind the asset's bytes came from. */
export interface ProvenanceRow {
  id: string;
  asset_id: string;
  source_kind: string;
}

/** One page of rows in id order; the first page also carries their exact count. */
export interface Page<T> {
  rows: T[];
  total: number | null;
}

export type ProvenancePage = Page<ProvenanceRow>;

/** One project_ffe_items line, removed or not: its vendor record and the vendor name the line gives. */
export interface MakerLine {
  id: string;
  vendor_id: string | null;
  vendor_name: string | null;
}

/** Every call takes a signal that aborts once its window has passed. */
export interface Db {
  rpc(fn: string, args: Record<string, unknown>, signal: AbortSignal): Promise<DbResult<unknown>>;
  /** The project's approved edition, if any (client_editions, status 'approved'), with its overrides. */
  approvedEdition(projectId: string, signal: AbortSignal): Promise<DbResult<CurrentEdition>>;
  /** At most `limit` request rows naming these assets, in any status, ordered by id after `after` (null: from the first). */
  provenancePage(
    projectId: string,
    assetIds: string[],
    after: string | null,
    limit: number,
    signal: AbortSignal,
  ): Promise<DbResult<ProvenancePage>>;
  /** At most `limit` of the project's item lines, removed ones included, ordered by id after `after` (null: from the first). */
  makerLines(projectId: string, after: string | null, limit: number, signal: AbortSignal): Promise<DbResult<Page<MakerLine>>>;
  /** The names on these vendor records. */
  vendorNames(vendorIds: string[], signal: AbortSignal): Promise<DbResult<string[]>>;
  /** An edition's status as it stands now. */
  editionStatus(editionId: string, signal: AbortSignal): Promise<DbResult<string>>;
}

export type Claude = (opts: CallClaudeOptions) => Promise<CallClaudeResult>;

export interface ComposeDeps {
  db: Db;
  claude: Claude;
  privacyLive: boolean;
  media: Media;
  /** Milliseconds since the epoch. */
  now: () => number;
  /** When this invocation's budget ends, in the same clock. */
  deadline: number;
  /** Resolves once `ms` pass on the same clock, or as soon as `signal` aborts. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** The real clock's sleep. */
export function sleepFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

// ── Bounded I/O ────────────────────────────────────────────────────────────

const LATE = Symbol("late");

/**
 * The work's answer, or LATE once `ms` pass on the deps clock. The work's
 * signal aborts as soon as either settles, so a call that honours it stops,
 * and no await outlives its window.
 */
async function within<T>(deps: ComposeDeps, ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T | typeof LATE> {
  const stop = new AbortController();
  try {
    return await Promise.race([work(stop.signal), deps.sleep(Math.max(0, ms), stop.signal).then((): typeof LATE => LATE)]);
  } finally {
    stop.abort(new Error("no answer in time"));
  }
}

function dbFailure(message: string): DbResult<never> {
  return { data: null, error: { message } };
}

/** A database call bounded to `ms`: a throw, no time or no answer in time comes back as its error, never thrown. */
async function dbCall<T>(deps: ComposeDeps, ms: number, call: (signal: AbortSignal) => Promise<DbResult<T>>): Promise<DbResult<T>> {
  if (ms <= 0) return dbFailure("no time left");
  try {
    const result = await within(deps, ms, call);
    return result === LATE ? dbFailure("no answer in time") : result;
  } catch (cause) {
    return dbFailure(shortenError(cause));
  }
}

/** A call's window: its cap, or what is left before `until`. */
function windowTo(deps: ComposeDeps, until: number, cap: number): number {
  return Math.min(cap, until - deps.now());
}

/** A database call outside an edition: the run's finish reserve stays untouched. */
function runWindow(deps: ComposeDeps): number {
  return windowTo(deps, deps.deadline - FINISH_RESERVE_MS, DB_CALL_MS);
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

function heroSized(asset: FactsAsset): boolean {
  return Math.max(asset.width, asset.height) >= 2000 && Math.min(asset.width, asset.height) >= 1200;
}

/** Gallery's full-height arrival must hold its subject in both viewport crops. */
export function meetsHero(asset: FactsAsset): boolean {
  return heroSized(asset) && asset.ground === "scene" && asset.sourceKind !== "concept" &&
    holdsSubject(cropBox(390 / 796, asset), asset) && holdsSubject(cropBox(1440 / 852, asset), asset);
}

// ── Gallery deterministic headlines ──────────────────────────────────────

function roomHeadline(room: FactsRoom): string {
  const name = room.name.trim().replace(/\s+/gu, " ");
  const headline = name.includes(" ") ? name : `The ${name.toLowerCase()}`;
  return headlineFault(headline, false) || lintText(headline) ? "The room" : headline;
}

function coverHeadline(phase: string | null): string {
  switch (phase) {
    case "procurement":
      return "The pieces are on their way";
    case "installation":
      return "The rooms are going in";
    case "final_walkthrough":
      return "The house, as finished";
    default:
      return "The rooms, as drawn";
  }
}

/** Safe band and menu copy from the record alone; no standing sentences are invented. */
export function deterministicHeadlines(facts: EditorialFacts): { key: string; headline: string }[] {
  return [
    { key: "cover", headline: coverHeadline(facts.project.phase) },
    { key: "house", headline: "The house" },
    ...facts.rooms.map((room) => ({ key: room.anchor, headline: roomHeadline(room) })),
    { key: "progress", headline: "On the way" },
  ];
}

/** The held crop: a tall plate (0.46) at least 780×1696 (client-portal lib/editorial/floors.ts). */
function meetsHeld(asset: FactsAsset): boolean {
  return meetsCrop(0.46, { w: 780, h: 1696 }, asset);
}

// ── Source hash and render fingerprint ─────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** sha256 of the allowlisted facts: what the words are written from. */
export function sourceHash(facts: EditorialFacts): Promise<string> {
  return sha256Hex(JSON.stringify(allowedFacts(facts)));
}

/** Object keys sorted at every depth; arrays keep their order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isPlainObject(value)) return value ?? null;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function without(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

// The approved reader reads these live, by asset or project, not from the
// frozen facts; and these are the composer's own, never rendered. Perceived
// flags are kept: the reader re-checks the hero against them live, but not
// the held pictures, so a flag-only change must compose again.
const LIVE_PROJECT = ["showMakers"];
const LIVE_ASSET = ["sha256", "width", "height", "ground", "dominantHex", "lqip", "focal", "subjectBox", "crops"];
const SERVICE_ASSET = ["perceivedPromptVersion", "focalOrigin", "perceivedAlt"];

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A picture's frozen facts, its flags as a set. */
function frozenAsset(asset: unknown): Record<string, unknown> | null {
  const kept = without(asset, [...LIVE_ASSET, ...SERVICE_ASSET]);
  return kept && { ...kept, perceivedFlags: [...new Set(listOf(kept.perceivedFlags).map(String))].sort() };
}

/** The facts an approved page renders or selects from its frozen copy, in order: every envelope key the reader projects. */
export function frozenFacts(facts: unknown): unknown {
  const envelope = isPlainObject(facts) ? facts : {};
  const project = without(envelope.project, LIVE_PROJECT);
  return canonical({
    project: project && { ...project, studio: without(project.studio, ["id"]) },
    rooms: listOf(envelope.rooms),
    assets: listOf(envelope.assets).map(frozenAsset),
    palette: listOf(envelope.palette),
    boards: listOf(envelope.boards),
    sheets: listOf(envelope.sheets),
  });
}

/** sha256 of the frozen facts: a palette colour, a caption or an item's pictures in a new order all change it. */
export function renderFingerprint(facts: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(frozenFacts(facts)));
}

/** The same words' source and the same frozen facts as the approved edition: nothing to compose. */
export async function unchanged(current: CurrentEdition | null, hash: string, facts: EditorialFacts): Promise<boolean> {
  if (!current?.facts || current.source_hash !== hash) return false;
  return (await renderFingerprint(current.facts)) === (await renderFingerprint(facts));
}

// ── One edition ────────────────────────────────────────────────────────────

/** A model call was denied (kill switch, disabled feature, budget): composition stops. */
export class ComposeStopped extends Error {}

/** What this run's A1 saw in one picture. `frame` is set only when the model's framing was recorded. */
interface Seen {
  flags: string[];
  alt: string;
  frame: { subjectBox: Box; focal: Point } | null;
  /** record_plate_perception answered without an error. */
  recorded: boolean;
}

interface Ctx {
  facts: EditorialFacts;
  deps: ComposeDeps;
  /** This edition's end: the run's, or sooner when the claim lease ends first. */
  deadline: number;
  spend: { usd: number };
  model: string | null;
  /** Asset id → every kind its bytes were requested under. */
  sources: Map<string, string[]>;
  /** The project's own names, which model attribution never matches. */
  names: string[];
  /** While the studio hides makers, the job's maker names (makerNames); none while it shows them. */
  makers: string[];
  seen: Map<string, Seen>;
  pictures: Map<string, string | null>;
}

/** Time left before the finish reserve. */
function timeLeft(ctx: Ctx): number {
  return ctx.deadline - ctx.deps.now() - FINISH_RESERVE_MS;
}

type Answer = { ok: true; response: ModelResponse } | { ok: false; error: string; late: boolean };

/** Counts what a call cost, failed calls included; the edition records the model that wrote it, not the judge's. */
function count(ctx: Ctx, role: ClaudeRole, result: CallClaudeResult): void {
  if (result.ok && role !== "judge") ctx.model = result.model;
  ctx.spend.usd += "usd" in result ? result.usd ?? 0 : 0;
}

/**
 * One model call, bounded by the budget less `keep`: the ledger's reservation
 * and the model share `timeoutMs`, settling the ledger has LEDGER_MS more, and
 * nothing is awaited past that. A call with no answer by then is a failed call
 * whose reservation the ledger's stale sweep settles. A denied call stops the edition.
 */
async function ask(ctx: Ctx, role: ClaudeRole, params: Record<string, unknown>, keep: number): Promise<Answer> {
  const timeoutMs = Math.min(CALL_TIMEOUT_MS, timeLeft(ctx) - keep - LEDGER_MS);
  if (timeoutMs < MIN_CALL_MS) return { ok: false, error: "out of time", late: true };
  const studioId = ctx.facts.project.studio?.id ?? null;
  const call = { feature: FEATURE, role, studioId, userId: null, promptVersion: PROMPT_VERSION, params, timeoutMs };
  const result = await within(ctx.deps, timeoutMs + LEDGER_MS, (signal) => ctx.deps.claude({ ...call, signal, ledgerSignal: signal }));
  return result === LATE ? { ok: false, error: "no answer in time", late: false } : answered(ctx, role, result);
}

/** A call that answered in time, counted. A denied call stops the edition. */
function answered(ctx: Ctx, role: ClaudeRole, result: CallClaudeResult): Answer {
  count(ctx, role, result);
  if (result.ok) return { ok: true, response: result.response };
  if ("denied" in result) throw new ComposeStopped(`claude ${result.denied}`);
  return { ok: false, error: result.error, late: false };
}

const ALWAYS_SENT = new Set(["upload", "maker", "concept"]);
const HER_HOME = new Set(["scan", "installed"]);
const NEVER_HERO = new Set(["sheet", "concept"]);

/** Sheets, boards and any kind not named here never; her home only once the privacy page is live. */
function kindSendable(kind: string, privacyLive: boolean): boolean {
  return HER_HOME.has(kind) ? privacyLive : ALWAYS_SENT.has(kind);
}

/** The asset's kind and every request kind behind it; null when no request row resolves. */
function provenance(ctx: Ctx, asset: FactsAsset): string[] | null {
  const kinds = ctx.sources.get(asset.id);
  return kinds?.length ? [asset.sourceKind, ...kinds] : null;
}

/** Sheets and boards never; scans and installed photographs only once the privacy page is live; unknown provenance never. */
function sendable(ctx: Ctx, asset: FactsAsset): boolean {
  const kinds = provenance(ctx, asset);
  return !!kinds && kinds.every((kind) => kindSendable(kind, ctx.deps.privacyLive));
}

/** Watermark, people or text over the picture, seen now or by an earlier perception. */
function flagged(ctx: Ctx, asset: FactsAsset): boolean {
  return (asset.perceivedFlags?.length ?? 0) > 0 || (ctx.seen.get(asset.id)?.flags.length ?? 0) > 0;
}

/** The asset with this run's recorded model framing; a designer's framing stands. */
function framed(ctx: Ctx, asset: FactsAsset): FactsAsset {
  const frame = ctx.seen.get(asset.id)?.frame;
  return frame ? { ...asset, ...frame } : asset;
}

async function picture(ctx: Ctx, asset: FactsAsset, use: RenditionUse, keep: number): Promise<string | null> {
  const key = `${use}:${asset.id}`;
  if (!ctx.pictures.has(key)) {
    const timeoutMs = Math.min(RENDITION_TIMEOUT_MS, timeLeft(ctx) - keep);
    ctx.pictures.set(key, await readRendition(ctx.deps.media, ctx.facts.project.id, asset, use, timeoutMs));
  }
  return ctx.pictures.get(key) ?? null;
}

interface Shown {
  asset: FactsAsset;
  data: string;
}

/** The assets whose renditions could be read, in order; one that cannot is dropped alone. */
async function withPictures(ctx: Ctx, assets: readonly FactsAsset[], use: RenditionUse, keep: number): Promise<Shown[]> {
  const data = await Promise.all(assets.map((asset) => picture(ctx, asset, use, keep)));
  return assets.flatMap((asset, i) => (data[i] ? [{ asset, data: data[i]! }] : []));
}

function imageInput(ctx: Ctx, shown: Shown): ImageInput {
  return { data: shown.data, label: assetLabel(ctx.facts, shown.asset.id) };
}

const FRAME_UNIT = 10_000;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The model's frame on a 1e-4 grid, exactly inside the picture (x+w ≤ 1,
 * y+h ≤ 1) with the focal point inside the box: the values record_plate_perception
 * stores and the recrop uses are the ones this run judges crops with.
 */
export function onGrid(box: Box, focal: Point): { subjectBox: Box; focal: Point } {
  const [x, y] = [box[0], box[1]].map((v) => clamp(Math.round(v * FRAME_UNIT), 0, FRAME_UNIT - 1));
  const w = clamp(Math.round(box[2] * FRAME_UNIT), 1, FRAME_UNIT - x);
  const h = clamp(Math.round(box[3] * FRAME_UNIT), 1, FRAME_UNIT - y);
  const fx = clamp(Math.round(focal[0] * FRAME_UNIT), x, x + w);
  const fy = clamp(Math.round(focal[1] * FRAME_UNIT), y, y + h);
  const unit = (v: number) => v / FRAME_UNIT;
  return { subjectBox: [unit(x), unit(y), unit(w), unit(h)], focal: [unit(fx), unit(fy)] };
}

/** A null frame keeps the stored one (the designer's). */
function frameArgs(frame: ReturnType<typeof onGrid> | null) {
  return { p_subject_box: frame?.subjectBox ?? null, p_focal: frame?.focal ?? null };
}

/**
 * record_plate_perception: flags, alt and version always; the frame only when
 * it is the model's to set (a designer's frame is sent as null and stands). A
 * changed model frame requeues the plate's crops server side.
 */
async function recordPerception(ctx: Ctx, asset: FactsAsset, perception: Perception): Promise<void> {
  const frame = asset.focalOrigin === "designer" ? null : onGrid(perception.subjectBox, perception.focal);
  const args = {
    p_asset_id: asset.id,
    ...frameArgs(frame),
    p_flags: perception.flags,
    p_alt: perception.alt,
    p_prompt_version: PROMPT_VERSION,
  };
  const { error } = await dbCall(ctx.deps, Math.min(DB_CALL_MS, timeLeft(ctx)), (signal) => ctx.deps.db.rpc("record_plate_perception", args, signal));
  if (error) console.error(`client-edition-compose: perception ${asset.id}: ${shortenError(error.message)}`);
  // Flags count even when the write failed; a frame not stored is not the frame the crops will use.
  ctx.seen.set(asset.id, { flags: perception.flags, alt: perception.alt, frame: error ? null : frame, recorded: !error });
}

/** One A1 call over the pictures of `assets` that can be read; an answer the validator rejects records nothing. */
async function perceiveBatch(ctx: Ctx, assets: FactsAsset[]): Promise<void> {
  const batch = await withPictures(ctx, assets, "perceive", WORDS_RESERVE_MS);
  if (!batch.length) return;
  const answer = await ask(ctx, "perceive", buildPerceptionRequest(batch.map((shown) => imageInput(ctx, shown))), WORDS_RESERVE_MS);
  const checked = answer.ok ? validatePerception(answer.response, batch.length, ctx.names) : null;
  if (!checked?.ok) return;
  for (const perception of checked.value) await recordPerception(ctx, batch[perception.index].asset, perception);
}

/** Call A1 over unperceived sendable pictures, eight at a time, while words still fit after it. */
async function perceive(ctx: Ctx): Promise<void> {
  const targets = ctx.facts.assets.filter((asset) => !asset.perceivedPromptVersion && sendable(ctx, asset));
  for (let start = 0; start < targets.length; start += A1_BATCH) {
    if (timeLeft(ctx) - WORDS_RESERVE_MS < MIN_CALL_MS) return;
    await perceiveBatch(ctx, targets.slice(start, start + A1_BATCH));
  }
}

export interface HeroChoice {
  asset: FactsAsset;
  why: string | null;
  held: FactsAsset[];
}

/** Known provenance with no sheet or concept behind it, unflagged, ranked, and meeting the hero floors. */
function heroEligible(ctx: Ctx, asset: FactsAsset): boolean {
  const kinds = provenance(ctx, asset);
  if (!kinds || kinds.some((kind) => NEVER_HERO.has(kind)) || flagged(ctx, asset)) return false;
  return tierOf(asset) !== null && meetsHero(framed(ctx, asset));
}

/**
 * Call A2 inside the top tier; any answer the validator rejects falls back to
 * the code pick (rank order). A held choice that misses the held floor is dropped.
 */
async function pickHero(ctx: Ctx): Promise<HeroChoice | null> {
  const eligible = ctx.facts.assets.filter((asset) => heroEligible(ctx, asset)).sort(compareAssets);
  if (!eligible.length) return null;
  const code: HeroChoice = { asset: eligible[0], why: null, held: [] };
  const top = tierOf(eligible[0]);
  const candidates = eligible.filter((asset) => tierOf(asset) === top && sendable(ctx, asset)).slice(0, A2_CANDIDATES);
  const pool = candidates.length < 2 ? [] : await withPictures(ctx, candidates, "hero", WORDS_RESERVE_MS);
  if (pool.length < 2) return code;
  const chosen = await askHero(ctx, pool);
  if (!chosen) return code;
  const held = chosen.held.map((i) => pool[i].asset).filter((asset) => meetsHeld(framed(ctx, asset)));
  return { asset: pool[chosen.index].asset, why: chosen.why, held };
}

/** Call A2 over the pool; null when it fails or the validator rejects the answer. */
async function askHero(ctx: Ctx, pool: Shown[]): Promise<HeroAnswer | null> {
  const request = buildHeroRequest(pool.map((shown) => imageInput(ctx, shown)), allowedFacts(ctx.facts));
  const answer = await ask(ctx, "draft", request, WORDS_RESERVE_MS);
  const checked = answer.ok ? validateHero(answer.response, pool.length, ctx.names) : null;
  return checked?.ok ? checked.value : null;
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

type Prose = Pick<Composition, "chapters" | "doorstep">;

/** The approved words as the homeowner reads them: the designer's overrides applied by chapter key. */
export function effectiveProse(composition: Partial<Composition>, overrides: EditionOverrides | null | undefined): Partial<Prose> {
  const edits = overrides?.chapters ?? {};
  return {
    chapters: (composition.chapters ?? []).map((chapter) => {
      const edit = edits[chapter.key];
      return {
        key: chapter.key,
        headline: typeof edit?.headline === "string" ? edit.headline : chapter.headline,
        standing: typeof edit?.standing === "string" ? edit.standing : chapter.standing ?? null,
      };
    }),
    doorstep: composition.doorstep,
  };
}

/**
 * The words finish_client_edition compares to publish plates only
 * (_client_edition_prose): the chapters in key order as key, headline and
 * standing, and the doorstep. Never the notice, which says what changed.
 */
export function proseKey(prose: Partial<Prose>): string {
  const chapters = (prose.chapters ?? [])
    .map((chapter, position) => ({ chapter, position }))
    .sort((a, b) => compareCodepoints(a.chapter.key, b.chapter.key) || a.position - b.position)
    .map(({ chapter }) => ({ key: chapter.key, headline: chapter.headline ?? null, standing: chapter.standing ?? null }));
  return JSON.stringify(canonical({ chapters, doorstep: prose.doorstep ?? null }));
}

/**
 * The page's words as the homeowner reads them, rekeyed by position, for Call B
 * to keep what is still true. None at all once the studio stops showing makers:
 * older words may name one.
 */
function currentWords(ctx: Ctx, current: CurrentEdition | null, plan: ChapterPlan): unknown | null {
  const composition = current?.composition;
  if (!composition?.chapters || ctx.facts.project.showMakers !== true) return null;
  const prose = effectiveProse(composition, current?.overrides);
  return { chapters: byPosition(prose, plan), doorstep: prose.doorstep ?? null, notice: composition.notice ?? null };
}

/** The chapters Call B is asked for, keyed by position as it asks. */
function byPosition(prose: Partial<Prose>, plan: ChapterPlan) {
  const keyOf = new Map([...plan.anchorOf].map(([key, anchor]) => [anchor, key]));
  return (prose.chapters ?? []).filter((c) => keyOf.has(c.key)).map((c) => ({ ...c, key: keyOf.get(c.key) }));
}

/** The opening the page had: never a description of a picture now flagged. */
function beforeLabel(ctx: Ctx, current: CurrentEdition | null): string | null {
  if (!current?.composition) return null;
  const before = ctx.facts.assets.find((asset) => asset.id === current.composition?.hero?.assetId);
  if (!before) return "the paint card";
  return flagged(ctx, before) ? "an earlier picture" : assetLabel(ctx.facts, before.id);
}

function opening(ctx: Ctx, hero: HeroChoice | null, current: CurrentEdition | null) {
  return {
    now: hero ? assetLabel(ctx.facts, hero.asset.id) : "the paint card",
    before: beforeLabel(ctx, current),
  };
}

/** The judge's reading of one answer; null when there was no time to ask. */
function judgementOf(answer: Answer): Judgement | null {
  if (answer.ok) return readJudgement(answer.response);
  return answer.late ? null : JUDGE_UNAVAILABLE;
}

/** Call C's judge, asked once more while it is unavailable and time remains. */
async function judge(ctx: Ctx, words: Words): Promise<Judgement> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const verdict = judgementOf(await ask(ctx, "judge", buildJudgeRequest(words), 0));
    if (verdict?.verdict !== "unavailable") return verdict ?? JUDGE_UNAVAILABLE;
  }
  return JUDGE_UNAVAILABLE;
}

type WordsBrief = Omit<WordsInput, "avoid">;

type Draft = { words: Words; avoid: null } | { words: null; avoid: string | null };

/** One Call B draft: valid words, or a forbidden term / Gallery limit for the retry. */
async function draftWords(ctx: Ctx, plan: ChapterPlan, brief: WordsBrief, avoid?: string): Promise<Draft> {
  const answer = await ask(ctx, "draft", buildWordsRequest({ ...brief, avoid }), MIN_CALL_MS);
  if (!answer.ok) return noDraft(answer);
  const checked = validateWords(answer.response, plan.keys, ctx.names);
  return checked.ok ? { words: checked.value, avoid: null } : { words: null, avoid: checked.term ?? galleryMiss(checked.reason) };
}

/** Only wording-limit failures join the lexicon's single-regeneration path. */
function galleryMiss(reason: string): string | null {
  return /^(headline|standing) /.test(reason) ? reason : null;
}

/** A Call B with no time left gives no words; one that failed fails the edition. */
function noDraft(answer: Extract<Answer, { ok: false }>): Draft {
  if (!answer.late) throw new Error(`words: ${answer.error}`);
  return { words: null, avoid: null };
}

/** Valid words go to the judge; a lint hit is a finding; anything else leaves nothing usable. */
function verdictOn(ctx: Ctx, draft: Draft): Promise<Judgement> | Judgement {
  if (draft.words) return judge(ctx, draft.words);
  return draft.avoid ? { verdict: "hit", term: draft.avoid } : JUDGE_UNAVAILABLE;
}

/**
 * Call B, then C. A forbidden term (the shared lint's or the judge's) earns one
 * regeneration naming it. A Gallery wording-limit miss also earns that retry.
 * A second miss, a judge that stays unavailable, or no time left leaves the
 * deterministic headlines. A failed B call fails the edition.
 */
async function writeWords(ctx: Ctx, plan: ChapterPlan, brief: WordsBrief): Promise<Words | null> {
  let avoid: string | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const draft = await draftWords(ctx, plan, brief, avoid);
    const verdict = await verdictOn(ctx, draft);
    if (verdict.verdict !== "hit") return verdict.verdict === "clean" ? draft.words : null;
    avoid = verdict.term;
  }
  return null;
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

/** Pictures whose caption names a maker while the studio shows makers (_client_plate_alt's maker and upload). */
const MAKER_ATTRIBUTED = new Set(["maker", "upload"]);

/**
 * This run's perceived alt, else the one an earlier perception stored, else
 * the caption's. While the studio hides makers, a maker or upload picture
 * takes the caption's alt, built from the masked caption, since a perceived
 * one may have been written while makers were shown; so does any picture
 * whose alt names one of the job's makers. The facts were read with every
 * caption alt naming one rebuilt (withoutMakerAlts), so the caption's names none.
 */
function altOf(ctx: Ctx, asset: FactsAsset): string | null {
  const caption = asset.alt ?? null;
  if (makerHidden(ctx, asset)) return caption;
  const alt = ctx.seen.get(asset.id)?.alt ?? storedAlt(ctx, asset) ?? caption;
  return namesMaker(alt, ctx.makers) ? caption : alt;
}

/** A maker or upload picture while the studio hides makers. */
function makerHidden(ctx: Ctx, asset: FactsAsset): boolean {
  return ctx.facts.project.showMakers !== true && MAKER_ATTRIBUTED.has(asset.sourceKind);
}

/** The alt an earlier perception stored, while it still passes the lint. */
function storedAlt(ctx: Ctx, asset: FactsAsset): string | null {
  const alt = asset.perceivedAlt;
  return alt && !lintText(alt, ctx.names) ? alt : null;
}

function imageRow(ctx: Ctx, asset: FactsAsset, role: ImageRow["plate_role"], rank: number, chapter: string): ImageRow {
  return {
    asset_id: asset.id,
    plate_role: role,
    crop_key: "none",
    rank,
    chapter_key: chapter,
    alt: altOf(ctx, asset),
    caption_what: asset.caption?.what ?? null,
    caption_whose: asset.caption?.whose ?? null,
    caption_when: asset.caption?.when ?? null,
  };
}

/** The chosen pictures' rows: the hero on the cover, each held picture in its room. */
function imageRows(ctx: Ctx, hero: HeroChoice | null): ImageRow[] {
  if (!hero) return [];
  const held = hero.held.map((asset, i) => imageRow(ctx, asset, "held", i + 1, roomAnchorOf(ctx.facts, asset.id) ?? "house"));
  return [imageRow(ctx, hero.asset, "hero", 0, "cover"), ...held];
}

export interface EditionDraft {
  status: "awaiting_review" | "approved" | "failed";
  kind: "full" | "plates_only";
  composition: Partial<Composition>;
  images: ImageRow[];
  model: string | null;
  error: string | null;
  /** The facts to freeze, when this run changed what it read. */
  facts?: EditorialFacts;
}

// ── Makers off ─────────────────────────────────────────────────────────────

/** _client_plate_alt's kind wording (00845). */
const KIND_WORDS: Record<string, string> = {
  maker: "product photograph",
  upload: "studio photograph",
  installed: "installed photograph",
  scan: "room scan",
  board: "studio board",
  sheet: "drawing",
  concept: "concept render, not installed",
};

/** _client_plate_alt: what · whose · the kind's wording, a missing part left out. */
function plateAlt(what: string | null, whose: string | null, kind: string): string {
  return [what, whose, KIND_WORDS[kind] ?? null].filter((part) => part !== null).join(" · ");
}

/** The names the 00846 reader masks: trimmed, lower-cased, at least three characters, each once. */
function makerSet(names: readonly (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const name of names) {
    const trimmed = name?.trim().toLowerCase() ?? "";
    if ([...trimmed].length >= 3) set.add(trimmed);
  }
  return [...set];
}

/** Whether `text` holds one of `makers`, matched as the reader does: case-insensitive substrings. */
function namesMaker(text: string | null | undefined, makers: readonly string[]): boolean {
  const lower = text?.toLowerCase() ?? "";
  return makers.some((maker) => lower.includes(maker));
}

const LEFTOVER_SEPARATORS = /^[\s·,;:&/\-–—]+|[\s·,;:&/\-–—]+$/g;

/** `text` with every maker name taken out and its leftover separators trimmed; null once nothing (or a maker) is left. */
function withoutMakers(text: string | null | undefined, makers: readonly string[]): string | null {
  if (!text) return null;
  let left = text;
  for (const maker of [...makers].sort((a, b) => b.length - a.length)) {
    left = left.replace(new RegExp(maker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), " ");
  }
  left = left.replace(/\s+/g, " ").replace(LEFTOVER_SEPARATORS, "");
  return left && !namesMaker(left, makers) ? left : null;
}

/**
 * Makers off is a consent switch over every kind of picture (story seq 53).
 * A caption alt naming one of the job's makers is rebuilt as _client_plate_alt
 * builds it, from the caption with those names taken out of its what; a stored
 * perceived alt naming one is dropped. The studio's name and the kind words are
 * trusted, so a rebuilt alt is final and never checked again (seq 59). Any
 * other alt is kept byte for byte.
 */
function withoutMakerAlts(facts: EditorialFacts, makers: readonly string[]): EditorialFacts {
  if (!makers.length) return facts;
  const assets = facts.assets.map((asset) => {
    const alt = namesMaker(asset.alt, makers)
      ? plateAlt(withoutMakers(asset.caption?.what, makers), asset.caption?.whose ?? null, asset.sourceKind)
      : asset.alt;
    const perceivedAlt = namesMaker(asset.perceivedAlt, makers) ? null : asset.perceivedAlt;
    return alt === asset.alt && perceivedAlt === asset.perceivedAlt ? asset : { ...asset, alt, perceivedAlt };
  });
  return { ...facts, assets };
}

const VENDOR_IDS_PER_READ = 100;

/**
 * While the studio hides makers, every name the 00846 reader masks: each
 * vendor record and vendor name on the project's item lines, removed ones
 * included, and each makerName the facts carry. An error, no answer in time
 * or a short read throws, so nothing is composed without the whole set.
 */
async function makerNames(facts: EditorialFacts, deps: ComposeDeps): Promise<string[]> {
  if (facts.project.showMakers === true || !facts.assets.length) return [];
  const until = deps.deadline - FINISH_RESERVE_MS;
  const lines = await readAll(deps, until, "makers", (after, signal) => deps.db.makerLines(facts.project.id, after, PAGE_ROWS, signal));
  const vendorIds = [...new Set(lines.flatMap((line) => (line.vendor_id ? [line.vendor_id] : [])))];
  const vendors: string[] = [];
  for (let i = 0; i < vendorIds.length; i += VENDOR_IDS_PER_READ) {
    const ids = vendorIds.slice(i, i + VENDOR_IDS_PER_READ);
    const { data, error } = await dbCall(deps, windowTo(deps, until, DB_CALL_MS), (signal) => deps.db.vendorNames(ids, signal));
    if (error || !data) throw new Error(`makers: ${error?.message ?? "no answer"}`);
    vendors.push(...data);
  }
  const named = facts.rooms.flatMap((room) => room.items.map((item) => item.makerName));
  return makerSet([...vendors, ...lines.map((line) => line.vendor_name), ...named]);
}

function kindsByAsset(rows: readonly ProvenanceRow[]): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  for (const row of rows) sources.set(row.asset_id, [...(sources.get(row.asset_id) ?? []), row.source_kind]);
  return sources;
}

const PAGE_ROWS = 1_000;
const MAX_PAGES = 50;

/**
 * Every row a paged read returns, page by page in id order until a short page,
 * held to the first page's exact count. An error, no answer in time or fewer
 * rows than counted throws, naming `what`.
 */
async function readAll<T extends { id: string }>(
  deps: ComposeDeps,
  until: number,
  what: string,
  query: (after: string | null, signal: AbortSignal) => Promise<DbResult<Page<T>>>,
): Promise<T[]> {
  const read = async (after: string | null) => {
    const { data, error } = await dbCall(deps, windowTo(deps, until, DB_CALL_MS), (signal) => query(after, signal));
    if (error || !data) throw new Error(`${what}: ${error?.message ?? "no answer"}`);
    return data;
  };
  const first = await read(null);
  const rows = [...first.rows];
  let last = first.rows.length;
  for (let page = 1; page < MAX_PAGES && last >= PAGE_ROWS; page += 1) {
    const next = await read(rows[rows.length - 1].id);
    rows.push(...next.rows);
    last = next.rows.length;
  }
  const total = first.total;
  if (total === null || rows.length < total) throw new Error(`${what}: read ${rows.length} of ${total ?? "an uncounted set of"} rows`);
  return rows;
}

/**
 * Every request row naming the facts' assets. A failed or short read throws:
 * the edition then fails before any picture is sent.
 */
function readProvenance(facts: EditorialFacts, deps: ComposeDeps, until: number): Promise<ProvenanceRow[]> {
  const ids = facts.assets.map((asset) => asset.id);
  if (!ids.length) return Promise.resolve([]);
  return readAll(deps, until, "provenance", (after, signal) => deps.db.provenancePage(facts.project.id, ids, after, PAGE_ROWS, signal));
}

/** Every signed item name, and maker names when the studio shows makers. */
function allowedNames(facts: EditorialFacts): string[] {
  const makers = facts.project.showMakers === true;
  return facts.rooms.flatMap((room) => room.items.flatMap((item) => [item.nameAsSigned, ...(makers && item.makerName ? [item.makerName] : [])]));
}

async function context(facts: EditorialFacts, makers: string[], deps: ComposeDeps, deadline: number, spend: { usd: number }): Promise<Ctx> {
  const rows = await readProvenance(facts, deps, deadline - FINISH_RESERVE_MS);
  return {
    facts,
    deps,
    deadline,
    spend,
    model: null,
    sources: kindsByAsset(rows),
    names: allowedNames(facts),
    makers,
    seen: new Map(),
    pictures: new Map(),
  };
}

/** The facts as this run leaves them: flags it recorded replace the ones it read, so the next run finds them unchanged. */
function factsAsLeft(ctx: Ctx): EditorialFacts {
  const assets = ctx.facts.assets.map((asset) => {
    const seen = ctx.seen.get(asset.id);
    return seen?.recorded ? { ...asset, perceivedFlags: seen.flags } : asset;
  });
  return { ...ctx.facts, assets };
}

/**
 * Words that read the same as the approved page publish as plates only, and
 * carry the approved edition's own words, so finish_client_edition finds them
 * unchanged and keeps the designer's overrides. Anything else waits for review.
 */
function settleWords(fresh: Composition, current: CurrentEdition | null): { composition: Composition; platesOnly: boolean } {
  const prior = current?.composition;
  const same = !!prior?.chapters && proseKey(fresh) === proseKey(effectiveProse(prior, current?.overrides));
  if (!same) return { composition: fresh, platesOnly: false };
  return { composition: { ...fresh, chapters: prior!.chapters!, doorstep: prior!.doorstep! }, platesOnly: true };
}

/** One edition's draft. */
export async function composeEdition(
  facts: EditorialFacts,
  makers: string[],
  current: CurrentEdition | null,
  hash: string,
  deps: ComposeDeps,
  deadline: number,
  spend: { usd: number },
): Promise<EditionDraft> {
  const ctx = await context(facts, makers, deps, deadline, spend);
  if (!facts.closing) await perceive(ctx);
  const hero = await pickHero(ctx);
  const plan = chapterPlan(facts);
  const words = await writeWords(ctx, plan, {
    facts: allowedFacts(facts),
    chapters: plan.chapters,
    current: currentWords(ctx, current, plan),
    opening: opening(ctx, hero, current),
  });
  const fresh = buildComposition(hash, plan, words, hero, facts);
  // Closing drafts never auto-publish, so SQL will not carry the prior overrides.
  const { composition, platesOnly } = facts.closing
    ? { composition: fresh, platesOnly: false }
    : settleWords(fresh, current);
  return {
    status: platesOnly && !facts.closing ? "approved" : "awaiting_review",
    kind: platesOnly && !facts.closing ? "plates_only" : "full",
    composition,
    images: imageRows(ctx, hero),
    model: ctx.model,
    error: null,
    facts: factsAsLeft(ctx),
  };
}

// ── One request ────────────────────────────────────────────────────────────

export interface RequestOutcome {
  requestId: string;
  /** The edition begin_client_edition opened, if it did. */
  editionId: string | null;
  /** "unsettled": the reason names what the dispatcher's sweep recovers. */
  result: "composed" | "skipped" | "failed" | "unsettled";
  reason: string | null;
  usd: number;
}

type Settled = [RequestOutcome["result"], string | null];

const DAILY_LIMIT = /client_edition_daily_limit|two.?per.?day|daily.?limit/i;

export function isDailyLimit(error: DbError): boolean {
  return [error.message, error.details, error.hint].some((text) => !!text && DAILY_LIMIT.test(text));
}

async function readFacts(deps: ComposeDeps, projectId: string): Promise<EditorialFacts> {
  const args = { p_project_id: projectId };
  const { data, error } = await dbCall(deps, runWindow(deps), (signal) => deps.db.rpc("get_project_editorial_facts", args, signal));
  if (error || !data) throw new Error(`facts: ${error?.message ?? "none"}`);
  return data as EditorialFacts;
}

async function readCurrent(deps: ComposeDeps, projectId: string): Promise<CurrentEdition | null> {
  const { data, error } = await dbCall(deps, runWindow(deps), (signal) => deps.db.approvedEdition(projectId, signal));
  if (error) throw new Error(`approved edition: ${error.message}`);
  return data;
}

/** close_client_edition_request, tried twice within the run; a close that fails leaves the request leased for the sweep to requeue. */
async function closeRequest(deps: ComposeDeps, request: EditionRequest, reason: string): Promise<Settled> {
  const args = { p_request_id: request.id, p_lease_token: request.lease_token, p_reason: reason };
  let error: DbError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    ({ error } = await dbCall(deps, windowTo(deps, deps.deadline, SETTLE_CALL_MS), (signal) => deps.db.rpc("close_client_edition_request", args, signal)));
    if (!error) return ["skipped", reason];
  }
  const message = shortenError(error!.message);
  console.error(`client-edition-compose: close ${request.id}: ${message}`);
  return ["unsettled", `${reason}; close failed: ${message}`];
}

/** The new edition's id, or null when the project already has two today. */
async function beginEdition(deps: ComposeDeps, request: EditionRequest): Promise<string | null> {
  const args = { p_request_id: request.id, p_lease_token: request.lease_token };
  const { data, error } = await dbCall(deps, runWindow(deps), (signal) => deps.db.rpc("begin_client_edition", args, signal));
  if (error) {
    if (isDailyLimit(error)) return null;
    throw new Error(`begin: ${error.message}`);
  }
  if (typeof data !== "string") throw new Error("begin returned no edition");
  return data;
}

function finishArgs(editionId: string, request: EditionRequest, facts: EditorialFacts, draft: EditionDraft, usd: number) {
  return {
    p_edition_id: editionId,
    p_lease_token: request.lease_token,
    p_status: draft.status,
    p_kind: draft.kind,
    p_composition: draft.composition,
    p_facts: draft.facts ?? facts,
    p_images: draft.images,
    p_prompt_version: PROMPT_VERSION,
    p_model: draft.model,
    p_cost_usd: Number(usd.toFixed(6)),
    p_error: draft.error,
  };
}

function failedDraft(hash: string, cause: unknown): EditionDraft {
  return { status: "failed", kind: "full", composition: { sourceHash: hash }, images: [], model: null, error: shortenError(cause) };
}

interface Finish {
  deps: ComposeDeps;
  editionId: string;
  request: EditionRequest;
  facts: EditorialFacts;
  hash: string;
  usd: number;
  /** Every attempt and read ends by then. */
  until: number;
}

/** What the edition's own status says a finish did: null while it is still drafting, or when it cannot be read. */
async function landed(finish: Finish): Promise<Settled | null> {
  const { deps, editionId, until } = finish;
  const { data } = await dbCall(deps, windowTo(deps, until, SETTLE_CALL_MS), (signal) => deps.db.editionStatus(editionId, signal));
  if (data === "approved" || data === "awaiting_review") return ["composed", null];
  return data === "failed" || data === "superseded" ? ["failed", `edition found ${data}`] : null;
}

/** One bounded finish_client_edition: its error, a throw or no answer in time all come back as an error. */
async function finishOnce(finish: Finish, draft: EditionDraft): Promise<DbError | null> {
  const { deps, editionId, request, facts, usd, until } = finish;
  const args = finishArgs(editionId, request, facts, draft, usd);
  const { error } = await dbCall(deps, windowTo(deps, until, SETTLE_CALL_MS), (signal) => deps.db.rpc("finish_client_edition", args, signal));
  return error;
}

/** The sweep may enqueue one bounded recovery (00847); begin already consumed the request. */
function unconfirmed(finish: Finish, refused: string): Settled {
  const recovery = `the dispatcher's sweep fails drafting edition ${finish.editionId} once its lease lapses; ` +
    "its request is already done; the sweep may enqueue bounded recovery after 30 minutes, subject to the daily cap; " +
    "closed/frozen, consecutive-failure cap, or an active request suppress recovery; otherwise the project waits for its next edition request";
  console.error(`client-edition-compose: ${finish.editionId}: ${refused}; ${recovery}`);
  return ["unsettled", `${refused}; ${recovery}`];
}

/**
 * finish_client_edition with the spend: the draft, the draft again, then the
 * same edition recorded failed, spend and all. A finish that threw or never
 * answered may still have landed, so before each retry and after the last the
 * edition's own status is read, and a refusal is never taken to mean nothing
 * was written. Every attempt and read is bounded, and all of it ends by `until`.
 */
async function finishEdition(finish: Finish, draft: EditionDraft): Promise<Settled> {
  let refused = "finish refused";
  for (const [index, send] of sends(finish, draft).entries()) {
    const outcome = await attempt(finish, draft, send(refused), refused, index > 0);
    if (typeof outcome !== "string") return outcome;
    refused = outcome;
  }
  const found = await landed(finish);
  return found ? foundAs(found, draft, refused) : unconfirmed(finish, refused);
}

/** The draft, the draft again, then (unless the draft already failed) the edition recorded failed with the last refusal. */
function sends(finish: Finish, draft: EditionDraft): ((refused: string) => EditionDraft)[] {
  const twice = [() => draft, () => draft];
  return draft.status === "failed" ? twice : [...twice, (refused: string) => failedDraft(finish.hash, refused)];
}

/** One finish, after reading whether an earlier refused one landed: the outcome, or this attempt's refusal. */
async function attempt(finish: Finish, draft: EditionDraft, sent: EditionDraft, refused: string, retry: boolean): Promise<Settled | string> {
  const found = retry ? await landed(finish) : null;
  return found ? foundAs(found, draft, refused) : await sendFinish(finish, sent);
}

async function sendFinish(finish: Finish, sent: EditionDraft): Promise<Settled | string> {
  const error = await finishOnce(finish, sent);
  if (!error) return [sent.status === "failed" ? "failed" : "composed", sent.error];
  const refused = `finish refused: ${shortenError(error.message)}`;
  console.error(`client-edition-compose: ${finish.editionId}: ${refused}`);
  return refused;
}

/** A finish found landed: composed keeps the draft's note; otherwise the refusal and what the edition says. */
function foundAs(found: Settled, draft: EditionDraft, refused: string): Settled {
  return found[0] === "composed" ? ["composed", draft.error] : [found[0], `${refused}; ${found[1]}`];
}

async function draftOrFailure(
  facts: EditorialFacts,
  makers: string[],
  current: CurrentEdition | null,
  hash: string,
  deps: ComposeDeps,
  deadline: number,
  spend: { usd: number },
): Promise<EditionDraft> {
  try {
    return await composeEdition(facts, makers, current, hash, deps, deadline, spend);
  } catch (cause) {
    return failedDraft(hash, cause);
  }
}

/** The run's deadline, or sooner when this request's claim lease ends first. */
function editionDeadline(deps: ComposeDeps, request: EditionRequest): number {
  const lease = Date.parse(request.lease_expires_at ?? "");
  return Number.isFinite(lease) ? Math.min(deps.deadline, lease - LEASE_MARGIN_MS) : deps.deadline;
}

/** Closing requests never fall back to live facts: that would silently rewrite the close. */
function closingFacts(request: EditionRequest): EditorialFacts {
  const facts = request.closing_facts;
  if (!isPlainObject(facts) || facts.closing !== true || !isPlainObject(facts.project)
    || facts.project.id !== request.project_id || facts.project.phase !== "final_walkthrough"
    || !Array.isArray(facts.rooms) || !Array.isArray(facts.assets)) {
    throw new Error("closing request has no captured editorial facts");
  }
  return facts as unknown as EditorialFacts;
}

async function settleRequest(request: EditionRequest, deps: ComposeDeps, spend: { usd: number }, edition: { id: string | null }): Promise<Settled> {
  const read = request.closing ? closingFacts(request) : await readFacts(deps, request.project_id);
  // Before the unchanged check, so an edition frozen from these facts reads the same next run.
  const makers = await makerNames(read, deps);
  const facts = withoutMakerAlts(read, makers);
  const current = await readCurrent(deps, request.project_id);
  const hash = await sourceHash(facts);
  if (!request.closing && await unchanged(current, hash, facts)) return await closeRequest(deps, request, "unchanged");
  edition.id = await beginEdition(deps, request);
  if (edition.id === null) return await closeRequest(deps, request, "daily_limit");
  const until = editionDeadline(deps, request);
  const draft = await draftOrFailure(facts, makers, current, hash, deps, until, spend);
  return await finishEdition({ deps, editionId: edition.id, request, facts, hash, usd: spend.usd, until }, draft);
}

/** One claimed request, settled or reported unsettled; it never throws, and its edition and spend are always carried. */
export async function composeRequest(request: EditionRequest, deps: ComposeDeps): Promise<RequestOutcome> {
  const spend = { usd: 0 };
  const edition: { id: string | null } = { id: null };
  let settled: Settled;
  try {
    settled = await settleRequest(request, deps, spend, edition);
  } catch (cause) {
    // Only before an edition settles: the request is still leased, and the dispatcher's sweep requeues it.
    settled = ["unsettled", shortenError(cause)];
  }
  return { requestId: request.id, editionId: edition.id, result: settled[0], reason: settled[1], usd: spend.usd };
}

// ── One run ────────────────────────────────────────────────────────────────

export interface BatchSummary {
  claimed: number;
  composed: number;
  skipped: number;
  failed: number;
  unsettled: number;
  cost_usd: number;
  outcomes: { request_id: string; edition_id: string | null; result: RequestOutcome["result"]; reason: string | null }[];
}

/**
 * One request at a time; a claim error, throw or silence before any request is
 * the run's failure, and a later one ends the batch with what it has.
 */
async function claimOne(deps: ComposeDeps, first: boolean): Promise<EditionRequest | null> {
  const args = { p_limit: 1 };
  const { data, error } = await dbCall(deps, runWindow(deps), (signal) => deps.db.rpc("claim_client_edition_requests", args, signal));
  if (!error) return ((data ?? []) as EditionRequest[])[0] ?? null;
  if (first) throw new Error(`claim failed: ${error.message}`);
  console.error(`client-edition-compose: claim: ${shortenError(error.message)}`);
  return null;
}

function tally(summary: BatchSummary, outcome: RequestOutcome): void {
  summary.claimed += 1;
  summary[outcome.result] += 1;
  summary.cost_usd = Number((summary.cost_usd + outcome.usd).toFixed(6));
  summary.outcomes.push({ request_id: outcome.requestId, edition_id: outcome.editionId, result: outcome.result, reason: outcome.reason });
}

/** Claims and composes requests one by one while a whole edition still fits in the run's budget. */
export async function runBatch(deps: ComposeDeps): Promise<BatchSummary> {
  const summary: BatchSummary = { claimed: 0, composed: 0, skipped: 0, failed: 0, unsettled: 0, cost_usd: 0, outcomes: [] };
  while (deps.deadline - deps.now() >= EDITION_MIN_MS) {
    const request = await claimOne(deps, summary.claimed === 0);
    if (!request) break;
    tally(summary, await composeRequest(request, deps));
  }
  return summary;
}

/** finish_client_edition_compose_run's status and error for a run. */
export function runStatus(summary: BatchSummary): { status: "succeeded" | "failed" | "skipped"; error: string | null } {
  if (summary.claimed === 0) return { status: "skipped", error: null };
  if (summary.failed + summary.unsettled === summary.claimed) {
    return { status: "failed", error: `all ${summary.claimed} editions failed or were left unsettled` };
  }
  return { status: "succeeded", error: null };
}
