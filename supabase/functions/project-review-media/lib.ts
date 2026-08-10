export function isSafeDerivativePath(path: string): boolean {
  return /^project-review\/[^/]+\/[a-f0-9]{64}\.[a-z0-9]+$/i.test(path);
}
export function uniquePaths(paths: unknown): string[] { return Array.isArray(paths) ? [...new Set(paths.filter((path): path is string => typeof path === 'string' && isSafeDerivativePath(path)))] : []; }
