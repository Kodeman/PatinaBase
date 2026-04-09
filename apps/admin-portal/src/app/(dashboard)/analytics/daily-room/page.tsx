/**
 * Admin → Analytics → Daily Room
 *
 * Server component. Reads live aggregates from the Daily Room telemetry
 * tables (populated by the interactions batch endpoint + the nightly
 * re-ranking pipeline). For volume metrics (DAU/WAU, scroll depth,
 * funnels), see the PostHog dashboards documented in
 * docs/specs/Data Tracking/posthog-dashboards.md.
 */
import { createAdminClient } from '@patina/supabase/client';

export const dynamic = 'force-dynamic';

export default async function DailyRoomAnalyticsPage() {
  // Cast to `any` because the Daily Room tables (`user_room_engagement`,
  // `product_engagement`) were added in migration 00069 and are not yet in
  // the generated Database types. Remove the cast once `pnpm db:generate`
  // picks them up.
  const admin = createAdminClient() as any;

  const [
    { count: activeUsersLast7d },
    { data: topProducts },
    { data: topRooms },
    { count: declining },
  ] = await Promise.all([
    admin
      .from('user_room_engagement')
      .select('user_id', { count: 'exact', head: true })
      .gte('last_active', new Date(Date.now() - 7 * 864e5).toISOString()),
    admin
      .from('product_engagement')
      .select('product_id, total_impressions, avg_dwell_ms, save_rate, add_to_room_rate')
      .order('save_rate', { ascending: false })
      .limit(10),
    admin
      .from('user_room_engagement')
      .select('room_id, total_dwell_ms, products_added')
      .order('total_dwell_ms', { ascending: false })
      .limit(10),
    admin
      .from('product_engagement')
      .select('product_id', { count: 'exact', head: true })
      .eq('declining_flag', true),
  ]);

  return (
    <div className="space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold">The Daily Room — Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Aggregates from the behavioral telemetry pipeline. Volume metrics
          live in PostHog.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <MetricCard label="Active users (7d)" value={activeUsersLast7d ?? 0} />
        <MetricCard label="Top rooms by dwell" value={topRooms?.length ?? 0} />
        <MetricCard label="Declining products" value={declining ?? 0} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Top products by save rate</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Product ID</th>
              <th>Impressions</th>
              <th>Avg dwell (ms)</th>
              <th>Save rate</th>
              <th>Add-to-room rate</th>
            </tr>
          </thead>
          <tbody>
            {(topProducts ?? []).map((p: any) => (
              <tr key={p.product_id} className="border-b">
                <td className="py-2 font-mono text-xs">{p.product_id}</td>
                <td>{p.total_impressions}</td>
                <td>{p.avg_dwell_ms}</td>
                <td>{(p.save_rate * 100).toFixed(1)}%</td>
                <td>{(p.add_to_room_rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
