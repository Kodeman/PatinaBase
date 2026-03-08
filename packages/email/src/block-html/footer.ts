import type { FooterBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

export function renderFooter(props: FooterBlockProps, _ctx: RenderContext): string {
  const links = (props.nav_links || [])
    .map((l) => `<a href="${esc(l.url)}" style="color:#A3927C;text-decoration:none;font-size:12px;font-weight:500;">${esc(l.label)}</a>`)
    .join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;');

  return `          <tr>
            <td style="background-color:#2C2926;padding:32px 40px;text-align:center;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <span style="font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:600;color:#FAF7F2;letter-spacing:1px;">PATINA</span>
                  </td>
                </tr>
                ${links ? `<tr><td align="center" style="padding-bottom:16px;">${links}</td></tr>` : ''}
                <tr>
                  <td align="center">
                    <p style="margin:0;font-size:11px;line-height:1.6;color:#7A736C;">${esc(props.compliance_text)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
