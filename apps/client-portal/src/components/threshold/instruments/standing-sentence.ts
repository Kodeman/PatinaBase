/* ── The standing sentence ──────────────────────────────────────────────────
   The ruling took D's standing sentence, and its voice, for The Making's state
   line. This module is that voice, and nothing else: facts in, one plain-spoken
   sentence out. It is pure on purpose — no React, no hooks, no clock of its own
   (the caller passes today already in words), so the wording is testable
   without rendering anything and cannot drift between the masthead and the gate
   captions that borrow its cardinality rules.

   The rules the voice keeps:

   · Present tense, second person, warm and specific. "Your walnut credenza is
     in production", never "1 item · status: production".
   · A count is a word up to twelve — "two papers wait for your name" — because
     that is how a person says it out loud. Past twelve, figures.
   · Nothing is ever reported as zero. A cardinality that has nothing to say
     says nothing; if every clause is silent, the sentence says so in plain
     words rather than printing an empty state.
   · Money is figures, whole dollars, the way the deck prints it: $9,125.
   · Two clauses join with ", and"; three or more take the serial comma. Both
     forms come straight off the deck's own sentences.

   The sub-line lives here too. It is the same cardinality problem in mono, and
   keeping it beside the sentence is what stops the two from ever disagreeing
   about how many papers wait. ────────────────────────────────────────────── */

/** What the calendar says comes next, when the schedule knows. */
export interface StandingMilestone {
  /** The phase's own name, e.g. "Installation". */
  title: string;
  /** When it lands, already in words: "the week of October 12". */
  whenLabel?: string | null;
}

/**
 * Every fact the standing sentence is made of.
 *
 * The three piece lists carry *names*, and their length is the count — one
 * named piece gets named, several get counted. A list whose names are blank
 * still counts correctly and falls back to "one piece" / "three pieces", so a
 * caller that has the tally but not the nouns loses nothing but the noun.
 */
export interface StandingSentenceInput {
  /** Today, already in words: "the fifth of August". See `todayInWords`. */
  todayLabel: string;
  /**
   * Papers sent and unsigned. These are the only gates that are literally a
   * paper waiting for a name.
   */
  signatureCount: number;
  /**
   * Trade scopes called substantially complete and waiting to be accepted.
   * Counted apart from the papers on purpose: acceptance is an inline act with
   * no document behind it, so a client whose only outstanding item is one of
   * these must not be told a paper waits.
   */
  acceptanceCount: number;
  /** Names of the pieces being made right now. */
  inProduction: string[];
  /** Names of the pieces in transit. */
  shipped: string[];
  /** Names of the pieces that have arrived. */
  delivered: string[];
  /** Open balance across unsettled invoices, in cents. Zero when nothing is owed. */
  openBalanceCents: number;
  /** The next thing on the calendar, when there is one. */
  nextMilestone?: StandingMilestone | null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Index is the day of the month; 0 is unused so the day reads straight in. */
const DAY_ORDINALS = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
  'twenty-first',
  'twenty-second',
  'twenty-third',
  'twenty-fourth',
  'twenty-fifth',
  'twenty-sixth',
  'twenty-seventh',
  'twenty-eighth',
  'twenty-ninth',
  'thirtieth',
  'thirty-first',
] as const;

const COUNT_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;

/**
 * A small count as a person says it. Past twelve the word stops helping and
 * becomes a puzzle, so figures take over.
 */
export function countInWords(count: number): string {
  if (!Number.isFinite(count)) return '0';
  const whole = Math.max(0, Math.trunc(count));
  return COUNT_WORDS[whole] ?? String(whole);
}

const TEEN_WORDS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;

const TENS_WORDS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const;

/**
 * A whole number spelled all the way out — no figure fallback.
 *
 * `countInWords` hands over to figures past twelve, which is right for a
 * standing sentence that has to stay scannable. It is wrong INSIDE one clause:
 * "the schedule moves out by 14 days, and the lead time shortens by four days"
 * writes the same quantity in two registers in one breath, which reads as two
 * voices. So the weighing sentence spells throughout, and this is the speller
 * it uses.
 *
 * Past nine hundred and ninety-nine the words stop being a sentence and become
 * a paragraph; a lead time that long is a fact, not a phrase, so the figure is
 * honest there and this returns one.
 */
export function wholeNumberInWords(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const whole = Math.abs(Math.trunc(value));
  if (whole < 10) return COUNT_WORDS[whole];
  if (whole < 20) return TEEN_WORDS[whole - 10];
  if (whole < 100) {
    const tens = TENS_WORDS[Math.floor(whole / 10)];
    const units = whole % 10;
    return units === 0 ? tens : `${tens}-${COUNT_WORDS[units]}`;
  }
  if (whole < 1000) {
    const hundreds = `${COUNT_WORDS[Math.floor(whole / 100)]} hundred`;
    const rest = whole % 100;
    return rest === 0 ? hundreds : `${hundreds} and ${wholeNumberInWords(rest)}`;
  }
  return String(whole);
}

/**
 * Money the way the deck prints it — whole dollars, grouped, no cents.
 * $912,500 of cents reads "$9,125".
 */
export function moneyInWords(cents: number, currency = 'USD'): string {
  const dollars = Number.isFinite(cents) ? cents / 100 : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Today, in the sentence's own words: "the fifth of August".
 *
 * Reads the date's *local* parts deliberately — the client's today is the one
 * on their wall, not the server's. That is exactly why the surface holds this
 * sentence back until hydration.
 */
export function todayInWords(date: Date): string {
  const day = date.getDate();
  const ordinal = DAY_ORDINALS[day] ?? String(day);
  return `the ${ordinal} of ${MONTHS[date.getMonth()]}`;
}

/** "August 2026" — the masthead's vitals line closes on this. */
export function monthAndYear(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Joins clauses the way the deck's sentences do: two take ", and", three or
 * more take the serial comma.
 */
export function joinClauses(clauses: readonly string[]): string {
  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0];
  if (clauses.length === 2) return `${clauses[0]}, and ${clauses[1]}`;
  const head = clauses.slice(0, -1).join(', ');
  return `${head}, and ${clauses[clauses.length - 1]}`;
}

interface PieceVoice {
  /** One piece, and we know its name. */
  named: (name: string) => string;
  /** One piece, name unknown. */
  single: string;
  /** Several pieces, counted. */
  plural: (count: string) => string;
}

const IN_PRODUCTION: PieceVoice = {
  named: (name) => `your ${name} is in production`,
  single: 'one piece is in production',
  plural: (count) => `${count} pieces are in production`,
};

const SHIPPED: PieceVoice = {
  named: (name) => `your ${name} is on its way`,
  single: 'one piece is on its way',
  plural: (count) => `${count} pieces are on their way`,
};

const DELIVERED: PieceVoice = {
  named: (name) => `your ${name} has arrived`,
  single: 'one piece has arrived',
  plural: (count) => `${count} pieces have arrived`,
};

function asList(value: string[] | undefined | null): string[] {
  return Array.isArray(value) ? value : [];
}

function piecesClause(names: string[] | undefined | null, voice: PieceVoice): string | null {
  const pieces = asList(names);
  if (pieces.length === 0) return null;
  if (pieces.length === 1) {
    const name = pieces[0]?.trim();
    return name ? voice.named(name) : voice.single;
  }
  return voice.plural(countInWords(pieces.length));
}

/** A count the caller may not have handed in at all, floored at zero. */
function tally(value: number | undefined | null): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : 0;
}

function papersClause(signatureCount: number): string | null {
  const papers = tally(signatureCount);
  if (papers <= 0) return null;
  if (papers === 1) return 'one paper waits for your name';
  return `${countInWords(papers)} papers wait for your name`;
}

/**
 * Finished work is accepted, not signed — there is no paper. "Finished work"
 * is a mass noun, so one scope needs no count at all; several take the same
 * kind label the gate itself carries.
 */
function acceptanceClause(acceptanceCount: number): string | null {
  const scopes = tally(acceptanceCount);
  if (scopes <= 0) return null;
  if (scopes === 1) return 'finished work waits for your acceptance';
  return `${countInWords(scopes)} scopes of finished work wait for your acceptance`;
}

function balanceClause(openBalanceCents: number): string | null {
  if (!Number.isFinite(openBalanceCents) || openBalanceCents <= 0) return null;
  return `a balance of ${moneyInWords(openBalanceCents)} stands open`;
}

function capitalize(text: string): string {
  if (text.length === 0) return text;
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

/**
 * The standing sentence: today, where the house stands, and what comes next.
 *
 * Composed as up to three sentences —
 *
 *   "It is the fifth of August. Your credenza is in production, and two papers
 *    wait for your name. Installation comes next, the week of October 12."
 *
 * — with the middle one assembled from whichever clauses have something true
 * to say, in the order the ruling asks for: the goods first, then the ask, then
 * the money. When nothing at all is moving, the middle sentence says so plainly
 * rather than leaving a hole.
 */
export function standingSentence(input: StandingSentenceInput): string {
  const sentences: string[] = [];

  const today = input.todayLabel?.trim();
  if (today) sentences.push(`It is ${today}.`);

  const clauses = [
    piecesClause(input.inProduction, IN_PRODUCTION),
    piecesClause(input.shipped, SHIPPED),
    piecesClause(input.delivered, DELIVERED),
    papersClause(input.signatureCount),
    acceptanceClause(input.acceptanceCount),
    balanceClause(input.openBalanceCents),
  ].filter((clause): clause is string => clause !== null);

  sentences.push(
    clauses.length > 0
      ? `${capitalize(joinClauses(clauses))}.`
      : 'Nothing waits on you today.',
  );

  const title = input.nextMilestone?.title?.trim();
  if (title) {
    const when = input.nextMilestone?.whenLabel?.trim();
    sentences.push(
      when ? `${capitalize(title)} comes next, ${when}.` : `${capitalize(title)} comes next.`,
    );
  }

  return sentences.join(' ');
}

/**
 * The mono counts beneath the sentence — what waits on the client's hand, and
 * what stands open. Figures here, not words: this line is the ledger's voice,
 * and the sentence above it has already said the warm version.
 *
 * The count keeps its noun, the way the deck's own meta line does
 * (`2 unanswered · balance of $9,125 open`) — a bare figure is a dashboard
 * tell. Papers and acceptances are summed here: this line is the tally, and
 * "unanswered" is true of both.
 *
 * Returns an EMPTY array when nothing is outstanding. The sentence above has
 * already said "Nothing waits on you today"; saying it again in mono is the
 * same negation twice in two typefaces, which reads as a stutter rather than
 * as calm. The masthead drops the paragraph entirely.
 */
export function standingSubline(input: StandingSentenceInput): string[] {
  const segments: string[] = [];

  const unanswered = tally(input.signatureCount) + tally(input.acceptanceCount);
  if (unanswered > 0) segments.push(`${unanswered} unanswered`);

  if (Number.isFinite(input.openBalanceCents) && input.openBalanceCents > 0) {
    segments.push(`balance of ${moneyInWords(input.openBalanceCents)} open`);
  }

  return segments;
}

/* ── The weighing ────────────────────────────────────────────────────────────
   What an edition costs her, in the same voice as the sentence above: one
   spoken line, then a mono ledger of the figures underneath.

   The three deltas are INDEPENDENT and stand side by side (R11) — they are
   never summed into one number, because cost, schedule and lead time are not
   the same quantity and a total of them is not a fact. A delta of zero is
   still stated, in words, whenever any of the three moved: silence about the
   schedule reads as "we didn't check", and she is agreeing to all three.

   A baseline turns a delta into a fact: "$46,880 becomes $48,120" says what
   the figure IS, where "+$1,200" only says what it moved by. So the baseline
   is spoken whenever the edition carries one, and the delta alone is the
   fallback, never the preference.

   Neither the sentence nor the ledger carries a pigment: a rise is not
   terracotta and a saving is not sage, on a page where an outcome is the only
   thing allowed to be a colour.
   ────────────────────────────────────────────────────────────────────────── */

export interface ApprovalWeighingInput {
  costCentsDelta: number;
  scheduleDaysDelta: number;
  leadTimeDaysDelta: number;
  /** What the cost stood at before this edition, when the row carries it. */
  costBaselineCents?: number | null;
  currency?: string;
}

export interface ApprovalWeighing {
  /** The spoken line. Never empty. */
  sentence: string;
  /** The figures beneath it, in mono. EMPTY when nothing moved. */
  ledger: string;
}

/** The sentence the surface has printed since the edition first carried none. */
const NOTHING_MOVED = 'No cost, schedule or lead-time change.';

/** A delta the composer can trust: a real number, rounded to a whole unit. */
function delta(value: number | undefined | null): number {
  return Number.isFinite(value) ? Math.trunc(value as number) : 0;
}

/**
 * `W2-n1`. One register, all the way through the clause: this used to hand
 * over to `countInWords`, which prints figures past twelve, so a thirteen-day
 * slip and a four-day pull stood in the same sentence as "13 days" and "four
 * days".
 */
function daysInWords(days: number): string {
  const whole = Math.abs(days);
  return `${wholeNumberInWords(whole)} ${whole === 1 ? 'day' : 'days'}`;
}

function costClause(
  cents: number,
  baseline: number | null,
  currency: string,
): string {
  if (baseline !== null) {
    return `${moneyInWords(baseline, currency)} becomes ${moneyInWords(
      baseline + cents,
      currency,
    )}`;
  }
  if (cents === 0) return 'the cost does not change';
  return cents > 0
    ? `the cost rises by ${moneyInWords(cents, currency)}`
    : `the cost falls by ${moneyInWords(Math.abs(cents), currency)}`;
}

function scheduleClause(days: number): string {
  if (days === 0) return 'the schedule does not change';
  return days > 0
    ? `the schedule moves out by ${daysInWords(days)}`
    : `the schedule pulls in by ${daysInWords(days)}`;
}

function leadTimeClause(days: number): string {
  if (days === 0) return 'the lead time does not change';
  return days > 0
    ? `the lead time grows by ${daysInWords(days)}`
    : `the lead time shortens by ${daysInWords(days)}`;
}

/** Figures, with the sign the ledger prints and the minus a typesetter uses. */
function signedMoney(cents: number, currency: string): string {
  if (cents === 0) return moneyInWords(0, currency);
  return `${cents > 0 ? '+' : '−'}${moneyInWords(Math.abs(cents), currency)}`;
}

function signedDays(days: number): string {
  const whole = Math.abs(days);
  const noun = whole === 1 ? 'day' : 'days';
  if (days === 0) return `0 ${noun}`;
  return `${days > 0 ? '+' : '−'}${whole} ${noun}`;
}

/**
 * One edition's weight: the spoken line, and the figures under it.
 *
 *   "$46,880 becomes $48,120, the schedule does not change, and the lead time
 *    shortens by four days."
 *   "Cost +$1,240 · Schedule 0 days · Lead time −4 days"
 */
export function approvalWeighing(input: ApprovalWeighingInput): ApprovalWeighing {
  const currency = input.currency ?? 'USD';
  const cost = delta(input.costCentsDelta);
  const schedule = delta(input.scheduleDaysDelta);
  const leadTime = delta(input.leadTimeDaysDelta);
  const baseline =
    typeof input.costBaselineCents === 'number' && Number.isFinite(input.costBaselineCents)
      ? Math.trunc(input.costBaselineCents)
      : null;

  if (cost === 0 && schedule === 0 && leadTime === 0 && baseline === null) {
    return { sentence: NOTHING_MOVED, ledger: '' };
  }

  const sentence = `${capitalize(
    joinClauses([
      costClause(cost, baseline, currency),
      scheduleClause(schedule),
      leadTimeClause(leadTime),
    ]),
  )}.`;

  return {
    sentence,
    ledger: [
      `Cost ${signedMoney(cost, currency)}`,
      `Schedule ${signedDays(schedule)}`,
      `Lead time ${signedDays(leadTime)}`,
    ].join(' · '),
  };
}
