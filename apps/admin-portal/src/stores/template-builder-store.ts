import { create } from 'zustand';
import type {
  TypedContentBlock,
  ContentBlockType,
  EmailTemplate,
  TemplateVariable,
} from '@patina/shared/types';
import { getDefaultProps, normalizeTemplateVariables } from '@patina/shared';

export type EditorMode = 'builder' | 'html' | 'variables';
export type PreviewDevice = 'desktop' | 'mobile';

export interface TemplateBuilderState {
  headerBlock: TypedContentBlock;
  footerBlock: TypedContentBlock;
  contentBlocks: TypedContentBlock[];
  selectedBlockId: string | null;
  editorMode: EditorMode;
  previewDevice: PreviewDevice;
  isDirty: boolean;
  rawHtml: string;
  variables: TemplateVariable[];

  addBlock: (type: ContentBlockType, index?: number) => void;
  removeBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  moveBlock: (from: number, to: number) => void;
  updateBlockProps: (id: string, partialProps: Record<string, unknown>) => void;
  selectBlock: (id: string | null) => void;
  setEditorMode: (mode: EditorMode) => void;
  setPreviewDevice: (device: PreviewDevice) => void;
  setRawHtml: (html: string) => void;
  getAllBlocks: () => TypedContentBlock[];
  loadFromTemplate: (template: EmailTemplate) => void;
  reset: () => void;

  addVariable: () => void;
  updateVariable: (index: number, partial: Partial<TemplateVariable>) => void;
  removeVariable: (index: number) => void;
  insertTokenIntoSelected: (name: string) => boolean;
}

function makeId(): string {
  return crypto.randomUUID();
}

function createBlock(type: ContentBlockType): TypedContentBlock {
  return { id: makeId(), type, props: getDefaultProps(type) } as TypedContentBlock;
}

function defaultHeader(): TypedContentBlock {
  return { id: 'header', type: 'header', props: getDefaultProps('header') } as TypedContentBlock;
}

function defaultFooter(): TypedContentBlock {
  return { id: 'footer', type: 'footer', props: getDefaultProps('footer') } as TypedContentBlock;
}

const PRIMARY_TEXT_FIELD: Partial<Record<string, string>> = {
  header: 'tagline',
  hero: 'headline',
  text_block: 'text',
  cta_button: 'text',
  notification: 'headline',
  maker_spotlight: 'story',
  footer: 'compliance_text',
  product_card: 'description',
};

export const useTemplateBuilderStore = create<TemplateBuilderState>()((set, get) => ({
  headerBlock: defaultHeader(),
  footerBlock: defaultFooter(),
  contentBlocks: [],
  selectedBlockId: null,
  editorMode: 'builder',
  previewDevice: 'desktop',
  isDirty: false,
  rawHtml: '',
  variables: [],

  addBlock: (type, index) => {
    if (type === 'header' || type === 'footer') return;
    const block = createBlock(type);
    set((s) => {
      const blocks = [...s.contentBlocks];
      const insertAt = index !== undefined ? index : blocks.length;
      blocks.splice(insertAt, 0, block);
      return { contentBlocks: blocks, selectedBlockId: block.id, isDirty: true };
    });
  },

  removeBlock: (id) =>
    set((s) => ({
      contentBlocks: s.contentBlocks.filter((b) => b.id !== id),
      selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
      isDirty: true,
    })),

  duplicateBlock: (id) =>
    set((s) => {
      const idx = s.contentBlocks.findIndex((b) => b.id === id);
      if (idx === -1) return s;
      const source = s.contentBlocks[idx];
      const clone: TypedContentBlock = {
        ...source,
        id: makeId(),
        props: { ...source.props },
      } as TypedContentBlock;
      const blocks = [...s.contentBlocks];
      blocks.splice(idx + 1, 0, clone);
      return { contentBlocks: blocks, selectedBlockId: clone.id, isDirty: true };
    }),

  moveBlock: (from, to) =>
    set((s) => {
      const blocks = [...s.contentBlocks];
      const [moved] = blocks.splice(from, 1);
      blocks.splice(to, 0, moved);
      return { contentBlocks: blocks, isDirty: true };
    }),

  updateBlockProps: (id, partialProps) =>
    set((s) => {
      if (s.headerBlock.id === id) {
        return {
          headerBlock: { ...s.headerBlock, props: { ...s.headerBlock.props, ...partialProps } } as TypedContentBlock,
          isDirty: true,
        };
      }
      if (s.footerBlock.id === id) {
        return {
          footerBlock: { ...s.footerBlock, props: { ...s.footerBlock.props, ...partialProps } } as TypedContentBlock,
          isDirty: true,
        };
      }
      return {
        contentBlocks: s.contentBlocks.map((b) =>
          b.id === id ? { ...b, props: { ...b.props, ...partialProps } } as TypedContentBlock : b
        ),
        isDirty: true,
      };
    }),

  selectBlock: (id) => set({ selectedBlockId: id }),
  setEditorMode: (mode) => set({ editorMode: mode, selectedBlockId: null }),
  setPreviewDevice: (device) => set({ previewDevice: device }),
  setRawHtml: (html) => set({ rawHtml: html, isDirty: true }),

  getAllBlocks: () => {
    const s = get();
    return [s.headerBlock, ...s.contentBlocks, s.footerBlock];
  },

  loadFromTemplate: (template) => {
    const blocks = (template.content_blocks || []) as unknown as TypedContentBlock[];
    const variables = normalizeTemplateVariables(template.variables);
    if (blocks.length > 0) {
      const header = blocks.find((b) => b.type === 'header');
      const footer = blocks.find((b) => b.type === 'footer');
      const content = blocks.filter((b) => b.type !== 'header' && b.type !== 'footer');
      set({
        headerBlock: header || defaultHeader(),
        footerBlock: footer || defaultFooter(),
        contentBlocks: content,
        editorMode: 'builder',
        rawHtml: template.html_content || '',
        selectedBlockId: null,
        isDirty: false,
        variables,
      });
    } else {
      set({
        headerBlock: defaultHeader(),
        footerBlock: defaultFooter(),
        contentBlocks: [],
        editorMode: template.html_content ? 'html' : 'builder',
        rawHtml: template.html_content || '',
        selectedBlockId: null,
        isDirty: false,
        variables,
      });
    }
  },

  reset: () =>
    set({
      headerBlock: defaultHeader(),
      footerBlock: defaultFooter(),
      contentBlocks: [],
      selectedBlockId: null,
      editorMode: 'builder',
      previewDevice: 'desktop',
      isDirty: false,
      rawHtml: '',
      variables: [],
    }),

  addVariable: () =>
    set((s) => ({
      variables: [
        ...s.variables,
        { name: '', label: '', sample: '', required: false },
      ],
      isDirty: true,
    })),

  updateVariable: (index, partial) =>
    set((s) => {
      const next = [...s.variables];
      if (index < 0 || index >= next.length) return s;
      next[index] = { ...next[index], ...partial };
      return { variables: next, isDirty: true };
    }),

  removeVariable: (index) =>
    set((s) => ({
      variables: s.variables.filter((_, i) => i !== index),
      isDirty: true,
    })),

  insertTokenIntoSelected: (name) => {
    const s = get();
    const id = s.selectedBlockId;
    if (!id) return false;
    const token = `{{${name}}}`;

    const tryAppendOnBlock = (block: TypedContentBlock): TypedContentBlock | null => {
      const field = PRIMARY_TEXT_FIELD[block.type];
      if (!field) return null;
      const current = (block.props as Record<string, unknown>)[field];
      if (typeof current !== 'string') return null;
      const nextProps = { ...block.props, [field]: current ? `${current} ${token}` : token };
      return { ...block, props: nextProps } as TypedContentBlock;
    };

    if (s.headerBlock.id === id) {
      const updated = tryAppendOnBlock(s.headerBlock);
      if (!updated) return false;
      set({ headerBlock: updated, isDirty: true });
      return true;
    }
    if (s.footerBlock.id === id) {
      const updated = tryAppendOnBlock(s.footerBlock);
      if (!updated) return false;
      set({ footerBlock: updated, isDirty: true });
      return true;
    }
    const idx = s.contentBlocks.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    const updated = tryAppendOnBlock(s.contentBlocks[idx]);
    if (!updated) return false;
    const nextBlocks = [...s.contentBlocks];
    nextBlocks[idx] = updated;
    set({ contentBlocks: nextBlocks, isDirty: true });
    return true;
  },
}));

export const useSelectedBlock = () =>
  useTemplateBuilderStore((s) => {
    const id = s.selectedBlockId;
    if (!id) return null;
    if (s.headerBlock.id === id) return s.headerBlock;
    if (s.footerBlock.id === id) return s.footerBlock;
    return s.contentBlocks.find((b) => b.id === id) ?? null;
  });

export const useBuilderIsDirty = () => useTemplateBuilderStore((s) => s.isDirty);
export const useEditorMode = () => useTemplateBuilderStore((s) => s.editorMode);
export const usePreviewDevice = () => useTemplateBuilderStore((s) => s.previewDevice);
