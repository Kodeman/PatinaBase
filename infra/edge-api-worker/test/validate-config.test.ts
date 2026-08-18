import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { validateScope } from '../scripts/validate-config.mjs';

// Read the real committed config so the fixtures are complete, valid scopes
// whose ONLY varied field is workers_dev — any workers_dev error is then
// unambiguous.
const config = parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
  [],
  { allowTrailingComma: true },
);

function workersDevErrors(label: string, scope: unknown): string[] {
  const errors: string[] = [];
  validateScope(label, scope, errors);
  return errors.filter((error) => error.includes('workers_dev'));
}

function withWorkersDev(scope: object, value: boolean): object {
  return { ...scope, workers_dev: value };
}

describe('validate-config workers_dev contract', () => {
  it('rejects a production scope with workers_dev:true (second unauthenticated origin)', () => {
    const errors = workersDevErrors(
      'env.production',
      withWorkersDev(config.env.production, true),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('workers_dev must be false');
  });

  it('accepts a production scope with workers_dev:false', () => {
    expect(
      workersDevErrors('env.production', withWorkersDev(config.env.production, false)),
    ).toEqual([]);
  });

  it('rejects a staging scope with workers_dev:false', () => {
    const errors = workersDevErrors(
      'env.staging',
      withWorkersDev(config.env.staging, false),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('workers_dev must be true');
  });

  it('accepts a staging scope with workers_dev:true', () => {
    expect(
      workersDevErrors('env.staging', withWorkersDev(config.env.staging, true)),
    ).toEqual([]);
  });
});
