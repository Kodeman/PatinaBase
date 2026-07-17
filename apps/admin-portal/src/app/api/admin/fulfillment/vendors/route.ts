import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import type { PaymentTerms, TransmissionType, VendorDirectoryRow } from '@patina/fulfillment';

// GET /api/admin/fulfillment/vendors — the Vendor Directory list (S4, spec §7).
// Every vendor, whether profiled or not (R1.6: code never blocks on vendor
// facts) — an unprofiled vendor still appears, just with hasProfile=false, so
// the operator can see the gap and fill it in rather than the vendor silently
// not existing on this screen.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  try {
    const { data, error } = await db
      .from('vendors')
      .select('id, name, vendor_profiles(transmission_type, payment_terms)')
      .order('name', { ascending: true });
    if (error) throw error;

    const rows: VendorDirectoryRow[] = (data ?? []).map((v: Record<string, unknown>) => {
      const profile = Array.isArray(v.vendor_profiles) ? v.vendor_profiles[0] : v.vendor_profiles;
      return {
        vendorId: v.id as string,
        vendorName: v.name as string,
        hasProfile: !!profile,
        transmissionType: (profile?.transmission_type as TransmissionType | undefined) ?? null,
        paymentTerms: (profile?.payment_terms as PaymentTerms | undefined) ?? null,
      };
    });

    return NextResponse.json({ data: rows });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load vendor directory');
  }
}
