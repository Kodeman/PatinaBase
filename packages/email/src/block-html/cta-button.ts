import type { CtaButtonProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderCtaButton(props: CtaButtonProps, _ctx: RenderContext): string {
  const isDark = props.variant === 'dark';
  const bgColor = isDark ? COLORS.ink : COLORS.brass;
  const textColor = isDark ? COLORS.buttonInkText : '#FFFFFF';
  const borderColor = isDark ? COLORS.ink : COLORS.brassBorder;

  return `          <tr>
            <td class="px" style="padding:24px 40px;text-align:center;">
              ${props.supporting_text ? `<p class="ink3" style="margin:0 0 16px;font-family:${FONTS.sans};font-size:14px;line-height:1.5;color:${COLORS.ink3};">${esc(props.supporting_text)}</p>` : ''}
              <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:7px;background:${bgColor};">
                    <a href="${esc(props.url)}" style="display:inline-block;padding:15px 32px;font-family:${FONTS.sans};color:${textColor};text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.01em;border:1px solid ${borderColor};border-radius:7px;">${esc(props.text)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
