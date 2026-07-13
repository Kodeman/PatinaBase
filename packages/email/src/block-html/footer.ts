import type { FooterBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderFooter(props: FooterBlockProps, _ctx: RenderContext): string {
  const links = (props.nav_links || [])
    .map((l) => `<a href="${esc(l.url)}" style="color:${COLORS.verd};text-decoration:none;font-size:13px;font-weight:500;">${esc(l.label)}</a>`)
    .join('<br />');

  return `          <tr>
            <td style="background-color:${COLORS.card};padding:32px 40px;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="top">
                    <div class="ink2" style="font-family:${FONTS.serif};font-size:15px;color:${COLORS.ink2};margin-bottom:5px;">Patina</div>
                    <div class="ink3" style="font-family:${FONTS.sans};font-size:13px;line-height:1.5;color:${COLORS.ink3};">A workshop for interior designers<br />and the makers they trust.</div>
                  </td>
                  ${links ? `<td align="right" valign="top" style="font-family:${FONTS.sans};font-size:13px;line-height:1.95;color:${COLORS.ink3};">${links}</td>` : ''}
                </tr>
              </table>
              <div class="hairbg" style="height:1px;background:${COLORS.line};font-size:0;line-height:0;margin:22px 0 16px;">&nbsp;</div>
              <p class="ink3" style="margin:0;font-family:${FONTS.mono};font-size:11px;line-height:1.8;letter-spacing:0.03em;color:${COLORS.ink3};">${esc(props.compliance_text)}</p>
            </td>
          </tr>`;
}
