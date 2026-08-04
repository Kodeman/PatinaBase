// Type-only import-map target for checking the local integration harness.
// The designer portal's own type-check remains authoritative for the complete
// @patina/design-system MoodBoardRasterInput contract.
export interface MoodBoardRasterInput {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor?: string;
  sections: readonly unknown[];
  items: readonly unknown[];
}
