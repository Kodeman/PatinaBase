import type { NotificationBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

export function renderNotification(props: NotificationBlockProps, _ctx: RenderContext): string {
  const detailRows = (props.details || []).map((d) =>
    `<tr>
                              <td style="padding:6px 0;font-size:13px;color:#6B645D;border-bottom:1px solid #EDE9E4;">${esc(d.key)}</td>
                              <td style="padding:6px 0;font-size:13px;font-weight:500;color:#2C2926;text-align:right;border-bottom:1px solid #EDE9E4;">${esc(d.value)}</td>
                            </tr>`
  ).join('\n');

  return `          <tr>
            <td style="padding:16px 40px;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:24px;">
                    <span style="display:inline-block;padding:4px 12px;background:#A3927C;color:#FFFFFF;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">${esc(props.badge_label)}</span>
                    <h3 style="margin:12px 0 8px;font-family:'Playfair Display',Georgia,serif;font-size:18px;font-weight:600;color:#2C2926;">${esc(props.headline)}</h3>
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#6B645D;">${esc(props.body)}</p>
                    ${detailRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                            ${detailRows}
                          </table>` : ''}
                    ${props.cta_text ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:100px;background:#2C2926;"><a href="${esc(props.cta_url || '#')}" style="display:inline-block;padding:10px 24px;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:500;">${esc(props.cta_text)}</a></td></tr></table>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
