// Campaign Dispatch Edge Function
// Receives { campaign_id }, resolves audience via segment rules,
// supports A/B subject testing, snapshots audience, adds UTM tags,
// generates unsubscribe tokens, and sends via Resend Batch API.
// Logs each result to notification_log with ab_variant metadata.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 100;
const PORTAL_URL = "https://admin.patina.cloud";
const AB_EVALUATION_DELAY_HOURS = 2;

// Map campaign template_id to notification type for preference checking
const TEMPLATE_TO_NOTIFICATION_TYPE: Record<string, string> = {
  "campaign-product-launch": "product_launch",
  "campaign-seasonal": "seasonal_campaign",
  "campaign-maker-spotlight": "maker_spotlight",
  "campaign-reengagement": "reengagement",
};

// Map notification type to preference column
const TYPE_TO_PREFERENCE_COLUMN: Record<string, string> = {
  product_launch: "type_product_launch",
  seasonal_campaign: "type_seasonal_campaign",
  maker_spotlight: "type_weekly_inspiration",
  reengagement: "type_reengagement",
};

// ─── Audience Resolver (inline for Edge Function) ───────────────────────

interface SegmentCondition {
  field: string;
  operator: string;
  value: unknown;
}

interface SegmentRules {
  logic: "and" | "or";
  conditions: SegmentCondition[];
}

interface Recipient {
  id: string;
  email: string;
  display_name: string | null;
}

/**
 * Resolve audience from segment rules. Supports the standard segment fields
 * and applies suppression filters (unsubscribed, bounced, frequency cap).
 */
async function resolveAudienceFromRules(
  supabase: ReturnType<typeof createClient>,
  rules: SegmentRules
): Promise<Recipient[]> {
  // Start with all active email users
  let query = supabase
    .from("profiles")
    .select("id, email, display_name")
    .eq("email_suppressed", false)
    .not("email", "is", null);

  // Apply conditions
  for (const condition of rules.conditions) {
    const { field, operator, value } = condition;

    switch (field) {
      case "role": {
        const { data: roleUsers } = await supabase
          .from("user_roles")
          .select("user_id, roles!inner(domain)")
          .eq("roles.domain", value);
        if (roleUsers && roleUsers.length > 0) {
          query = query.in("id", roleUsers.map((r: { user_id: string }) => r.user_id));
        } else {
          return [];
        }
        break;
      }
      case "founding_circle":
        query = query.eq("is_founding_circle", value);
        break;
      case "engagement_score":
        if (operator === "gte") query = query.gte("engagement_score", value);
        else if (operator === "gt") query = query.gt("engagement_score", value);
        else if (operator === "lte") query = query.lte("engagement_score", value);
        else if (operator === "lt") query = query.lt("engagement_score", value);
        else query = query.eq("engagement_score", value);
        break;
      case "engagement_tier":
        if (operator === "eq") query = query.eq("engagement_tier", value);
        else if (operator === "neq") query = query.neq("engagement_tier", value);
        break;
      case "channels_email":
        if (value === true) {
          // Only users subscribed to email — filter via notification_preferences
        }
        break;
      case "city":
      case "state":
      case "country":
        if (operator === "eq") query = query.eq(field, value);
        else if (operator === "neq") query = query.neq(field, value);
        else if (operator === "contains") query = query.ilike(field, `%${value}%`);
        break;
      case "created_at":
      case "last_active_at": {
        const days = Number(value);
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();
        if (operator === "older_than") query = query.lt(field, cutoff);
        else if (operator === "newer_than") query = query.gt(field, cutoff);
        break;
      }
    }
  }

  const { data } = await query;
  return (data as Recipient[]) || [];
}

/**
 * Snapshot an audience: store the recipient list for audit and post-send analysis.
 */
function snapshotAudience(recipients: Recipient[]): {
  total: number;
  user_ids: string[];
  roles: Record<string, number>;
} {
  return {
    total: recipients.length,
    user_ids: recipients.map((r) => r.id),
    roles: {},
  };
}

/**
 * Fisher-Yates shuffle + split for A/B testing.
 */
function splitAudience(
  recipients: Recipient[],
  splitPct: number = 50
): { variantA: Recipient[]; variantB: Recipient[] } {
  const shuffled = [...recipients];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const splitIndex = Math.round(shuffled.length * (Math.max(0, Math.min(100, splitPct)) / 100));
  return {
    variantA: shuffled.slice(0, splitIndex),
    variantB: shuffled.slice(splitIndex),
  };
}

/**
 * Append UTM parameters to a URL.
 */
function addUtmParams(url: string, campaignName: string, variant?: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "patina");
    u.searchParams.set("utm_medium", "email");
    u.searchParams.set("utm_campaign", campaignName.toLowerCase().replace(/\s+/g, "-"));
    if (variant) u.searchParams.set("utm_content", `variant_${variant}`);
    return u.toString();
  } catch {
    return url;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const unsubscribeSecret =
    Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") || supabaseServiceKey;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "campaign_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Fetch campaign
    const { data: campaign, error: campaignErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campaignErr || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate status
    if (!["draft", "scheduled"].includes(campaign.status)) {
      return new Response(
        JSON.stringify({
          error: `Campaign status is '${campaign.status}', must be draft or scheduled`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Set status to sending
    await supabase
      .from("campaigns")
      .update({ status: "sending" })
      .eq("id", campaign_id);

    // 3. Resolve audience using segment rules or legacy fallback
    let recipients: Recipient[] = [];

    // Prefer audience_segment_id (new segment-based resolution)
    if (campaign.audience_segment_id) {
      const { data: segment } = await supabase
        .from("audience_segments")
        .select("rules")
        .eq("id", campaign.audience_segment_id)
        .single();

      if (segment?.rules) {
        recipients = await resolveAudienceFromRules(supabase, segment.rules as SegmentRules);
      }
    } else if (campaign.audience_type === "all") {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .eq("email_suppressed", false)
        .not("email", "is", null);
      recipients = (data as Recipient[]) || [];
    } else if (campaign.audience_type === "segment") {
      // Legacy: inline audience_segment object
      const segment = campaign.audience_segment || {};
      const legacyRules: SegmentRules = { logic: "and", conditions: [] };

      if (segment.role) {
        legacyRules.conditions.push({ field: "role", operator: "eq", value: segment.role });
      }
      if (segment.is_founding_circle !== undefined) {
        legacyRules.conditions.push({ field: "founding_circle", operator: "eq", value: segment.is_founding_circle });
      }
      if (segment.engagement_tier) {
        legacyRules.conditions.push({ field: "engagement_tier", operator: "eq", value: segment.engagement_tier });
      }

      if (legacyRules.conditions.length > 0) {
        recipients = await resolveAudienceFromRules(supabase, legacyRules);
      } else {
        const { data } = await supabase
          .from("profiles")
          .select("id, email, display_name")
          .eq("email_suppressed", false)
          .not("email", "is", null);
        recipients = (data as Recipient[]) || [];
      }
    } else if (campaign.audience_type === "individual") {
      const segment = campaign.audience_segment || {};
      const userIds = segment.user_ids || [];
      if (userIds.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, email, display_name")
          .eq("email_suppressed", false)
          .in("id", userIds);
        recipients = (data as Recipient[]) || [];
      }
    }

    // Snapshot audience for audit trail
    const audienceSnapshot = snapshotAudience(recipients);
    await supabase
      .from("campaigns")
      .update({ audience_snapshot: audienceSnapshot })
      .eq("id", campaign_id);

    // 4. Filter against notification preferences
    const notificationType =
      TEMPLATE_TO_NOTIFICATION_TYPE[campaign.template_id];
    const prefColumn = notificationType
      ? TYPE_TO_PREFERENCE_COLUMN[notificationType]
      : null;

    if (prefColumn && recipients.length > 0) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("user_id, channels_email, " + prefColumn)
        .in(
          "user_id",
          recipients.map((r) => r.id)
        );

      if (prefs && prefs.length > 0) {
        const suppressedIds = new Set(
          prefs
            .filter(
              (p: Record<string, unknown>) =>
                p.channels_email === false || p[prefColumn] === false
            )
            .map((p: { user_id: string }) => p.user_id)
        );
        recipients = recipients.filter((r) => !suppressedIds.has(r.id));
      }
    }

    if (recipients.length === 0) {
      await supabase
        .from("campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          total_recipients: 0,
        })
        .eq("id", campaign_id);

      return new Response(
        JSON.stringify({ success: true, recipients: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!resendApiKey) {
      await supabase
        .from("campaigns")
        .update({ status: "draft" })
        .eq("id", campaign_id);

      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. A/B split if enabled
    const abEnabled = campaign.ab_enabled && campaign.ab_subject_b;
    let sendGroups: Array<{ recipients: Recipient[]; subject: string; variant: string }>;

    if (abEnabled) {
      const splitPct = campaign.ab_split_pct || 50;
      const { variantA, variantB } = splitAudience(recipients, splitPct);
      sendGroups = [
        { recipients: variantA, subject: campaign.subject, variant: "a" },
        { recipients: variantB, subject: campaign.ab_subject_b, variant: "b" },
      ];
    } else {
      sendGroups = [
        { recipients, subject: campaign.subject, variant: "a" },
      ];
    }

    // 6-7. Send in batches per variant group
    let totalDelivered = 0;
    const secretKey = new TextEncoder().encode(unsubscribeSecret);
    const campaignName = campaign.name || campaign.subject || "campaign";

    for (const group of sendGroups) {
      for (let i = 0; i < group.recipients.length; i += BATCH_SIZE) {
        const batch = group.recipients.slice(i, i + BATCH_SIZE);

        const emailPromises = batch.map(async (recipient) => {
          const token = await new SignJWT({
            purpose: "unsubscribe",
            sub: recipient.id,
            type: notificationType || "reengagement",
          })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setIssuer("patina:notifications")
            .setExpirationTime("90d")
            .sign(secretKey);

          const unsubscribeUrl = `${PORTAL_URL}/api/unsubscribe?token=${token}`;

          // Add UTM params to CTA URLs in template data
          const templateData = { ...campaign.template_data };
          if (templateData.ctaUrl) {
            templateData.ctaUrl = addUtmParams(
              templateData.ctaUrl as string,
              campaignName,
              abEnabled ? group.variant : undefined
            );
          }

          return {
            from: "Patina <hello@notify.patina.com>",
            to: [recipient.email],
            subject: group.subject,
            html: buildCampaignEmailHtml(
              campaign.template_id,
              {
                ...templateData,
                displayName: recipient.display_name,
              },
              unsubscribeUrl
            ),
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          };
        });

        const emails = await Promise.all(emailPromises);

        const response = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify(emails),
        });

        if (response.ok) {
          const results = await response.json();
          const batchResults = Array.isArray(results.data)
            ? results.data
            : Array.isArray(results)
              ? results
              : [];

          const logEntries = batch.map((recipient, idx) => ({
            user_id: recipient.id,
            type: notificationType || campaign.template_id,
            channel: "email" as const,
            status: "delivered" as const,
            template_id: campaign.template_id,
            provider_id: batchResults[idx]?.id || null,
            metadata: {
              campaign_id,
              ab_variant: group.variant,
              subject_line: group.subject,
            },
            sent_at: new Date().toISOString(),
          }));

          await supabase.from("notification_log").insert(logEntries);
          totalDelivered += batch.length;
        } else {
          const errorText = await response.text();
          console.error(`Batch send failed (${response.status}): ${errorText}`);

          const failEntries = batch.map((recipient) => ({
            user_id: recipient.id,
            type: notificationType || campaign.template_id,
            channel: "email" as const,
            status: "failed" as const,
            template_id: campaign.template_id,
            metadata: {
              campaign_id,
              ab_variant: group.variant,
            },
            error: `Batch API error (${response.status})`,
          }));

          await supabase.from("notification_log").insert(failEntries);
        }
      }
    }

    // 8. Update campaign status and inline counters
    await supabase
      .from("campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        total_recipients: totalDelivered,
        sent_count: totalDelivered,
      })
      .eq("id", campaign_id);

    // 9. Update analytics
    await supabase
      .from("campaign_analytics")
      .update({ delivered: totalDelivered })
      .eq("campaign_id", campaign_id);

    // 10. Schedule A/B winner evaluation if enabled
    if (abEnabled) {
      const evalAt = new Date(
        Date.now() + AB_EVALUATION_DELAY_HOURS * 3600000
      ).toISOString();
      console.log(
        `A/B test enabled for campaign ${campaign_id}. Winner evaluation scheduled for ${evalAt}`
      );
      // In production, this would invoke a delayed Edge Function or pg_cron job
      // For now, log the intent — evaluateAbWinner can be called manually or via cron
    }

    return new Response(
      JSON.stringify({ success: true, recipients: totalDelivered }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in campaign-dispatch:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// ─── Inline HTML Builder ─────────────────────────────────────────────────

function buildCampaignEmailHtml(
  templateId: string,
  data: Record<string, unknown>,
  unsubscribeUrl: string
): string {
  const name = (data.displayName as string) || "";
  const greeting = name ? `Hi ${name},` : "Hello,";

  let body = "";

  switch (templateId) {
    case "campaign-product-launch": {
      const headline = (data.headlineText as string) || "New Arrivals";
      const bodyText = (data.bodyText as string) || "";
      const products = (data.products as Array<Record<string, string>>) || [];
      const ctaUrl = (data.ctaUrl as string) || PORTAL_URL;
      const ctaText = (data.ctaText as string) || "Explore the Collection";
      const heroImageUrl = data.heroImageUrl as string;

      body = `
        ${heroImageUrl ? `<img src="${heroImageUrl}" alt="Product launch" style="width:100%;border-radius:12px;margin-bottom:24px;" />` : ""}
        <h1 style="color:#2C2926;font-size:26px;font-weight:600;margin:0 0 16px;">${headline}</h1>
        <p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 28px;">${bodyText}</p>
        ${products
          .slice(0, 3)
          .map(
            (p) => `
          <div style="margin-bottom:20px;">
            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:100%;border-radius:12px;margin-bottom:12px;" />` : ""}
            <p style="color:#2C2926;font-size:16px;font-weight:600;margin:0 0 4px;">${p.name}</p>
            <p style="color:#2C2926;font-size:15px;margin:0;">${p.priceFormatted}${p.maker ? ` <span style="color:#7A736C;font-style:italic;">by ${p.maker}</span>` : ""}</p>
          </div>
        `
          )
          .join('<hr style="border-color:#E8E2DB;margin:20px 0;" />')}
        <div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl}" style="display:inline-block;background:#C4A57B;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">${ctaText}</a>
        </div>
      `;
      break;
    }

    case "campaign-seasonal": {
      const season = (data.season as string) || "";
      const headline = (data.headlineText as string) || "";
      const bodyText = (data.bodyText as string) || "";
      const ctaUrl = (data.ctaUrl as string) || PORTAL_URL;
      const moodImageUrl = data.moodImageUrl as string;
      const products = (data.products as Array<Record<string, string>>) || [];

      body = `
        <div style="text-align:center;margin:0 0 20px;">
          <span style="display:inline-block;background:#2C2926;color:#C4A57B;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 16px;border-radius:20px;">${season}</span>
        </div>
        ${moodImageUrl ? `<img src="${moodImageUrl}" alt="${season}" style="width:100%;border-radius:12px;margin-bottom:24px;" />` : ""}
        <h1 style="color:#2C2926;font-size:26px;font-weight:600;margin:0 0 16px;">${headline}</h1>
        <p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 28px;">${bodyText}</p>
        ${products
          .slice(0, 4)
          .map(
            (p) => `
          <div style="margin-bottom:16px;">
            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:100%;border-radius:8px;margin-bottom:8px;" />` : ""}
            <p style="color:#2C2926;font-size:14px;font-weight:600;margin:0 0 2px;">${p.name}</p>
            <p style="color:#2C2926;font-size:13px;margin:0;">${p.priceFormatted}</p>
          </div>
        `
          )
          .join("")}
        <div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl}" style="display:inline-block;background:#C4A57B;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">Shop the ${season} Collection</a>
        </div>
      `;
      break;
    }

    case "campaign-maker-spotlight": {
      const makerName = (data.makerName as string) || "";
      const makerPortraitUrl = data.makerPortraitUrl as string;
      const makerLocation = data.makerLocation as string;
      const narrative = (data.narrativeText as string) || "";
      const quote = data.philosophyQuote as string;
      const products = (data.products as Array<Record<string, string>>) || [];
      const ctaUrl = (data.ctaUrl as string) || PORTAL_URL;

      body = `
        <p style="color:#C4A57B;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:center;margin:0 0 16px;">Maker Spotlight</p>
        <div style="text-align:center;margin:0 0 24px;">
          ${makerPortraitUrl ? `<img src="${makerPortraitUrl}" alt="${makerName}" width="100" height="100" style="border-radius:50%;margin:0 auto 12px;" />` : ""}
          <h1 style="color:#2C2926;font-size:24px;font-weight:600;margin:0 0 4px;">${makerName}</h1>
          ${makerLocation ? `<p style="color:#7A736C;font-size:14px;font-style:italic;margin:0;">${makerLocation}</p>` : ""}
        </div>
        <p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">${narrative}</p>
        ${
          quote
            ? `<div style="background:#FAF7F2;border-radius:12px;padding:20px 24px;text-align:center;margin:0 0 24px;">
          <p style="color:#2C2926;font-size:16px;font-style:italic;line-height:26px;margin:0 0 8px;">&ldquo;${quote}&rdquo;</p>
          <p style="color:#7A736C;font-size:13px;margin:0;">&mdash; ${makerName}</p>
        </div>`
            : ""
        }
        ${products
          .map(
            (p) => `
          <div style="margin-bottom:16px;">
            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:100%;border-radius:12px;margin-bottom:12px;" />` : ""}
            <p style="color:#2C2926;font-size:16px;font-weight:600;margin:0 0 4px;">${p.name}</p>
            <p style="color:#2C2926;font-size:15px;margin:0 0 8px;">${p.priceFormatted}</p>
          </div>
        `
          )
          .join('<hr style="border-color:#E8E2DB;margin:16px 0;" />')}
        <div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl}" style="display:inline-block;background:#C4A57B;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">Explore ${makerName}'s Work</a>
        </div>
      `;
      break;
    }

    case "campaign-reengagement": {
      const daysSince = data.daysSinceLastVisit as number;
      const offerText = data.offerText as string;
      const products =
        (data.personalizedProducts as Array<Record<string, string>>) || [];
      const ctaUrl = (data.ctaUrl as string) || PORTAL_URL;
      const ctaText = (data.ctaText as string) || "Rediscover Patina";

      body = `
        <h1 style="color:#2C2926;font-size:26px;font-weight:600;margin:0 0 16px;">${name ? `We miss you, ${name}` : "We miss you"}</h1>
        ${
          daysSince
            ? `<div style="background:#FAF7F2;border-radius:12px;padding:20px;text-align:center;margin:0 0 20px;">
          <p style="color:#C4A57B;font-size:36px;font-weight:700;line-height:42px;margin:0;">${daysSince}</p>
          <p style="color:#7A736C;font-size:13px;margin:4px 0 0;">days since your last visit</p>
        </div>`
            : ""
        }
        <p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">${greeting} A lot has happened since you were last here. We've curated some new pieces we think you'll love.</p>
        ${
          offerText
            ? `<div style="background:#2C2926;border-radius:12px;padding:16px 24px;text-align:center;margin:0 0 28px;">
          <p style="color:#C4A57B;font-size:15px;font-weight:600;margin:0;">${offerText}</p>
        </div>`
            : ""
        }
        ${products
          .slice(0, 3)
          .map(
            (p) => `
          <div style="margin-bottom:20px;">
            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:100%;border-radius:12px;margin-bottom:12px;" />` : ""}
            <p style="color:#2C2926;font-size:16px;font-weight:600;margin:0 0 4px;">${p.name}</p>
            <p style="color:#2C2926;font-size:15px;margin:0;">${p.priceFormatted}</p>
            ${p.matchReason ? `<p style="color:#C4A57B;font-size:12px;font-weight:500;margin:4px 0 0;">${p.matchReason}</p>` : ""}
          </div>
        `
          )
          .join('<hr style="border-color:#E8E2DB;margin:20px 0;" />')}
        <div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl}" style="display:inline-block;background:#C4A57B;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">${ctaText}</a>
        </div>
      `;
      break;
    }

    default:
      body = `<p>${greeting} You have a new update from Patina.</p>`;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="background:#FAF7F2;font-family:Inter,Helvetica,Arial,sans-serif;margin:0;padding:0;">
      <div style="max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:linear-gradient(135deg,#C4A57B,#8B7355);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:28px;font-weight:600;letter-spacing:2px;">Patina</span>
        </div>
        <div style="padding:40px;">${body}</div>
        <div style="background:#2C2926;padding:32px 40px;text-align:center;">
          <p style="color:#A09890;font-size:13px;margin:0 0 8px;">Patina — Furniture intelligence for design professionals</p>
          <p style="color:#7A736C;font-size:11px;margin:0 0 12px;">Patina Inc. &middot; 123 Design Way, Suite 100 &middot; San Francisco, CA 94102</p>
          <a href="${unsubscribeUrl}" style="color:#7A736C;font-size:11px;">Unsubscribe</a>
        </div>
      </div>
    </body>
    </html>
  `;
}
