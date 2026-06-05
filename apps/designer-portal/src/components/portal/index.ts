// Catalog primitives now live in @patina/catalog-ui; re-export for backward-compat.
export {
  StrataMark,
  LoadingStrata,
  SearchInput,
  FilterRow,
  TierBadge,
  ProductCard,
  ProductListItem,
  EmptyState,
  CatalogRefineBar,
} from '@patina/catalog-ui';

// PortalButton is the new control-kit button (drop-in superset of the legacy
// catalog-ui PortalButton). Source it from the local kit, not @patina/catalog-ui,
// so barrel consumers get the new clay button instead of the old charcoal one.
export { PortalButton, Button, buttonVariants } from './button';

export { PageContainer } from './page-container';
export { MetricBlock } from './metric-block';
export { FieldGroup } from './field-group';
export { DetailRow } from './detail-row';
export { ScoreCircle } from './score-circle';
export { StyleTag } from './style-tag';
export { ProgressBar } from './progress-bar';
export { TopBar } from './top-bar';
export { SubNav } from './sub-nav';
export { MobileTabBar } from './mobile-tab-bar';
export { LeadListItem } from './lead-list-item';
export { ProjectListItem } from './project-list-item';
export { SpectrumSlider } from './spectrum-slider';
export { TeachPanel } from './teach-panel';
export { CompatItem } from './compat-item';
export { UploadZone } from './upload-zone';
export { ImageGallery } from './image-gallery';
export { Breadcrumb } from './breadcrumb';
export { ToastProvider, useToast } from './toast-provider';
export { PhaseDot } from './phase-dot';
export { PhaseTimeline } from './phase-timeline';
export { TaskChecklist } from './task-checklist';
export { BudgetTable } from './budget-table';
export { DocumentList } from './document-list';
export { PaymentMilestoneCard } from './payment-milestone-card';
export { ProjectForm } from './project-form';
export { ClosureChecklist } from './closure-checklist';
export { PortfolioSnapshotForm } from './portfolio-snapshot-form';
export { ChangeHistory } from './change-history';
export { PageActionBar } from './page-action-bar';
export type { PageActionBarProps, BadgeTone } from './page-action-bar';
export { ListPageHeader } from './list-page-header';
export type { ListPageHeaderProps } from './list-page-header';
