// Requests for Calls A1 (perception), A2 (hero pick), B (words) and C (the
// judge). Each copies buildDraftRequest's shape: one cached system block holding
// the voice rules, the lexicon, the caption form and the answer's schema. The
// only project facts any request carries are the allowlisted ones below; an
// image travels as the bytes of its plate's stored full-frame rendition
// (renditions.ts), labelled from the allowlist: never an address, a file name
// or a storage path.

import { ERROR_RULES, WARNING_RULES } from "./lint.ts";
import { LIMITS } from "./validate.ts";

export const PROMPT_VERSION = "e1";
export const FEATURE = "client-edition-compose";
export const A1_BATCH = 8;
export const A2_CANDIDATES = 6;

/** The parts of the editorial facts this function reads. Anything else in the envelope is ignored. */
export interface FactsItem {
  id: string;
  nameAsSigned: string;
  category?: string | null;
  status?: string | null;
  makerName?: string | null;
  madeIn?: string | null;
  material?: string | null;
  finish?: string | null;
  dimensions?: string | null;
  descriptionAsSigned?: string | null;
  assetIds?: readonly string[];
}

export interface FactsRoom {
  id: string;
  name: string;
  anchor: string;
  conceptAssetId?: string | null;
  scanAssetIds?: readonly string[];
  items: FactsItem[];
}

export interface FactsAsset {
  id: string;
  sha256: string;
  sourceKind: string;
  width: number;
  height: number;
  ground?: string | null;
  focal?: readonly number[] | null;
  subjectBox?: readonly number[] | null;
  alt?: string | null;
  caption?: { what?: string | null; whose?: string | null; when?: string | null } | null;
  /** The stored renditions per crop (client_plate_assets.crops); `piece` is the whole frame. */
  crops?: Record<string, { widths?: readonly number[] } | null> | null;
  perceivedPromptVersion?: string | null;
  focalOrigin?: string | null;
  /** The alt text an earlier perception wrote (record_plate_perception), or null. */
  perceivedAlt?: string | null;
  /** Watermark, people or text_overlay, as an earlier perception saw them. */
  perceivedFlags?: readonly string[] | null;
}

export interface EditorialFacts {
  project: {
    id: string;
    name: string;
    phase: string | null;
    targetDate?: string | null;
    showMakers?: boolean;
    studio?: { id?: string | null } | null;
  };
  rooms: FactsRoom[];
  assets: FactsAsset[];
  palette?: { name?: string | null }[];
}

export interface AllowedItem {
  nameAsSigned: string;
  category: string | null;
  status: string | null;
  makerName?: string | null;
  madeIn?: string | null;
  material: string | null;
  finish: string | null;
  dimensions: string | null;
  descriptionAsSigned: string | null;
}

export interface AllowedFacts {
  project: { phase: string | null; targetDate: string | null };
  rooms: { name: string; items: AllowedItem[] }[];
  palette: { name: string | null }[];
}

function orNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

function allowedItem(item: FactsItem, showMakers: boolean): AllowedItem {
  return {
    nameAsSigned: item.nameAsSigned,
    category: orNull(item.category),
    status: orNull(item.status),
    ...(showMakers ? { makerName: orNull(item.makerName), madeIn: orNull(item.madeIn) } : {}),
    material: orNull(item.material),
    finish: orNull(item.finish),
    dimensions: orNull(item.dimensions),
    descriptionAsSigned: orNull(item.descriptionAsSigned),
  };
}

/**
 * The allowlist: the project's phase and target date; room names; each item's
 * signed name, category, status, material, finish, dimensions and signed
 * description, plus maker and origin only when the studio shows makers; palette
 * names. Never the project's name (it can be a household's name), sheet titles,
 * board names, or the studio's name and town. Nothing else in the facts reaches
 * a model or the source hash.
 */
export function allowedFacts(facts: EditorialFacts): AllowedFacts {
  const showMakers = facts.project.showMakers === true;
  return {
    project: { phase: orNull(facts.project.phase), targetDate: orNull(facts.project.targetDate) },
    rooms: facts.rooms.map((room) => ({ name: room.name, items: room.items.map((item) => allowedItem(item, showMakers)) })),
    palette: (facts.palette ?? []).map((swatch) => ({ name: orNull(swatch.name) })),
  };
}

function itemLabel(item: FactsItem, room: FactsRoom): string {
  const detail = [item.category, item.material, item.finish].filter(Boolean).join(", ");
  return `${item.nameAsSigned}${detail ? ` (${detail})` : ""}, ${room.name}`;
}

function roomLabel(room: FactsRoom, assetId: string): string | null {
  const item = room.items.find((entry) => entry.assetIds?.includes(assetId));
  if (item) return itemLabel(item, room);
  if (room.conceptAssetId === assetId) return `${room.name}, as drawn`;
  return room.scanAssetIds?.includes(assetId) ? `${room.name}, as measured` : null;
}

/** What a picture shows, from allowlisted fields only: the piece it belongs to, or its room. */
export function assetLabel(facts: EditorialFacts, assetId: string): string {
  for (const room of facts.rooms) {
    const label = roomLabel(room, assetId);
    if (label) return label;
  }
  return "a picture from the project";
}

const VOICE = `You work inside an interior design studio's practice. The studio is writing its client's project page: one homeowner, one house, one agreed direction. Write the way the studio speaks to that client.
- Plain, warm, exact. Short declarative sentences. Present tense.
- Name real things only: pieces, rooms, materials, finishes and places that appear in the facts you are given. Never invent a piece, a date, a maker, a price or a promise.
- No counts, fractions or percentages in a sentence ("three of five", "60%"). No money. No dates beyond the target date given.
- No exclamation marks, no emoji, no superlatives, no sales language.
- Never describe how the page is made. Never mention software, models, automation, "AI", or that anything was generated.
- The studio is the author. Do not address the reader as a customer or audience.`;

function lexiconText(): string {
  const avoid = [...new Set([...ERROR_RULES, ...WARNING_RULES].map((rule) => rule.rule))]
    .filter((rule) => !["emoji", "exclamations", "spelled-quantity", "tagline", "audience"].includes(rule));
  return `Lexicon. Never use these words or their forms: ${avoid.join(", ")}. Never write a spelled-out quantity of time ("two weeks"), the phrase "time adds value", or a phrase aimed at homeowners or makers as an audience.`;
}

const CAPTION_FORM = `Caption form. A caption on this page is code-written: what (the piece's signed name), whose (the maker or the studio), when (the date of the photograph). You never write captions and never invent provenance.`;

function systemBlock(task: string, schema: string): Record<string, unknown>[] {
  const text = [VOICE, lexiconText(), CAPTION_FORM, task, `Answer with one JSON object and nothing else:\n${schema}`].join("\n\n");
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

export interface ImageInput {
  /** Base64 WebP bytes of the plate's full-frame rendition. */
  data: string;
  label: string;
}

function imageBlocks(images: readonly ImageInput[]): Record<string, unknown>[] {
  return images.flatMap((image, index) => [
    { type: "text", text: `Picture ${index}: ${image.label}` },
    { type: "image", source: { type: "base64", media_type: "image/webp", data: image.data } },
  ]);
}

const PERCEIVE_TASK = `Task: look at each numbered picture and describe where its subject sits so the page can crop it without cutting the subject off.
- subject_box: [x, y, w, h], fractions 0–1 of the picture's width and height, the tightest box holding the subject (the piece, or the room's main view). It covers at least 5% of the picture.
- focal: [x, y], fractions 0–1, the point the eye should land on; inside subject_box.
- flags: any of "watermark", "people", "text_overlay" that the picture shows; otherwise an empty list.
- alt: one plain sentence of at most ${LIMITS.alt} characters saying what the picture shows, for a reader who cannot see it. Start with the subject, not with "Picture" or "Photo".`;

const PERCEIVE_SCHEMA = `{"images":[{"index":0,"subject_box":[0.1,0.2,0.6,0.7],"focal":[0.4,0.5],"flags":[],"alt":"…"}]}`;

/** Call A1: up to eight pictures, each its whole frame. */
export function buildPerceptionRequest(images: readonly ImageInput[]): Record<string, unknown> {
  return {
    max_tokens: 16_000,
    system: systemBlock(PERCEIVE_TASK, PERCEIVE_SCHEMA),
    messages: [{
      role: "user",
      content: [...imageBlocks(images), { type: "text", text: `Describe all ${images.length} pictures.` }],
    }],
  };
}

const HERO_TASK = `Task: choose the picture that opens the client's page. It runs full width above everything else, so it should show the house or its pieces at their most legible and calm. Every candidate already meets the size and crop floors; choose on what the picture shows.
- hero.index: the opening picture. hero.why: one sentence of at most ${LIMITS.why} characters, for the studio, saying why.
- held: up to two other candidates worth holding for a later chapter, best first; an empty list is fine.`;

const HERO_SCHEMA = `{"hero":{"index":0,"why":"…"},"held":[2]}`;

/** Call A2: the candidates (≤6, in rank order) and the allowlisted facts. */
export function buildHeroRequest(images: readonly ImageInput[], facts: AllowedFacts): Record<string, unknown> {
  return {
    max_tokens: 8_000,
    system: systemBlock(HERO_TASK, HERO_SCHEMA),
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `Project facts:\n${JSON.stringify(facts)}` },
        ...imageBlocks(images),
        { type: "text", text: `Choose among pictures 0 to ${images.length - 1}.` },
      ],
    }],
  };
}

export interface WordsChapter {
  key: string;
  about: string;
}

export interface WordsInput {
  facts: AllowedFacts;
  chapters: readonly WordsChapter[];
  /**
   * The page as the homeowner reads it now (the approved words with the
   * designer's corrections applied): keep any line that is still true, word for
   * word. Null when the studio no longer shows makers, since older words may
   * name one.
   */
  current: unknown | null;
  opening: { now: string; before: string | null };
  /** The term a first draft used that the lexicon forbids. */
  avoid?: string;
}

const WORDS_TASK = `Task: write the page's chapter headlines and standing sentences.
- For each chapter key asked for: a headline of at most ${LIMITS.headline} characters and one standing sentence of at most ${LIMITS.standing} characters saying where that part of the job stands today.
- doorstep.standing: one sentence of at most ${LIMITS.standing} characters for the top of the page, where things stand overall.
- notice: one sentence of at most ${LIMITS.notice} characters telling the client what changed since the page they last saw, in the studio's voice, for example "The page now opens on the walnut dining table; everything else is where it was." If only pictures inside chapters changed, say so plainly.
- When the current page is given, keep every headline and sentence that is still true exactly as it is, and the notice too when nothing it describes has changed.`;

const WORDS_SCHEMA = `{"chapters":[{"key":"cover","headline":"…","standing":"…"}],"doorstep":{"standing":"…"},"notice":"…"}`;

/** Call B: allowlisted facts in, words out. */
export function buildWordsRequest(input: WordsInput): Record<string, unknown> {
  const body = {
    facts: input.facts,
    chapters: input.chapters,
    current: input.current,
    opening: input.opening,
  };
  const retry = input.avoid
    ? `\n\nAn earlier draft used "${input.avoid}", which the studio never writes. Write it again without that wording.`
    : "";
  return {
    max_tokens: 16_000,
    system: systemBlock(WORDS_TASK, WORDS_SCHEMA),
    messages: [{ role: "user", content: [{ type: "text", text: `${JSON.stringify(body)}${retry}` }] }],
  };
}

const JUDGE_TASK = `Task: you check a draft against the voice rules and lexicon above. Report the first word or phrase that breaks a rule. Read meaning, not just spelling: a synonym or a disguised spelling of a forbidden word breaks the rule too.`;

const JUDGE_SCHEMA = `{"ok":true,"term":null} or {"ok":false,"term":"the words that break a rule"}`;

/** Call C's judge, on the words only. */
export function buildJudgeRequest(words: unknown): Record<string, unknown> {
  return {
    max_tokens: 2_000,
    system: systemBlock(JUDGE_TASK, JUDGE_SCHEMA),
    messages: [{ role: "user", content: [{ type: "text", text: JSON.stringify(words) }] }],
  };
}
