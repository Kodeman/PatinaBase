import type { ProductCardProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';

export function renderProductCard(props: ProductCardProps, _ctx: RenderContext): string {
  const image = props.image_url
    ? `<img src="${esc(props.image_url)}" alt="${esc(props.product_name)}" width="520" style="width:100%;max-width:520px;height:auto;display:block;border-radius:8px 8px 0 0;" />`
    : `<div style="height:260px;background:#F5F1ED;border-radius:8px 8px 0 0;"></div>`;

  return `          <tr>
            <td style="padding:8px 40px 16px;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #EDE9E4;border-radius:8px;overflow:hidden;">
                <tr><td>${image}</td></tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 6px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#A3927C;font-weight:600;">${esc(props.provenance)}</p>
                    <h3 style="margin:0 0 6px;font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:600;color:#2C2926;">${esc(props.product_name)}</h3>
                    <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#6B645D;">${esc(props.description)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td><span style="font-size:18px;font-weight:600;color:#2C2926;">${esc(props.price)}</span></td>
                        <td align="right"><span style="display:inline-block;padding:4px 12px;background:#F5F1ED;border-radius:20px;font-size:12px;font-weight:500;color:#8B7355;">${esc(props.style_match)}</span></td>
                      </tr>
                    </table>
                    ${props.product_url && props.product_url !== '#' ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td align="center"><a href="${esc(props.product_url)}" style="display:inline-block;padding:12px 32px;background:#A3927C;color:#FFFFFF;text-decoration:none;border-radius:100px;font-size:14px;font-weight:500;">View Details</a></td></tr></table>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
