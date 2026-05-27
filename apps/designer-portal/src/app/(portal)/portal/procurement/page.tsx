import { redirect } from 'next/navigation';

/**
 * Procurement zone root.
 *
 * The zone's default landing view is "By Vendor". Redirecting here keeps the
 * sub-nav active-state logic simple (each view owns its own pathname) and
 * matches the pattern used by other zones that have a default sub-tab.
 */
export default function ProcurementIndexPage() {
  redirect('/portal/procurement/by-vendor');
}
