import type { CtaButtonProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

export function renderCtaButton(props: CtaButtonProps, _ctx: RenderContext): string {
  const isDark = props.variant === 'dark';
  const bgColor = isDark ? '#2C2926' : '#A3927C';

  return `          <tr>
            <td style="padding:24px 40px;text-align:center;" class="mobile-padding">
              ${props.supporting_text ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#6B645D;">${esc(props.supporting_text)}</p>` : ''}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:100px;background:${bgColor};">
                    <a href="${esc(props.url)}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px;">${esc(props.text)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
