-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Seed email_templates for in-app messaging
-- Spec: docs/prds/in-app-messaging-prd.md §11
-- Description:
--   Inserts two rows into email_templates so renderTemplateFromDb returns
--   real HTML for the in-app messaging notification types instead of falling
--   through to the inline string builder in notification-dispatch.
--
--   The HTML mirrors packages/email/src/templates/in-app-message.tsx and uses
--   {{variable}} substitution with values produced by
--   supabase/functions/comms-notification-dispatch (camelCase keys).
--
--   Pre-computed slots from the dispatch:
--     {{senderName}}      — display name (already HTML-escaped where needed)
--     {{previewBody}}     — message body, ≤ 200 chars (escaped)
--     {{headline}}        — "X mentioned you" / "X sent you a message"
--     {{contextSubtitle}} — "In your project: …" / "Vendor brief — …" / etc.
--     {{ctaLabel}}        — "See the mention" / "Open conversation"
--     {{deepLink}}        — absolute URL to the thread (role-resolved)
--     {{avatarHtml}}      — pre-rendered <img> or initials <div>
--     {{muteFooterHtml}}  — full footer block, empty string if no mute URL
--
--   Idempotent via ON CONFLICT (slug). Reapplying refreshes the html_content,
--   which is the right behavior — the DB row is the deployment artifact.
-- ═══════════════════════════════════════════════════════════════════════════

-- The mention variant uses warmer accent colors (Clay) and a stronger headline
-- color. The plain variant uses charcoal. Both share the same overall layout.

INSERT INTO public.email_templates (slug, name, description, category, subject_default, html_content, is_active)
VALUES
(
  'in-app-message',
  'In-app message — new',
  'Sent when a user receives a non-mention message in a thread (after eligibility + 5-min coalescing).',
  'transactional',
  'New message from {{senderName}}',
  $HTML$
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>New message from {{senderName}}</title>
</head>
<body style="background:#FAF7F2;font-family:Inter,Helvetica,Arial,sans-serif;margin:0;padding:0;color:#2C2926;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#FAF7F2;">
    <tr><td>
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;">
        <tr><td style="background:linear-gradient(135deg,#C4A57B,#8B7355);padding:32px 40px;text-align:center;">
          <span style="color:#FFFFFF;font-size:28px;font-weight:600;letter-spacing:2px;">Patina</span>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#7A736C;font-size:13px;margin:0 0 4px 0;letter-spacing:0.02em;">Hi {{displayName}},</p>
          <h1 style="color:#2C2926;font-size:22px;font-weight:600;line-height:28px;margin:0 0 4px 0;font-family:Georgia,'Playfair Display',serif;">{{headline}}</h1>
          <p style="color:#7A736C;font-size:13px;margin:0 0 20px 0;font-style:italic;">{{contextSubtitle}}</p>
          <div style="background:#FAF7F2;border-radius:12px;border:1px solid #EEE6DB;padding:16px;margin:0 0 24px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:48px;vertical-align:top;padding-right:12px;">{{avatarHtml}}</td>
                <td style="vertical-align:top;">
                  <p style="color:#2C2926;font-size:13px;font-weight:600;margin:0 0 4px 0;">{{senderName}}</p>
                  <p style="color:#3A3530;font-size:15px;line-height:22px;margin:0;white-space:pre-wrap;">{{previewBody}}</p>
                </td>
              </tr>
            </table>
          </div>
          <div style="margin:0 0 24px 0;text-align:center;">
            <a href="{{deepLink}}" style="display:inline-block;background:#C4A57B;color:#FFFFFF;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">{{ctaLabel}}</a>
          </div>
          {{muteFooterHtml}}
        </td></tr>
        <tr><td style="background:#2C2926;padding:32px 40px;text-align:center;">
          <p style="color:#A09890;font-size:13px;margin:0 0 8px;">Patina — Furniture intelligence for design professionals</p>
          <p style="color:#7A736C;font-size:11px;margin:0;">Patina Inc. · 123 Design Way, Suite 100 · San Francisco, CA 94102</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
$HTML$,
  TRUE
),
(
  'in-app-message-mention',
  'In-app message — @-mention',
  'Sent when a user is @-mentioned in a thread. Higher priority + warmer styling than the plain variant.',
  'transactional',
  '{{senderName}} mentioned you in Patina',
  $HTML$
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{{senderName}} mentioned you</title>
</head>
<body style="background:#FAF7F2;font-family:Inter,Helvetica,Arial,sans-serif;margin:0;padding:0;color:#2C2926;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#FAF7F2;">
    <tr><td>
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;">
        <tr><td style="background:linear-gradient(135deg,#C4A57B,#8B7355);padding:32px 40px;text-align:center;">
          <span style="color:#FFFFFF;font-size:28px;font-weight:600;letter-spacing:2px;">Patina</span>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#7A736C;font-size:13px;margin:0 0 4px 0;letter-spacing:0.02em;">Hi {{displayName}},</p>
          <h1 style="color:#A56A3F;font-size:22px;font-weight:600;line-height:28px;margin:0 0 4px 0;font-family:Georgia,'Playfair Display',serif;">{{headline}}</h1>
          <p style="color:#7A736C;font-size:13px;margin:0 0 20px 0;font-style:italic;">{{contextSubtitle}}</p>
          <div style="background:#FBF3EA;border-radius:12px;border:1px solid #E5D2BB;padding:16px;margin:0 0 24px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:48px;vertical-align:top;padding-right:12px;">{{avatarHtml}}</td>
                <td style="vertical-align:top;">
                  <p style="color:#2C2926;font-size:13px;font-weight:600;margin:0 0 4px 0;">{{senderName}}</p>
                  <p style="color:#3A3530;font-size:15px;line-height:22px;margin:0;white-space:pre-wrap;">{{previewBody}}</p>
                </td>
              </tr>
            </table>
          </div>
          <div style="margin:0 0 24px 0;text-align:center;">
            <a href="{{deepLink}}" style="display:inline-block;background:#A56A3F;color:#FFFFFF;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">{{ctaLabel}}</a>
          </div>
          {{muteFooterHtml}}
        </td></tr>
        <tr><td style="background:#2C2926;padding:32px 40px;text-align:center;">
          <p style="color:#A09890;font-size:13px;margin:0 0 8px;">Patina — Furniture intelligence for design professionals</p>
          <p style="color:#7A736C;font-size:11px;margin:0;">Patina Inc. · 123 Design Way, Suite 100 · San Francisco, CA 94102</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
$HTML$,
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  category         = EXCLUDED.category,
  subject_default  = EXCLUDED.subject_default,
  html_content     = EXCLUDED.html_content,
  is_active        = EXCLUDED.is_active,
  updated_at       = now();

COMMENT ON COLUMN public.email_templates.html_content IS
  'Static HTML with {{var}} substitution. Variables come from the dispatch fn data payload — pre-compute display HTML there to keep templates pure substitution.';
