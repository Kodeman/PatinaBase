// Single source of truth for the Patina email design system (Node/React side).
// Mirrors the canonical hand-authored shell at packages/email/branded/welcome.html
// — that HTML file is the design reference of record; keep this in step with it.
// The Deno edge shell (supabase/functions/_shared/branded-email.ts) and the
// block-html string shell each carry their own copy of these tokens because the
// Node/Deno runtime boundary prevents sharing a module.

/** Light-mode palette (ink & paper). */
export const COLORS = {
  paper: '#F5F0E6', // page background
  card: '#FCF9F2', // shell card
  cardAlt: '#FFFFFF', // inner cards / chips
  line: '#E6DDCC', // hairlines / borders
  ink: '#1F1B16', // primary text / dark button
  ink2: '#4B463E', // body text
  ink3: '#8C8578', // muted / legal
  verd: '#4E7A66', // verdigris (links, kicker)
  verdDeep: '#2F5142',
  brass: '#B08A46', // accent / celebratory button
  brassBorder: '#8A6A30',
  rust: '#A24E2E',
  buttonInkText: '#F5F0E6',
} as const;

/** Font stacks. Web fonts load via FONT_LINK; the stacks carry the fallbacks. */
export const FONTS = {
  serif: "'Fraunces', Georgia, 'Times New Roman', serif",
  sans: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Courier New', monospace",
} as const;

/** The three-color signature bar (verdigris / brass / rust). */
export const COLOR_BAR = [COLORS.verd, COLORS.brass, COLORS.rust] as const;

export const TAGLINE = 'A workshop for interior designers and the makers they trust.';

// Real footer URLs baked into React-rendered emails (Weekly Pulse sends the
// HTML directly, so it cannot rely on the {{mustache}} brandDefaults path).
export const URLS = {
  dashboard: 'https://app.patina.cloud',
  help: 'https://app.patina.cloud/help',
  prefs: 'https://app.patina.cloud/portal/settings/notifications',
} as const;

/** Google Fonts stylesheet URL for Fraunces + Hanken Grotesk + IBM Plex Mono. */
export const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

/** Reset + mobile + dark-mode CSS injected into <head>. Matches welcome.html. */
export const HEAD_CSS = `
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
  .hero-t { font-size:26px !important; }
  .stack { display:block !important; width:100% !important; box-sizing:border-box !important; }
  .stack-gap { height:10px !important; line-height:10px !important; }
  .code { font-size:30px !important; letter-spacing:0.24em !important; }
}
@media (prefers-color-scheme: dark) {
  body, .bg, .bg td { background:#14110D !important; }
  .card { background:#221E17 !important; border-color:#3B342A !important; }
  .shell { background:#1B1712 !important; border-color:#332D24 !important; }
  .ink  { color:#F2EBDD !important; }
  .ink2 { color:#D4CCBB !important; }
  .ink3 { color:#9C9484 !important; }
  .wordmark { color:#F2EBDD !important; }
  .hair, .rowline { border-color:#3B342A !important; }
  .hairbg { background:#3B342A !important; }
  .chip, .codebox { background:#221E17 !important; border-color:#3B342A !important; }
}
`.trim();
