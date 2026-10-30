import Link from 'next/link';
import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Round8PaperFrame, { type Round8Pieces, type Round8PaperFrameProps } from '../round8-paper-frame';
import type { DocumentFrameSlots } from '../frame-slots';
import { ROUND8_PAPER_ORDER } from '@/lib/document/round8-paper-order';

import { rememberPaperOrigin, takeDeskReturn } from '@/lib/document/paper/paper-origin';
import { LENS_RESOLVE_MAX_MS, LENS_RESOLVE_STABLE_FRAMES } from '@/lib/document/lens-constants';
import { UNFOLD_REGION_EVENT } from '@/lib/document/document-index';
import { REVEAL_FAILSAFE_MS, revealStep, useChapterReveal, type RevealState } from '../use-chapter-reveal';
import { scrollIntoRevealed, SHOWN_ATTRIBUTE } from '@/lib/document/paper-reveal';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Closeout chapter's acceptance instrument reads its own data; its
// behaviour is proven in service-acceptance/__tests__.
jest.mock('@/components/document/service-acceptance/service-acceptance-section', () => ({
  ServiceAcceptanceSection: ({ projectId }: { projectId: string }) => (
    <div data-service-acceptance-mount={projectId} />
  ),
}));
// Likewise studio service completion (service-completion/__tests__).
jest.mock('@/components/document/service-completion/studio-service-section', () => ({
  StudioServiceSection: ({ projectId }: { projectId: string }) => (
    <div data-studio-service-mount={projectId} />
  ),
}));

// The page owns the data reads; a gate stands in for its read here.
let roomFilesReady = false;
let visitsReady = false;
const GATES: Round8PaperFrameProps['gates'] = {
  design: ({ children }: { children: ReactNode }) => (roomFilesReady ? children : null),
  site: ({ children }: { children: ReactNode }) => (visitsReady ? children : null),
};

function slots(overrides: Partial<DocumentFrameSlots> = {}): DocumentFrameSlots {
  return {
    arrival: <div data-slot="arrival" />,
    letterhead: <div data-slot="letterhead" />,
    ticketFacts: <div data-slot="ticket-facts" />,
    band: <div data-slot="band" />,
    household: <div data-slot="household" />,
    frontMatter: <div data-slot="front-matter" />,
    approvals: <div data-slot="approvals" />,
    scheduleScope: (children) => <div data-slot="schedule-scope">{children}</div>,
    schedule: <div data-slot="schedule" />,
    activeSpread: <div data-slot="active-spread" />,
    accountBand: <div data-slot="account-band" />,
    kickoff: <div data-slot="kickoff" />,
    record: <div data-slot="record" />,
    colophon: <div data-slot="colophon" />,
    margin: <div data-slot="margin" />,
    overlays: <div data-slot="overlays" />,
    ...overrides,
  } as DocumentFrameSlots;
}

const piece = (name: string) => <div data-slot={name} />;
const fileDrop = {
  onDragOver: jest.fn(),
  onDragLeave: jest.fn(),
  onDrop: jest.fn(),
};
function pieces(section = 'project'): Round8Pieces {
  return {
    section,
    stageLine: piece('stage-line'),
    fileDrop,
    brief: null,
    roomFiles: piece('room-files'),
    scheduleSpine: piece('schedule-spine'),
    visits: piece('visits'),
    projectFfe: piece('project-ffe'),
    projectMoney: piece('project-money'),
    projectCare: piece('project-care'),
    installFfe: piece('install-ffe'),
    installCeremony: piece('install-ceremony'),
    installMoney: piece('install-money'),
    installCare: piece('install-care'),
    careSection: piece('care-section'),
    careFfe: piece('care-ffe'),
    careMoney: piece('care-money'),
  };
}

function renderFrame(props: Partial<Round8PaperFrameProps> = {}) {
  const onSelect = jest.fn();
  const onCommitted = jest.fn();
  const utils = render(
    <Round8PaperFrame
      slots={slots()}
      shellProps={{ 'data-reading-index': 'approvals', 'data-arr-engagement': 'eng-1' }}
      paperProps={{ 'data-shelf-open': undefined }}
      docId="doc-1"
      onCommitted={onCommitted}
      jobName="The Harbour House"
      pieces={pieces()}
      gates={GATES}
      projectId="project-1"
      contents={{
        subLabels: { ffe: 'Price the console LR-36' },
        regions: [],
        mountedKeys: ['approvals', 'schedule', 'ffe'],
        activeKey: 'approvals',
        onSelect,
      }}
      roomInHand={null}
      {...props}
    />,
  );
  return { ...utils, onSelect, onCommitted };
}

const mountedChapters = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-paper-chapter]')).map((el) =>
    el.getAttribute('data-paper-chapter'),
  );

beforeEach(() => {
  roomFilesReady = false;
  visitsReady = false;
});

describe('Round8PaperFrame', () => {
  it('keeps the shell DOM contract and marks itself as the round-8 renderer', () => {
    const { container } = renderFrame();
    const shell = container.querySelector('[data-document-shell]')!;

    expect(shell.getAttribute('data-paper-renderer')).toBe('round8');
    expect(shell.getAttribute('data-shell-regime')).toBe(
      'single-below-1180-narrow-to-1439-full-from-1440',
    );
    expect(shell.getAttribute('data-reading-index')).toBe('approvals');
    expect(shell.getAttribute('data-arr-engagement')).toBe('eng-1');
    expect(shell.querySelectorAll('main[data-document-paper][data-spotlight-frame]')).toHaveLength(1);
    // The arrival curtain stands before the shell, as in the legacy frame.
    expect(container.firstElementChild?.getAttribute('data-slot')).toBe('arrival');
  });

  it('prints the job head, then the cover, then the chapters, then the colophon', () => {
    const { container } = renderFrame();
    const paper = container.querySelector('main[data-document-paper]')!;
    const cover = paper.querySelector('[data-paper-cover]')!;

    const head = container.querySelector('[data-job-head]')!;
    expect(head).toHaveTextContent('The Harbour House');
    expect(within(head as HTMLElement).getByRole('link', { name: 'Studio' })).toHaveAttribute('href', '/desk');
    expect(head.compareDocumentPosition(paper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      Array.from(cover.querySelectorAll('[data-slot]')).map((el) => el.getAttribute('data-slot')),
    ).toEqual(['letterhead', 'ticket-facts', 'band', 'household', 'front-matter']);
    const firstChapter = paper.querySelector('[data-paper-chapter]')!;
    expect(cover.compareDocumentPosition(firstChapter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(paper.lastElementChild?.getAttribute('data-slot')).toBe('colophon');
  });

  it('opens Design boards and the Specification book from their job chapters', () => {
    roomFilesReady = true;
    const { container } = renderFrame();
    const design = container.querySelector('[data-paper-chapter="design"]') as HTMLElement;
    const ffe = container.querySelector('[data-paper-chapter="ffe"]') as HTMLElement;
    expect(within(design).getByRole('link', { name: 'Design boards' }))
      .toHaveAttribute('href', '/doc/project-1/boards');
    expect(within(ffe).getByRole('link', { name: 'Specification book' }))
      .toHaveAttribute('href', '/doc/project-1/spec-book');
  });

  it.each(['install', 'care'])('keeps the existing Spec book door alone on the %s spread', (section) => {
    const { container } = renderFrame({ pieces: {
      ...pieces(section),
      [`${section}Ffe`]: <Link href="/doc/project-1/spec-book">Spec book →</Link>,
    } });
    const ffe = container.querySelector('[data-paper-chapter="ffe"]') as HTMLElement;
    expect(within(ffe).getAllByRole('link', { name: /spec book/i })).toHaveLength(1);
    expect(within(ffe).queryByRole('link', { name: 'Specification book' })).toBeNull();
  });

  it('mounts only the chapters with content, in ROUND8_PAPER_ORDER, inside the schedule scope', () => {
    const { container } = renderFrame();

    // brief is null, cabinetry has no slot, design and site wait on their reads.
    expect(mountedChapters(container)).toEqual([
      'approvals',
      'schedule',
      'ffe',
      'financials',
      'closeout',
      'record',
    ]);
    const scope = container.querySelector('[data-slot="schedule-scope"]')!;
    expect(scope.querySelectorAll('[data-paper-chapter]')).toHaveLength(6);
    // The project spread's pieces, each inside its chapter.
    const inChapter = (chapter: string, slot: string) =>
      container.querySelector(`[data-paper-chapter="${chapter}"] [data-slot="${slot}"]`);
    expect(inChapter('schedule', 'schedule-spine')).not.toBeNull();
    expect(inChapter('ffe', 'project-ffe')).not.toBeNull();
    expect(inChapter('financials', 'project-money')).not.toBeNull();
    expect(inChapter('financials', 'account-band')).not.toBeNull();
    expect(inChapter('closeout', 'project-care')).not.toBeNull();
    // The legacy one-spread composition is not printed on the continuous paper.
    expect(container.querySelector('[data-slot="active-spread"]')).toBeNull();
    expect(container.querySelectorAll('[data-slot="account-band"]')).toHaveLength(1);
  });

  it.each([
    ['install', ['install-ffe'], ['install-money'], ['install-ceremony', 'install-care']],
    ['care', ['care-ffe'], ['care-money'], ['care-section']],
  ])('places the %s spread\'s pieces in their chapters', (section, ffe, money, closeout) => {
    const { container } = renderFrame({ pieces: pieces(section) });
    const slotsIn = (chapter: string) =>
      Array.from(container.querySelectorAll(`[data-paper-chapter="${chapter}"] [data-slot]`)).map((el) =>
        el.getAttribute('data-slot'),
      );
    expect(slotsIn('ffe')).toEqual(ffe);
    expect(slotsIn('financials')).toEqual([...money, 'account-band']);
    expect(slotsIn('closeout')).toEqual(closeout);
    expect(slotsIn('schedule')).toEqual(['stage-line', 'schedule']);
  });

  it('mounts service acceptance after the stage pieces in the Closeout chapter', async () => {
    const { container } = renderFrame();
    const closeout = container.querySelector('[data-paper-chapter="closeout"]')!;
    const mount = await within(closeout as HTMLElement).findByText(
      (_, element) => element?.getAttribute('data-service-acceptance-mount') === 'project-1',
    );
    expect(closeout.querySelector('[data-slot="project-care"]')!.compareDocumentPosition(mount))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.querySelectorAll('[data-service-acceptance-mount]')).toHaveLength(1);
    // Studio service completion reads beside acceptance, after it, in the same chapter.
    const studio = await within(closeout as HTMLElement).findByText(
      (_, element) => element?.getAttribute('data-studio-service-mount') === 'project-1',
    );
    expect(mount.compareDocumentPosition(studio)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.querySelectorAll('[data-studio-service-mount]')).toHaveLength(1);
  });

  it("mounts Design and Site only when the page's gates find content", () => {
    roomFilesReady = true;
    visitsReady = true;
    const { container } = renderFrame();

    expect(mountedChapters(container)).toEqual([
      'design',
      'approvals',
      'schedule',
      'ffe',
      'site',
      'financials',
      'closeout',
      'record',
    ]);
  });

  it('renders the brief slot as the brief and agreement chapter', () => {
    const { container } = renderFrame({ pieces: {
      ...pieces(),
      brief: { brief: 'Original piano inquiry', discovery: 'Measured rooms', agreement: 'Agreed services' },
    } });
    const chapter = container.querySelector('[data-paper-chapter="brief"]') as HTMLElement;
    expect(chapter.querySelector('[data-brief-agreement-chapter]')).not.toBeNull();
    expect(within(chapter).getByRole('heading', { name: 'Original brief' })).toBeInTheDocument();
    expect(chapter).toHaveTextContent('Original piano inquiry');
    expect(chapter).toHaveTextContent('Measured rooms');
    expect(chapter).toHaveTextContent('Agreed services');
  });

  it('gives each chapter a focusable heading the contents can land on', () => {
    const { container } = renderFrame();
    const heading = container.querySelector('#ffe-chapter-heading') as HTMLElement;

    expect(heading).not.toBeNull();
    expect(heading.tabIndex).toBe(-1);
    expect(container.querySelector('[data-paper-chapter="ffe"]')!.getAttribute('data-index-region')).toBe('ffe');
  });

  it('lists exactly the mounted chapters in the contents margin and reports a press', async () => {
    const { onSelect } = renderFrame();
    const nav = screen.getByRole('navigation', { name: 'Job contents' });
    const rows = within(nav).getAllByRole('button');

    expect(rows.map((row) => row.getAttribute('data-contents-entry'))).toEqual([
      'approvals',
      'schedule',
      'ffe',
    ]);
    // Numbered from ROUND8_PAPER_ORDER, sub-labelled with the carried region's reading.
    expect(rows[2]).toHaveTextContent('06');
    expect(rows[2]).toHaveTextContent(ROUND8_PAPER_ORDER[5].label);
    expect(rows[2]).toHaveTextContent('Price the console LR-36');
    await userEvent.click(rows[2]);
    expect(onSelect).toHaveBeenCalledWith('ffe');
  });

  it('prints a pre-work document as its current regions, not as chapters', () => {
    const { container } = renderFrame({
      pieces: null,
      projectId: null,
      contents: {
        subLabels: {},
        regions: [{ key: 'proposal', label: 'The proposal' }],
        mountedKeys: ['proposal'],
        activeKey: null,
        onSelect: jest.fn(),
      },
    });

    expect(container.querySelector('[data-paper-chapter]')).toBeNull();
    const scope = container.querySelector('[data-slot="schedule-scope"]')!;
    expect(scope.querySelector('[data-slot="active-spread"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="account-band"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="kickoff"]')).not.toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Job contents' });
    expect(within(nav).getAllByRole('button').map((row) => row.getAttribute('data-contents-entry'))).toEqual([
      'proposal',
    ]);
  });

  it('carries DocSpine\'s room-in-hand release under the job head', async () => {
    const onRelease = jest.fn();
    renderFrame({ roomInHand: { name: 'Living room', onRelease } });

    expect(screen.getByText('Room in hand: Living room')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Release the room' }));
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('heads the Schedule chapter with the live workflow tracks', () => {
    const { container } = renderFrame();
    const schedule = container.querySelector('[data-paper-chapter="schedule"]')!;
    const slotsIn = Array.from(schedule.querySelectorAll('[data-slot]')).map((el) =>
      el.getAttribute('data-slot'),
    );
    expect(slotsIn).toEqual(['stage-line', 'schedule', 'schedule-spine']);
    expect(container.querySelectorAll('[data-slot="stage-line"]')).toHaveLength(1);
  });

  it('hangs the section file-drop host on the FF&E chapter, around the folio it feeds', () => {
    fileDrop.onDragOver.mockClear();
    fileDrop.onDrop.mockClear();
    const { container } = renderFrame({ pieces: pieces('install') });
    const hosts = container.querySelectorAll('[data-section-file-drop]');
    expect(hosts).toHaveLength(1);
    const host = hosts[0] as HTMLElement;
    expect(host.querySelector('[data-paper-chapter="ffe"] [data-slot="install-ffe"]')).not.toBeNull();

    // A drop anywhere on the chapter — not only on the strip — reaches the host.
    const heading = container.querySelector('#ffe-chapter-heading')!;
    fireEvent.dragOver(heading, { dataTransfer: { types: ['Files'], files: [] } });
    fireEvent.drop(heading, { dataTransfer: { types: ['Files'], files: [] } });
    expect(fileDrop.onDragOver).toHaveBeenCalledTimes(1);
    expect(fileDrop.onDrop).toHaveBeenCalledTimes(1);
  });

  it('reports its own commit once, so the page lands only on a mounted paper', () => {
    const { onCommitted, rerender } = renderFrame();
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(onCommitted).toHaveBeenCalledWith(true);
    rerender(
      <Round8PaperFrame
        slots={slots()}
        shellProps={{}}
        paperProps={{}}
        docId="doc-1"
        onCommitted={onCommitted}
        jobName="The Harbour House"
        pieces={pieces()}
        gates={GATES}
        projectId="project-1"
        contents={{ subLabels: {}, regions: [], mountedKeys: [], activeKey: null, onSelect: jest.fn() }}
        roomInHand={null}
      />,
    );
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });

  it('never renders DocSpine', () => {
    const { container } = renderFrame();
    expect(container.querySelector('[data-doc-spine]')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'This paper' })).toBeNull();
  });
});


it('refreshes the mounted JobHead from People to same-job Accounts without replacing the shell', () => {
  window.sessionStorage.clear();
  rememberPaperOrigin('doc-1', { path: '/people', search: '?person=person-1' });
  const { container } = renderFrame();
  const shell = container.querySelector('[data-document-shell]');
  expect(screen.getByRole('link', { name: 'Studio contacts' })).toHaveAttribute('href', '/people?person=person-1');
  act(() => rememberPaperOrigin('doc-1', { path: '/desk', studioOverlay: {
    overlay: 'books', filter: 'receivables', focusKey: 'invoice-1:open-invoice-document', scrollTop: 67,
  } }));
  expect(container.querySelector('[data-document-shell]')).toBe(shell);
  expect(container.querySelector('[data-job-head-return]')).toHaveAttribute('href', '/desk');
  fireEvent.click(screen.getByRole('link', { name: 'Studio' }));
  expect(takeDeskReturn()?.studioOverlay).toMatchObject({ overlay: 'books', filter: 'receivables', focusKey: 'invoice-1:open-invoice-document', scrollTop: 67 });
});

/*
 * RC7-E8-4 — the paper body reveals chapter by chapter, top down. jsdom
 * evaluates no stylesheet, so the hold is read from round8.css and its selector
 * run against the frame's real DOM; the reveal order is driven frame by frame.
 */
describe('RC7-E8-4 — the paper body reveals chapter by chapter', () => {
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const round8Css = strip(readFileSync(join(__dirname, '..', '..', 'paper', 'round8.css'), 'utf8'));
  const globalsCss = strip(readFileSync(join(__dirname, '..', '..', '..', '..', 'app', 'globals.css'), 'utf8'));
  const holds = [...round8Css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim().replace(/\s+/g, ' '), body: body.trim() }))
    .filter(({ selector }) => selector.includes(':not([data-lens-resolved])'));
  const HOLD =
    '[data-paper-renderer="round8"][data-document-shell]:not([data-lens-resolved]) [data-document-paper] > :not([data-paper-cover]):not([data-paper-shown])';

  it('is one rule on the round-8 shell, released per child or by the lens', () => {
    expect(holds).toHaveLength(1);
    expect(holds[0]!.selector).toBe(HOLD);
  });

  it('holds paint only, with a per-child failsafe past the lens deadline', () => {
    const properties = holds[0]!.body.split(';').map((decl) => decl.split(':')[0]!.trim()).filter(Boolean);
    expect(properties).toEqual(['opacity', 'animation']);
    const failsafe = /animation:\s*doc-fade 1ms linear (\d+)ms both/.exec(holds[0]!.body);
    expect(Number(failsafe?.[1])).toBeGreaterThan(LENS_RESOLVE_MAX_MS);
    // The sampler gives up exactly when the CSS would have shown everything anyway.
    expect(Number(failsafe?.[1])).toBe(REVEAL_FAILSAFE_MS);
    expect(globalsCss).toMatch(
      /@keyframes doc-fade\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}\s*\}/,
    );
  });

  const heldIn = (container: HTMLElement) => (el: Element) =>
    Array.from(container.querySelectorAll(HOLD)).some((root) => root.contains(el));
  const chapter = (container: HTMLElement, key: string) =>
    container.querySelector(`[data-paper-chapter="${key}"]`)!;
  // The page's schedule scope is providers only (no element), so each chapter
  // is its own child of the paper; the harness default wraps them in a div.
  const asOnPage = () => renderFrame({ slots: slots({ scheduleScope: (children) => <>{children}</> }) });

  it('mounts holding every chapter and the colophon, never the cover, head or margin', () => {
    roomFilesReady = true;
    visitsReady = true;
    const { container } = renderFrame();
    const isHeld = heldIn(container);
    const chapters = Array.from(container.querySelectorAll('[data-paper-chapter]'));
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters.every(isHeld)).toBe(true);
    expect(isHeld(container.querySelector('[data-slot="colophon"]')!)).toBe(true);
    expect(isHeld(container.querySelector('[data-paper-cover] [data-slot="letterhead"]')!)).toBe(false);
    expect(isHeld(container.querySelector('[data-job-head]')!)).toBe(false);
    expect(isHeld(container.querySelector('[data-slot="margin"]')!)).toBe(false);
    container.querySelector('[data-document-shell]')!.setAttribute('data-lens-resolved', 'true');
    expect(container.querySelectorAll(HOLD)).toHaveLength(0);
  });

  /** A paper of four children whose tops the test sets, frame by frame. */
  function paperOf(keys: string[]) {
    const paper = document.createElement('main');
    paper.innerHTML =
      '<div data-paper-cover=""></div>' +
      keys.map((key) => `<section data-paper-chapter="${key}" data-index-region="${key}"></section>`).join('');
    const tops = new Map<Element, number>();
    for (const el of [paper, ...Array.from(paper.children)]) {
      el.getBoundingClientRect = () => ({ top: tops.get(el) ?? 0 }) as DOMRect;
    }
    const shown = () =>
      Array.from(paper.querySelectorAll(`[${SHOWN_ATTRIBUTE}]`)).map((el) => el.getAttribute('data-paper-chapter'));
    const at = (key: string) => paper.querySelector(`[data-paper-chapter="${key}"]`)!;
    return { paper, tops, shown, at };
  }
  const frames = (paper: Element, state: RevealState, n: number) => {
    for (let i = 0; i < n; i++) revealStep(paper, state);
  };

  it('reveals in paper order once the tops have held for the lens frame count', () => {
    const { paper, shown } = paperOf(['brief', 'design', 'schedule']);
    const state: RevealState = { tops: new WeakMap() };
    frames(paper, state, LENS_RESOLVE_STABLE_FRAMES);
    expect(shown()).toEqual([]);
    frames(paper, state, 1);
    expect(shown()).toEqual(['brief', 'design', 'schedule']);
  });

  it('stops at the first chapter below a loading register, and at a top still moving', () => {
    const { paper, tops, shown, at } = paperOf(['brief', 'design', 'schedule', 'ffe']);
    const busy = document.createElement('p');
    busy.setAttribute('aria-busy', 'true');
    at('design').appendChild(busy);
    const state: RevealState = { tops: new WeakMap() };
    frames(paper, state, LENS_RESOLVE_STABLE_FRAMES + 1);
    // design is revealed (nothing above it is loading); what it pushes is not.
    expect(shown()).toEqual(['brief', 'design']);

    busy.remove();
    let y = 400;
    tops.set(at('schedule'), y);
    tops.set(at('ffe'), y + 100);
    for (let i = 0; i < LENS_RESOLVE_STABLE_FRAMES + 1; i++) {
      // design is still growing: schedule's top moves every frame.
      y += 50;
      tops.set(at('schedule'), y);
      tops.set(at('ffe'), y + 100);
      revealStep(paper, state);
    }
    expect(shown()).toEqual(['brief', 'design']);
    frames(paper, state, LENS_RESOLVE_STABLE_FRAMES);
    expect(shown()).toEqual(['brief', 'design', 'schedule', 'ffe']);
  });

  it('holds what lies below a region the lens still holds quiet, until it resolves', () => {
    const { paper, shown, at } = paperOf(['design', 'approvals', 'schedule']);
    const quiet = document.createElement('section');
    quiet.setAttribute('data-density', 'quiet');
    at('approvals').appendChild(quiet);
    const state: RevealState = { tops: new WeakMap() };
    frames(paper, state, LENS_RESOLVE_STABLE_FRAMES + 1);
    // At resolution a quiet region whose own data reads full takes its height at once.
    expect(shown()).toEqual(['design', 'approvals']);
    quiet.setAttribute('data-density', 'full');
    revealStep(paper, state);
    expect(shown()).toEqual(['design', 'approvals', 'schedule']);
  });

  it('holds everything while the cover itself is still loading', () => {
    const { paper, shown } = paperOf(['brief', 'design']);
    paper.querySelector('[data-paper-cover]')!.innerHTML = '<span class="animate-pulse"></span>';
    frames(paper, { tops: new WeakMap() }, LENS_RESOLVE_STABLE_FRAMES + 2);
    expect(shown()).toEqual([]);
  });

  it('reveals a jumped-to chapter and every chapter above it at once', () => {
    roomFilesReady = true;
    visitsReady = true;
    const { container } = asOnPage();
    const isHeld = heldIn(container);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNFOLD_REGION_EVENT, { detail: { region: 'schedule' } }));
    });
    for (const key of ['design', 'approvals', 'schedule']) expect(isHeld(chapter(container, key))).toBe(false);
    expect(isHeld(chapter(container, 'ffe'))).toBe(true);
    // A legacy region key lands on the chapter that carries it (money → 08 Financials).
    act(() => {
      window.dispatchEvent(new CustomEvent(UNFOLD_REGION_EVENT, { detail: { region: 'money' } }));
    });
    for (const key of ['ffe', 'site', 'financials']) expect(isHeld(chapter(container, key))).toBe(false);
    expect(isHeld(chapter(container, 'closeout'))).toBe(true);
  });

  it('reveals the chapter a landing focuses, and every chapter above it', () => {
    const { container } = asOnPage();
    const isHeld = heldIn(container);
    const heading = container.querySelector<HTMLElement>('#closeout-chapter-heading')!;
    act(() => heading.focus());
    expect(document.activeElement).toBe(heading);
    for (const key of ['approvals', 'schedule', 'ffe', 'financials', 'closeout']) {
      expect(isHeld(chapter(container, key))).toBe(false);
    }
    expect(isHeld(chapter(container, 'record'))).toBe(true);
  });

  /**
   * The hook on a hand-built round-8 shell. Each chapter is laid out at a page
   * offset, and its rect follows `window.scrollY`. The sampler's frames run
   * only when the test flushes them.
   */
  function mounted(layout: Record<string, [top: number, height: number]>, before?: (paper: HTMLElement) => void) {
    const shell = document.createElement('div');
    shell.setAttribute('data-document-shell', '');
    shell.setAttribute('data-paper-renderer', 'round8');
    const grid = document.createElement('div');
    const { paper, shown, at } = paperOf(Object.keys(layout));
    paper.setAttribute('data-document-paper', '');
    grid.appendChild(paper);
    shell.appendChild(grid);
    document.body.appendChild(shell);
    for (const [key, [top, height]] of Object.entries(layout)) {
      at(key).getBoundingClientRect = () =>
        ({ top: top - window.scrollY, bottom: top + height - window.scrollY }) as DOMRect;
    }
    const queue: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queue.push(cb));
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    before?.(paper);
    const hook = renderHook(() => useChapterReveal({ current: grid }));
    const flush = () => queue.splice(0).forEach((cb) => cb(performance.now()));
    const scrollTo = (y: number) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
    };
    return { shell, paper, shown, at, queue, flush, scrollTo, hook };
  }
  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    document.body.innerHTML = '';
  });
  const LAYOUT: Record<string, [number, number]> = {
    brief: [300, 300],
    design: [600, 400],
    schedule: [1000, 600],
    ffe: [1600, 600],
    record: [2200, 400],
  };

  it('stops sampling once every chapter shows', () => {
    const { shown, queue, flush } = mounted(LAYOUT);
    for (let i = 0; i <= LENS_RESOLVE_STABLE_FRAMES; i++) flush();
    expect(shown()).toEqual(Object.keys(LAYOUT));
    expect(queue).toHaveLength(0);
  });

  it('stops sampling at the CSS failsafe when the lens never resolves', () => {
    const { paper, shown, queue, flush } = mounted(LAYOUT);
    paper.querySelector('[data-paper-cover]')!.innerHTML = '<span aria-busy="true"></span>';
    const now = jest.spyOn(performance, 'now').mockReturnValue(performance.now());
    for (let i = 0; i < 10; i++) flush();
    expect(queue).toHaveLength(1);
    now.mockReturnValue(now() + REVEAL_FAILSAFE_MS);
    flush();
    expect(queue).toHaveLength(0);
    expect(shown()).toEqual([]);
  });

  it('stops sampling at lens resolution', () => {
    const { shell, queue, flush } = mounted(LAYOUT);
    flush();
    shell.setAttribute('data-lens-resolved', 'true');
    flush();
    expect(queue).toHaveLength(0);
  });

  it('leaves the first screen to the sampler while nobody has scrolled', () => {
    const { shown, scrollTo } = mounted(LAYOUT);
    // A scroll event at the opening position (a layout nudge, a no-op scrollTo).
    scrollTo(0);
    expect(shown()).toEqual([]);
  });

  it('reveals what a scroll away from the opening reaches, and everything above it', () => {
    const { shown, scrollTo } = mounted(LAYOUT);
    // find-in-page / a screen reader's cursor: the viewport now spans 1100–1868.
    scrollTo(1100);
    expect(window.innerHeight).toBe(768);
    expect(shown()).toEqual(['brief', 'design', 'schedule', 'ffe']);
  });

  it('a returning reader is landed on a chapter that is already revealed', () => {
    const { at, shown } = mounted(LAYOUT);
    const target = at('ffe');
    let shownAtScroll: (string | null)[] = [];
    target.scrollIntoView = jest.fn(() => {
      shownAtScroll = shown();
    });
    scrollIntoRevealed(target, { block: 'start' });
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(shownAtScroll).toEqual(['brief', 'design', 'schedule', 'ffe']);
  });

  it('reveals the target even when its scroll is a no-op (already in place, or no scrollIntoView)', () => {
    const { at, shown } = mounted(LAYOUT);
    // design already sits in the first screen: the scroll moves nothing.
    const target = at('design') as HTMLElement;
    target.scrollIntoView = jest.fn();
    scrollIntoRevealed(target, { block: 'center' });
    expect(window.scrollY).toBe(0);
    expect(shown()).toEqual(['brief', 'design']);
    // jsdom-like: no scrollIntoView at all. Still revealed.
    const lower = at('schedule') as HTMLElement & { scrollIntoView?: unknown };
    lower.scrollIntoView = undefined;
    scrollIntoRevealed(lower, { block: 'start' });
    expect(shown()).toEqual(['brief', 'design', 'schedule']);
    scrollIntoRevealed(null);
  });

  it('reveals through the chapter a hash names, at mount', () => {
    const line = document.createElement('div');
    line.id = 'ffe-selection-l1';
    window.history.replaceState(null, '', '#ffe-selection-l1');
    try {
      const { at, shown, queue } = mounted(LAYOUT, (paper) => paper.querySelector('[data-paper-chapter="schedule"]')!.appendChild(line));
      // Before any sampler frame.
      expect(queue).toHaveLength(1);
      expect(at('schedule').contains(line)).toBe(true);
      expect(shown()).toEqual(['brief', 'design', 'schedule']);
    } finally {
      window.history.replaceState(null, '', window.location.pathname);
    }
  });

  it('reveals what a position restored before mount puts in view', () => {
    Object.defineProperty(window, 'scrollY', { value: 1100, configurable: true });
    const { shown } = mounted(LAYOUT);
    expect(shown()).toEqual(['brief', 'design', 'schedule', 'ffe']);
  });

  /*
   * Every scroll to an element of the paper goes through `scrollIntoRevealed`.
   * A bare scroll is allowed only where it can never reach a round-8 chapter.
   */
  it('scrolls nowhere on the document surface except through the reveal', () => {
    const SCROLL = /\.\s*scroll(?:IntoView|To|By)\s*(?:\?\.\s*)?\(/g;
    const src = join(__dirname, '..', '..', '..', '..');
    const OUTSIDE_THE_PAPER: Record<string, number> = {
      'app/(document)/doc/[id]/page.tsx': 1, // toTop: the letterhead, in the cover (never held)
      'components/document/letterhead-instruments.tsx': 2, // the cover
      'components/document/letterhead-vitals.tsx': 1, // the cover
      'components/document/margin-rail.tsx': 1, // the margin
      'components/document/day-sheet.tsx': 1, // the Desk
      'components/document/arrival/arrival-mount.tsx': 1, // the Desk roster
      'components/document/help/desk-walkthrough.tsx': 1, // the Desk tour
      'components/document/accounts/accounts-receivables-page.tsx': 1, // its own page
      'components/document/spec-books/spec-book-workspace.tsx': 1, // its own page
      'components/document/rooms/drafting/drafting-room.tsx': 1, // a room
      'components/document/rooms/drafting/agreement/agreement-composer.tsx': 4, // a room
      'components/document/rooms/piece/piece-room.tsx': 1, // a room
      'components/document/pieces/build-room-shell.tsx': 1, // standalone only; embedded, the host lands
      'components/document/coordination/coordination-band.tsx': 1, // not mounted on the paper
    };
    const walk = (dir: string): string[] =>
      readdirSync(join(src, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(rel);
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : [];
      });
    const files = ['app/(document)/doc/[id]/page.tsx', ...walk('components/document')].filter(
      (rel) => rel !== 'components/document/frame/use-chapter-reveal.ts',
    );
    expect(files).toEqual(expect.arrayContaining(['components/document/ffe-section.tsx', 'components/document/paper/chapters/ffe-chapter.tsx']));
    const bare = Object.fromEntries(
      files
        .map((rel) => [rel, (readFileSync(join(src, rel), 'utf8').match(SCROLL) ?? []).length] as const)
        .filter(([, n]) => n > 0),
    );
    expect(bare).toEqual(OUTSIDE_THE_PAPER);
    // The scan itself sees every spelling.
    const spellings = ['a?.scrollIntoView?.(x)', 'b.scrollTo (0)', 'c\n  .scrollBy?. (1)', 'd.scrollIntoView('];
    expect(spellings.filter((text) => text.match(SCROLL))).toEqual(spellings);
    // The returning reader's landing and the section landing reveal first.
    const page = readFileSync(join(src, 'app/(document)/doc/[id]/page.tsx'), 'utf8');
    expect(page).toMatch(/scrollIntoRevealed\(el, \{ block: 'start' \}\)/);
    expect(page).toMatch(/revealPaperThrough\(section\);\s*landSection\(/);
  });
});
