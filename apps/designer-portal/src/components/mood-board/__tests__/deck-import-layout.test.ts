import type {
  DeckImportManifest,
  DeckImportRegistration,
  EditableMoodBoardItem,
  MoodBoardSection,
} from '@patina/types';
import { fixtureBytes } from '@/lib/deck-import/__fixtures__/load';
import { readImageSize, type DeckImageCodec } from '@/lib/deck-import/crop';
import { openPackage } from '@/lib/deck-import/read-package';
import {
  DECK_COPY,
  buildRegisterManifest,
  deckFileKind,
  deckLedgerLine,
  deckPinHoldReason,
  extractPastedUrls,
  kickDeckImportResolver,
  prepareDeck,
  runDeckLayout,
  type DeckLayoutDeps,
  type DeckLayoutRoom,
  type PreparedDeck,
} from '@/hooks/use-board-deck-import-layout';

const mockInvoke = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ functions: { invoke: mockInvoke } }),
  useRegisterBoardDeckImport: jest.fn(),
  useAttachBoardDeckImportPins: jest.fn(),
}));

const codec: DeckImageCodec = {
  async decode(bytes) {
    const size = readImageSize(bytes);
    if (!size) throw new Error('undecodable');
    return { ...size, source: null, close: () => undefined };
  },
  async render() {
    return new Blob(['x'], { type: 'image/webp' });
  },
};

/** Pin-role pictures that cropped: exactly what the lay-out places. */
function placeable(deck: PreparedDeck) {
  return deck.manifest.elements.filter(
    (e) => (e.role === 'product' || e.role === 'reference') && deck.crops.has(e.element_key),
  );
}

async function prepareFixture(name: string): Promise<PreparedDeck> {
  const bytes = fixtureBytes(name);
  return prepareDeck(new File([bytes], name), {
    open: async () => openPackage(name, bytes),
    codec,
  });
}

function registration(
  manifest: DeckImportManifest,
  overrides: Partial<DeckImportRegistration> = {},
  attachedKeys: readonly string[] = [],
): DeckImportRegistration {
  return {
    importId: 'import-1',
    resumed: false,
    status: 'pending' as DeckImportRegistration['status'],
    items: manifest.items.map((item, index) => ({
      itemId: `deck-item-${index}`,
      elementKey: item.elementKey,
      boardItemId: attachedKeys.includes(item.elementKey) ? `board-${index}` : null,
      state: 'pending' as DeckImportRegistration['items'][number]['state'],
    })),
    ...overrides,
  };
}

/** The room's upload path, as the hook drives it: one row per file, placed by its override. */
const fakeUpload: DeckLayoutDeps['upload'] = async ({ files, overrides, onProgress }) =>
  files.map((file, index) => {
    onProgress(index);
    const override = overrides[index];
    return {
      id: `uploaded-${index}`,
      type: 'image',
      x: override.point!.x,
      y: override.point!.y,
      width: override.size!.width,
      height: override.size!.height,
      zIndex: override.zIndex,
      rotation: override.rotation,
      locked: false,
      imageUrl: `https://cdn.example/${file.name}`,
      content: null,
      data: { ...override.data, image_url: `https://cdn.example/${file.name}` },
    } as EditableMoodBoardItem;
  });

function harness(
  existing: { sections?: MoodBoardSection[]; items?: EditableMoodBoardItem[] } = {},
) {
  const log: string[] = [];
  const committed: Array<{ sections: readonly MoodBoardSection[]; items: readonly EditableMoodBoardItem[] }> = [];
  const room: DeckLayoutRoom = {
    sections: existing.sections ?? [],
    items: existing.items ?? [],
    commit: (sections, items) => {
      log.push('commit');
      committed.push({ sections, items });
    },
    flush: async () => {
      log.push('flush');
    },
  };
  let seq = 0;
  const deps = {
    register: jest.fn(),
    upload: jest.fn(fakeUpload),
    attach: jest.fn(async () => {
      log.push('attach');
    }),
    kick: jest.fn(async () => {
      log.push('kick');
    }),
    newId: () => `id-${seq++}`,
  };
  return { room, deps, log, committed };
}

describe('deck drop intercept', () => {
  it('classifies decks, old formats to re-save, and everything else', () => {
    expect(deckFileKind({ name: 'Living Room.pptx' })).toBe('deck');
    expect(deckFileKind({ name: 'show.PPSX' })).toBe('deck');
    expect(deckFileKind({ name: 'template.potx' })).toBe('deck');
    expect(
      deckFileKind({
        name: 'unnamed',
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    ).toBe('deck');
    expect(deckFileKind({ name: 'legacy.ppt' })).toBe('resave');
    expect(deckFileKind({ name: 'keynote.key' })).toBe('resave');
    expect(deckFileKind({ name: 'chair.jpg', type: 'image/jpeg' })).toBeNull();
    expect(deckFileKind({ name: 'brief.docx' })).toBeNull();
  });
});

describe('pasted links', () => {
  it('pulls every http(s) URL out of mixed pasted text', () => {
    const text = [
      'Sofa — https://maker.example/sofa?ref=deck, lamp at http://lights.example/arc.',
      'not a link: maker.example/no-scheme and mailto:hi@example.com',
      '(https://rugs.example/runner)',
    ].join('\n');
    const urls = extractPastedUrls(text);
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^https:\/\/maker\.example\/sofa\?ref=deck/),
        expect.stringMatching(/^http:\/\/lights\.example\/arc/),
        expect.stringMatching(/^https:\/\/rugs\.example\/runner/),
      ]),
    );
    expect(urls.every((url) => /^https?:\/\//.test(url))).toBe(true);
    expect(urls.some((url) => url.includes('no-scheme'))).toBe(false);
  });
});

describe('deck pin hold', () => {
  it('holds only pins still to confirm', () => {
    expect(deckPinHoldReason({ data: { deck_import: { state: 'to_confirm' } } })).toBe(DECK_COPY.hold);
    expect(deckPinHoldReason({ data: { deck_import: { state: 'kept' } } })).toBeNull();
    expect(deckPinHoldReason({ data: { deck_import: { state: 'reference' } } })).toBeNull();
    expect(deckPinHoldReason({ data: {} })).toBeNull();
  });
});

describe('prepared deck', () => {
  it('crops the fixture deck and registers placed pictures plus pasted links', async () => {
    const deck = await prepareFixture('structure.pptx');
    expect(deck.crops.size).toBeGreaterThan(0);
    const line = deckLedgerLine(deck);
    if (line !== null) expect(line).toMatch(/couldn't read|no pictures/);

    const firstDeckLink = deck.manifest.deck_links[0]?.url;
    const manifest = buildRegisterManifest(
      deck,
      `https://pasted.example/one ${firstDeckLink ?? ''} https://pasted.example/one`,
    );
    expect(manifest.slideCount).toBe(deck.manifest.slides.length);
    expect(manifest.options).toEqual({ layout: 'section_per_slide' });
    expect(placeable(deck).length).toBeGreaterThan(1);
    expect(manifest.items.map((item) => item.elementKey)).toEqual(
      placeable(deck).map((e) => e.element_key),
    );
    const pasted = manifest.deckLinks.filter((link) => link.source === 'pasted');
    expect(pasted).toEqual([{ url: 'https://pasted.example/one', source: 'pasted' }]);
  });
});

describe('runDeckLayout', () => {
  let deck: PreparedDeck;
  beforeAll(async () => {
    deck = await prepareFixture('structure.pptx');
  });

  it('lays a fresh deck out as one room command, flushes, attaches, then kicks the resolver', async () => {
    const { room, deps, log, committed } = harness({
      items: [{ id: 'old', type: 'note', x: 0, y: 0, width: 100, height: 300, zIndex: 7 } as EditableMoodBoardItem],
    });
    deps.register.mockImplementation(async ({ manifest }: { manifest: DeckImportManifest }) =>
      registration(manifest),
    );
    const progress: string[] = [];

    const result = await runDeckLayout(
      { boardId: 'board-1', deck, room, onProgress: (slide, of) => progress.push(`${slide}/${of}`) },
      deps,
    );

    expect(deps.register).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: 'board-1',
        fileSha256: deck.manifest.deck_sha256,
        fileName: 'structure.pptx',
      }),
    );
    const placed = placeable(deck);
    expect(result).toEqual({ importId: 'import-1', resumed: false, placed: placed.length });
    // Commit lands before flush, attach waits for the flush, the kick is last.
    expect(log).toEqual(['commit', 'flush', 'attach', 'kick']);
    expect(committed).toHaveLength(1);
    expect(deps.kick).toHaveBeenCalledWith('import-1');
    expect(progress.length).toBe(placed.length);
    expect(progress[0]).toMatch(new RegExp(`/${deck.manifest.slides.length}$`));

    const { sections, items } = committed[0];
    const titled = deck.manifest.slides.filter((slide) => slide.title);
    expect(sections.length).toBeGreaterThan(0);
    for (const slide of titled) {
      if (placed.some((e) => e.slide_index === slide.index)) {
        expect(sections.map((section) => section.name)).toContain(slide.title);
      }
    }

    const pins = items.filter((item) => item.type !== 'note');
    expect(pins).toHaveLength(placed.length);
    for (const pin of pins) {
      const deckImport = pin.data?.deck_import as Record<string, unknown>;
      expect(pin.data?.provenance).toBe('imported_deck');
      expect(deckImport.import_id).toBe('import-1');
      expect(typeof deckImport.item_id).toBe('string');
      // Below the existing item (bottom 300 + gutter), above its z.
      expect(pin.y).toBeGreaterThanOrEqual(300);
      expect(pin.zIndex).toBeGreaterThan(7);
      if (deckImport.role === 'product') {
        expect(pin.type).toBe('capture');
        expect(deckImport.state).toBe('to_confirm');
        expect(deckPinHoldReason(pin)).toBe(DECK_COPY.hold);
      } else {
        expect(deckImport.role).toBe('reference');
        expect(pin.type).toBe('image');
        expect(deckImport.state).toBe('reference');
        expect(deckPinHoldReason(pin)).toBeNull();
      }
      expect(sections.map((section) => section.id)).toContain(pin.data?.section_id);
    }
    const productCount = placed.filter((e) => e.role === 'product').length;
    // The fixture exercises both branches.
    expect(productCount).toBeGreaterThan(0);
    expect(placed.length - productCount).toBeGreaterThan(0);
    expect(pins.filter((pin) => pin.type === 'capture')).toHaveLength(productCount);

    const notes = items.filter((item) => item.type === 'note');
    for (const note of notes) {
      expect(note.data?.provenance).toBe('imported_deck');
      expect(note.content?.trim()).toBeTruthy();
    }

    expect(deps.attach).toHaveBeenCalledWith({
      importId: 'import-1',
      pins: pins.map((pin) => ({ elementKey: expect.any(String), boardItemId: pin.id })),
    });
  });

  it('resumes: skips attached pictures, reuses named sections and adds no notes', async () => {
    const first = placeable(deck)[0];
    const firstSlideTitle = deck.manifest.slides[first.slide_index]?.title ?? `Slide ${first.slide_index + 1}`;
    const existingSection = { id: 'section-existing', name: firstSlideTitle } as MoodBoardSection;
    const { room, deps, committed } = harness({ sections: [existingSection] });
    deps.register.mockImplementation(async ({ manifest }: { manifest: DeckImportManifest }) =>
      registration(manifest, { resumed: true }, [first.element_key]),
    );

    const result = await runDeckLayout({ boardId: 'board-1', deck, room }, deps);

    expect(result.resumed).toBe(true);
    expect(result.placed).toBe(placeable(deck).length - 1);
    const uploadedFiles = deps.upload.mock.calls[0][0].files;
    expect(uploadedFiles).toHaveLength(placeable(deck).length - 1);
    const { sections, items } = committed[0];
    expect(items.some((item) => item.type === 'note')).toBe(false);
    expect(sections.map((section) => section.name)).not.toContain(existingSection.name);
    expect(deps.attach.mock.calls[0][0].pins.map((pin: { elementKey: string }) => pin.elementKey))
      .not.toContain(first.element_key);
  });

  it('does nothing but kick when every picture is already on the board', async () => {
    const { room, deps, log } = harness();
    deps.register.mockImplementation(async ({ manifest }: { manifest: DeckImportManifest }) =>
      registration(manifest, { resumed: true }, manifest.items.map((item) => item.elementKey)),
    );
    const result = await runDeckLayout({ boardId: 'board-1', deck, room }, deps);
    expect(result.placed).toBe(0);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(log).toEqual(['kick']);
  });
});

describe('kickDeckImportResolver', () => {
  it('posts the import id and tolerates a missing (404) resolver', async () => {
    mockInvoke.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(kickDeckImportResolver('import-9')).resolves.toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledWith('board-deck-import-resolve', {
      body: { import_id: 'import-9' },
    });
  });
});
