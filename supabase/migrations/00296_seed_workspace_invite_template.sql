-- ═══════════════════════════════════════════════════════════════════════════
-- 00296 — Seed the 'workspace-invite' email template
--
-- Branded studio-workspace invitation, sent by the workspace-member-invite edge
-- function. render-template.ts (00051 html_content column) loads this row by
-- slug and mustache-interpolates the {{first_name}} / {{inviter_name}} /
-- {{studio_name}} / {{action_link}} tokens at send time.
--
-- The html_content below is the static render of
-- packages/email/src/templates/workspace-invite.tsx (React Email +
-- BaseEmailLayout), with the four tokens passed as literal prop strings so they
-- survive verbatim into the HTML. Regenerate by re-rendering that component with
-- the same token props and refreshing this INSERT.
--
-- category = 'transactional' (the NOT NULL email_template_category enum has no
-- 'operational' bucket; an invite is closest to transactional and bypasses
-- unsubscribe headers/rate caps). Idempotent: ON CONFLICT (slug) DO UPDATE
-- refreshes the body so template edits ship via migration — mirrors 00284.
--
-- No GRANT/REVOKE: email_templates is reached only by the service-role client
-- (RLS-bypassing) inside edge functions, so the legacy-grants seed is unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.email_templates (slug, name, description, category, subject_default, html_content, variables)
VALUES (
  'workspace-invite',
  'Studio Workspace Invite',
  'Branded invitation to join a studio workspace (designer or collaborator), sent by the workspace-member-invite edge function.',
  'transactional',
  '{{inviter_name}} invited you to join {{studio_name}} on Patina',
  $wsinvite$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <style>
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        mso-font-alt: 'Helvetica';
        src: url(https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap) format('woff2');
      }

      * {
        font-family: 'Inter', Helvetica;
      }
    </style>
  </head>
  <body
    style="background-color:#FAF7F2;font-family:Inter, Helvetica, Arial, sans-serif;margin:0;padding:0">
    <!--$--><!--html--><!--head-->
    <div
      style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">
      {{inviter_name}} invited you to join {{studio_name}} on Patina
      <div>
         ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿ ‌​‍‎‏﻿
      </div>
    </div>
    <!--body-->
    <table
      align="center"
      width="100%"
      border="0"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="max-width:600px;margin:0 auto;background-color:#FFFFFF">
      <tbody>
        <tr style="width:100%">
          <td>
            <table
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="background:linear-gradient(135deg, #C4A57B, #8B7355);padding:32px 40px;text-align:center">
              <tbody>
                <tr>
                  <td>
                    <p
                      style="font-size:28px;line-height:24px;margin:0;color:#FFFFFF;font-weight:600;letter-spacing:2px">
                      Patina
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="padding:40px">
              <tbody>
                <tr>
                  <td>
                    <h1
                      style="color:#2C2926;font-size:24px;font-weight:600;line-height:32px;margin:0 0 16px 0">
                      You&#x27;re invited,
                      <!-- -->{{first_name}}
                    </h1>
                    <p
                      style="font-size:15px;line-height:24px;margin:0 0 16px 0;color:#4A453F">
                      <strong>{{inviter_name}}</strong> has invited you to join<!-- -->
                      <strong>{{studio_name}}</strong> on Patina — the workspace
                      where the studio keeps its rooms, scans, and project work
                      together.
                    </p>
                    <p
                      style="font-size:15px;line-height:24px;margin:0 0 16px 0;color:#4A453F">
                      Accept the invitation to set up your account. Everything
                      the studio has shared will be waiting for you.
                    </p>
                    <div style="margin:28px 0;text-align:center">
                      <a
                        href="{{action_link}}"
                        style="line-height:20px;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;border-radius:24px;font-size:15px;font-weight:600;text-align:center;padding:14px 32px 14px 32px;min-height:48px;background-color:#C4A57B;color:#FFFFFF"
                        target="_blank"
                        ><span
                          ><!--[if mso
                            ]><i
                              style="mso-font-width:400%;mso-text-raise:21"
                              hidden
                              >&#8202;&#8202;&#8202;&#8202;</i
                            ><!
                          [endif]--></span
                        ><span
                          style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:10.5px"
                          >Accept invitation</span
                        ><span
                          ><!--[if mso
                            ]><i style="mso-font-width:400%" hidden
                              >&#8202;&#8202;&#8202;&#8202;&#8203;</i
                            ><!
                          [endif]--></span
                        ></a
                      >
                    </div>
                    <table
                      align="center"
                      width="100%"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="background-color:#FAF7F2;border-radius:12px;padding:16px 20px;margin:16px 0">
                      <tbody>
                        <tr>
                          <td>
                            <p
                              style="font-size:13px;line-height:20px;margin:0 0 8px 0;color:#6B645D">
                              This invitation expires in 7 days. If the button
                              doesn&#x27;t work, copy and paste this link into
                              your browser:
                            </p>
                            <p
                              style="font-size:14px;line-height:24px;margin:0;word-break:break-all">
                              <a
                                href="{{action_link}}"
                                style="color:#8B7355;text-decoration-line:none;font-size:13px;text-decoration:underline"
                                target="_blank"
                                >{{action_link}}</a
                              >
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p
                      style="font-size:14px;line-height:22px;margin:24px 0 0 0;color:#6B645D">
                      — The Patina team
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="background-color:#2C2926;padding:32px 40px">
              <tbody>
                <tr>
                  <td>
                    <hr
                      style="width:100%;border:none;border-top:1px solid #eaeaea;border-color:#4A453F;margin:0 0 24px 0" />
                    <p
                      style="font-size:13px;line-height:20px;margin:0 0 8px 0;color:#A09890;text-align:center">
                      Patina — Furniture intelligence for design professionals
                    </p>
                    <p
                      style="font-size:11px;line-height:16px;margin:0 0 12px 0;color:#7A736C;text-align:center">
                      Patina Inc. · 123 Design Way, Suite 100 · San Francisco,
                      CA 94102
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
    <!--/$-->
  </body>
</html>
$wsinvite$,
  '["first_name","inviter_name","studio_name","action_link"]'::jsonb
)
ON CONFLICT (slug) DO UPDATE
  SET html_content    = EXCLUDED.html_content,
      subject_default = EXCLUDED.subject_default,
      name            = EXCLUDED.name,
      description     = EXCLUDED.description,
      category        = EXCLUDED.category,
      variables       = EXCLUDED.variables,
      is_active       = true,
      updated_at      = now();
