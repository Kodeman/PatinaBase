// Type surface for the config validator's one exported unit. The script itself
// stays plain .mjs so `node scripts/validate-config.mjs` runs without a build.
export function validateScope(
  label: string,
  scope: unknown,
  errors: string[],
): void;
