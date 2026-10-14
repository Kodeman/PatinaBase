import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEVER_OPTIMISTIC } from '../optimistic';

/**
 * Plan §5.2 deny list: no hook in NEVER_OPTIMISTIC may call the optimistic
 * helper. The hooks live in this package and in the designer portal (the
 * SQ-965 inventory names both).
 */
const REPO_ROOT = resolve(__dirname, '../../../../..');
const SOURCE_ROOTS = ['packages/supabase/src', 'apps/designer-portal/src'];

const HELPER_CALL = /\b(useOptimisticMutation|optimisticMutationOptions)\b/;
const HOOK_DEFINITION = /^(?:export\s+)?(?:async\s+)?(?:function\s+|const\s+)(use[A-Za-z0-9]+)\b/;
const TOP_LEVEL =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__tests__' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Each top-level definition of a listed hook, up to the next top-level declaration. */
function hookBodies(source: string, names: ReadonlySet<string>) {
  const lines = source.split('\n');
  const bodies: Array<{ name: string; line: number; body: string }> = [];
  lines.forEach((text, i) => {
    const name = HOOK_DEFINITION.exec(text)?.[1];
    if (!name || !names.has(name)) return;
    let end = i + 1;
    while (end < lines.length && !TOP_LEVEL.test(lines[end])) end += 1;
    bodies.push({ name, line: i + 1, body: lines.slice(i, end).join('\n') });
  });
  return bodies;
}

describe('NEVER_OPTIMISTIC deny list (plan §5.2)', () => {
  const names = new Set<string>(NEVER_OPTIMISTIC);
  const definitions = SOURCE_ROOTS.flatMap((root) =>
    sourceFiles(join(REPO_ROOT, root)).flatMap((file) =>
      hookBodies(readFileSync(file, 'utf8'), names).map((d) => ({
        ...d,
        at: `${relative(REPO_ROOT, file)}:${d.line}`,
      })),
    ),
  );

  it('the grep isolates one hook body and sees a helper call in it', () => {
    const source = [
      'export function useSendInvoice() {',
      '  return useOptimisticMutation({ honesty: "internal" });',
      '}',
      'export function useSomethingElse() {',
      '  return useOptimisticMutation({ honesty: "internal" });',
      '}',
      'function useSetProjectStatus(projectId: string) {',
      '  return useMutation({ mutationFn: async () => projectId });',
      '}',
    ].join('\n');
    const bodies = hookBodies(source, new Set(['useSendInvoice', 'useSetProjectStatus']));
    expect(bodies.map((b) => [b.name, HELPER_CALL.test(b.body)])).toEqual([
      ['useSendInvoice', true],
      ['useSetProjectStatus', false],
    ]);
  });

  it('every listed hook is defined in the scanned sources', () => {
    const defined = new Set(definitions.map((d) => d.name));
    expect(NEVER_OPTIMISTIC.filter((name) => !defined.has(name))).toEqual([]);
  });

  it('no listed hook calls useOptimisticMutation', () => {
    const offenders = definitions.filter((d) => HELPER_CALL.test(d.body)).map((d) => `${d.name} at ${d.at}`);
    expect(offenders).toEqual([]);
  });
});
