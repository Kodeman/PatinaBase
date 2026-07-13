import type { ProductCardProps } from '@patina/shared/types';
import type { RenderContext } from '../block-renderer';
import { esc } from './utils';
import { COLORS, FONTS } from '../components/brand';

export function renderProductCard(props: ProductCardProps, _ctx: RenderContext): string {
  const image = props.image_url
    ? `<img src="${esc(props.image_url)}" alt="${esc(props.product_name)}" width="520" style="width:100%;max-width:520px;height:auto;display:block;border-radius:8px 8px 0 0;" />`
    : `<div class="card" style="height:260px;background:${COLORS.card};border-radius:8px 8px 0 0;"></div>`;

  return `          <tr>
            <td class="px" style="padding:8px 40px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COLORS.line};border-radius:8px;overflow:hidden;">
                <tr><td>${image}</td></tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 6px;font-family:${FONTS.mono};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${COLORS.verd};font-weight:600;">${esc(props.provenance)}</p>
                    <h3 class="ink" style="margin:0 0 6px;font-family:${FONTS.serif};font-size:20px;font-weight:600;color:${COLORS.ink};">${esc(props.product_name)}</h3>
                    <p class="ink3" style="margin:0 0 12px;font-family:${FONTS.sans};font-size:14px;line-height:1.5;color:${COLORS.ink3};">${esc(props.description)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td><span class="ink" style="font-family:${FONTS.sans};font-size:18px;font-weight:600;color:${COLORS.ink};">${esc(props.price)}</span></td>
                        <td align="right"><span class="chip" style="display:inline-block;padding:4px 12px;background:${COLORS.cardAlt};border:1px solid ${COLORS.line};border-radius:20px;font-family:${FONTS.sans};font-size:12px;font-weight:500;color:${COLORS.verd};">${esc(props.style_match)}</span></td>
                      </tr>
                    </table>
                    ${props.product_url && props.product_url !== '#' ? `<table role="presentation" class="btn" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td align="center" style="border-radius:7px;background:${COLORS.brass};"><a href="${esc(props.product_url)}" style="display:inline-block;padding:12px 32px;font-family:${FONTS.sans};color:#FFFFFF;text-decoration:none;border:1px solid ${COLORS.brassBorder};border-radius:7px;font-size:14px;font-weight:600;">View Details</a></td></tr></table>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}
