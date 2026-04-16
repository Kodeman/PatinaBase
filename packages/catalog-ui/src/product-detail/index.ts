export {
  ProductEditProvider,
  useProductEdit,
  defaultNormalize,
  type EditMode,
  type AutoSaveStatus,
  type ToastVariant,
  type ProductImage,
  type BaseProductDraft,
  type ProductDraft,
  type ValidationResult,
} from './product-edit-context';
export { EditModeBar } from './edit-mode-bar';
export { InlineEditable } from './inline-editable';
export { RichTextField } from './rich-text-field';
export { HeroGallery } from './hero-gallery';
// ModelViewer intentionally not re-exported at top-level — lazy-loaded within HeroGallery.
export { ProductIdentity } from './product-identity';
export { ProductStory } from './product-story';
export { MaterialCloseups } from './material-closeups';
export { Specifications } from './specifications';
export { MakerStory } from './maker-story';
export {
  PairsWith,
  type PairsWithRelation,
  type PairsWithSearchResult,
} from './pairs-with';
export { DesignerIntelligence, type StyleSpectrum } from './designer-intelligence';
