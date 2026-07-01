/**
 * Pure selectors over CaptureState.
 *
 * The aggregate "is this record clean?" decisions (R1 vs C2, library vs inbox
 * default) run the existing lib/capture-validation rules plus a core-field
 * gate, so optional empty fields don't force everything into the inbox.
 */
import {
  validateProductCapture,
  type ValidationResult,
} from '../lib/capture-validation';
import type { CaptureState, DraftFieldKey } from './types';

/** Fields whose absence means the record has a real gap (drives R1 / inbox). */
const CORE_FIELDS: DraftFieldKey[] = ['name', 'price'];

const EMPTY_INVALID: ValidationResult = {
  errors: [],
  warnings: [],
  isValid: false,
};

export function selectValidation(state: CaptureState): ValidationResult {
  const draft = state.draft;
  if (!draft) return EMPTY_INVALID;
  return validateProductCapture({
    productName: draft.fields.name.value,
    price: draft.fields.price.value,
    sourceUrl: draft.sourceUrl,
    imageCount: draft.images.selected.length,
    confidence: draft.confidence,
  });
}

function hasCoreGap(state: CaptureState): boolean {
  const draft = state.draft;
  if (!draft) return false;
  return CORE_FIELDS.some((key) => draft.fields[key].status === 'missing');
}

/** C2 (captured) vs R1 (partial — fields flagged). Same component, derived. */
export function deriveRecordScreen(state: CaptureState): 'C2' | 'R1' {
  if (!state.draft) return 'C2';
  return hasCoreGap(state) || !selectValidation(state).isValid ? 'R1' : 'C2';
}

/** Spec S3: any flag → default Send-to-inbox (brass); clean → Save-to-library. */
export function selectCommitDefault(state: CaptureState): 'library' | 'inbox' {
  if (!state.draft) return 'library';
  return deriveRecordScreen(state) === 'R1' ? 'inbox' : 'library';
}
