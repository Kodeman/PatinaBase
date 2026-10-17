import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { newestDesignerClient } from "./recipient.ts";

type Row = Record<string, string | null>;

/** designer_clients through PostgREST: maybeSingle() refuses more than one row. */
function fakeAdmin(rows: Row[], failWith: string | null = null) {
  return {
    from(table: string) {
      assertEquals(table, "designer_clients");
      let found = [...rows];
      const orders: Array<[string, boolean]> = [];
      let limit: number | null = null;
      const query = {
        select: () => query,
        eq(column: string, value: string) {
          found = found.filter((row) => row[column] === value);
          return query;
        },
        order(column: string, { ascending }: { ascending: boolean }) {
          orders.push([column, ascending]);
          return query;
        },
        limit(n: number) {
          limit = n;
          return query;
        },
        maybeSingle() {
          if (failWith) return Promise.resolve({ data: null, error: { message: failWith } });
          const sorted = [...found].sort((a, b) => {
            for (const [column, ascending] of orders) {
              const order = String(a[column]).localeCompare(String(b[column]));
              if (order !== 0) return ascending ? order : -order;
            }
            return 0;
          });
          const out = limit === null ? sorted : sorted.slice(0, limit);
          if (out.length > 1) {
            return Promise.resolve({
              data: null,
              error: { message: "JSON object requested, multiple (or no) rows returned" },
            });
          }
          return Promise.resolve({ data: out[0] ?? null, error: null });
        },
      };
      return query;
    },
  };
}

const history: Row[] = [
  {
    id: "dc-old",
    designer_id: "designer-1",
    client_id: "client-1",
    client_email: null,
    client_name: "Elena Reyes",
    updated_at: "2026-01-04T10:00:00Z",
    created_at: "2026-01-04T10:00:00Z",
  },
  {
    id: "dc-new",
    designer_id: "designer-1",
    client_id: "client-1",
    client_email: "elena@example.com",
    client_name: "Elena Reyes",
    updated_at: "2026-09-30T10:00:00Z",
    created_at: "2026-09-30T10:00:00Z",
  },
  {
    id: "dc-other",
    designer_id: "designer-2",
    client_id: "client-1",
    client_email: "someone-else@example.com",
    client_name: "Elena Reyes",
    updated_at: "2026-10-01T10:00:00Z",
    created_at: "2026-10-01T10:00:00Z",
  },
];

Deno.test("with relationship history, the newest row in the invoice designer's book is the recipient", async () => {
  const { row, error } = await newestDesignerClient(fakeAdmin(history), "designer-1", "client-1");
  assertEquals(error, null);
  assertEquals(row?.client_email, "elena@example.com");
});

Deno.test("a failed relationship read is returned, never read as no row", async () => {
  const { row, error } = await newestDesignerClient(
    fakeAdmin(history, "permission denied"),
    "designer-1",
    "client-1",
  );
  assertEquals(row, null);
  assertEquals(error?.message, "permission denied");
});
