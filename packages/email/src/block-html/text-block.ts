import type { TextBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderTextBlock(props: TextBlockProps, _ctx: RenderContext): string {
  const align = props.align || 'left';
  return `          <tr>
            <td class="px" style="padding:16px 40px;text-align:${align};">
              <p class="ink2" style="margin:0;font-family:${FONTS.sans};font-size:15px;line-height:1.7;color:${COLORS.ink2};">${esc(props.text).replace(/\n/g, '<br/>')}</p>
            </td>
          </tr>`;
}
