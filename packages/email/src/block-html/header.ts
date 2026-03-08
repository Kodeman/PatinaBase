import type { HeaderBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

export function renderHeader(props: HeaderBlockProps, _ctx: RenderContext): string {
  return `          <tr>
            <td style="background-color:#3C3226;padding:28px 40px;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="https://admin.patina.cloud/logo-mark-cream.png" alt="Patina" width="32" height="32" style="display:block;margin:0 auto 8px;" />
                    <span style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#FAF7F2;letter-spacing:1.5px;">PATINA</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:6px;">
                    <span style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#A3927C;">${esc(props.tagline)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
