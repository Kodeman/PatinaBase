/**
 * Email skeleton — the outer HTML wrapper for all block-based templates.
 * Patina email design system: Fraunces/Hanken Grotesk/IBM Plex Mono, the
 * verdigris/brass/rust color-bar, ink-and-paper palette, dark-mode aware.
 * Mirrors packages/email/branded/welcome.html (design source of record) and
 * packages/email/src/components/brand.ts — reuses brand.ts's exported
 * tokens (HEAD_CSS, FONT_LINK, COLORS, COLOR_BAR) rather than hardcoding
 * hex/CSS here, so this shell stops drifting from the canonical one.
 */
import { esc } from './utils';
import { COLORS, COLOR_BAR, FONTS, FONT_LINK, HEAD_CSS } from '../components/brand';

// Zero-width padding appended after preheader text so email clients don't
// pull trailing body copy into the inbox preview snippet. Matches the
// pattern in welcome.html / security-alert.html.
const PREHEADER_PADDING = '&#847;&zwnj;&nbsp;'.repeat(8);

export function wrapSkeleton(innerRows: string, preheader?: string): string {
  const preheaderHtml = preheader ? `${esc(preheader)}${PREHEADER_PADDING}` : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Patina</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${FONT_LINK}" rel="stylesheet" />
  <style>
${HEAD_CSS}
  </style>
</head>
<body class="bg" style="margin:0; padding:0; background:${COLORS.paper};">
  <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all; color:transparent;">${preheaderHtml}</div>
  <table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.paper};">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="container shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:${COLORS.card}; border:1px solid ${COLORS.line}; border-radius:12px; overflow:hidden;">
        <tr><td style="font-size:0; line-height:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="33.34%" height="4" style="background:${COLOR_BAR[0]}; font-size:0; line-height:0;">&nbsp;</td>
            <td width="33.33%" height="4" style="background:${COLOR_BAR[1]}; font-size:0; line-height:0;">&nbsp;</td>
            <td width="33.33%" height="4" style="background:${COLOR_BAR[2]}; font-size:0; line-height:0;">&nbsp;</td>
          </tr></table>
        </td></tr>
${innerRows}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
        <tr><td class="px" align="center" style="padding:18px 40px 10px; font-family:${FONTS.mono}; font-size:11px; line-height:1.8; letter-spacing:0.03em; color:${COLORS.ink3};">
          Patina &nbsp;·&nbsp; {{business_address}}<br />
          <a href="{{unsub_url}}" style="color:${COLORS.ink3}; text-decoration:underline;">Unsubscribe</a> &nbsp;·&nbsp; <a href="{{prefs_url}}" style="color:${COLORS.ink3}; text-decoration:underline;">Manage preferences</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
