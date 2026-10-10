// deno-lint-ignore-file no-import-prefix
// Deno tests for the react-pdf text boundary (US-21 T-60c F13).
//   cd supabase/functions && deno test --allow-all --config deno.json _shared/pdf-text.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import React from 'npm:react@19.1.0';
import { pdfText, Text } from './pdf-text.ts';

// What base-14 Helvetica can print under WinAnsiEncoding: printable ASCII,
// Latin-1, and the 27 characters at 0x80–0x9F (pdfkit's WIN_ANSI_MAP), plus
// the line breaks react-pdf lays out itself.
const WIN_ANSI_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function winAnsi(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return cp === 0x09 || cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_HIGH.includes(ch);
}

Deno.test('primes print as feet and inches', () => {
  assertEquals(pdfText('Runner, 2′6″ × 10′'), `Runner, 2'6" × 10'`);
  assertEquals(pdfText('2ʹ6ʺ'), `2'6"`);
});

Deno.test('text WinAnsi can encode comes back unchanged', () => {
  let all = '\n';
  for (let cp = 0x20; cp <= 0x7e; cp++) all += String.fromCodePoint(cp);
  for (let cp = 0xa0; cp <= 0xff; cp++) all += String.fromCodePoint(cp);
  all += WIN_ANSI_HIGH;
  assertEquals(pdfText(all), all);
  assertEquals(pdfText('Möbelverkstad · 6–8 wks — €1,200.00 × ½'), 'Möbelverkstad · 6–8 wks — €1,200.00 × ½');
});

Deno.test('other characters print in their nearest form, or as ?', () => {
  assertEquals(pdfText('a‐b‑c−d'), 'a-b-c-d');
  assertEquals(pdfText('⅛ in'), '1/8 in');
  assertEquals(pdfText('ﬁnish'), 'finish');
  assertEquals(pdfText('Ākāśa'), 'Akasa');
  assertEquals(pdfText('12 in · 3 ft'), '12 in · 3 ft');
  assertEquals(pdfText('Łódź'), '?ódz');
  assertEquals(pdfText('sofa 🛋'), 'sofa ?');
  assertEquals(pdfText('bell\u0007'), 'bell');
});

Deno.test('every character the boundary prints is one WinAnsi can encode', () => {
  for (let cp = 0; cp <= 0x2fff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const printed = pdfText(String.fromCodePoint(cp));
    for (const ch of printed) {
      assert(winAnsi(ch), `U+${cp.toString(16)} printed ${JSON.stringify(printed)}`);
    }
  }
});

Deno.test('every base-14 builder takes Text from the boundary, never from react-pdf', async () => {
  for (const file of ['spec-pdf.ts', 'po-pdf.ts', 'fulfillment-po-pdf.ts']) {
    const source = await Deno.readTextFile(new URL(`./${file}`, import.meta.url));
    const reactPdf = source.match(/import \{([^}]*)\} from 'npm:@react-pdf\/renderer@[^']+';/);
    assert(reactPdf, `${file} imports react-pdf`);
    assertEquals(/\bText\b/.test(reactPdf[1]), false, `${file} imports Text from react-pdf`);
    assert(source.includes(`import { Text } from './pdf-text.ts';`), `${file} imports the boundary Text`);
  }
});

Deno.test('Text passes every string child through the boundary', () => {
  const one = Text({ style: { fontSize: 10 }, children: '2′6″' }) as React.ReactElement<
    { children: unknown; style: unknown }
  >;
  assertEquals(one.props.children, `2'6"`);
  assertEquals(one.props.style, { fontSize: 10 });
  const many = Text({ children: ['10′', ' × ', 3] }) as React.ReactElement<{ children: unknown }>;
  assertEquals(many.props.children, [`10'`, ' × ', 3]);
});
