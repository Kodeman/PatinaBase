import * as React from 'react';
import * as S from "@ds-stories/packages/patina-design-system/src/components/Tag/Tag.stories";

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

// Storybook's addon-actions auto-injects a spy for any arg matching /^on[A-Z]/
// (argTypesRegex). Tag renders its "×" remove button only when `onRemove` is
// truthy, so the real storybook render of Default shows the ×. The plain
// compose() path only mirrors declared args (children) and drops the auto
// action — so we add onRemove here to faithfully match the storybook render.
const Tag: any = (S as any).default?.component;
export const Default = () =>
  React.createElement(Tag, { children: 'Default Tag', onRemove: () => {} });

export const Variants = compose(S, "Variants");
export const Sizes = compose(S, "Sizes");
export const Removable = compose(S, "Removable");
export const WithIcons = compose(S, "WithIcons");
export const MultipleRemovable = compose(S, "MultipleRemovable");
