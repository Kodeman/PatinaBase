// What a model answer must hold before any of it reaches an edition. A refusal,
// a truncated answer, a wrong shape, an over-long string, a box or focal point
// that does not describe a picture, an unknown flag, or any string naming the
// machinery behind the page is rejected.

export interface ModelAnswer {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}

export type Checked<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; /** The banned words, when that is the fault. */ term?: string };

export const LIMITS = { alt: 125, why: 140, headline: 60, standing: 160, notice: 200 } as const;
export const FLAGS: ReadonlySet<unknown> = new Set(["watermark", "people", "text_overlay"]);
/** A subject box covers at least 5% of the frame. */
export const MIN_BOX_AREA = 0.05;
const EDGE = 1 + 1e-9;

// "AI" (also "A.I."), the words a homeowner must never read on her page, and
// model or vendor names. Bare "Opus" or "Haiku" can name a piece of furniture,
// so those count only with a version number.
const BANNED: readonly RegExp[] = [
  /(?<![A-Za-z])A(?:\.I\.|I)(?![A-Za-z])/,
  /\bartificial\s+intelligence\b/i,
  /\bgenerated\b/i,
  /\bimage of\b/i,
  /\b(?:claude|anthropic|chatgpt|openai|gpt-?\d[\w.]*|gemini)\b/i,
  /\b(?:sonnet|haiku|opus|fable|mythos)[\s-]*\d/i,
];

type Fields = Record<string, unknown>;
type Check<C> = (entry: Fields, context: C) => string | null;

function fail<T>(reason: string, term?: string): Checked<T> {
  return term === undefined ? { ok: false, reason } : { ok: false, reason, term };
}

export function isPlainObject(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first check an object fails, in order. */
function firstFault<C>(entry: unknown, context: C, checks: readonly Check<C>[]): string | null {
  if (!isPlainObject(entry)) return "entry is not an object";
  for (const check of checks) {
    const fault = check(entry, context);
    if (fault) return fault;
  }
  return null;
}

function listOf(value: unknown, min: number, max: number): value is unknown[] {
  return Array.isArray(value) && value.length >= min && value.length <= max;
}

function repeatFault(values: unknown[], message: string): string | null {
  return new Set(values).size === values.length ? null : message;
}

/** The first banned words in a string, or null. */
export function bannedIn(text: string): string | null {
  for (const pattern of BANNED) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

function childrenOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return isPlainObject(value) ? Object.values(value) : [];
}

/** The first banned words in any string inside `value`, or null. */
export function findBanned(value: unknown): string | null {
  if (typeof value === "string") return bannedIn(value);
  for (const child of childrenOf(value)) {
    const term = findBanned(child);
    if (term) return term;
  }
  return null;
}

function stopFault(answer: ModelAnswer): string | null {
  if (answer.stop_reason === "refusal") return "refusal";
  return answer.stop_reason === "max_tokens" ? "truncated" : null;
}

function answerText(answer: ModelAnswer): string {
  return answer.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
}

/** The text from the first "{" to the last "}", or null. */
function objectText(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start < 0 || end <= start ? null : text.slice(start, end + 1);
}

// Text that starts at "{" and parses is an object.
function parseObject(text: string): Fields | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The answer's JSON object: refusal and max_tokens truncation are rejected
 * first (as aesthete-dna-draft's parser does), then the text between the first
 * "{" and the last "}" must parse, with no banned words anywhere in it.
 */
export function readAnswer(answer: ModelAnswer): Checked<Fields> {
  const stop = stopFault(answer);
  if (stop) return fail(stop);
  const text = objectText(answerText(answer));
  if (text === null) return fail("no JSON object");
  const parsed = parseObject(text);
  if (!parsed) return fail("unparseable JSON");
  const term = findBanned(parsed);
  return term ? fail("banned words", term) : { ok: true, value: parsed };
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function indexIn(value: unknown, count: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < count;
}

function finiteNumbers(value: unknown, length: number): value is number[] {
  return listOf(value, length, length) && value.every(Number.isFinite);
}

export type Box = [number, number, number, number];
export type Point = [number, number];

function insideFrame([x, y, w, h]: number[]): boolean {
  return Math.min(x, y) >= 0 && Math.min(w, h) > 0 && x + w <= EDGE && y + h <= EDGE;
}

/** [x, y, w, h], 0–1 of the frame, inside it, and at least 5% of it. */
export function boxFault(box: unknown): string | null {
  if (!finiteNumbers(box, 4)) return "subject_box is not four numbers";
  if (!insideFrame(box)) return "subject_box is outside the frame";
  return box[2] * box[3] < MIN_BOX_AREA ? "subject_box is under 5% of the frame" : null;
}

function within(value: number, start: number, size: number): boolean {
  return value >= start && value <= start + size;
}

/** [x, y] inside the subject box. */
export function focalFault(focal: unknown, box: Box): string | null {
  if (!finiteNumbers(focal, 2)) return "focal is not two numbers";
  return within(focal[0], box[0], box[2]) && within(focal[1], box[1], box[3]) ? null : "focal is outside the subject box";
}

function flagsKnown(flags: unknown): boolean {
  return Array.isArray(flags) && flags.every((flag) => FLAGS.has(flag));
}

const PERCEPTION_CHECKS: readonly Check<number>[] = [
  (entry, count) => (indexIn(entry.index, count) ? null : "image index is out of range"),
  (entry) => boxFault(entry.subject_box),
  (entry) => focalFault(entry.focal, entry.subject_box as Box),
  (entry) => (flagsKnown(entry.flags) ? null : "unknown flag"),
  (entry) => (boundedText(entry.alt, LIMITS.alt) ? null : `alt is empty or over ${LIMITS.alt} characters`),
];

export interface Perception {
  index: number;
  subjectBox: Box;
  focal: Point;
  flags: string[];
  alt: string;
}

function toPerception(entry: Fields): Perception {
  return {
    index: entry.index as number,
    subjectBox: entry.subject_box as Box,
    focal: entry.focal as Point,
    flags: [...new Set(entry.flags as string[])],
    alt: (entry.alt as string).trim(),
  };
}

/** Call A1: {images:[{index, subject_box[4], focal[2], flags[], alt}]} for `count` pictures. */
export function validatePerception(answer: ModelAnswer, count: number): Checked<Perception[]> {
  const read = readAnswer(answer);
  if (!read.ok) return read;
  const images = read.value.images;
  if (!listOf(images, 1, count)) return fail("images is not a list");
  const fault = images.map((entry) => firstFault(entry, count, PERCEPTION_CHECKS)).find(Boolean) ??
    repeatFault(images.map((entry) => (entry as Fields).index), "image index repeats");
  return fault ? fail(fault) : { ok: true, value: (images as Fields[]).map(toPerception) };
}

export interface HeroAnswer {
  index: number;
  why: string;
  held: number[];
}

const HERO_CHECKS: readonly Check<number>[] = [
  (hero, count) => (indexIn(hero.index, count) ? null : "hero index is outside the candidates"),
  (hero) => (boundedText(hero.why, LIMITS.why) ? null : `why is empty or over ${LIMITS.why} characters`),
];

function heldFault(held: unknown, hero: unknown, count: number): string | null {
  if (held === undefined) return null;
  if (!listOf(held, 0, 2)) return "held is not a list of at most two";
  if (!held.every((index) => indexIn(index, count))) return "held index is outside the candidates";
  return repeatFault([hero, ...held], "held repeats an index");
}

function heroFault(value: Fields, count: number): string | null {
  const hero = value.hero;
  if (!isPlainObject(hero)) return "hero is missing";
  return firstFault(hero, count, HERO_CHECKS) ?? heldFault(value.held, hero.index, count);
}

/** Call A2: {hero:{index, why≤140}, held:[≤2]}; every index must name one of `count` candidates. */
export function validateHero(answer: ModelAnswer, count: number): Checked<HeroAnswer> {
  const read = readAnswer(answer);
  if (!read.ok) return read;
  const fault = heroFault(read.value, count);
  if (fault) return fail(fault);
  const hero = read.value.hero as Fields;
  const held = (read.value.held as number[] | undefined) ?? [];
  return { ok: true, value: { index: hero.index as number, why: (hero.why as string).trim(), held } };
}

export interface ChapterWords {
  key: string;
  headline: string;
  standing: string;
}

export interface Words {
  chapters: ChapterWords[];
  doorstep: { standing: string };
  notice: string;
}

const CHAPTER_CHECKS: readonly Check<ReadonlySet<unknown>>[] = [
  (entry, keys) => (keys.has(entry.key) ? null : "unknown chapter key"),
  (entry) => (boundedText(entry.headline, LIMITS.headline) ? null : `headline is empty or over ${LIMITS.headline} characters`),
  (entry) => (boundedText(entry.standing, LIMITS.standing) ? null : `standing is empty or over ${LIMITS.standing} characters`),
];

function chaptersFault(chapters: unknown, keys: readonly string[]): string | null {
  const wanted = new Set<unknown>(keys);
  if (!listOf(chapters, wanted.size, wanted.size)) return "chapters do not match the keys asked for";
  return chapters.map((entry) => firstFault(entry, wanted, CHAPTER_CHECKS)).find(Boolean) ??
    repeatFault(chapters.map((entry) => (entry as Fields).key), "a chapter key repeats");
}

function doorstepFault(doorstep: unknown): string | null {
  const ok = isPlainObject(doorstep) && boundedText(doorstep.standing, LIMITS.standing);
  return ok ? null : `doorstep standing is empty or over ${LIMITS.standing} characters`;
}

const WORDS_CHECKS: readonly Check<readonly string[]>[] = [
  (value, keys) => chaptersFault(value.chapters, keys),
  (value) => doorstepFault(value.doorstep),
  (value) => (boundedText(value.notice, LIMITS.notice) ? null : `notice is empty or over ${LIMITS.notice} characters`),
];

function trimWords(value: Fields, keys: readonly string[]): Words {
  const byKey = new Map((value.chapters as ChapterWords[]).map((entry) => [entry.key, entry]));
  return {
    chapters: keys.map((key) => ({
      key,
      headline: byKey.get(key)!.headline.trim(),
      standing: byKey.get(key)!.standing.trim(),
    })),
    doorstep: { standing: (value.doorstep as { standing: string }).standing.trim() },
    notice: (value.notice as string).trim(),
  };
}

/** Call B: {chapters:[{key, headline≤60, standing≤160}], doorstep:{standing≤160}, notice≤200}. */
export function validateWords(answer: ModelAnswer, keys: readonly string[]): Checked<Words> {
  const read = readAnswer(answer);
  if (!read.ok) return read;
  const fault = firstFault(read.value, keys, WORDS_CHECKS);
  return fault ? fail(fault) : { ok: true, value: trimWords(read.value, keys) };
}

function judgedTerm(term: unknown): string {
  return typeof term === "string" && term.trim() ? term.trim().slice(0, 60) : "the flagged wording";
}

/** Call C's judge: {ok:boolean, term:string|null}; only ok:false is a finding. */
export function readJudgement(answer: ModelAnswer): string | null {
  const text = stopFault(answer) ? null : objectText(answerText(answer));
  const parsed = text === null ? null : parseObject(text);
  return parsed?.ok === false ? judgedTerm(parsed.term) : null;
}
