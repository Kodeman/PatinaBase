// Call C's regex half: the error and warning rules of
// marketing/canon/lexicon.json. An edge function bundles only what sits under
// supabase/functions, so the rules are copied here; lint.test.ts reads the
// canon file and fails when the copy drifts. The canon's places, numbers and
// claims sections police marketing claims (citations, coastal place names) and
// are not applied to a homeowner's page, whose own project name may be a place.

export interface LexiconRule {
  rule: string;
  pattern: string;
  flags: string;
  homoglyphs?: boolean;
  maxPerPiece?: number;
}

export const NORMALIZE = {
  form: "NFKC",
  strip: "[\\u200B-\\u200D\\u2060\\uFEFF]",
  homoglyphs: {
    "А": "A",
    "а": "a",
    "Α": "A",
    "α": "a",
    "І": "I",
    "і": "i",
    "Ӏ": "I",
    "Ι": "I",
    "ι": "i",
  } as Record<string, string>,
};

const SEP = "[\\s\\u00A0\\u2010\\u2011-]";

export const ERROR_RULES: LexiconRule[] = [
  { rule: "ai", pattern: "(?<![A-Za-z])A\\.?\\s?I(?![A-Za-z])", flags: "i", homoglyphs: true },
  { rule: "ai", pattern: "\\bgen\\s?ai\\b", flags: "i", homoglyphs: true },
  {
    rule: "ai-powered",
    pattern: `(?<![A-Za-z])A\\.?\\s?I${SEP}*powered\\b`,
    flags: "i",
    homoglyphs: true,
  },
  { rule: "artificial-intelligence", pattern: `\\bartificial${SEP}+intelligence\\b`, flags: "i" },
  { rule: "machine-learning", pattern: `\\bmachine${SEP}+learning\\b`, flags: "i" },
  { rule: "powered-by", pattern: `\\bpowered${SEP}+by\\b`, flags: "i" },
  { rule: "algorithm", pattern: "\\balgorithm\\w*", flags: "i" },
  { rule: "pledge", pattern: "\\bpledge\\w*", flags: "i" },
  { rule: "royalty", pattern: "\\broyalt\\w*", flags: "i" },
  { rule: "giving-back", pattern: `\\bgiv(?:e|ing)${SEP}+back\\b`, flags: "i" },
  {
    rule: "pay-it-forward",
    pattern: `\\bpay(?:s|ing)?${SEP}+it${SEP}+forward\\b`,
    flags: "i",
  },
  { rule: "disrupt", pattern: "\\bdisrupt\\w*", flags: "i" },
  { rule: "revolutionize", pattern: "\\brevolutioni\\w*", flags: "i" },
  { rule: "curated", pattern: "\\bcurat\\w*", flags: "i" },
  { rule: "luxury", pattern: "\\bluxur\\w*", flags: "i" },
  { rule: "gig", pattern: "\\bgigs?\\b", flags: "i" },
  { rule: "game-changer", pattern: `\\bgame${SEP}+chang\\w*`, flags: "i" },
  { rule: "seamless", pattern: "\\bseamless\\w*", flags: "i" },
  { rule: "unlock", pattern: "\\bunlock\\w*", flags: "i" },
];

export const WARNING_RULES: LexiconRule[] = [
  { rule: "tagline", pattern: "(?:where\\s+)?time\\s+adds\\s+value", flags: "i" },
  { rule: "elevated", pattern: "\\belevated\\b", flags: "i" },
  { rule: "bespoke", pattern: "\\bbespoke\\b", flags: "i" },
  { rule: "promise", pattern: "\\bpromise\\b", flags: "i" },
  { rule: "audience", pattern: "\\b(?:for|to) (?:homeowners|makers)\\b", flags: "i" },
  { rule: "audience", pattern: "\\bhomeowners? (?:love|choose|sign up|trust)\\b", flags: "i" },
  { rule: "ml", pattern: "\\bML\\b", flags: "" },
  { rule: "llm", pattern: "\\bLLMs?\\b", flags: "" },
  { rule: "chatbot", pattern: `\\bchat${SEP}?bots?\\b`, flags: "i" },
  { rule: "automation", pattern: "\\bautomat\\w*", flags: "i" },
  { rule: "driven-by", pattern: `\\bdriven${SEP}+by\\b`, flags: "i" },
  {
    rule: "spelled-quantity",
    pattern:
      "\\b(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\\s-](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)[\\s-]+(?:hours?|days?|minutes?|weeks?|percent)\\b",
    flags: "i",
  },
  { rule: "emoji", pattern: "\\p{Extended_Pictographic}", flags: "u" },
  { rule: "exclamations", pattern: "!(?!\\[)", flags: "", maxPerPiece: 1 },
];

export interface LintHit {
  rule: string;
  /** The words as they appear in the draft, for the regeneration request. */
  term: string;
}

const STRIP = new RegExp(NORMALIZE.strip, "g");

function normalize(text: string): string {
  return text.normalize(NORMALIZE.form as "NFKC").replace(STRIP, "");
}

function mapHomoglyphs(text: string): string {
  return [...text].map((char) => NORMALIZE.homoglyphs[char] ?? char).join("");
}

const COMPILED = [...ERROR_RULES, ...WARNING_RULES].map((rule) => ({
  rule,
  regex: new RegExp(rule.pattern, `${rule.flags}g`),
}));

function matches(regex: RegExp, text: string): string[] {
  return [...text.matchAll(regex)].map((match) => match[0]);
}

/** A homoglyph rule also reads the text with look-alikes mapped to Latin. */
function ruleMatches(rule: LexiconRule, regex: RegExp, plain: string, mapped: string): string[] {
  const found = matches(regex, plain);
  return found.length || !rule.homoglyphs ? found : matches(regex, mapped);
}

/** The first canon rule this piece breaks, or null. */
export function lintText(text: string): LintHit | null {
  const plain = normalize(text);
  const mapped = mapHomoglyphs(plain);
  for (const { rule, regex } of COMPILED) {
    const found = ruleMatches(rule, regex, plain, mapped);
    if (found.length > (rule.maxPerPiece ?? 0)) return { rule: rule.rule, term: found[0] };
  }
  return null;
}

/** The first hit across several pieces (each string is one piece). */
export function lintPieces(pieces: readonly string[]): LintHit | null {
  for (const piece of pieces) {
    const hit = lintText(piece);
    if (hit) return hit;
  }
  return null;
}
