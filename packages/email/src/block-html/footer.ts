import type { FooterBlockProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderFooter(props: FooterBlockProps, _ctx: RenderContext): string {
  const links = (props.nav_links || [])
    .map((l) => `<a href="${esc(l.url)}" style="color:${COLORS.verd};text-decoration:none;">${esc(l.label)}</a>`)
    .join('<br />');

  // props.compliance_text is intentionally NOT rendered here. The
  // legal/unsub line now lives in the skeleton's outer legal-line table
  // (wrapSkeleton), matching welcome.html / security-alert.html. The field
  // stays on FooterBlockProps for backward compatibility with existing
  // stored block data / builders that still set it.
  return `          <tr>
            <td class="px" style="padding:34px 40px 0;">
              <div class="hairbg" style="height:1px;background:${COLORS.line};font-size:1px;line-height:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:22px 40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                <tr>
                  <td align="left" valign="top">
                    <div class="ink2" style="font-family:${FONTS.serif};font-size:15px;color:${COLORS.ink2};margin-bottom:5px;">Patina</div>
                    <div class="ink3" style="font-family:${FONTS.sans};font-size:13px;line-height:1.5;color:${COLORS.ink3};">A workshop for interior designers<br />and the makers they trust.</div>
                  </td>
                  ${links ? `<td align="right" valign="top" class="ink3" style="font-family:${FONTS.sans};font-size:13px;line-height:1.95;color:${COLORS.ink3};">${links}</td>` : ''}
                </tr>
              </table>
            </td>
          </tr>`;
}
