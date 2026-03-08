import type { ProductGridProps, ProductGridProduct } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

function renderGridItem(p: ProductGridProduct): string {
  const image = p.image_url
    ? `<img src="${esc(p.image_url)}" alt="${esc(p.product_name)}" width="240" style="width:100%;height:auto;display:block;border-radius:6px;" />`
    : `<div style="height:180px;background:#F5F1ED;border-radius:6px;"></div>`;

  return `<td class="stack-column" width="48%" style="vertical-align:top;padding:8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr><td>${image}</td></tr>
                        <tr>
                          <td style="padding:10px 0 0;">
                            <p style="margin:0 0 2px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#A3927C;font-weight:600;">${esc(p.provenance)}</p>
                            <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#2C2926;">${esc(p.product_name)}</p>
                            <p style="margin:0 0 6px;font-size:12px;line-height:1.4;color:#6B645D;">${esc(p.description)}</p>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td><span style="font-size:15px;font-weight:600;color:#2C2926;">${esc(p.price)}</span></td>
                                <td align="right"><span style="font-size:11px;font-weight:500;color:#8B7355;">${esc(p.style_match)}</span></td>
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
            <td style="padding:16px 40px;text-align:center;color:#A3927C;font-size:14px;" class="mobile-padding">
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
      cells.push(`<td class="stack-column" width="48%" style="padding:8px;"></td>`);
    }
    rows.push(`                <tr>
                    ${cells.join('\n                    ')}
                </tr>`);
  }

  return `          <tr>
            <td style="padding:8px 32px;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.join('\n')}
              </table>
            </td>
          </tr>`;
}
