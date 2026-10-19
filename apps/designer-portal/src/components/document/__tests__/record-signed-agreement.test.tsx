import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecordSignedAgreementSheet } from '../overlays/record-signed-agreement-sheet';
import { DocFileViewer } from '../overlays/doc-file-viewer';

const mockMutate = jest.fn();
const mockHook = jest.fn();
const mockSignedUrl = jest.fn();
jest.mock('@/hooks/use-project-purchasing-agreement', () => ({
  useRecordProjectSignedAgreement: (projectId: string) => mockHook(projectId),
}));
jest.mock('@/hooks/use-folio', () => ({ folioSignedUrl: (...args: unknown[]) => mockSignedUrl(...args) }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
const close = jest.fn();
const projectId = '83500000-0000-4000-8000-000000000100';
const pdf = new File(['%PDF-1.4'], 'synthetic.pdf', { type: 'application/pdf' });
beforeEach(() => {
  jest.clearAllMocks();
  mockMutate.mockResolvedValue({ id: 'evidence' });
  mockHook.mockReturnValue({ mutateAsync: mockMutate, isPending: false, stage: null });
});
function open() {
  return render(<RecordSignedAgreementSheet projectId={projectId} projectName="Fixture project" onClose={close} />);
}
async function fill() {
  await userEvent.upload(screen.getByLabelText('Signed PDF (up to 20 MiB)'), pdf);
  fireEvent.change(screen.getByLabelText('Signed date'), { target: { value: '2020-01-01' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

test('project-bound sheet opens focused on PDF and cancels without upload or record', async () => {
  open();
  expect(screen.getByRole('dialog', { name: 'Record signed agreement' })).toBeInTheDocument();
  expect(mockHook).toHaveBeenCalledWith(projectId);
  await waitFor(() => expect(screen.getByLabelText('Signed PDF (up to 20 MiB)')).toHaveFocus());
  expect(mockMutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(mockMutate).not.toHaveBeenCalled();
});

test('file selection is not submission; only explicit Record records and closes after success', async () => {
  open(); await fill();
  expect(mockMutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockMutate).toHaveBeenCalledWith({ file: pdf, signedOn: '2020-01-01', coversProject: true });
});

test('record refusal stays open with actionable error and retained form', async () => {
  mockMutate.mockRejectedValue(new Error('This project already has an agreement'));
  open(); await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This project already has an agreement');
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Signed date')).toHaveValue('2020-01-01');
  expect(screen.getByRole('checkbox')).toBeChecked();
});

test('pending upload exposes progress and blocks repeat Record and Cancel', () => {
  mockHook.mockReturnValue({ mutateAsync: mockMutate, isPending: true, stage: 'uploading' });
  open();
  expect(screen.getByRole('status')).toHaveTextContent('Uploading private PDF');
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Record/ }));
  expect(mockMutate).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

test('private PDF viewer signs the actual agreements bucket and never uses a public URL', async () => {
  mockSignedUrl.mockResolvedValue('https://example.invalid/private-signed-url');
  render(<DocFileViewer bucket="project-agreements" file={{ title: 'Signed outside Patina', doc_type: 'pdf',
    storage_path: `${projectId}/synthetic.pdf` }} onClose={close} />);
  await waitFor(() => expect(screen.getByTitle('Signed outside Patina')).toHaveAttribute('src', 'https://example.invalid/private-signed-url'));
  expect(mockSignedUrl).toHaveBeenCalledWith(`${projectId}/synthetic.pdf`, 'project-agreements');
});
