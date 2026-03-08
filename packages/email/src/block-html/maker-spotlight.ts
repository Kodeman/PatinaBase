import type { MakerSpotlightProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

export function renderMakerSpotlight(props: MakerSpotlightProps, _ctx: RenderContext): string {
  const portrait = props.portrait_url
    ? `<img src="${esc(props.portrait_url)}" alt="${esc(props.maker_name)}" width="80" height="80" style="display:block;width:80px;height:80px;border-radius:50%;object-fit:cover;margin:0 auto 12px;" />`
    : `<div style="width:80px;height:80px;border-radius:50%;background:#EDE9E4;margin:0 auto 12px;"></div>`;

  return `          <tr>
            <td style="padding:16px 40px;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:32px;text-align:center;">
                    ${portrait}
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#A3927C;font-weight:600;">Maker Spotlight</p>
                    <h3 style="margin:0 0 12px;font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:600;color:#2C2926;">${esc(props.maker_name)}</h3>
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6B645D;text-align:left;">${esc(props.story)}</p>
                    <a href="${esc(props.link_url)}" style="font-size:14px;font-weight:500;color:#A3927C;text-decoration:underline;">${esc(props.link_text)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
