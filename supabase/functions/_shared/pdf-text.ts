// The text boundary for the react-pdf builders (spec-pdf, po-pdf,
// fulfillment-po-pdf).
//
// Those builders print in base-14 Helvetica/Courier, which react-pdf writes
// with WinAnsiEncoding and one byte per glyph. A character outside WinAnsi
// keeps only the low byte of its code point, so a prime U+2032 printed as `2`
// and `2′6″ × 10′` came out `2263 × 102` (US-21 T-60c F13). Every string a
// builder prints therefore passes through `pdfText`, which swaps each
// character WinAnsi cannot encode for its nearest printable form. The data is
// never edited; only what reaches the page.
//
// The builders import `Text` from here instead of from react-pdf, so no call
// site can skip the mapping.

// deno-lint-ignore-file no-import-prefix

import React from 'npm:react@19.1.0';
import { Text as PdfText } from 'npm:@react-pdf/renderer@4.3.0';

/** The 27 characters WinAnsi places in 0x80–0x9F (pdfkit's WIN_ANSI_MAP). */
const WIN_ANSI_HIGH = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Characters outside WinAnsi whose nearest printable form is not their
 *  compatibility decomposition (NFKD turns ″ into ′′, which is no better). */
const NEAREST: Readonly<Record<string, string>> = {
  '′': "'", // U+2032 prime: feet, minutes
  '″': '"', // U+2033 double prime: inches, seconds
  '‴': "'''", // U+2034 triple prime
  '‵': "'", // U+2035 reversed prime
  '‶': '"', // U+2036 reversed double prime
  'ʹ': "'", // U+02B9 modifier prime
  'ʺ': '"', // U+02BA modifier double prime
  'ʼ': '’', // U+02BC modifier apostrophe
  '‐': '-', // U+2010 hyphen
  '‑': '-', // U+2011 non-breaking hyphen
  '‒': '–', // U+2012 figure dash
  '―': '—', // U+2015 horizontal bar
  '−': '-', // U+2212 minus
  '⁄': '/', // U+2044 fraction slash (NFKD of ⅛ is 1⁄8)
  '∕': '/', // U+2215 division slash
  '⨯': '×', // U+2A2F vector product
  '✕': '×', // U+2715 multiplication x
  '✖': '×', // U+2716 heavy multiplication x
  '∙': '·', // U+2219 bullet operator
  '⋅': '·', // U+22C5 dot operator
  '‧': '·', // U+2027 hyphenation point
};

function isWinAnsi(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return cp === 0x09 || cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_HIGH.has(ch);
}

function printable(ch: string): string | null {
  if (isWinAnsi(ch)) return ch;
  return NEAREST[ch] ?? null;
}

function nearest(ch: string): string {
  const direct = printable(ch);
  if (direct !== null) return direct;
  if (/^\p{Cc}$/u.test(ch)) return ''; // a stray control character prints nothing
  // Compatibility decomposition, accents dropped: ﬁ → fi, ⅛ → 1/8, ā → a,
  // a thin or narrow no-break space → a space.
  let out = '';
  for (const part of ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')) {
    const mapped = printable(part);
    if (mapped === null) return '?';
    out += mapped;
  }
  return out || '?';
}

/** `text` with every character WinAnsi cannot encode replaced by its nearest
 *  printable form, or `?` when it has none. WinAnsi text comes back as is. */
export function pdfText(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  let out = '';
  for (const ch of text) out += nearest(ch);
  return out;
}

function pdfChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') return pdfText(children);
  if (Array.isArray(children)) return children.map(pdfChildren);
  return children;
}

type PdfTextProps = React.ComponentProps<typeof PdfText>;

/** react-pdf's `Text`, with every string child passed through `pdfText`. */
export function Text(props: PdfTextProps): React.ReactElement {
  const { children, ...rest } = props as React.PropsWithChildren<PdfTextProps>;
  const printed = pdfChildren(children);
  return Array.isArray(printed)
    ? React.createElement(PdfText, rest as PdfTextProps, ...printed)
    : React.createElement(PdfText, rest as PdfTextProps, printed);
}
