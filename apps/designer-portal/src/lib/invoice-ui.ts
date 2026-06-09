import type { InvoiceStatus } from '@patina/shared';
import type { StatusTone } from '@/components/ui/controls';

/** Map an invoice status (+derived overdue) to the kit StatusBadge tone. */
export function invoiceStatusToTone(status: InvoiceStatus, overdue = false): StatusTone {
  if (overdue) return 'error';
  switch (status) {
    case 'paid':
      return 'success';
    case 'sent':
      return 'warning';
    case 'partially_paid':
      return 'info';
    case 'void':
      return 'error';
    default:
      return 'neutral';
  }
}
