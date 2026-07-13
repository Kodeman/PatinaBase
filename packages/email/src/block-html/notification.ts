import type { NotificationBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderNotification(props: NotificationBlockProps, _ctx: RenderContext): string {
  const detailRows = (props.details || []).map((d) =>
    `<tr>
                              <td style="padding:6px 0;font-family:${FONTS.sans};font-size:13px;color:${COLORS.ink3};border-bottom:1px solid ${COLORS.line};">${esc(d.key)}</td>
                              <td style="padding:6px 0;font-family:${FONTS.sans};font-size:13px;font-weight:500;color:${COLORS.ink};text-align:right;border-bottom:1px solid ${COLORS.line};">${esc(d.value)}</td>
                            </tr>`
  ).join('\n');

  return `          <tr>
            <td style="padding:16px 40px;" class="mobile-padding">
              <table role="presentation" class="chip" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.cardAlt};border:1px solid ${COLORS.line};border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:24px;">
                    <span style="display:inline-block;padding:4px 12px;background:${COLORS.brass};color:#FFFFFF;border:1px solid ${COLORS.brassBorder};border-radius:20px;font-family:${FONTS.mono};font-size:11px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;margin-bottom:12px;">${esc(props.badge_label)}</span>
                    <h3 style="margin:12px 0 8px;font-family:${FONTS.serif};font-size:18px;font-weight:600;color:${COLORS.ink};">${esc(props.headline)}</h3>
                    <p style="margin:0 0 16px;font-family:${FONTS.sans};font-size:14px;line-height:1.5;color:${COLORS.ink3};">${esc(props.body)}</p>
                    ${detailRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                            ${detailRows}
                          </table>` : ''}
                    ${props.cta_text ? `<table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:7px;background:${COLORS.ink};"><a href="${esc(props.cta_url || '#')}" style="display:inline-block;padding:10px 24px;font-family:${FONTS.sans};color:${COLORS.buttonInkText};text-decoration:none;border:1px solid ${COLORS.ink};border-radius:7px;font-size:13px;font-weight:600;">${esc(props.cta_text)}</a></td></tr></table>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
