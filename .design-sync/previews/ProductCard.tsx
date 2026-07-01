import * as React from 'react';
import * as S from "@ds-stories/packages/patina-design-system/src/components/ProductCard/ProductCard.stories";

// ProductCard's root is w-full with no max-width, so on the full-width preview
// page its 4/5-aspect image balloons and pushes the content below the capture.
// Storybook's `layout: 'centered'` shrinks it to the image's intrinsic width.
// We reproduce that by wrapping each story in a fixed-width container so the
// card renders at a natural size with its content visible.  (See NOTES.md:
// "full-bleed image cards under layout:centered".)
function compose(S: any, key: string) {
  const meta: any = S.default ?? {};
  const st: any = S[key];
  const args: any = { ...(meta.args ?? {}), ...(st && st.args ? st.args : {}) };
  const at: any = { ...(meta.argTypes ?? {}), ...(st && st.argTypes ? st.argTypes : {}) };
  for (const k of Object.keys(args)) {
    const m = at[k] && at[k].mapping;
    if (m && typeof m === 'object' && args[k] in m) args[k] = m[args[k]];
  }
  const title: string = typeof meta.title === 'string' ? meta.title : '';
  const ctx: any = {
    args, name: key, title, kind: title, id: '', componentId: '',
    globals: {}, viewMode: 'story',
    parameters: (st && st.parameters) ?? meta.parameters ?? {},
  };
  let render: (() => any) | null = null;
  if (st && typeof st.render === 'function') render = () => st.render(args, ctx);
  else if (typeof st === 'function') render = () => st(args, ctx);
  else if (typeof meta.render === 'function') render = () => meta.render(args, ctx);
  else {
    const C = (st && st.component) || meta.component;
    if (C) render = () => React.createElement(C, args);
  }
  if (!render) return () => null;
  const decorators: any[] = ([] as any[]).concat((st && st.decorators) ?? []).concat(meta.decorators ?? []);
  return decorators.reduce((inner: any, dec: any) => () => {
    const out = dec(inner, ctx);
    return out === undefined ? inner() : out;
  }, render);
}

// width wrapper — w matches the natural presentation storybook's centered
// layout gives each story (single vertical card ≈ image intrinsic width).
const box = (w: number, fn: () => any) => () =>
  React.createElement('div', { style: { width: w, maxWidth: '100%', margin: '0 auto' } }, fn());

export const Default = box(400, compose(S, "Default"));
export const WithSale = box(400, compose(S, "WithSale"));
export const Featured = box(400, compose(S, "Featured"));
export const Favorited = box(400, compose(S, "Favorited"));
export const ListVariant = box(640, compose(S, "ListVariant"));
export const CompactVariant = box(400, compose(S, "CompactVariant"));
export const MultipleBadges = box(400, compose(S, "MultipleBadges"));
export const Grid = box(880, compose(S, "Grid"));
export const ListView = box(680, compose(S, "ListView"));
