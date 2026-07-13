import type { MakerSpotlightProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderMakerSpotlight(props: MakerSpotlightProps, _ctx: RenderContext): string {
  const portrait = props.portrait_url
    ? `<img src="${esc(props.portrait_url)}" alt="${esc(props.maker_name)}" width="80" height="80" style="display:block;width:80px;height:80px;border-radius:50%;object-fit:cover;margin:0 auto 12px;" />`
    : `<div style="width:80px;height:80px;border-radius:50%;background:${COLORS.line};margin:0 auto 12px;"></div>`;

  return `          <tr>
            <td style="padding:16px 40px;" class="mobile-padding">
              <table role="presentation" class="chip" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.cardAlt};border:1px solid ${COLORS.line};border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:32px;text-align:center;">
                    ${portrait}
                    <p style="margin:0 0 4px;font-family:${FONTS.mono};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.verd};font-weight:600;">Maker Spotlight</p>
                    <h3 style="margin:0 0 12px;font-family:${FONTS.serif};font-size:20px;font-weight:600;color:${COLORS.ink};">${esc(props.maker_name)}</h3>
                    <p style="margin:0 0 16px;font-family:${FONTS.sans};font-size:14px;line-height:1.6;color:${COLORS.ink3};text-align:left;">${esc(props.story)}</p>
                    <a href="${esc(props.link_url)}" style="font-family:${FONTS.sans};font-size:14px;font-weight:500;color:${COLORS.verd};text-decoration:underline;">${esc(props.link_text)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
