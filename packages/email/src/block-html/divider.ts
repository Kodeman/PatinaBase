import type { DividerBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { COLORS } from '../components/brand';

export function renderDivider(props: DividerBlockProps, _ctx: RenderContext): string {
  const isGold = props.variant === 'gold';
  const color = isGold ? COLORS.brass : COLORS.line;
  const height = isGold ? '2px' : '1px';
  // Only the subtle (line-color) variant gets the hairbg class — it's the
  // canonical hairline that should dark-adapt (see welcome.html's footer
  // divider). The gold accent divider is a deliberate brand color, not a
  // hairline, so it keeps its static color in dark mode too.
  const hairlineClass = isGold ? '' : ' class="hairbg"';
  return `          <tr>
            <td class="px" style="padding:8px 40px;">
              <div${hairlineClass} style="height:${height};background:${color};font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>`;
}
