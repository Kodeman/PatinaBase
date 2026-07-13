// Branded email shell for Supabase Edge Functions (Deno).
//
// The Deno runtime cannot import @patina/email, so this is a standalone copy of
// the Patina email design system, mirroring the canonical hand-authored shell
// at packages/email/branded/welcome.html — keep it in step with that file and
// with packages/email/src/components/brand.ts.
//
// Inline edge builders (invoice/po/quote/proposal/decision/digest/…) compose a
// body with the helpers below and wrap it in renderBrandedShell().

const C = {
  paper: "#F5F0E6",
  card: "#FCF9F2",
  cardAlt: "#FFFFFF",
  line: "#E6DDCC",
  ink: "#1F1B16",
  ink2: "#4B463E",
  ink3: "#8C8578",
  verd: "#4E7A66",
  brass: "#B08A46",
  brassBorder: "#8A6A30",
  rust: "#A24E2E",
  buttonInkText: "#F5F0E6",
};
const F = {
  serif: "'Fraunces', Georgia, 'Times New Roman', serif",
  sans:
    "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Courier New', monospace",
};
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

const HEAD_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
html, body { margin:0 !important; padding:0 !important; height:100% !important; width:100% !important; }
* { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
table, td { mso-table-lspace:0pt !important; mso-table-rspace:0pt !important; border-collapse:collapse !important; }
img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
a { text-decoration:none; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
.btn a:hover, .btn:hover td { opacity:0.90 !important; }
@media screen and (max-width:620px) {
  .container { width:100% !important; }
  .px { padding-left:24px !important; padding-right:24px !important; }
  .h1 { font-size:27px !important; line-height:1.18 !important; }
}
@media (prefers-color-scheme: dark) {
  body, .bg, .bg td { background:#14110D !important; }
  .card { background:#221E17 !important; border-color:#3B342A !important; }
  .shell { background:#1B1712 !important; border-color:#332D24 !important; }
  .ink { color:#F2EBDD !important; }
  .ink2 { color:#D4CCBB !important; }
  .ink3 { color:#9C9484 !important; }
  .wordmark { color:#F2EBDD !important; }
  .hairbg { background:#3B342A !important; }
  .chip { background:#221E17 !important; border-color:#3B342A !important; }
}`.trim();

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function portalBase(): string {
  // Defensive: env access may be denied (e.g. `deno test` without --allow-env);
  // fall back to the prod URL rather than throwing a permission error.
  let v: string | undefined;
  try {
    v = Deno.env.get("DESIGNER_PORTAL_URL");
  } catch {
    v = undefined;
  }
  return (v ?? "https://app.patina.cloud").replace(/\/$/, "");
}

// ---- Body helpers (compose the inner content) -------------------------------

/** Green mono kicker above the headline. */
export function kicker(text: string): string {
  return `<div style="font-family:${F.mono}; font-size:11px; font-weight:500; letter-spacing:0.16em; text-transform:uppercase; color:${C.verd}; margin:6px 0 14px;">${escapeHtml(text)}</div>`;
}

/** Fraunces headline. */
export function heading(text: string): string {
  return `<h1 class="h1 ink" style="margin:0 0 16px; font-family:${F.serif}; font-size:31px; font-weight:600; line-height:1.16; letter-spacing:-0.015em; color:${C.ink};">${escapeHtml(text)}</h1>`;
}

/** Hanken body paragraph. `html` is inserted as-is (caller escapes user data). */
export function paragraph(html: string): string {
  return `<p class="ink2" style="margin:0 0 16px; font-family:${F.sans}; font-size:16px; line-height:1.62; color:${C.ink2};">${html}</p>`;
}

/** Muted small print. */
export function muted(html: string): string {
  return `<p class="ink3" style="margin:0 0 12px; font-family:${F.sans}; font-size:13px; line-height:1.6; color:${C.ink3};">${html}</p>`;
}

/** A left-accented quote/callout (personal notes, etc.). */
export function callout(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="chip" style="border-left:3px solid ${C.brass}; background:${C.cardAlt};"><tr><td style="padding:14px 18px; font-family:${F.serif}; font-size:15px; font-style:italic; line-height:1.5; color:${C.ink2};">${html}</td></tr></table>`;
}

/** Bulletproof CTA button. variant: "ink" (default) | "brass". */
export function ctaButton(url: string, label: string, variant: "ink" | "brass" = "ink"): string {
  const bg = variant === "brass" ? C.brass : C.ink;
  const border = variant === "brass" ? C.brassBorder : C.ink;
  return `<table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bg}" style="border-radius:7px;"><a href="${url}" style="display:inline-block; padding:15px 32px; font-family:${F.sans}; font-size:15px; font-weight:600; line-height:1; letter-spacing:0.01em; color:${C.buttonInkText}; text-decoration:none; border:1px solid ${border}; border-radius:7px;">${escapeHtml(label)}</a></td></tr></table>`;
}

export function spacer(px = 26): string {
  return `<div style="height:${px}px; line-height:${px}px; font-size:0;">&nbsp;</div>`;
}

// ---- The shell --------------------------------------------------------------

export interface BrandedShellOpts {
  title: string;
  /** Inbox preview text. */
  preview?: string;
  /** Top-right mono eyebrow (e.g. "Invoice", "Proposal"). */
  eyebrow?: string;
  /** The inner body HTML, assembled from the helpers above. */
  body: string;
  /** Footer nav links (right column). Defaults to Dashboard/Help/Preferences. */
  footerLinks?: { label: string; href: string }[];
  /** Legal line under the shell. Defaults to the Patina tagline. */
  businessAddress?: string;
}

export function renderBrandedShell(opts: BrandedShellOpts): string {
  const base = portalBase();
  const links = opts.footerLinks ?? [
    { label: "Dashboard", href: base },
    { label: "Help center", href: `${base}/help` },
    { label: "Email preferences", href: `${base}/portal/settings/notifications` },
  ];
  const preheader = opts.preview
    ? `<div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all; color:transparent;">${escapeHtml(opts.preview)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>`
    : "";
  const eyebrow = opts.eyebrow
    ? `<td align="right" valign="middle" class="ink3" style="font-family:${F.mono}; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:${C.ink3};">${escapeHtml(opts.eyebrow)}</td>`
    : "";
  const footerNav = links
    .map(
      (l) =>
        `<a href="${l.href}" style="color:${C.verd}; text-decoration:none;">${escapeHtml(l.label)}</a>`,
    )
    .join("<br>");

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(opts.title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="${FONT_LINK}" rel="stylesheet">
  <style>${HEAD_CSS}</style>
</head>
<body class="bg" style="margin:0; padding:0; background:${C.paper};">
  ${preheader}
  <table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="container shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:${C.card}; border:1px solid ${C.line}; border-radius:12px; overflow:hidden;">
        <tr><td style="font-size:0; line-height:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="33.34%" height="4" style="background:${C.verd}; font-size:0; line-height:0;">&nbsp;</td>
            <td width="33.33%" height="4" style="background:${C.brass}; font-size:0; line-height:0;">&nbsp;</td>
            <td width="33.33%" height="4" style="background:${C.rust}; font-size:0; line-height:0;">&nbsp;</td>
          </tr></table>
        </td></tr>
        <tr><td class="px" style="padding:26px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="left" valign="middle" class="wordmark" style="font-family:${F.serif}; font-size:23px; font-weight:600; letter-spacing:-0.01em; color:${C.ink};">Patina</td>
            ${eyebrow}
          </tr></table>
        </td></tr>
        <tr><td class="px" style="padding:22px 40px 0px;">
          ${opts.body}
        </td></tr>
        <tr><td class="px" style="padding:34px 40px 0;">
          <div class="hairbg" style="height:1px; background:${C.line}; font-size:0; line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td class="px" style="padding:22px 40px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="left" valign="top">
              <div class="ink2" style="font-family:${F.serif}; font-size:15px; color:${C.ink2}; margin-bottom:5px;">Patina</div>
              <div class="ink3" style="font-family:${F.sans}; font-size:13px; line-height:1.5; color:${C.ink3};">A workshop for interior designers<br>and the makers they trust.</div>
            </td>
            <td align="right" valign="top" class="ink3" style="font-family:${F.sans}; font-size:13px; line-height:1.95; color:${C.ink3};">${footerNav}</td>
          </tr></table>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
        <tr><td class="px" align="center" style="padding:18px 40px 10px; font-family:${F.mono}; font-size:11px; line-height:1.8; letter-spacing:0.03em; color:${C.ink3};">
          Patina &nbsp;·&nbsp; ${escapeHtml(opts.businessAddress ?? "A workshop for interior designers and the makers they trust.")}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
