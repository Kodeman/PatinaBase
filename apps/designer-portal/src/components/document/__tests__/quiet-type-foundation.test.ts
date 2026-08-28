import fs from 'node:fs';
import path from 'node:path';

const globals = fs.readFileSync(
  path.resolve(__dirname, '../../../app/globals.css'),
  'utf8',
);

function relativeLuminance(hex: string) {
  const channels = hex
    .match(/[a-f\d]{2}/gi)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const values = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('Quiet Work type foundation', () => {
  it('publishes explicit metadata, body, and control floors', () => {
    expect(globals).toContain('--type-metadata-min: 12px');
    expect(globals).toContain('--type-body-min: 14px');
    expect(globals).toContain('--type-control-min: 16px');
    expect(globals).toContain('.doc-type-meta');
    expect(globals).toContain('.doc-type-body');
    expect(globals).toContain('.doc-type-control');
  });

  it('uses a high-contrast Quiet Ink instead of material pigment for small copy', () => {
    const quietInk = globals.match(/--color-quiet-ink:\s*(#[\dA-F]{6})/i)?.[1];
    expect(quietInk).toBeDefined();
    expect(contrastRatio(quietInk!, '#FAF7F2')).toBeGreaterThanOrEqual(6.3);
    // R126 split the ramp: muted, subtle and faint were three names on this one
    // ink and are now three real steps. The guarantee is unchanged and now
    // covers all three — small copy is a quiet ink, never a material pigment —
    // so it is asserted on the values rather than on the alias form.
    for (const step of ['--text-muted', '--text-subtle', '--text-faint']) {
      const hex = globals.match(
        new RegExp(`${step}:\\s*(#[\\dA-F]{6})`, 'i'),
      )?.[1];
      expect(hex).toBeDefined();
      expect(contrastRatio(hex!, '#FAF7F2')).toBeGreaterThanOrEqual(6.3);
    }
  });
});
