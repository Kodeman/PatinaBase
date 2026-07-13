/**
 * Email skeleton — the outer HTML wrapper for all block-based templates.
 * Patina email design system: Fraunces/Hanken Grotesk/IBM Plex Mono, the
 * verdigris/brass/rust color-bar, ink-and-paper palette, dark-mode aware.
 * Mirrors packages/email/branded/welcome.html (design source of record) and
 * packages/email/src/components/brand.ts.
 */
export function wrapSkeleton(innerRows: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Patina</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
    body, td, th, p, div, li, a, span {
      font-family: 'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    h1, h2, h3, h4 { font-family: 'Fraunces', Georgia, 'Times New Roman', serif; }
    @media screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; }
      .stack-column-center { text-align: center !important; }
      .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .mobile-hide { display: none !important; }
      .mobile-full { width: 100% !important; height: auto !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .bg { background: #14110D !important; }
      .shell { background: #1B1712 !important; border-color: #332D24 !important; }
      .ink { color: #F2EBDD !important; }
    }
  </style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#F5F0E6;">
  <table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F0E6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="email-container shell" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FCF9F2;border:1px solid #E6DDCC;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="font-size:0;line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="33.34%" height="4" style="background:#4E7A66;font-size:0;line-height:0;">&nbsp;</td>
                <td width="33.33%" height="4" style="background:#B08A46;font-size:0;line-height:0;">&nbsp;</td>
                <td width="33.33%" height="4" style="background:#A24E2E;font-size:0;line-height:0;">&nbsp;</td>
              </tr></table>
            </td>
          </tr>
${innerRows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
