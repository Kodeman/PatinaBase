export const MAX_SEARCH_LENGTH = 200;
export const MAX_FILTER_LENGTH = 100;

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>&"']/g, '')
    .trim();
}
