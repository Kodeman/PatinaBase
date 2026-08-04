// deno-lint-ignore-file no-import-prefix
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

Deno.test('spec-pdf shared-module deploy importer manifest is exhaustive', async () => {
  const functionsUrl = new URL('../', import.meta.url);
  const manifest = JSON.parse(
    await Deno.readTextFile(
      new URL('./spec-pdf.importers.json', import.meta.url),
    ),
  ) as { deployImporters: string[] };
  const discovered: string[] = [];
  for await (const entry of Deno.readDir(functionsUrl)) {
    if (!entry.isDirectory || entry.name.startsWith('_')) continue;
    const indexUrl = new URL(`./${entry.name}/index.ts`, functionsUrl);
    try {
      const source = await Deno.readTextFile(indexUrl);
      if (source.includes('../_shared/spec-pdf.ts')) {
        discovered.push(entry.name);
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  assertEquals(discovered.sort(), [...manifest.deployImporters].sort());
});
