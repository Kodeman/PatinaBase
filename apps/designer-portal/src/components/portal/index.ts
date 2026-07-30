/**
 * What is left of the portal barrel (R21 dissolve).
 *
 * This file was a 35-name backward-compat barrel for the zone tree. Because it
 * re-exported each name EXPLICITLY, every one of those 35 modules had to keep
 * existing just so the barrel could type-check — which is how forty dead
 * components would have survived the deletion of the pages that used them.
 *
 * Pruned to the one name surviving code still asks the barrel for: UploadZone,
 * imported by the Library Room's import sheet. Everything else under
 * components/portal/** is imported by its own path.
 *
 * Do not grow this file. New shared primitives belong in @patina/design-system
 * or the portal-local ui/controls kit.
 */
export { UploadZone } from './upload-zone';
