-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Seed pre-rendered HTML for transactional & engagement templates
-- Description: Populates email_templates.html_content + subject_default with
--              Patina-branded HTML and {{mustache}} placeholders. Edge
--              functions interpolate at send time via _shared/render-template.ts.
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: standard email skeleton (shared across all templates)
-- Inlined per template below to keep this migration self-contained and
-- Deno-free. Admins can override per-template via the builder UI, which
-- writes to the same html_content column.

-- ─── welcome-verification ─────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Welcome to Patina — Verify your email',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Welcome to Patina</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F1ED;"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:600;line-height:32px;margin:0 0 16px;">Welcome{{displayNameComma}}</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 16px;">We're delighted you're here. Patina connects you with exceptional furniture — pieces with character, craftsmanship, and stories worth telling.</p>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">Verify your email to unlock your account and start building your curated collection.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;"><tr><td align="center" style="border-radius:100px;background:#A3927C;"><a href="{{verificationUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px;">Verify My Email</a></td></tr></table>
<p style="color:#7A736C;font-size:13px;line-height:20px;margin:24px 0 0;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;">
<p style="color:#A09890;font-size:13px;margin:0 0 8px;">Patina — Furniture intelligence for design professionals</p>
<p style="color:#7A736C;font-size:11px;margin:0;">Patina Inc. · San Francisco, CA</p>
</td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'welcome-verification';

-- ─── password-reset ───────────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Reset your Patina password',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Reset your password</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F1ED;"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:600;margin:0 0 16px;">Reset your password</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 16px;">Hi {{displayName}},</p>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">We received a request to reset your Patina password. Click below to choose a new one.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;"><tr><td align="center" style="border-radius:100px;background:#A3927C;"><a href="{{resetUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">Reset Password</a></td></tr></table>
<p style="color:#7A736C;font-size:13px;line-height:20px;margin:24px 0 0;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password will stay the same.</p>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'password-reset';

-- ─── security-alert ───────────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Security alert for your Patina account',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Security alert</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<div style="background:#FDF2E9;border-left:4px solid #C45B4A;padding:16px 20px;border-radius:6px;margin:0 0 24px;"><p style="color:#C45B4A;font-size:13px;font-weight:600;margin:0;letter-spacing:0.5px;text-transform:uppercase;">Security Alert</p></div>
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:600;margin:0 0 16px;">New sign-in detected</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 16px;">Hi {{displayName}},</p>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 16px;">{{alertDescription}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2;border-radius:8px;margin:16px 0 24px;"><tr><td style="padding:16px 20px;">
<p style="color:#7A736C;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Device</p>
<p style="color:#2C2926;font-size:14px;margin:0 0 12px;">{{deviceInfo}}</p>
<p style="color:#7A736C;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Location</p>
<p style="color:#2C2926;font-size:14px;margin:0;">{{location}}</p>
</td></tr></table>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">If this wasn't you, secure your account immediately.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" style="border-radius:100px;background:#C45B4A;"><a href="{{secureAccountUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">Secure My Account</a></td></tr></table>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'security-alert';

-- ─── order-confirmation ───────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Order confirmed — {{orderNumber}}',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Order confirmed</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<p style="color:#A3927C;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;">Order Confirmed</p>
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:600;margin:0 0 16px;">Thank you, {{displayName}}</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">Your order <strong>{{orderNumber}}</strong> is being prepared. We'll let you know as each piece begins its journey to you.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2;border-radius:8px;margin:0 0 24px;"><tr><td style="padding:20px 24px;">
<p style="color:#7A736C;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Order Total</p>
<p style="color:#2C2926;font-size:20px;font-weight:600;margin:0 0 12px;">{{totalFormatted}}</p>
<p style="color:#7A736C;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Shipping to</p>
<p style="color:#2C2926;font-size:14px;margin:0;">{{shippingAddress}}</p>
</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" style="border-radius:100px;background:#A3927C;"><a href="{{orderUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">View Order</a></td></tr></table>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'order-confirmation';

-- ─── payment-receipt ──────────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Payment receipt — {{amountFormatted}}',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Payment receipt</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<p style="color:#A3927C;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;">Payment Receipt</p>
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:600;margin:0 0 16px;">{{amountFormatted}}</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">Hi {{displayName}}, your payment for order {{orderNumber}} has been received.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2;border-radius:8px;margin:0 0 24px;"><tr><td style="padding:20px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:4px 0;color:#7A736C;font-size:13px;">Paid on</td><td align="right" style="padding:4px 0;color:#2C2926;font-size:13px;">{{paidAt}}</td></tr>
<tr><td style="padding:4px 0;color:#7A736C;font-size:13px;">Card</td><td align="right" style="padding:4px 0;color:#2C2926;font-size:13px;">{{cardBrand}} •••• {{cardLast4}}</td></tr>
<tr><td style="padding:4px 0;color:#7A736C;font-size:13px;">Transaction</td><td align="right" style="padding:4px 0;color:#2C2926;font-size:13px;font-family:monospace;">{{paymentIntentId}}</td></tr>
</table>
</td></tr></table>
<p style="color:#7A736C;font-size:13px;line-height:20px;margin:0;">Keep this receipt for your records. Questions? Reply to this email.</p>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'payment-receipt';

-- ─── client-confirmation ──────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Your Patina consultation request is confirmed',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Consultation confirmed</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:600;margin:0 0 16px;">Request received, {{displayName}}</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 16px;">We've sent your consultation request to <strong>{{designerName}}</strong>. You'll hear back within {{expectedResponseTime}}.</p>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">While you wait, you can browse curated collections and save pieces you love to your project.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" style="border-radius:100px;background:#A3927C;"><a href="{{projectUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">View My Project</a></td></tr></table>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'client-confirmation';

-- ─── new-lead-designer ────────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'New lead: {{clientName}} is interested',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>New lead</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<p style="color:#A3927C;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;">New Lead</p>
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:600;margin:0 0 16px;">{{clientName}} wants to work with you</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">Hi {{designerName}}, a new client has requested a consultation.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2;border-radius:8px;margin:0 0 24px;"><tr><td style="padding:20px 24px;">
<p style="color:#7A736C;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Project type</p>
<p style="color:#2C2926;font-size:15px;font-weight:500;margin:0 0 12px;">{{projectType}}</p>
<p style="color:#7A736C;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Timeline</p>
<p style="color:#2C2926;font-size:15px;margin:0 0 12px;">{{timeline}}</p>
<p style="color:#7A736C;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Budget</p>
<p style="color:#2C2926;font-size:15px;margin:0;">{{budget}}</p>
</td></tr></table>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 8px;"><strong>Respond within 24 hours</strong> to claim this lead. After that, it may be shared with other designers.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;"><tr><td align="center" style="border-radius:100px;background:#A3927C;"><a href="{{leadUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">Review Lead</a></td></tr></table>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'new-lead-designer';

-- ─── lead-expiring ────────────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Action needed: Lead from {{clientName}} expires in {{hoursRemaining}}h',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Lead expiring</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<div style="background:#FDF2E9;border-left:4px solid #E59844;padding:16px 20px;border-radius:6px;margin:0 0 24px;"><p style="color:#B36800;font-size:13px;font-weight:600;margin:0;letter-spacing:0.5px;text-transform:uppercase;">Expires in {{hoursRemaining}} hours</p></div>
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:600;margin:0 0 16px;">Don't lose this lead</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">Hi {{designerName}}, {{clientName}}'s request is about to expire. Respond now to claim this project.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" style="border-radius:100px;background:#A3927C;"><a href="{{leadUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">Respond Now</a></td></tr></table>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'lead-expiring';

-- ─── price-drop ───────────────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Price drop: {{productName}}',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Price drop</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<p style="color:#2A9D5F;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;">Price Drop</p>
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:600;margin:0 0 16px;">{{productName}} is now {{newPriceFormatted}}</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">Hi {{displayName}}, a piece you've been watching just dropped from <span style="text-decoration:line-through;color:#7A736C;">{{oldPriceFormatted}}</span> to <strong style="color:#2A9D5F;">{{newPriceFormatted}}</strong> — a {{percentOff}}% savings.</p>
{{productImageTag}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;"><tr><td align="center" style="border-radius:100px;background:#A3927C;"><a href="{{productUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">View Product</a></td></tr></table>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'price-drop';

-- ─── back-in-stock ────────────────────────────────────────────────────────
UPDATE email_templates SET
  subject_default = 'Back in stock: {{productName}}',
  html_content = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Back in stock</title></head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
<tr><td style="background:#3C3226;padding:28px 40px;text-align:center;"><span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span></td></tr>
<tr><td style="padding:40px;">
<p style="color:#A3927C;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;">Back In Stock</p>
<h1 style="color:#2C2926;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:600;margin:0 0 16px;">{{productName}} is available again</h1>
<p style="color:#4A453F;font-size:15px;line-height:24px;margin:0 0 24px;">Hi {{displayName}}, a piece you were interested in is ready to ship. Limited quantities — act quickly.</p>
{{productImageTag}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;"><tr><td align="center" style="border-radius:100px;background:#A3927C;"><a href="{{productUrl}}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">Shop Now</a></td></tr></table>
</td></tr>
<tr><td style="background:#2C2926;padding:24px 40px;text-align:center;"><p style="color:#A09890;font-size:13px;margin:0;">Patina — hello@patina.cloud</p></td></tr>
</table></td></tr></table></body></html>$HTML$
WHERE slug = 'back-in-stock';
