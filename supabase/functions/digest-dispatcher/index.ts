// Digest Dispatcher Edge Function
// Cron-triggered daily. For each user whose digest_frequency is not 'never',
// determines whether they're due for a digest in their timezone today, then
// collects notification_log entries since their last digest and sends a
// summary email.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import {
  renderBrandedShell,
  heading,
  paragraph,
  muted,
  ctaButton,
  spacer,
} from "../_shared/branded-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type DigestFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "never";

interface DigestablePreference {
  user_id: string;
  digest_frequency: DigestFrequency;
  last_digest_sent_at: string | null;
  timezone: string | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

interface NotificationRow {
  id: string;
  type: string;
  template_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Notification types that should NOT appear in a digest. Transactional
// emails are always sent immediately and contain time-critical content.
const DIGEST_EXCLUDED_TYPES = new Set([
  "account_verification",
  "password_reset",
  "security_alert",
  "order_confirmation",
  "payment_receipt",
  "client_confirmation",
  // In-app messages already have their own coalescing channel.
  "in_app_message",
  "in_app_message_mention",
]);

const DIGEST_BASE_URL =
  Deno.env.get("CLIENT_PORTAL_URL") ?? "https://app.patina.cloud";

// ─── Frequency check ────────────────────────────────────────────────────

function inUserTz(date: Date, tz: string): { dow: number; dom: number; weekIdx: number; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const dowStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const domStr = parts.find((p) => p.type === "day")?.value ?? "01";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = dowMap[dowStr] ?? 1;
  const dom = parseInt(domStr, 10) || 1;
  const week1 = new Date(date.getTime());
  week1.setUTCDate(1);
  const weekIdx = Math.floor((dom - 1) / 7);
  return { dow, dom, weekIdx, hour: parseInt(hourStr, 10) || 0 };
}

function isDigestDue(pref: DigestablePreference, now: Date): boolean {
  const tz = pref.timezone || "America/New_York";
  let local: ReturnType<typeof inUserTz>;
  try {
    local = inUserTz(now, tz);
  } catch {
    local = inUserTz(now, "America/New_York");
  }

  // Honor quiet hours if enabled — only send during waking hours.
  if (pref.quiet_hours_enabled && pref.quiet_hours_start && pref.quiet_hours_end) {
    const startH = parseInt(pref.quiet_hours_start.slice(0, 2), 10);
    const endH = parseInt(pref.quiet_hours_end.slice(0, 2), 10);
    const hour = local.hour;
    const inQuietWindow =
      startH <= endH ? hour >= startH && hour < endH : hour >= startH || hour < endH;
    if (inQuietWindow) return false;
  }

  // Avoid double-send: skip if a digest already went out within the
  // minimum interval for this frequency.
  if (pref.last_digest_sent_at) {
    const last = new Date(pref.last_digest_sent_at).getTime();
    const minIntervalMs = {
      daily: 20 * 60 * 60 * 1000,
      weekly: 6 * 86400 * 1000,
      biweekly: 13 * 86400 * 1000,
      monthly: 27 * 86400 * 1000,
    }[pref.digest_frequency as Exclude<DigestFrequency, "never">] || 0;
    if (now.getTime() - last < minIntervalMs) return false;
  }

  // Frequency cadence (we run daily; the per-user cadence is enforced here).
  switch (pref.digest_frequency) {
    case "daily":
      return true;
    case "weekly":
      return local.dow === 1; // Mondays in user tz
    case "biweekly":
      // First and third Monday of month
      return local.dow === 1 && (local.weekIdx === 0 || local.weekIdx === 2);
    case "monthly":
      return local.dom === 1;
    default:
      return false;
  }
}

// ─── Digest builder ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  new_lead_designer: "New leads",
  lead_expiring: "Leads expiring soon",
  lead_response: "Lead responses",
  client_message: "Messages from clients",
  project_milestone: "Project milestones",
  commission_earned: "Commissions",
  new_products: "New products",
  weekly_inspiration: "Curated inspiration",
  founding_circle: "Founding Circle updates",
  product_launch: "Product launches",
  seasonal_campaign: "Seasonal collections",
  reengagement: "Things you might like",
  price_drop: "Price drops",
  back_in_stock: "Back in stock",
  wishlist_update: "Wishlist updates",
};

function buildDigestHtml(
  rows: NotificationRow[],
  frequency: DigestFrequency,
  baseUrl: string,
): string {
  const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
  const SANS =
    "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  const MONO =
    "'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Courier New', monospace";

  // Group by type
  const byType = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    if (!byType.has(row.type)) byType.set(row.type, []);
    byType.get(row.type)!.push(row);
  }

  const sections = Array.from(byType.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, items]) => {
      const label = TYPE_LABELS[type] || type.replace(/_/g, " ");
      const lis = items
        .slice(0, 5)
        .map((it) => {
          const meta = it.metadata ?? {};
          const preview =
            (meta.headline as string) ||
            (meta.subject as string) ||
            (meta.title as string) ||
            (meta.client_name as string) ||
            (meta.product_name as string) ||
            "Update";
          return `<li style="margin:0 0 6px;color:#4B463E;font-family:${SANS};font-size:15px;line-height:1.5;">${escape(
            preview,
          )}</li>`;
        })
        .join("");
      const overflow =
        items.length > 5
          ? `<li style="margin:0;color:#8C8578;font-family:${SANS};font-size:13px;font-style:italic;">+${items.length - 5} more</li>`
          : "";
      return `
        <div style="margin:0 0 24px;">
          <h2 style="color:#1F1B16;font-family:${SERIF};font-size:17px;font-weight:600;letter-spacing:-0.01em;margin:0 0 8px;">${label} <span style="font-family:${MONO};font-size:12px;font-weight:500;color:#8C8578;">(${items.length})</span></h2>
          <ul style="padding-left:18px;margin:0;">${lis}${overflow}</ul>
        </div>
      `;
    })
    .join("");

  const titleByFreq: Record<string, string> = {
    daily: "Your Patina daily digest",
    weekly: "This week on Patina",
    biweekly: "Your bi-weekly Patina recap",
    monthly: "Patina this month",
  };

  const title = titleByFreq[frequency] || "Patina digest";
  const body =
    heading(title) +
    paragraph(`${rows.length} updates since your last digest.`) +
    (sections || paragraph("No new updates.")) +
    spacer(6) +
    ctaButton(baseUrl, "Open Patina") +
    spacer(10) +
    muted(
      `You're receiving the ${frequency} Patina digest. Manage your digest preference in your account settings.`,
    );

  return renderBrandedShell({ title, eyebrow: "This week", body });
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Main loop ──────────────────────────────────────────────────────────

async function dispatchDigests(
  supabase: ReturnType<typeof createClient>,
): Promise<{ scanned: number; sent: number; skipped: number; errors: number }> {
  const stats = { scanned: 0, sent: 0, skipped: 0, errors: 0 };
  const now = new Date();

  // Pull users with non-trivial digest preferences. Page through to handle
  // larger user bases.
  const PAGE = 200;
  let offset = 0;
  while (true) {
    const { data: prefs, error } = await supabase
      .from("notification_preferences")
      .select(
        "user_id, digest_frequency, last_digest_sent_at, timezone, quiet_hours_enabled, quiet_hours_start, quiet_hours_end",
      )
      .neq("digest_frequency", "never")
      .eq("channels_email", true)
      .range(offset, offset + PAGE - 1);

    if (error || !prefs || prefs.length === 0) break;
    stats.scanned += prefs.length;

    for (const raw of prefs as DigestablePreference[]) {
      try {
        if (!isDigestDue(raw, now)) {
          stats.skipped++;
          continue;
        }

        const sinceIso = raw.last_digest_sent_at ?? new Date(0).toISOString();
        const { data: rows } = await supabase
          .from("notification_log")
          .select("id, type, template_id, status, metadata, created_at")
          .eq("user_id", raw.user_id)
          .gt("created_at", sinceIso)
          .in("status", ["delivered", "opened", "clicked", "queued", "sending"])
          .order("created_at", { ascending: false })
          .limit(200);

        const eligible = (rows ?? []).filter(
          (r) => !DIGEST_EXCLUDED_TYPES.has((r as NotificationRow).type),
        ) as NotificationRow[];

        if (eligible.length === 0) {
          // Nothing to digest — still bump the watermark so we don't keep
          // re-checking empty windows.
          await supabase
            .from("notification_preferences")
            .update({ last_digest_sent_at: now.toISOString() })
            .eq("user_id", raw.user_id);
          stats.skipped++;
          continue;
        }

        // Look up email
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, display_name")
          .eq("id", raw.user_id)
          .maybeSingle();
        if (!profile?.email) {
          stats.skipped++;
          continue;
        }

        const html = buildDigestHtml(eligible, raw.digest_frequency, DIGEST_BASE_URL);
        const subject =
          raw.digest_frequency === "daily"
            ? "Your Patina daily digest"
            : raw.digest_frequency === "monthly"
              ? "Patina this month"
              : "Your Patina digest";

        const result = await sendCompliantEmail(supabase, {
          to: profile.email,
          subject,
          html,
          userId: raw.user_id,
          notificationType: "weekly_inspiration",
          category: "engagement",
          templateId: "digest",
          metadata: {
            digest_frequency: raw.digest_frequency,
            item_count: eligible.length,
          },
          unsubscribeBaseUrl: DIGEST_BASE_URL,
        });

        if (result.success) {
          await supabase
            .from("notification_preferences")
            .update({ last_digest_sent_at: now.toISOString() })
            .eq("user_id", raw.user_id);
          stats.sent++;
        } else if (result.suppressed) {
          stats.skipped++;
        } else {
          stats.errors++;
        }
      } catch (err) {
        console.error(
          `[digest-dispatcher] Failed for user ${raw.user_id}:`,
          err instanceof Error ? err.message : err,
        );
        stats.errors++;
      }
    }

    if (prefs.length < PAGE) break;
    offset += PAGE;
  }

  return stats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const stats = await dispatchDigests(supabase);
    console.log(
      `[digest-dispatcher] scanned=${stats.scanned} sent=${stats.sent} skipped=${stats.skipped} errors=${stats.errors}`,
    );
    return new Response(
      JSON.stringify({ success: true, ...stats, checked_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[digest-dispatcher] Fatal error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
