import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// @patina/supabase has no tsconfig alias; the mapped types package is mirrored
// by jest.config.js. Keep help/PortableText behind the relative UI importers.
const mockInvoke = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
let mockUser = { id: 'me' };
jest.mock('../../../../../../../packages/supabase/src/client', () => ({
  createBrowserClient: () => ({ functions: { invoke: mockInvoke }, rpc: mockRpc, from: mockFrom }),
}));
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('../../../../../../../packages/supabase/src/hooks/use-party-sms'),
  ...jest.requireActual('../../../../../../../packages/supabase/src/hooks/use-sms-review'),
  useUser: () => ({ user: mockUser }),
}));
jest.mock('@patina/types', () => ({ getFieldTradeLabel: () => '', SMS_CONSENT_DISPLAY: {}, ALL_FIELD_TRADES: [] }));
jest.mock('../../rooms/room-sheet', () => ({ RoomSheet: () => null }));
jest.mock('../../people/promote-band', () => ({ PromoteBand: () => null }));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false }) }));
jest.mock('../../date-text-input', () => ({ DateTextInput: () => null }));
jest.mock('../../document-action', () => ({
  DocumentAction: ({ children, onClick, disabled, loading }: any) => <button onClick={onClick} disabled={disabled || loading}>{children}</button>,
  DocumentActionRow: ({ children }: any) => <div>{children}</div>,
  DocumentActionGroup: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('../../section-eyebrow', () => ({ SectionEyebrow: ({ children }: any) => <h2>{children}</h2> }));

import { PartySmsComposer } from '../../people/party-profile-sheet';
import { SmsReviewCard } from '../sms-review-card';
import { FieldDesk } from '../field-desk';
import { useSendPartySms, useCreateFieldLink, useSmsReviewQueue, type SmsReviewMessage } from '@patina/supabase';

function wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const message = (overrides: Partial<SmsReviewMessage> = {}): SmsReviewMessage => ({
  id: 'm1', conversation_id: 'c1', project_id: 'p1', party_id: 'party1', body: 'The chair needs a closer look', media: [],
  parsed_intent: { type: 'report_condition' }, confidence: 0.9, created_at: new Date(Date.now() - 31 * 60_000).toISOString(),
  party: { id: 'party1', display_name: 'Sal', party_kind: 'trade', trade: null }, project: { id: 'p1', name: 'Maple' },
  target_kind: null, target_title: null, owner_user_id: 'me', owner_name: 'Leah', paused_until: null,
  notified_name: null, twilio_status: 'received', error_code: null, applied_effect: null, project_lead_id: 'me', ...overrides,
});
function composer() {
  const rendered = render(<PartySmsComposer partyId="party1" />, { wrapper });
  const draft = screen.getByRole('textbox', { name: 'Send a text' });
  fireEvent.change(draft, { target: { value: 'Studio: hello' } });
  return { ...rendered, draft };
}
beforeEach(() => { mockInvoke.mockReset(); mockRpc.mockReset(); mockFrom.mockReset(); mockUser = { id: 'me' }; });

it.each(['sent', 'queued'])('clears the draft only after a %s receipt', async (status) => {
  let finish!: (value: unknown) => void;
  mockInvoke.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { draft } = composer();
  fireEvent.click(screen.getByRole('button', { name: 'Send text' }));
  expect(draft).toHaveValue('Studio: hello');
  expect(screen.queryByText('Sent')).not.toBeInTheDocument();
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
  await act(async () => finish({ data: { status, messageId: 'out1' }, error: null }));
  await waitFor(() => expect(draft).toHaveValue(''));
  expect(screen.getByRole('status')).toHaveTextContent(status === 'sent' ? 'Sent' : 'Queued to send');
});
it('keeps a deferred draft attached to its id with local due time and no second send', async () => {
  const dueAt = '2026-09-19T14:00:00Z';
  mockInvoke.mockResolvedValue({ data: { status: 'deferred', messageId: 'deferred1', dueAt }, error: null });
  const { draft, container } = composer();
  fireEvent.keyDown(draft, { key: 'Enter' });
  expect(await screen.findByRole('status')).toHaveTextContent('Will send at ' + new Date(dueAt).toLocaleString());
  expect(draft).toHaveValue('Studio: hello');
  expect(container.querySelector('[data-message-id="deferred1"]')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Send text' })).not.toBeInTheDocument();
  fireEvent.keyDown(draft, { key: 'Enter' });
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});
it.each([
  [422, { reason: 'not_consented' }, "They haven't said yes yet."],
  [422, { reason: 'suppressed' }, "They've asked us to stop."],
  [502, { provider_code: 30007 }, 'Carrier blocked this text.'],
  [502, { provider_code: '21610' }, "They've opted out."],
  [502, { provider_code: '999' }, "The carrier didn't accept it."],
  [503, { reason: 'prompt_code_unavailable' }, "Couldn't get them a reply code, try again."],
  [500, { reason: 'defer_insert_failed' }, "The carrier didn't accept it."],
])('preserves the draft and focuses it for HTTP %s %j', async (status, facts, words) => {
  mockInvoke.mockResolvedValue({ data: null, error: { context: { status, json: async () => ({ status: 'failed', ...facts }) } } });
  const { draft } = composer();
  fireEvent.click(screen.getByRole('button', { name: 'Send text' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(words);
  expect(draft).toHaveValue('Studio: hello');
  expect(draft).toHaveFocus();
});
it('handles a thrown FunctionsHttpError as a typed failure, not unknown success', async () => {
  mockInvoke.mockRejectedValue({ context: { json: async () => ({ id: 'failed1', status: 'failed', reason: 'suppressed' }) } });
  const { result } = renderHook(() => useSendPartySms(), { wrapper });
  await act(async () => expect(result.current.mutateAsync({ partyId: 'p', body: 'draft' })).resolves.toMatchObject({ id: 'failed1', status: 'failed', reason: 'suppressed' }));
});
it.each([null, { success: true }, { status: 'unexpected' }])('never clears on an unknown response %j', async (data) => {
  mockInvoke.mockResolvedValue({ data, error: null });
  const { draft } = composer();
  fireEvent.keyDown(draft, { key: 'Enter' });
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't confirm the send");
  expect(draft).toHaveValue('Studio: hello');
});
it('Shift+Enter permits a newline; Enter sends once and IME Enter does not send', async () => {
  mockInvoke.mockResolvedValue({ data: { id: 'out', status: 'queued' }, error: null });
  const { draft } = composer();
  expect(fireEvent.keyDown(draft, { key: 'Enter', shiftKey: true })).toBe(true);
  fireEvent.keyDown(draft, { key: 'Enter', isComposing: true });
  expect(mockInvoke).not.toHaveBeenCalled();
  fireEvent.change(draft, { target: { value: 'First\nSecond' } });
  fireEvent.keyDown(draft, { key: 'Enter' });
  fireEvent.keyDown(draft, { key: 'Enter' });
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
  expect(mockInvoke).toHaveBeenCalledWith('sms-dispatch', { body: { partyId: 'party1', body: 'First\nSecond' } });
});
it('keeps a draft and focuses after a network error', async () => {
  mockInvoke.mockRejectedValue(new Error('network'));
  const { draft } = composer();
  fireEvent.click(screen.getByRole('button', { name: 'Send text' }));
  await screen.findByRole('alert');
  expect(draft).toHaveValue('Studio: hello'); expect(draft).toHaveFocus();
});
it('regeneration explicitly revokes the prior field link', async () => {
  mockRpc.mockResolvedValue({ data: [{ id: 'link', token: 'one-time' }], error: null });
  const { result } = renderHook(() => useCreateFieldLink(), { wrapper });
  await act(async () => { await result.current.mutateAsync({ partyId: 'party1', revokePrior: true }); });
  expect(mockRpc).toHaveBeenCalledWith('create_field_link', { p_party_id: 'party1', p_expires_at: null, p_revoke_prior: true });
});
it.each([
  ['Take it', 'sms_take_thread', { p_message_id: 'm1' }],
  ['Hand back', 'sms_hand_back_thread', { p_message_id: 'm1' }],
  ['Extend', 'sms_extend_pause', { p_message_id: 'm1', p_hours: 4 }],
])('%s calls its message-bound authority RPC', async (label, rpc, args) => {
  mockRpc.mockResolvedValue({ data: 'ok', error: null });
  render(<SmsReviewCard message={message()} />, { wrapper });
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith(rpc, args));
});
it('keeps ownership and pause unchanged on 42501, without a false notification failure', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } });
  render(<SmsReviewCard message={message({ paused_until: '2099-01-01T00:00:00Z' })} />, { wrapper });
  fireEvent.click(screen.getByRole('button', { name: 'Hand back' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Someone else has this one');
  expect(screen.getByText('Leah')).toBeInTheDocument();
  expect(screen.getByText(/Automatic replies paused until/)).toBeInTheDocument();
  expect(screen.getByText('Nobody’s been told yet')).toBeInTheDocument();
  expect(screen.queryByText(/notification failed/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
});
it('shows persisted notification and save receipts, not inferred send success', () => {
  render(<SmsReviewCard message={message({ notified_name: 'Leah', applied_effect: { applied: false } })} />, { wrapper });
  expect(screen.getByText('Told Leah')).toBeInTheDocument();
  expect(screen.getByText('Reviewed — no change needed')).toBeInTheDocument();
  expect(screen.queryByText('Sent')).not.toBeInTheDocument();
});
it('filters Mine / Unowned / All and quietly nudges only the project lead after 30 minutes', () => {
  const cards = [message({ id: 'mine', body: 'Mine text' }), message({ id: 'free', owner_user_id: null, body: 'Unowned text' }), message({ id: 'theirs', owner_user_id: 'other', body: 'Other text' })];
  const { rerender } = render(<FieldDesk population={{ cards, lines: [], isLoading: false, isError: false }} />, { wrapper });
  expect(screen.getByText(/Could you take a look/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mine', exact: true }));
  expect(screen.getByText('“Mine text”')).toBeInTheDocument(); expect(screen.queryByText('“Unowned text”')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Unowned', exact: true }));
  expect(screen.getByText('“Unowned text”')).toBeInTheDocument(); expect(screen.queryByText('“Mine text”')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All', exact: true }));
  expect(screen.getByText('“Other text”')).toBeInTheDocument();
  mockUser = { id: 'other' };
  rerender(<FieldDesk population={{ cards, lines: [], isLoading: false, isError: false }} />);
  expect(screen.queryByText(/Could you take a look/)).not.toBeInTheDocument();
});
it('shows load failures rather than an empty success state', () => {
  render(<FieldDesk population={{ cards: [], lines: [], isLoading: false, isError: true }} />, { wrapper });
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the field texts');
});
it('reads the authoritative view and matches pause to the message project, not just handset', async () => {
  const tables: Record<string, unknown[]> = {
    sms_review_queue: [{ ...message(), party_display_name: 'Sal', party_kind: 'trade' }],
    projects: [{ id: 'p1', name: 'Maple', designer_id: 'me' }],
    sms_messages: [{ id: 'm1', twilio_status: 'received', applied_effect: null }],
    sms_conversation_context: [{ conversation_id: 'c1', project_id: 'other', paused_until: 'wrong' }, { conversation_id: 'c1', project_id: 'p1', paused_until: '2099-01-01T00:00:00Z' }],
    notification_log: [{ user_id: 'me', metadata: { message_id: 'm1' } }],
    profiles: [{ id: 'me', full_name: 'Leah Hartwell' }],
  };
  mockFrom.mockImplementation((table) => {
    const q: any = { then: (resolve: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve) };
    for (const method of ['select', 'in', 'eq', 'order']) q[method] = jest.fn(() => q);
    return q;
  });
  const { result } = renderHook(() => useSmsReviewQueue(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockFrom).toHaveBeenCalledWith('sms_review_queue');
  expect(mockFrom).not.toHaveBeenCalledWith('sms_conversations');
  expect(result.current.data?.[0]).toMatchObject({ owner_name: 'Leah Hartwell', notified_name: 'Leah', paused_until: '2099-01-01T00:00:00Z', project_lead_id: 'me' });
});


it("follows the deferred id to sent without sending again", async () => {
  mockInvoke.mockResolvedValue({ data: { id: "deferred1", status: "deferred", dueAt: "2026-09-19T14:00:00Z" }, error: null });
  const { draft, rerender } = composer();
  fireEvent.keyDown(draft, { key: "Enter" });
  await screen.findByRole("status");
  rerender(<PartySmsComposer partyId="party1" thread={[{ id: "deferred1", twilio_status: "sent" } as any]} />);
  await waitFor(() => expect(draft).toHaveValue(""));
  expect(screen.getByRole("status")).toHaveTextContent("Sent");
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});
it("keeps a failed deferred id locked rather than creating a resend", async () => {
  mockInvoke.mockResolvedValue({ data: { id: "deferred1", status: "deferred" }, error: null });
  const { draft, rerender } = composer();
  fireEvent.keyDown(draft, { key: "Enter" });
  await screen.findByRole("status");
  rerender(<PartySmsComposer partyId="party1" thread={[{ id: "deferred1", twilio_status: "failed", error_code: "30007" } as any]} />);
  expect(screen.getByText("Carrier blocked this text.")).toBeInTheDocument();
  expect(draft).toHaveValue("Studio: hello");
  expect(screen.queryByRole("button", { name: "Send text" })).not.toBeInTheDocument();
});
it("does not nudge a lead before 30 minutes", () => {
  render(<FieldDesk population={{ cards: [message({ owner_user_id: null, created_at: new Date().toISOString() })], lines: [], isLoading: false, isError: false }} />, { wrapper });
  expect(screen.queryByText(/Could you take a look/)).not.toBeInTheDocument();
});
