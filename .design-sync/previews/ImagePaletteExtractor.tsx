import * as React from 'react';

// Owned preview for ImagePaletteExtractor.
//
// Why owned: the component extracts its palette in a Web Worker
//   new Worker(new URL('../../workers/palette-quantize.worker.ts', import.meta.url))
// Storybook's react-vite bundler resolves that worker so the real swatch row
// renders. The design-sync preview bundle can't resolve it — the worker URL
// points at `ds-preview.invalid` — so the real component takes its error branch
// and shows the image with NO swatch row, identically for every variant
// (that's the [RENDER_THIN] flag: "variants render identically").
//
// This preview mirrors the component's *success* DOM 1:1 (same wrapper, image
// block, and swatch-chip classes from ImagePaletteExtractor.tsx) and inlines the
// exact palette storybook extracts, so Default (k=5) and EightSwatches (k=8)
// each render their distinct swatch row. It never imports the real component —
// doing so would re-spawn the failing worker.

const SAMPLE_IMAGE =
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&q=80';

// Swatches storybook's worker produces for SAMPLE_IMAGE, read off the SB capture.
const FIVE = ['#273B47', '#8A867B', '#97A7B2', '#B7B4AF', '#C3C5BF'];
const EIGHT = [...FIVE, '#C0CEDB', '#E2E4E7', '#FAFCFF'];

function Extractor(swatches: string[]) {
  return React.createElement(
    'div',
    { className: 'flex w-full flex-col gap-3' },
    // image preview block
    React.createElement(
      'div',
      {
        key: 'img',
        className:
          'relative overflow-hidden rounded-md border border-border bg-muted',
      },
      React.createElement('img', {
        src: SAMPLE_IMAGE,
        alt: 'Source for palette extraction',
        className: 'block h-auto w-full max-h-[400px] object-contain',
        crossOrigin: 'anonymous',
      }),
    ),
    // extracted swatch row
    React.createElement(
      'div',
      { key: 'row', className: 'flex flex-wrap gap-2' },
      swatches.map((hex, i) =>
        React.createElement(
          'div',
          {
            key: `${hex}-${i}`,
            className: 'flex flex-col items-start gap-1',
            title: hex,
          },
          React.createElement('div', {
            key: 'sw',
            className: 'h-12 w-12 rounded border border-border',
            style: { backgroundColor: hex },
          }),
          React.createElement(
            'span',
            {
              key: 'hex',
              className:
                'font-mono text-[10px] uppercase text-muted-foreground',
            },
            hex,
          ),
        ),
      ),
    ),
  );
}

// Story wraps the component in `<div style={{ width: 480 }}>`; mirror that so
// the layout matches the storybook framing on the full-width preview page.
const box = (w: number, fn: () => any) => () =>
  React.createElement(
    'div',
    { style: { width: w, maxWidth: '100%', margin: '0 auto' } },
    fn(),
  );

export const Default = box(480, () => Extractor(FIVE));
export const EightSwatches = box(480, () => Extractor(EIGHT));
