import type { TextBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

export function renderTextBlock(props: TextBlockProps, _ctx: RenderContext): string {
  const align = props.align || 'left';
  return `          <tr>
            <td style="padding:16px 40px;text-align:${align};" class="mobile-padding">
              <p style="margin:0;font-size:15px;line-height:1.7;color:#4A453F;">${esc(props.text).replace(/\n/g, '<br/>')}</p>
            </td>
          </tr>`;
}
