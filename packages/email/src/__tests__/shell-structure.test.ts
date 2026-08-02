/**
 * Rendered-output gates for the two shells this package ships.
 *
 * The other suites in this folder assert on React *element trees*, which is
 * blind to the two defects these tests exist to catch:
 *
 *  1. react-email's <Section style={{ padding }}> emits <table style="padding:…">.
 *     CSS `border-collapse: collapse` makes a TABLE's own padding a no-op, and
 *     Gmail forces border-collapse on every message table while stripping our
 *     embedded reset — so those sections rendered edge-to-edge, wordmark jammed
 *     against the color bar. Padding must live on a <td>.
 *  2. Microsoft's Exchange HTML converter (new Outlook desktop, OWA, Outlook
 *     iOS) strips the <head>, strips table attributes (width/align/border/
 *     cellpadding/cellspacing/role), strips bgcolor, and drops the CSS `height`
 *     property. So full width must be inline, the CTA fill must be inline on
 *     the <a>, and the 4px color bar needs font-size/line-height to hold its
 *     box once `height` is gone.
 *
 * Both shells are asserted here — the React one via @react-email/render, the
 * string one via the block renderer. The Deno mirror
 * (supabase/functions/_shared/branded-email.ts) has its own byte-identical
 * baseline test; keep the two in step.
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { render } from '@react-email/render';
import type { ContentBlock } from '@patina/shared/types';

import { OnboardingHours } from '../templates/onboarding-hours';
import { DesignerWelcome } from '../templates/designer-welcome';
import { WorkspaceInvite } from '../templates/workspace-invite';
import { PaymentReceipt } from '../templates/payment-receipt';
import { renderTemplate } from '../block-renderer';

/** The four paddings BaseEmailLayout owns: header, body, footer hairline, footer. */
const SHELL_PADDINGS = ['26px 40px 0', '22px 40px 0', '34px 40px 0', '22px 40px 32px'];

const tagsOf = (html: string, tag: string): string[] =>
  html.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) ?? [];

const withInlinePadding = (tags: string[]): string[] =>
  tags.filter((t) => /style="[^"]*padding/.test(t));

const hasCellPadding = (html: string, padding: string): boolean =>
  tagsOf(html, 'td').some((t) => {
    const style = /style="([^"]*)"/.exec(t)?.[1];
    return Boolean(style && style.replace(/\s+/g, ' ').includes(`padding:${padding}`));
  });

async function renderShell(element: React.ReactElement): Promise<string> {
  const html = await render(element);
  // Guard against a half-rendered document quietly passing the assertions.
  expect(html).toContain('</html>');
  return html;
}

const SAMPLES: Array<[string, () => React.ReactElement]> = [
  ['OnboardingHours', () => React.createElement(OnboardingHours)],
  ['DesignerWelcome', () => React.createElement(DesignerWelcome)],
  [
    'WorkspaceInvite',
    () =>
      React.createElement(WorkspaceInvite, {
        inviterName: 'Ada',
        workspaceName: 'Kochaver Studio',
        acceptUrl: 'https://app.patina.cloud/invite/abc',
        role: 'member',
      }),
  ],
  [
    'PaymentReceipt',
    () =>
      React.createElement(PaymentReceipt, {
        customerName: 'Bo',
        amountFormatted: '$2,700.00',
        paidAt: '2026-08-01T10:00:00Z',
        paymentMethod: 'Visa ending 4242',
        invoiceNumber: 'INV-9',
        orderNumber: 'PO-1001',
        description: 'Deposit',
        receiptUrl: 'https://app.patina.cloud/receipt/9',
      }),
  ],
];

describe('React shell — padding never lands on a <table>', () => {
  it.each(SAMPLES)('%s renders no <table> with inline padding', async (_name, make) => {
    const html = await renderShell(make());
    expect(withInlinePadding(tagsOf(html, 'table'))).toEqual([]);
  });

  it('puts all four BaseEmailLayout paddings on a <td>', async () => {
    const html = await renderShell(React.createElement(OnboardingHours));
    for (const padding of SHELL_PADDINGS) {
      expect(hasCellPadding(html, padding), `padding:${padding} on a <td>`).toBe(true);
    }
  });

  it('keeps the mobile .px hook on the padded cell, not the table', async () => {
    const html = await renderShell(React.createElement(OnboardingHours));
    const pxCells = tagsOf(html, 'td').filter((t) => /class="px"/.test(t));
    expect(pxCells.length).toBeGreaterThanOrEqual(3);
    for (const cell of pxCells) expect(cell).toMatch(/style="[^"]*padding/);
    expect(tagsOf(html, 'table').filter((t) => /class="[^"]*\bpx\b/.test(t))).toEqual([]);
  });
});

describe('React shell — survives the Exchange HTML converter', () => {
  it('carries the CTA fill inline on the <a>, not only on a bgcolor attribute', async () => {
    const html = await renderShell(React.createElement(OnboardingHours));
    const filled = tagsOf(html, 'a').filter((t) => /style="[^"]*background-color/.test(t));
    expect(filled.length).toBeGreaterThanOrEqual(1);
  });

  it('holds the 4px color bar with font-size/line-height, not just height', async () => {
    const html = await renderShell(React.createElement(OnboardingHours));
    const bar = tagsOf(html, 'td').filter((t) => /background-color:#(4E7A66|B08A46|A24E2E)/.test(t));
    expect(bar).toHaveLength(3);
    for (const cell of bar) {
      expect(cell).toMatch(/font-size:4px/);
      expect(cell).toMatch(/line-height:4px/);
      expect(cell).toMatch(/height:4px/);
      // cellpadding="0" is stripped too; without this the UA default
      // (td { padding: 1px }) swells the 4px band. Measured in Chromium.
      expect(cell).toMatch(/padding:0(?![^;"]*[1-9])/);
    }
  });

  it('collapses the color-bar row so a stripped cellspacing cannot pad the band', async () => {
    const html = await renderShell(React.createElement(OnboardingHours));
    // The bar table is the one whose first cell carries the verdigris fill.
    const barTable = /<table[^>]*>(?=(?:(?!<table)[\s\S])*?background-color:#4E7A66)/.exec(html);
    expect(barTable, 'bar table found').not.toBeNull();
    expect(barTable![0]).toMatch(/border-collapse:collapse/);
  });

  it('declares every table width inline so a stripped width attribute cannot collapse it', async () => {
    const html = await renderShell(React.createElement(OnboardingHours));
    // The 600px shell keeps its own width; every other layout table is 100%.
    expect(html).toMatch(/<table[^>]*style="[^"]*width:600px/);
    const layoutTables = tagsOf(html, 'table').filter((t) => /width="100%"/.test(t));
    expect(layoutTables.length).toBeGreaterThan(0);
    for (const table of layoutTables) expect(table).toMatch(/style="[^"]*\bwidth:/);
  });
});

describe('block-html string shell', () => {
  const blocks: ContentBlock[] = [
    { type: 'header', props: { tagline: 'New account' } },
    { type: 'hero', props: { greeting: 'Hello —', headline: 'Welcome', subline: 'Come in.' } },
    { type: 'text_block', props: { text: 'A line of prose.', align: 'left' } },
    { type: 'divider', props: { variant: 'subtle' } },
    {
      type: 'cta_button',
      props: { text: 'Open Patina', url: 'https://app.patina.cloud', variant: 'dark' },
    },
    {
      type: 'product_card',
      props: {
        product_name: 'Walnut Credenza',
        provenance: 'Vermont',
        description: 'Oiled walnut.',
        price: '$2,400',
        style_match: '92% match',
        product_url: 'https://app.patina.cloud/p/1',
        image_url: 'https://example.com/a.jpg',
      },
    },
    {
      type: 'notification',
      props: {
        badge_label: 'Order',
        headline: 'Your order shipped',
        body: 'It is on the way.',
        details: [{ key: 'Carrier', value: 'FedEx' }],
        cta_text: 'Track it',
        cta_url: 'https://app.patina.cloud/track',
      },
    },
    { type: 'footer', props: { nav_links: [{ label: 'Dashboard', url: 'https://app.patina.cloud' }] } },
  ] as ContentBlock[];

  const html = renderTemplate(blocks, { preheader: 'Welcome' });

  it('never puts padding on a <table>', () => {
    expect(withInlinePadding(tagsOf(html, 'table'))).toEqual([]);
  });

  it('gives every full-width layout table an inline width', () => {
    const layoutTables = tagsOf(html, 'table').filter((t) => /width="100%"/.test(t));
    expect(layoutTables.length).toBeGreaterThan(0);
    for (const table of layoutTables) expect(table).toMatch(/style="[^"]*width:100%/);
  });

  it('holds the color bar and hairlines without the height property', () => {
    const bar = tagsOf(html, 'td').filter((t) => /height="4"/.test(t));
    expect(bar).toHaveLength(3);
    for (const cell of bar) {
      expect(cell).toMatch(/background:#(4E7A66|B08A46|A24E2E)/);
      expect(cell).toMatch(/font-size:4px/);
      expect(cell).toMatch(/line-height:4px/);
      expect(cell).toMatch(/height:4px/);
      expect(cell).toMatch(/padding:0;/);
    }
    // The band is only 4px if the wrapping cell and the bar table also refuse
    // the UA defaults that a stripped cellpadding/cellspacing falls back to.
    expect(html).toMatch(/<td style="font-size:4px; line-height:4px; padding:0;">/);
    const barTable = /<table[^>]*>(?=(?:(?!<table)[\s\S])*?background:#4E7A66)/.exec(html);
    expect(barTable, 'bar table found').not.toBeNull();
    expect(barTable![0]).toMatch(/border-collapse:collapse/);
    const hairlines = tagsOf(html, 'div').filter((t) => /class="hairbg"/.test(t));
    expect(hairlines.length).toBeGreaterThan(0);
    for (const rule of hairlines) expect(rule).not.toMatch(/font-size:0/);
  });

  it('carries every CTA fill inline on the <a>', () => {
    const ctas = tagsOf(html, 'a').filter((t) => /display:inline-block/.test(t));
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const cta of ctas) expect(cta).toMatch(/background-color:#/);
  });
});
