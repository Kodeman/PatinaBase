import type { HeroBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderHero(props: HeroBlockProps, _ctx: RenderContext): string {
  return `          <tr>
            <td class="px" style="padding:22px 40px 32px;">
              <p style="margin:0 0 4px;font-family:${FONTS.sans};font-size:14px;font-weight:500;color:${COLORS.verd};">${esc(props.greeting)}</p>
              <h1 class="h1 ink" style="margin:0 0 12px;font-family:${FONTS.serif};font-size:28px;font-weight:600;line-height:1.2;letter-spacing:-0.015em;color:${COLORS.ink};">${esc(props.headline)}</h1>
              <p class="ink3" style="margin:0;font-family:${FONTS.sans};font-size:15px;line-height:1.6;color:${COLORS.ink3};">${esc(props.subline)}</p>
            </td>
          </tr>`;
}
