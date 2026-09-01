import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardTemplateDialog } from './board-template-dialog';

const save = jest.fn();
const rename = jest.fn();
const remove = jest.fn();

const studioTemplate = {
  id: 'template-1',
  template_key: 'studio-template-1',
  name: 'Warm neutrals',
  description: null,
  kind: 'studio',
  studio_id: 'studio-1',
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#FAF8F5',
  sections: [],
  items: [{ type: 'note' }],
  cover_url: null,
  created_by: 'user-1',
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-01T12:00:00.000Z',
};

jest.mock('@patina/supabase', () => ({
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio' }] }),
  useBoardTemplates: () => ({ data: [studioTemplate], isLoading: false }),
  useSaveBoardAsTemplate: () => ({ mutateAsync: save, isPending: false }),
  useRenameBoardTemplate: () => ({ mutateAsync: rename, isPending: false }),
  useDeleteBoardTemplate: () => ({ mutateAsync: remove, isPending: false }),
}));

jest.mock('@patina/design-system', () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

jest.mock('@/components/ui/controls', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Button: ({ children, onClick, disabled }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

describe('BoardTemplateDialog', () => {
  beforeEach(() => {
    save.mockReset();
    rename.mockReset();
    remove.mockReset();
  });

  it('selects the prefilled template name on focus (VD5)', () => {
    render(
      <BoardTemplateDialog
        boardId="board-1"
        boardName="Living room"
        itemCount={5}
        sectionCount={2}
        open
        onOpenChange={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const input = screen.getByLabelText('Template name') as HTMLInputElement;
    const selectSpy = jest.spyOn(input, 'select');
    fireEvent.focus(input);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it('saves the live board as a studio template', async () => {
    save.mockResolvedValue({ id: 'template-new' });
    const onSaved = jest.fn();
    render(
      <BoardTemplateDialog
        boardId="board-1"
        boardName="Living room"
        itemCount={5}
        sectionCount={2}
        open
        onOpenChange={jest.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Client-ready room' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        boardId: 'board-1',
        studioId: 'studio-1',
        name: 'Client-ready room',
        description: null,
      }),
    );
    expect(onSaved).toHaveBeenCalledWith('template-new');
  });

  it('renames and deletes only the listed studio template', async () => {
    rename.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    render(
      <BoardTemplateDialog
        boardId="board-1"
        boardName="Living room"
        itemCount={5}
        sectionCount={2}
        open
        onOpenChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Rename Warm neutrals'), {
      target: { value: 'Soft neutrals' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith({
        templateId: 'template-1',
        studioId: 'studio-1',
        name: 'Soft neutrals',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith({ templateId: 'template-1', studioId: 'studio-1' }),
    );
  });

  // DV13 — save-time asset hygiene, non-blocking.
  describe('template asset warning', () => {
    const RealImage = global.Image;

    afterEach(() => {
      global.Image = RealImage;
    });

    it('warns about a missing image reference without disabling Save', () => {
      render(
        <BoardTemplateDialog
          boardId="board-1"
          boardName="Living room"
          itemCount={1}
          sectionCount={1}
          items={[{ id: 'pin-1', type: 'image', x: 0, y: 0, width: 100, imageUrl: null, data: { name: 'Blank frame' } }]}
          open
          onOpenChange={jest.fn()}
        />,
      );

      expect(
        screen.getByText(
          '1 item has a missing or broken image and will carry over as-is: Blank frame.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save as template' })).not.toBeDisabled();
    });

    it('warns about a broken image reference once the async probe settles, without blocking a save started earlier', async () => {
      save.mockResolvedValue({ id: 'template-new' });
      class FailingImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      }
      // @ts-expect-error test stub
      global.Image = FailingImage;

      render(
        <BoardTemplateDialog
          boardId="board-1"
          boardName="Living room"
          itemCount={1}
          sectionCount={1}
          items={[{ id: 'pin-1', type: 'image', x: 0, y: 0, width: 100, imageUrl: 'https://img/dead.jpg', data: { name: 'Dead link' } }]}
          open
          onOpenChange={jest.fn()}
        />,
      );

      expect(screen.queryByText(/missing or broken image/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
      await waitFor(() => expect(save).toHaveBeenCalled());

      await waitFor(() =>
        expect(
          screen.getByText(
            '1 item has a missing or broken image and will carry over as-is: Dead link.',
          ),
        ).toBeInTheDocument(),
      );
    });

    it('says nothing when every visual item resolves cleanly', () => {
      render(
        <BoardTemplateDialog
          boardId="board-1"
          boardName="Living room"
          itemCount={1}
          sectionCount={1}
          items={[{ id: 'note-1', type: 'note', x: 0, y: 0, width: 100, content: 'Ask about finish' }]}
          open
          onOpenChange={jest.fn()}
        />,
      );
      expect(screen.queryByText(/missing or broken image/)).not.toBeInTheDocument();
    });
  });
});
