import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import React from "react";

const mockSingle = jest.fn();
const mockInsert = jest.fn();

jest.mock("@patina/supabase", () => ({
  ...jest.requireActual("@patina/supabase"),
  createBrowserClient: () => ({
    from: () => ({
      insert: mockInsert,
    }),
  }),
}));

import { useAddDocumentRoom, type DocumentRoom } from "../use-document-rooms";

const projectId = "project-1";
const key = ["document-rooms", projectId] as const;

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function insertChain() {
  const chain = {
    select: jest.fn(() => chain),
    single: mockSingle,
  };
  mockInsert.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  let id = 0;
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: jest.fn(() => `client-room-${++id}`),
  });
  mockInsert.mockReset();
  mockSingle.mockReset();
});

describe("useAddDocumentRoom optimistic create", () => {
  it("shows the generated room only as pending and merges the receipt before pending ends", async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    insertChain();
    const existing: DocumentRoom = {
      id: "room-existing",
      project_id: projectId,
      name: "Living",
      budget_cents: 0,
      sort_order: 2,
    };
    client.setQueryData(key, [existing]);
    let resolveRefetch!: (rooms: DocumentRoom[]) => void;
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: () =>
        new Promise<DocumentRoom[]>((resolve) => {
          resolveRefetch = resolve;
        }),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    let resolveWrite!: (value: { data: DocumentRoom; error: null }) => void;
    mockSingle.mockReturnValue(
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
    );
    const { result } = renderHook(
      () => useAddDocumentRoom(projectId, { optimistic: true }),
      { wrapper: wrapperFor(client) },
    );

    act(() => result.current.mutate({ name: "Library", budgetCents: 120000 }));
    await waitFor(() => expect(result.current.pending).toHaveLength(1));
    const ghost = result.current.pending[0];
    expect(ghost).toMatchObject({ name: "Library", sortOrder: 3 });
    expect(ghost.id).toEqual(expect.any(String));
    // SQ-1001 #6: the unconfirmed room is never a row in the list.
    expect(client.getQueryData<DocumentRoom[]>(key)).toEqual([existing]);

    await waitFor(() => expect(mockSingle).toHaveBeenCalledTimes(1));
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][0]).toMatchObject({
      id: ghost.id,
      name: "Library",
      sort_order: 3,
    });
    const receipt: DocumentRoom = {
      id: ghost.id,
      project_id: projectId,
      name: "Library",
      budget_cents: 120000,
      sort_order: 3,
    };
    await act(async () => {
      resolveWrite({ data: receipt, error: null });
    });
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
    await waitFor(() => expect(resolveRefetch).toBeDefined());
    expect(client.getQueryData<DocumentRoom[]>(key)).toEqual([
      existing,
      receipt,
    ]);
    await act(async () => resolveRefetch([existing, receipt]));
    await waitFor(() =>
      expect(observer.getCurrentResult().isFetching).toBe(false),
    );
    unsubscribe();
    expect(client.getQueryData<DocumentRoom[]>(key)).toEqual([
      existing,
      receipt,
    ]);
  });

  it("keeps independent ghosts for concurrent creates", async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    insertChain();
    client.setQueryData(key, []);
    const writes: ((value: { data: DocumentRoom; error: null }) => void)[] = [];
    mockSingle.mockImplementation(
      () => new Promise((resolve) => writes.push(resolve)),
    );
    const { result } = renderHook(
      () => useAddDocumentRoom(projectId, { optimistic: true }),
      { wrapper: wrapperFor(client) },
    );

    act(() => {
      result.current.mutate({ name: "Library" });
      result.current.mutate({ name: "Dining" });
    });
    await waitFor(() => expect(result.current.pending).toHaveLength(2));
    expect(result.current.pending.map((room) => room.name)).toEqual([
      "Library",
      "Dining",
    ]);
    expect(result.current.pending.map((room) => room.sortOrder)).toEqual([
      0, 1,
    ]);
    expect(client.getQueryData<DocumentRoom[]>(key)).toEqual([]);
    expect(new Set(result.current.pending.map((room) => room.id)).size).toBe(2);

    await waitFor(() => expect(writes).toHaveLength(1));
    const first = result.current.pending.find(
      (room) => room.name === "Library",
    )!;
    await act(async () =>
      writes[0]({
        data: {
          id: first.id,
          project_id: projectId,
          name: first.name,
          budget_cents: 0,
          sort_order: first.sortOrder,
        },
        error: null,
      }),
    );
    await waitFor(() => expect(writes).toHaveLength(2));
    const second = result.current.pending.find(
      (room) => room.name === "Dining",
    )!;
    await act(async () =>
      writes[1]({
        data: {
          id: second.id,
          project_id: projectId,
          name: second.name,
          budget_cents: 0,
          sort_order: second.sortOrder,
        },
        error: null,
      }),
    );
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
    expect(
      client.getQueryData<DocumentRoom[]>(key)?.map((room) => room.name),
    ).toEqual(["Library", "Dining"]);
  });
});
