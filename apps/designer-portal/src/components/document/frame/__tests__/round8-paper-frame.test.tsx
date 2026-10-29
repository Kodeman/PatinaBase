import Link from 'next/link';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Round8PaperFrame, { type Round8Pieces, type Round8PaperFrameProps } from '../round8-paper-frame';
import type { DocumentFrameSlots } from '../frame-slots';
import { ROUND8_PAPER_ORDER } from '@/lib/document/round8-paper-order';

import { rememberPaperOrigin, takeDeskReturn } from '@/lib/document/paper/paper-origin';
import { LENS_RESOLVE_MAX_MS } from '@/lib/document/lens-constants';
import { readFileSync } from 'node:fs';
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
 * RC7-E8-4 — the paper body holds until the lens resolves it. jsdom evaluates
 * no stylesheet, so the rule is read from round8.css and its selector is run
 * against the frame's real DOM.
 */
describe('RC7-E8-4 — the paper body holds until the lens resolves it', () => {
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const round8Css = strip(readFileSync(join(__dirname, '..', '..', 'paper', 'round8.css'), 'utf8'));
  const globalsCss = strip(readFileSync(join(__dirname, '..', '..', '..', '..', 'app', 'globals.css'), 'utf8'));
  const holds = [...round8Css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim().replace(/\s+/g, ' '), body: body.trim() }))
    .filter(({ selector }) => selector.includes(':not([data-lens-resolved])'));

  it('is one rule on the round-8 shell, keyed on the lens resolution', () => {
    expect(holds).toHaveLength(1);
    expect(holds[0]!.selector).toBe(
      '[data-paper-renderer="round8"][data-document-shell]:not([data-lens-resolved]) [data-document-paper] > :not([data-paper-cover])',
    );
  });

  it('holds paint only: layout, focus and landings are untouched', () => {
    const properties = holds[0]!.body
      .split(';')
      .map((decl) => decl.split(':')[0]!.trim())
      .filter(Boolean);
    expect(properties).toEqual(['opacity', 'animation']);
  });

  it('lets go by itself past the lens deadline, onto full opacity', () => {
    const failsafe = /animation:\s*doc-fade 1ms linear (\d+)ms both/.exec(holds[0]!.body);
    expect(failsafe).not.toBeNull();
    expect(Number(failsafe![1])).toBeGreaterThan(LENS_RESOLVE_MAX_MS);
    expect(globalsCss).toMatch(
      /@keyframes doc-fade\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}\s*\}/,
    );
  });

  it('holds every chapter and the colophon, never the cover, and only until resolved', () => {
    roomFilesReady = true;
    visitsReady = true;
    const { container } = renderFrame();
    const held = () => Array.from(container.querySelectorAll<HTMLElement>(holds[0]!.selector));
    const isHeld = (el: Element) => held().some((root) => root.contains(el));

    const chapters = Array.from(container.querySelectorAll('[data-paper-chapter]'));
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters.every(isHeld)).toBe(true);
    expect(isHeld(container.querySelector('[data-slot="colophon"]')!)).toBe(true);
    const cover = container.querySelector('[data-paper-cover]')!;
    expect(held().some((root) => root === cover || root.contains(cover) || cover.contains(root))).toBe(false);
    // The job head and the contents margin stand outside the paper.
    expect(isHeld(container.querySelector('[data-job-head]')!)).toBe(false);
    expect(isHeld(container.querySelector('[data-slot="margin"]')!)).toBe(false);

    // The lens writes the attribute on the shell when its first pass commits.
    container.querySelector('[data-document-shell]')!.setAttribute('data-lens-resolved', 'true');
    expect(held()).toEqual([]);
  });
});
