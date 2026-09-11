// The client letter — a studio's own paper, carried by Patina.
//
// PP-1 (R2): studio letterhead on top, no Patina wordmark, Patina named exactly
// once in the colophon. `renderBrandedShell` in ./branded-email.ts puts the
// Patina wordmark atop every email by deliberate decision and is imported by
// ~21 senders; editing it would force redeploying all of them and change every
// client-facing email in one commit. So this is an ADDITIVE second shell,
// imported by client-invite alone, and the wholesale change stays its own
// program.
//
// The palette, fonts, font link and head CSS below are copied from
// ./branded-email.ts, where they are module-private (not exported). Keep them
// in step with that file, with packages/email/branded/welcome.html and with
// packages/email/src/components/brand.ts.

import {
  callout,
  ctaButton,
  escapeHtml,
  muted,
  paragraph,
  spacer,
} from "./branded-email.ts";
import { toEmailAssetUrl } from "./email-assets.ts";

// ── copied from ./branded-email.ts (module-private there) ──────────────────
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
  rust: "#A24E2E",
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
}
@media (prefers-color-scheme: dark) {
  body, .bg, .bg td { background:#14110D !important; }
  .card { background:#221E17 !important; border-color:#3B342A !important; }
  .shell { background:#1B1712 !important; border-color:#332D24 !important; }
  .ink { color:#F2EBDD !important; }
  .ink2 { color:#D4CCBB !important; }
  .ink3 { color:#9C9484 !important; }
  .hairbg { background:#3B342A !important; }
  .chip { background:#221E17 !important; border-color:#3B342A !important; }
}`.trim();

// ── dates ──────────────────────────────────────────────────────────────────
// Written out rather than delegated to Intl so the letter reads the same in
// every runtime and the tests pin exact strings. en-GB shape ("8 September",
// "8 Sept"), UTC, because a date on a letter is a fact, not a locale.
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "June",
  "July", "Aug", "Sept", "Oct", "Nov", "Dec",
];

export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

function longDateWithYear(iso: string): string {
  return `${longDate(iso)} ${new Date(iso).getUTCFullYear()}`;
}

// ── the snapshot the letter is rendered from, and nothing else ─────────────
export interface ClientLetterSnapshot {
  kind: "invite" | "notice";
  recipientEmail: string;
  recipientName: string | null;
  /**
   * The person who signs. NULL when no real name resolved — voice rule 5: a
   * slot with no fact prints nothing, so the studio authors the letter and no
   * placeholder identity ("Your designer") is ever invented.
   */
  designerFullName: string | null;
  designerGivenName: string | null;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  projectName: string | null;
  personalMessage: string | null;
  /** ISO. The date the letterhead and the standing sentence print. */
  sentAt: string;
  /** ISO. Ignored when kind === 'notice' — a notice expires nothing. */
  expiresAt: string;
  ctaUrl: string;
}

export interface RenderedClientLetter {
  subject: string;
  preheader: string;
  standingSentence: string;
  html: string;
  text: string;
}

const stated = (v: string | null | undefined): string | null =>
  (v ?? "").trim() || null;

/** The person the letter names, or NULL when none resolved. */
function person(s: ClientLetterSnapshot): string | null {
  return stated(s.designerFullName);
}

/** Her given name, or NULL. Never a pronoun standing in for someone unknown. */
function personGiven(s: ClientLetterSnapshot): string | null {
  return stated(s.designerGivenName);
}

function studio(s: ClientLetterSnapshot): string | null {
  return stated(s.studioName);
}

/** The name on the paper: the studio, the person where there is no studio, and
 *  NULL where there is neither — an empty letterhead, never an invented one. */
function letterheadName(s: ClientLetterSnapshot): string | null {
  return studio(s) ?? person(s);
}

/**
 * R1. The business name leads and "via" discloses the relay — the Gmail-Groups
 * pattern, which reads as a legitimate relay rather than display-name spoofing.
 */
export function senderDisplayName(s: ClientLetterSnapshot): string {
  const name = letterheadName(s);
  // With neither a studio nor a person there is no identity to lead with; the
  // relay alone is the honest envelope, never " via Patina" behind a blank.
  return name ? `${name} via Patina` : "Patina";
}

/**
 * RFC 5322: a display name carrying a special must be a quoted-string. Control
 * characters become a space and quotes are dropped — never escaped through into
 * the header, because a studio name is not a place to negotiate injection.
 */
export function formatFromAddress(displayName: string, email: string): string {
  const clean = displayName
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const needsQuoting = /[()<>@,;:.\[\]]/.test(clean);
  return needsQuoting ? `"${clean}" <${email}>` : `${clean} <${email}>`;
}

/**
 * R3. The one place "invited" survives the homeowner vocabulary.
 *
 * The author degrades: the person, then the studio, then nobody. A subject
 * never names a placeholder person.
 */
export function letterSubject(s: ClientLetterSnapshot): string {
  const project = (s.projectName ?? "").trim();
  const who = person(s);
  const house = studio(s);
  if (project) {
    if (who) return `${who} invited you to the ${project}`;
    if (house) return `${house} added you to the ${project}`;
    return `You've been added to the ${project}`;
  }
  if (who) return `${who} set up a page for your work together`;
  if (house) return `${house} set up a page for your work together`;
  return "A page is set up for your work together";
}

/** A.2. Defines the thing being handed over rather than repeating the subject. */
export function preheader(s: ClientLetterSnapshot): string {
  const house = studio(s);
  if (house) return `Where ${house} keeps the record of your job.`;
  const given = personGiven(s);
  if (given) return `Where ${given} keeps the record of your work.`;
  return "Where the record of your work is kept.";
}

/**
 * A.4. Two sentences, deliberately: "added you to X" tells a stranger nothing
 * about what X is. Third person for the fact, second person only as address.
 * Degradation: `{full name} of {Studio}` -> `{full name}` -> `{Studio}` alone
 * (the studio authors it) -> no author at all; `to {project}` -> `for your work
 * together`. With no studio the second sentence drops the word "studio" rather
 * than naming one that does not exist.
 */
export function standingSentence(s: ClientLetterSnapshot): string {
  const date = longDate(s.sentAt);
  const name = person(s);
  const house = studio(s);
  // The author, in the order the letter can prove it: the person of the studio,
  // the person alone, the studio alone, nobody.
  const who = name && house ? `${name} of ${house}` : (name ?? house);
  const project = (s.projectName ?? "").trim();
  if (project) {
    const record = house
      ? "The page below holds the studio's record of the job"
      : "The page below holds the record of the job";
    return who
      ? `${who} added you to the ${project} on ${date}. ${record} — the plans, the papers, and the numbers.`
      : `You were added to the ${project} on ${date}. ${record} — the plans, the papers, and the numbers.`;
  }
  // Whose record it is degrades with the author: her given name, then "the
  // studio", then no owner at all — never a pronoun for a person we cannot name.
  const keeper = personGiven(s) ?? (house ? "the studio" : null);
  const opening = who
    ? `${who} set up a page for your work together on ${date}.`
    : `A page for your work together was set up on ${date}.`;
  const holds = keeper
    ? `It's where ${keeper} keeps the record`
    : "It's where the record is kept";
  return `${opening} ${holds} — the plans, the papers, and the numbers, as they come.`;
}

function ctaLabel(s: ClientLetterSnapshot): string {
  return s.projectName ? "Open the project" : "Open the page";
}

/**
 * A.8. Missing studio and missing city each drop their segment AND separator.
 * With no person the studio signs alone; with neither there is no sign-off at
 * all, because renderClientLetter omits an empty line rather than print a dash.
 */
function signOffLine(s: ClientLetterSnapshot): string {
  return [s.designerFullName, s.studioName, s.signatureCity]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function letterhead(s: ClientLetterSnapshot): string {
  const name = letterheadName(s);
  // Escaped per segment, then joined, so the separator is an entity and a
  // missing city cannot leave one stranded.
  const place = [s.signatureCity?.trim(), longDateWithYear(s.sentAt)]
    .filter((part): part is string => Boolean(part))
    .map(escapeHtml)
    .join(" &middot; ");
  const studioLogoUrl = toEmailAssetUrl(s.studioLogoUrl);
  const logo = studioLogoUrl
    ? `<td valign="middle" style="padding-right:10px;"><img src="${escapeHtml(studioLogoUrl)}" height="20" alt="${escapeHtml(name ?? "")}" style="display:block; height:20px; max-height:24px; width:auto; border:0; outline:none; text-decoration:none;"></td>`
    : "";
  const nameCell = name
    ? `<td valign="middle" class="ink" style="font-family:${F.serif}; font-size:19px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:${C.ink};">${escapeHtml(name).toUpperCase()}</td>`
    : "";
  // No name and no logo → no brand row at all, rather than an empty rule.
  const brand = logo || nameCell
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}${nameCell}</tr></table>`
    : "";
  const preparedFor = s.recipientName?.trim()
    ? `<td align="right" valign="top" class="ink3" style="font-family:${F.sans}; font-size:13px; color:${C.ink3};">Prepared for ${escapeHtml(s.recipientName.trim())}</td>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
            <td align="left" valign="top">
              ${brand}
              <div class="ink3" style="margin-top:5px; font-family:${F.mono}; font-size:11px; letter-spacing:0.08em; color:${C.ink3};">${place}</div>
            </td>
            ${preparedFor}
          </tr></table>`;
}

function colophon(s: ClientLetterSnapshot): string {
  const by = letterheadName(s);
  const ignore = s.kind === "notice"
    ? "If this isn&rsquo;t for you, nothing happens &mdash; ignore it."
    : "If this isn&rsquo;t for you, nothing happens &mdash; ignore it and the link lapses on its own.";
  const lines = [
    by
      ? `Prepared by ${escapeHtml(by)} &middot; Sent through Patina`
      : "Sent through Patina",
    by
      ? `Sent to ${escapeHtml(s.recipientEmail)} at the request of ${escapeHtml(by)}.`
      : `Sent to ${escapeHtml(s.recipientEmail)}.`,
    ignore,
    `Button not working? Paste this link into your browser:<br><a href="${escapeHtml(s.ctaUrl)}" style="color:${C.verd}; text-decoration:underline; word-break:break-all;">${escapeHtml(s.ctaUrl)}</a>`,
  ];
  return lines
    .map(
      (l) =>
        `<div class="ink3" style="font-family:${F.sans}; font-size:12px; line-height:1.65; color:${C.ink3};">${l}</div>`,
    )
    .join("");
}

export function renderClientLetter(s: ClientLetterSnapshot): RenderedClientLetter {
  const subject = letterSubject(s);
  const preview = preheader(s);
  const standing = standingSentence(s);

  const note = s.personalMessage?.trim()
    ? callout(escapeHtml(s.personalMessage.trim()))
    : "";
  // Who can send another degrades the same way the author does; with neither, the
  // line states the date and stops rather than promising an unnamed somebody.
  const sender = personGiven(s) ?? studio(s);
  const expiry = s.kind === "invite"
    ? muted(
      sender
        ? `The link works until ${escapeHtml(longDate(s.expiresAt))}; ${escapeHtml(sender)} can send another.`
        : `The link works until ${escapeHtml(longDate(s.expiresAt))}.`,
    )
    : "";
  const signature = signOffLine(s);
  const signOffHtml = signature
    ? paragraph(`&mdash; ${escapeHtml(signature).replace(/ · /g, " &middot; ")}`)
    : "";

  const body = [
    paragraph(escapeHtml(standing)),
    note,
    spacer(6),
    // ctaButton (branded-email.ts) interpolates its url arg into an href
    // attribute unescaped — it only escapes the label — so the URL is
    // escaped here, at the one call site this module owns.
    ctaButton(escapeHtml(s.ctaUrl), ctaLabel(s), "brass"),
    spacer(10),
    expiry,
    signOffHtml,
  ].join("");

  const preheaderBlock =
    `<div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all; color:transparent;">${escapeHtml(preview)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="${FONT_LINK}" rel="stylesheet">
  <style>${HEAD_CSS}</style>
</head>
<body class="bg" style="margin:0; padding:0; background:${C.paper};">
  ${preheaderBlock}
  <table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background:${C.paper};">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="container shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:${C.card}; border:1px solid ${C.line}; border-radius:12px; overflow:hidden;">
        <tr><td class="px" style="padding:30px 40px 0;">
          ${letterhead(s)}
        </td></tr>
        <tr><td class="px" style="padding:18px 40px 0;">
          <div class="hairbg" style="height:1px; background:${C.line}; font-size:0; line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td class="px" style="padding:22px 40px 0;">
          ${body}
        </td></tr>
        <tr><td class="px" style="padding:26px 40px 0;">
          <div class="hairbg" style="height:1px; background:${C.line}; font-size:0; line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td class="px" style="padding:18px 40px 30px;">
          ${colophon(s)}
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    letterheadName(s)?.toUpperCase() ?? "",
    [s.signatureCity?.trim(), longDateWithYear(s.sentAt)].filter(Boolean).join(" · "),
    s.recipientName?.trim() ? `Prepared for ${s.recipientName.trim()}` : "",
    "",
    standing,
    "",
    s.personalMessage?.trim() ?? "",
    "",
    `${ctaLabel(s)}: ${s.ctaUrl}`,
    "",
    s.kind === "invite"
      ? (sender
        ? `The link works until ${longDate(s.expiresAt)}; ${sender} can send another.`
        : `The link works until ${longDate(s.expiresAt)}.`)
      : "",
    signature ? `— ${signature}` : "",
    "",
    letterheadName(s)
      ? `Prepared by ${letterheadName(s)} · Sent through Patina`
      : "Sent through Patina",
    letterheadName(s)
      ? `Sent to ${s.recipientEmail} at the request of ${letterheadName(s)}.`
      : `Sent to ${s.recipientEmail}.`,
    s.kind === "notice"
      ? "If this isn't for you, nothing happens — ignore it."
      : "If this isn't for you, nothing happens — ignore it and the link lapses on its own.",
  ];
  const text = textLines
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n")
    .trim();

  return { subject, preheader: preview, standingSentence: standing, html, text };
}
