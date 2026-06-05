// Re-point: the canonical portal Button now lives in the control kit.
// `PortalButton` is kept as a migration alias so existing call sites
// (which import `PortalButton` and pass variant 'primary'|'secondary'|'ghost',
// className overrides, onClick, disabled, type, etc.) keep working — the new
// Button is a drop-in superset.
export { Button, PortalButton, buttonVariants } from '@/components/ui/controls/button';
export type { ButtonProps } from '@/components/ui/controls/button';
