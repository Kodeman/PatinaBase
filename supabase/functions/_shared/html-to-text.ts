// HTML → plain text for the multipart/alternative text part.
//
// Every Patina email is built as table-layout HTML with a hidden preheader, MSO
// conditional comments, and a <head> full of CSS. A text part is a
// deliverability signal, so send-email.ts derives one from the HTML whenever the
// caller has not written a better one by hand.
//
// Deliberately regex-based: the Deno edge runtime has no DOM parser, and the
// input is our own generated markup, not arbitrary web HTML.

const BLOCK_CLOSERS =
  /<\/(?:p|div|tr|li|h[1-6]|table|blockquote|section|header|footer)\s*>/gi;

// The typographic entries are exactly the named entities the edge email
// builders emit (grep `&[a-z]+;` across supabase/functions); anything absent
// here would print as literal "&mdash;" in a reader's plain-text pane.
const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&mdash;": "—",
  "&ndash;": "–",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&middot;": "·",
  "&rsaquo;": "›",
  "&hellip;": "…",
  "&zwnj;": "",
  // Ampersand last on the decode pass so "&amp;lt;" survives as "&lt;".
  "&amp;": "&",
};

function decodeEntities(input: string): string {
  let out = input
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? safeFromCodePoint(code, whole) : whole;
    })
    .replace(/&#(\d+);/g, (whole, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? safeFromCodePoint(code, whole) : whole;
    });
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    out = out.replaceAll(entity, char);
  }
  return out;
}

function safeFromCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Tags off, entities decoded, whitespace flattened — for a link's label. */
function plainLabel(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render the plain-text alternative for one HTML email body.
 *
 * Drops <head>, <style>, <script>, every comment (MSO conditionals included),
 * and the hidden preheader div — a preheader is written for the inbox preview
 * line and reads as duplicated noise in a text part.
 */
export function htmlToText(html: string): string {
  if (!html) return "";

  let s = html;

  // Comments first: an MSO conditional wraps real markup we do not want either.
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<!\[endif\]>/gi, "");
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<!DOCTYPE[^>]*>/gi, "");

  // The preheader: a div hidden by display:none / max-height:0. It carries no
  // nested div, so the lazy match ends on its own closing tag.
  s = s.replace(
    /<div\b[^>]*style=(["'])[^"']*(?:display\s*:\s*none|max-height\s*:\s*0)[^"']*\1[^>]*>[\s\S]*?<\/div>/gi,
    "",
  );

  // Links become "label (href)". A label that already prints the URL — the
  // "copy this link" fallback every letter carries — keeps just the once.
  s = s.replace(
    /<a\b[^>]*\bhref=(["'])([^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_whole, _q: string, href: string, label: string) => {
      const text = plainLabel(label);
      const target = decodeEntities(href).trim();
      if (!target) return text;
      if (!text) return target;
      return text === target ? text : `${text} (${target})`;
    },
  );

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/td\s*>/gi, " ");
  s = s.replace(/<\/tr\s*>/gi, "\n");
  s = s.replace(BLOCK_CLOSERS, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "- ");
  s = s.replace(/<(?:p|div|table|h[1-6])\b[^>]*>/gi, "\n");

  s = s.replace(/<[^>]*>/g, "");
  s = decodeEntities(s);

  // Horizontal whitespace only — newlines are structure at this point.
  s = s.replace(/[^\S\n]+/g, " ");
  s = s.split("\n").map((line) => line.trim()).join("\n");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}
