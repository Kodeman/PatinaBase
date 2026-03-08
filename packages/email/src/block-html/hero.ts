import type { HeroBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

export function renderHero(props: HeroBlockProps, _ctx: RenderContext): string {
  return `          <tr>
            <td style="padding:40px 40px 32px;" class="mobile-padding">
              <p style="margin:0 0 4px;font-size:14px;color:#A3927C;">${esc(props.greeting)}</p>
              <h1 style="margin:0 0 12px;font-family:'Playfair Display',Georgia,serif;font-size:28px;font-weight:600;line-height:1.2;color:#2C2926;">${esc(props.headline)}</h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#6B645D;">${esc(props.subline)}</p>
            </td>
          </tr>`;
}
