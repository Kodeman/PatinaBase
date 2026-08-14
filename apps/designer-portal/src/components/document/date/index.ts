/** The Calendar Folio — the document register's date instrument. */

export { FolioPopover, type FolioPopoverProps } from './folio-popover';
export { FolioCalendar, type FolioCalendarProps } from './folio-calendar';
export { FolioPresets, type FolioPresetsProps } from './folio-presets';
export { FolioMonthGrid, type FolioMonthGridProps } from './folio-month-grid';
export {
  folioClickDay,
  folioCommittable,
  folioDraftFromValue,
  folioReadout,
  folioShadeRange,
  type FolioDraft,
  type FolioReadoutLabels,
  type FolioSelection,
} from '@/lib/document/folio-calendar-derivation';
