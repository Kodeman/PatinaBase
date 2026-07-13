import type { HeaderBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderHeader(props: HeaderBlockProps, _ctx: RenderContext): string {
  return `          <tr>
            <td style="background-color:${COLORS.card};padding:26px 40px 0;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle" class="wordmark" style="font-family:${FONTS.serif};font-size:23px;font-weight:600;letter-spacing:-0.01em;color:${COLORS.ink};">Patina</td>
                  <td align="right" valign="middle" class="ink3" style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.ink3};">${esc(props.tagline)}</td>
                </tr>
              </table>
            </td>
          </tr>`;
}
