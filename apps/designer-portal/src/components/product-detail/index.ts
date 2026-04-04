export { ProductEditProvider, useProductEdit } from './product-edit-context';
export type { ProductDraft, ProductImage, EditMode, AutoSaveStatus } from './product-edit-context';
export { EditModeBar } from './edit-mode-bar';
export { InlineEditable } from './inline-editable';
export { HeroGallery } from './hero-gallery';
// ModelViewer is lazy-loaded by HeroGallery — do not export statically (R3F init crashes SSR)
export { ProductIdentity } from './product-identity';
export { ProductStory } from './product-story';
export { MaterialCloseups } from './material-closeups';
export { Specifications } from './specifications';
export { MakerStory } from './maker-story';
export { PairsWith } from './pairs-with';
export { DesignerIntelligence } from './designer-intelligence';
