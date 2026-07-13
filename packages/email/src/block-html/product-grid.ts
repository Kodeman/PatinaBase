import type { ProductGridProps, ProductGridProduct } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

function renderGridItem(p: ProductGridProduct): string {
  const image = p.image_url
    ? `<img src="${esc(p.image_url)}" alt="${esc(p.product_name)}" width="240" style="width:100%;height:auto;display:block;border-radius:6px;" />`
    : `<div class="card" style="height:180px;background:${COLORS.card};border-radius:6px;"></div>`;

  return `<td class="stack" width="48%" style="vertical-align:top;padding:8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr><td>${image}</td></tr>
                        <tr>
                          <td style="padding:10px 0 0;">
                            <p style="margin:0 0 2px;font-family:${FONTS.mono};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${COLORS.verd};font-weight:600;">${esc(p.provenance)}</p>
                            <p class="ink" style="margin:0 0 4px;font-family:${FONTS.sans};font-size:14px;font-weight:600;color:${COLORS.ink};">${esc(p.product_name)}</p>
                            <p class="ink3" style="margin:0 0 6px;font-family:${FONTS.sans};font-size:12px;line-height:1.4;color:${COLORS.ink3};">${esc(p.description)}</p>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td><span class="ink" style="font-family:${FONTS.sans};font-size:15px;font-weight:600;color:${COLORS.ink};">${esc(p.price)}</span></td>
                                <td align="right"><span style="font-family:${FONTS.sans};font-size:11px;font-weight:500;color:${COLORS.verd};">${esc(p.style_match)}</span></td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>`;
}

export function renderProductGrid(props: ProductGridProps, _ctx: RenderContext): string {
  const products = props.products || [];
  if (products.length === 0) {
    return `          <tr>
            <td class="px ink3" style="padding:16px 40px;text-align:center;font-family:${FONTS.sans};color:${COLORS.ink3};font-size:14px;">
              Product grid — add products to display
            </td>
          </tr>`;
  }

  // Build rows of 2
  const rows: string[] = [];
  for (let i = 0; i < products.length; i += 2) {
    const cells = [renderGridItem(products[i])];
    if (products[i + 1]) {
      cells.push(renderGridItem(products[i + 1]));
    } else {
      cells.push(`<td class="stack" width="48%" style="padding:8px;"></td>`);
    }
    rows.push(`                <tr>
                    ${cells.join('\n                    ')}
                </tr>`);
  }

  return `          <tr>
            <td class="px" style="padding:8px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.join('\n')}
              </table>
            </td>
          </tr>`;
}
