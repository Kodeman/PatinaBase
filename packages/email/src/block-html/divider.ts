import type { DividerBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { COLORS } from '../components/brand';

export function renderDivider(props: DividerBlockProps, _ctx: RenderContext): string {
  const isGold = props.variant === 'gold';
  const color = isGold ? COLORS.brass : COLORS.line;
  const height = isGold ? '2px' : '1px';
  return `          <tr>
            <td style="padding:8px 40px;" class="mobile-padding">
              <div style="border-top:${height} solid ${color};"></div>
            </td>
          </tr>`;
}
