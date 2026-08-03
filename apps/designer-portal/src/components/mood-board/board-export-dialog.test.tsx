import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardExportDialog } from './board-export-dialog';

const exportPng = jest.fn();
const downloadPdf = jest.fn();

jest.mock('@/lib/mood-board-assets/export-board', () => ({
  exportMoodBoardPng: (...args: unknown[]) => exportPng(...args),
  safeMoodBoardFilename: (name: string, extension: string) => `${name}.${extension}`,
}));

jest.mock('@/lib/scope/spec-pdf-client', () => ({
  downloadSpecPdf: (...args: unknown[]) => downloadPdf(...args),
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
  Button: ({ children, onClick, disabled }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

const input = {
  canvasWidth: 1200,
  canvasHeight: 800,
  backgroundColor: '#FAF8F5',
  sections: [],
  items: [],
};

describe('BoardExportDialog', () => {
  beforeEach(() => {
    exportPng.mockReset();
    downloadPdf.mockReset();
  });

  it('flushes before composition PNG and reports painter placeholders', async () => {
    const calls: string[] = [];
    const flush = jest.fn(async () => { calls.push('flush'); });
    exportPng.mockImplementation(async () => {
      calls.push('png');
      return { warnings: [{ reason: 'image-load-failed' }] };
    });
    const onExported = jest.fn();
    render(
      <BoardExportDialog
        boardId="board-1"
        boardName="Living room"
        owner={{ kind: 'proposal', id: 'proposal-1' }}
        input={input}
        open
        onOpenChange={jest.fn()}
        flush={flush}
        onExported={onExported}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Composition · PNG/ }));
    await waitFor(() => expect(exportPng).toHaveBeenCalled());
    expect(calls).toEqual(['flush', 'png']);
    expect(onExported).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'png', failedImageCount: 1 }),
    );
    expect(screen.getByText(/labelled image placeholder/)).toBeInTheDocument();
  });

  it('keeps composition and spec-sheet PDF kinds distinct for project boards', async () => {
    downloadPdf.mockResolvedValue({ warnings: [], warningMetadata: null, filename: 'board.pdf' });
    const props = {
      boardId: 'board-1',
      boardName: 'Install options',
      owner: { kind: 'project' as const, id: 'project-1' },
      input,
      open: true,
      onOpenChange: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(<BoardExportDialog {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Composition · PDF/ }));
    await waitFor(() =>
      expect(downloadPdf).toHaveBeenCalledWith(
        { kind: 'board-composition', projectId: 'project-1', boardId: 'board-1' },
        'Install options.pdf',
      ),
    );

    rerender(<BoardExportDialog {...props} open={false} />);
    rerender(<BoardExportDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Spec sheet · PDF/ }));
    await waitFor(() =>
      expect(downloadPdf).toHaveBeenLastCalledWith(
        { kind: 'board', projectId: 'project-1', boardId: 'board-1' },
        'Install options-spec-sheet.pdf',
      ),
    );
  });
});
