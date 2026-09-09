/**
 * PP-7 — the concept-render act at the room heading.
 *
 * The bucket's own limits (00580) are the gate, so the studio hears the reason
 * here instead of a server rejection it could not read; a failed upload leaves
 * whatever was standing exactly where it was.
 *
 * Removal goes through `useRemoveRoomConceptRender`, which deletes the storage
 * object BEFORE nulling the row (that ordering is proved in the package's own
 * suite). What this suite proves is the component's half: the stored object
 * path reaches that hook, and the act is only ever mounted where a
 * QueryClientProvider can answer for it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

const mutateAsync = jest.fn();
const removeAsync = jest.fn();
const recordHook = jest.fn();
const removeHook = jest.fn();

let roomRow: Record<string, unknown> | null = null;
let roomError: unknown = null;
let record: Record<string, unknown> | null = null;
const selected: string[] = [];

const eqChain = (terminal: () => unknown) => {
  const chain: Record<string, unknown> = {};
  chain.eq = jest.fn(() => chain);
  chain.maybeSingle = terminal;
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(terminal()).then(resolve);
  return chain;
};

jest.mock('@patina/supabase', () => ({
  ROOM_RENDER_MAX_BYTES: 8 * 1024 * 1024,
  ROOM_RENDER_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  useRoomConceptRender: () => ({ mutateAsync, isPending: false }),
  useRoomConceptRenderRecord: (args: unknown) => {
    recordHook(args);
    return { data: record, isLoading: false };
  },
  useRemoveRoomConceptRender: () => {
    removeHook();
    return { mutateAsync: removeAsync, isPending: false };
  },
  createBrowserClient: () => ({
    from: () => ({
      select: (columns: string) => {
        selected.push(columns);
        return eqChain(async () => ({ data: roomRow, error: roomError }));
      },
    }),
  }),
}));

import { ConceptRenderUpload } from '../rooms/concept-render-upload';

const CONSENT = "Labeled 'Concept · not installed' on the client's page";

const STANDING = {
  url: 'https://signed.test/project-1/room-1/study.jpg',
  path: 'project-1/room-1/study.jpg',
  caption: 'Late-afternoon view',
  uploadedAt: '2026-09-08T14:00:00Z',
  uploadedBy: 'designer-1',
};

/** A room the probe says already carries a render. */
const withARenderStanding = () => {
  roomRow = { concept_render_url: STANDING.path };
  record = STANDING;
};

const imageFile = (bytes: number, type = 'image/jpeg', name = 'study.jpg') => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
};

const mount = () =>
  render(
    <ConceptRenderUpload
      projectId="project-1"
      roomId="room-1"
      roomName="Primary bedroom"
    />,
  );

const openTheAct = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /add a concept render/i }));
};

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ path: 'project-1/room-1/study.jpg' });
  removeAsync.mockReset().mockResolvedValue(undefined);
  recordHook.mockClear();
  removeHook.mockClear();
  roomRow = null;
  roomError = null;
  record = null;
  selected.length = 0;
});

describe('the concept-render act at the room heading', () => {
  it('offers the act on a room with no render yet', async () => {
    mount();
    expect(
      await screen.findByRole('button', { name: /add a concept render/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONSENT)).not.toBeInTheDocument();
  });

  it('asks the room one hook-free question and calls no React Query hook while nothing stands', async () => {
    // FFESection mounts this under every room heading, and fifteen of its
    // suites mount that section with no QueryClientProvider. The always-mounted
    // body therefore reads one column by hand; the hooks only exist inside the
    // subtrees that mount on demand.
    mount();
    await screen.findByRole('button', { name: /add a concept render/i });
    expect(selected).toEqual(['concept_render_url']);
    expect(recordHook).not.toHaveBeenCalled();
    expect(removeHook).not.toHaveBeenCalled();
  });

  it('unfolds a file field, a caption field and the consent line before any upload', async () => {
    mount();
    await openTheAct();
    expect(screen.getByLabelText('Image file')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );
    expect(screen.getByLabelText('Caption')).toBeInTheDocument();
    expect(screen.getByText(CONSENT)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('refuses a file over 8 MB with a named reason and uploads nothing', async () => {
    mount();
    await openTheAct();
    fireEvent.change(screen.getByLabelText('Image file'), {
      target: { files: [imageFile(9 * 1024 * 1024)] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file is 9 MB. A concept render has to be 8 MB or under.',
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^upload$/i })).not.toBeInTheDocument();
  });

  it('refuses a file that is not a JPEG, PNG or WebP with a named reason', async () => {
    mount();
    await openTheAct();
    fireEvent.change(screen.getByLabelText('Image file'), {
      target: { files: [imageFile(1024, 'application/pdf', 'plan.pdf')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file is not a JPEG, PNG or WebP. A concept render has to be one of those three.',
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('sends the project, the room, the file and the caption to the hook', async () => {
    mount();
    await openTheAct();
    const file = imageFile(2 * 1024 * 1024);
    fireEvent.change(screen.getByLabelText('Image file'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Caption'), {
      target: { value: 'Late-afternoon view toward the bay window' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^upload$/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectId: 'project-1',
        roomId: 'room-1',
        file,
        caption: 'Late-afternoon view toward the bay window',
      }),
    );
  });

  it('shows an existing render with its caption, its date, Replace and Remove', async () => {
    withARenderStanding();
    mount();

    expect(
      await screen.findByText('Concept render · Late-afternoon view · uploaded Sep 8'),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Late-afternoon view')).toHaveAttribute(
      'src',
      'https://signed.test/project-1/room-1/study.jpg',
    );
    expect(screen.getByRole('button', { name: /^replace$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add a concept render/i }),
    ).not.toBeInTheDocument();
  });

  it('reads a standing render through the record hook, room by room', async () => {
    withARenderStanding();
    mount();
    await screen.findByRole('button', { name: /^remove$/i });
    expect(recordHook).toHaveBeenCalledWith({
      projectId: 'project-1',
      roomId: 'room-1',
    });
  });

  it('hands the stored object path to the remove hook and takes the render off the room', async () => {
    withARenderStanding();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));

    await waitFor(() =>
      expect(removeAsync).toHaveBeenCalledWith({
        projectId: 'project-1',
        roomId: 'room-1',
        path: 'project-1/room-1/study.jpg',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /add a concept render/i }),
    ).toBeInTheDocument();
  });

  it('leaves the existing render standing when the upload fails, and says so in place', async () => {
    withARenderStanding();
    mutateAsync.mockRejectedValue(new Error('storage refused'));
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /^replace$/i }));
    fireEvent.change(screen.getByLabelText('Image file'), {
      target: { files: [imageFile(1024 * 1024)] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^upload$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The render did not upload. Nothing on the page has changed.',
    );
    expect(
      screen.getByText('Concept render · Late-afternoon view · uploaded Sep 8'),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Late-afternoon view')).toBeInTheDocument();
  });

  it('says a failed removal left the render where it was', async () => {
    withARenderStanding();
    removeAsync.mockRejectedValue(new Error('denied'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The render did not come down. It is still on the client's page.",
    );
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
  });

  it('renders the room silently when the render cannot be read', async () => {
    roomError = { message: 'rls' };
    mount();
    expect(
      await screen.findByRole('button', { name: /add a concept render/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
