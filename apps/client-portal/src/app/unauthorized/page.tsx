import { redirect } from 'next/navigation';

/**
 * Back-compat shim. The wrong-role interstitial now lives at `/wrong-portal`
 * (role-aware copy + escape hatch). Any lingering link or bookmark to
 * `/unauthorized` is forwarded there. Middleware keeps `/unauthorized` exempt
 * from the role gate so this redirect isn't itself gated.
 */
export default function UnauthorizedPage() {
  redirect('/wrong-portal');
}
