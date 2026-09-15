import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaperworkUploadForm } from '../paperwork-upload-form';

const ORIGINAL_FETCH = global.fetch;

function renderForm(overrides: Partial<Parameters<typeof PaperworkUploadForm>[0]> = {}) {
  const onReceived = jest.fn();
  render(
    <PaperworkUploadForm
      token={'a'.repeat(64)}
      docType="coi_gl"
      docLabel={null}
      title="COI, general liability"
      uploadOnly={false}
      expiryRequired
      onReceived={onReceived}
      {...overrides}
    />,
  );
  return { onReceived };
}

function pdf(name = 'coi.pdf'): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

describe('PaperworkUploadForm', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, document_id: 'doc-1' }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('asks for the five fields the spec names', () => {
    renderForm();
    expect(screen.getByLabelText('File')).toBeInTheDocument();
    expect(screen.getByLabelText('Number')).toBeInTheDocument();
    expect(screen.getByLabelText('Issuer')).toBeInTheDocument();
    expect(screen.getByLabelText('Issued')).toBeInTheDocument();
    expect(screen.getByLabelText('Expires')).toBeInTheDocument();
  });

  it('asks a waiver for the file and nothing else', () => {
    renderForm({
      docType: 'lien_waiver_unconditional',
      title: 'Lien waiver, unconditional',
      uploadOnly: true,
      expiryRequired: false,
    });
    expect(screen.getByLabelText('File')).toBeInTheDocument();
    expect(screen.queryByLabelText('Number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Issuer')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Expires')).not.toBeInTheDocument();
  });

  it('marks the expiry needed on a dated paper without letting the browser speak', () => {
    renderForm();
    const expires = screen.getByLabelText('Expires');
    expect(expires).toHaveAttribute('aria-required', 'true');
    // The HTML attribute would raise the browser's own validation bubble over
    // the studio's words, and would stop the form submitting at all.
    expect(expires).not.toHaveAttribute('required');
    expect((expires as HTMLInputElement).required).toBe(false);
  });

  it('will not post without a file, and says so plainly', async () => {
    const user = userEvent.setup();
    const { onReceived } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Send COI, general liability' }));
    expect(await screen.findByText('Choose the file first.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onReceived).not.toHaveBeenCalled();
  });

  it('asks a dated paper for its end date before spending the firm a round trip', async () => {
    const user = userEvent.setup();
    const { onReceived } = renderForm();
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.click(screen.getByRole('button', { name: 'Send COI, general liability' }));
    expect(await screen.findByText('Give the date it expires.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onReceived).not.toHaveBeenCalled();
  });

  it('posts the token, the type and the typed facts as multipart to the door', async () => {
    const user = userEvent.setup();
    const { onReceived } = renderForm();

    await user.upload(screen.getByLabelText('File'), pdf());
    await user.type(screen.getByLabelText('Number'), 'GL-118822');
    await user.type(screen.getByLabelText('Issuer'), 'Acme Mutual');
    await user.type(screen.getByLabelText('Issued'), '2026-04-01');
    await user.type(screen.getByLabelText('Expires'), '2027-04-01');
    await user.click(screen.getByRole('button', { name: 'Send COI, general liability' }));

    await waitFor(() => expect(onReceived).toHaveBeenCalledTimes(1));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:54321/functions/v1/paperwork-upload');
    expect(init.method).toBe('POST');
    // Content-Type is left to the browser so the multipart boundary is set.
    expect(init.headers).toEqual({
      apikey: 'anon-key',
      Authorization: 'Bearer anon-key',
    });
    const body = init.body as FormData;
    expect(body.get('token')).toBe('a'.repeat(64));
    expect(body.get('doc_type')).toBe('coi_gl');
    expect(body.get('number')).toBe('GL-118822');
    expect(body.get('issuer')).toBe('Acme Mutual');
    expect(body.get('issued_on')).toBe('2026-04-01');
    expect(body.get('expires_on')).toBe('2027-04-01');
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('doc_label')).toBeNull();
  });

  it('carries the studio-given name of an other_named paper', async () => {
    const user = userEvent.setup();
    renderForm({
      docType: 'other_named',
      docLabel: 'MN asbestos permit',
      title: 'MN asbestos permit',
      expiryRequired: false,
    });
    await user.upload(screen.getByLabelText('File'), pdf('permit.pdf'));
    await user.click(screen.getByRole('button', { name: 'Send MN asbestos permit' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as FormData;
    expect(body.get('doc_label')).toBe('MN asbestos permit');
  });

  it("prints the door's own refusal rather than re-wording it", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'send a PDF, a JPEG or a PNG' }),
    });
    const user = userEvent.setup();
    const { onReceived } = renderForm();
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.type(screen.getByLabelText('Expires'), '2027-04-01');
    await user.click(screen.getByRole('button', { name: 'Send COI, general liability' }));

    expect(
      await screen.findByText('send a PDF, a JPEG or a PNG'),
    ).toBeInTheDocument();
    expect(onReceived).not.toHaveBeenCalled();
  });

  it('says something plain when the door answers with nothing readable', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    const user = userEvent.setup();
    renderForm();
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.type(screen.getByLabelText('Expires'), '2027-04-01');
    await user.click(screen.getByRole('button', { name: 'Send COI, general liability' }));
    expect(
      await screen.findByText('That did not go through. Try again.'),
    ).toBeInTheDocument();
  });

  it('says something plain when the send never lands', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    const { onReceived } = renderForm();
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.type(screen.getByLabelText('Expires'), '2027-04-01');
    await user.click(screen.getByRole('button', { name: 'Send COI, general liability' }));
    expect(
      await screen.findByText('That did not go through. Try again.'),
    ).toBeInTheDocument();
    expect(onReceived).not.toHaveBeenCalled();
  });

  it('marks the send aria-disabled while it is in flight, never disabled', async () => {
    let release: (value: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const user = userEvent.setup();
    renderForm();
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.type(screen.getByLabelText('Expires'), '2027-04-01');
    await user.click(screen.getByRole('button', { name: 'Send COI, general liability' }));

    const sending = await screen.findByRole('button', { name: 'Sending…' });
    expect(sending).toHaveAttribute('aria-disabled', 'true');
    expect(sending).not.toBeDisabled();

    // A second press while in flight must not post twice.
    await user.click(sending);
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);

    release({ ok: true, json: async () => ({ success: true }) });
  });
});
