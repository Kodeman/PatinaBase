import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type PinnedHttpTransport,
  PinnedTransportError,
  type SafeFetchDependencies,
} from "../_shared/product-page/ssrf.ts";
import {
  checkBatch,
  checkLibraryImage,
  checkLibraryLink,
  isDeadLink,
  libraryAddress,
  type LibraryImage,
  runChecks,
} from "./lib.ts";

const image: LibraryImage = {
  id: "image",
  project_id: "project",
  url: "https://maker.example/chair.jpg",
};
const publicAddress = { address: "93.184.216.34", family: 4 as const };
function deps(request: PinnedHttpTransport["request"]): SafeFetchDependencies {
  return {
    resolver: () => Promise.resolve([publicAddress]),
    transport: { request },
  };
}

Deno.test("classifier: only definitive dead responses are recorded", () => {
  for (const status of [200, 206]) {
    assertEquals(isDeadLink(status, "image/jpeg"), false);
    assertEquals(isDeadLink(status, "IMAGE/WEBP; charset=binary"), false);
    assertEquals(isDeadLink(status, "text/html"), true);
    assertEquals(isDeadLink(status, "application/octet-stream"), true);
    for (
      const type of [
        null,
        "",
        "binary/octet-stream",
        "Binary/Octet-Stream; x=y",
      ]
    ) assertEquals(isDeadLink(status, type), null);
  }
  for (const status of [404, 410]) assertEquals(isDeadLink(status, null), true);
  for (const status of [301, 400, 401, 403, 416, 429, 500, 503]) {
    assertEquals(isDeadLink(status, "image/jpeg"), null);
  }
});

Deno.test("library address: reuse copier public URL builder", () => {
  assertEquals(libraryAddress(image, "https://local.example"), image.url);
  assertEquals(
    libraryAddress(
      { ...image, url: "project/chair image.jpg" },
      "https://local.example",
    ),
    "https://local.example/storage/v1/object/public/project-item-images/project/chair%20image.jpg",
  );
});

Deno.test("pinned ranged GET uses validated address without a second DNS lookup", async () => {
  let lookups = 0;
  let requests = 0;
  const result = await checkLibraryLink(image.url, {
    resolver: () =>
      Promise.resolve([
        ++lookups === 1 ? publicAddress : { address: "127.0.0.1", family: 4 },
      ]),
    transport: {
      request(url, address, options) {
        requests++;
        assertEquals(url.hostname, "maker.example");
        assertEquals(address, publicAddress);
        assertEquals(lookups, 1);
        assertEquals(options.headers, {
          Accept: "image/*",
          Range: "bytes=0-0",
        });
        assertEquals(options.maxBytes, 65_536);
        assertEquals(options.truncate, true);
        assertEquals(options.allowedContentTypes, undefined);
        assertEquals(options.timeoutMs > 0 && options.timeoutMs <= 5_000, true);
        return Promise.resolve(
          new Response(null, {
            status: 206,
            headers: { "content-type": "image/png" },
          }),
        );
      },
    },
  });
  assertEquals(result, false);
  assertEquals(lookups, 1);
  assertEquals(requests, 1);
});

Deno.test("ignored Range body is cancelled and content type is classified", async () => {
  let cancelled = false;
  assertEquals(
    await checkLibraryLink(
      image.url,
      deps(() =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { "content-type": "text/html" } },
          ),
        )
      ),
    ),
    true,
  );
  assertEquals(cancelled, true);
});

Deno.test("timeout and network errors remain inconclusive rather than dead", async () => {
  for (
    const error of [
      new PinnedTransportError("timeout"),
      new PinnedTransportError("too_large"),
      new PinnedTransportError("failed"),
      new Error("network"),
    ]
  ) {
    assertEquals(
      await checkLibraryLink(image.url, deps(() => Promise.reject(error))),
      null,
    );
  }
  assertEquals(
    await checkLibraryLink(image.url, {
      resolver: () => Promise.reject(new Error("DNS")),
      transport: {
        request: () => {
          throw new Error("must not connect");
        },
      },
    }),
    null,
  );
});

Deno.test("redirects resolve and pin each hop; unsafe targets never connect", async () => {
  const hosts: string[] = [];
  const connections: string[] = [];
  assertEquals(
    await checkLibraryLink(image.url, {
      resolver(host) {
        hosts.push(host);
        return Promise.resolve([publicAddress]);
      },
      transport: {
        request(url, address) {
          connections.push(url.hostname);
          assertEquals(address, publicAddress);
          return Promise.resolve(
            connections.length === 1
              ? new Response(null, {
                status: 302,
                headers: { location: "https://other.example/picture" },
              })
              : new Response(null, {
                headers: { "content-type": "image/jpeg" },
              }),
          );
        },
      },
    }),
    false,
  );
  assertEquals(hosts, ["maker.example", "other.example"]);
  assertEquals(connections, hosts);
  let calls = 0;
  const blocked = deps(() => {
    calls++;
    return Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
    );
  });
  assertEquals(await checkLibraryLink(image.url, blocked), null);
  for (
    const url of [
      "http://169.254.169.254/",
      "https://maker.example:8080/a",
      "https://user:password@maker.example/a",
    ]
  ) {
    assertEquals(await checkLibraryLink(url, blocked), null);
    assertEquals(await checkLibraryImage({ ...image, url }, "https://local.example"), true);
  }
  assertEquals(calls, 1);
});

Deno.test("redirect overflow stays due after three redirects", async () => {
  let calls = 0;
  assertEquals(
    await checkLibraryLink(
      image.url,
      deps(() => {
        calls++;
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: `/hop-${calls}` },
          }),
        );
      }),
    ),
    null,
  );
  assertEquals(calls, 4);
});

Deno.test("per-row deadline covers DNS and transport together", async () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;
  try {
    assertEquals(
      await checkLibraryLink(image.url, {
        resolver() {
          now += 3_000;
          return Promise.resolve([publicAddress]);
        },
        transport: {
          request(_url, _address, options) {
            assertEquals(options.timeoutMs, 2_000);
            now += 2_001;
            return Promise.resolve(
              new Response(null, { headers: { "content-type": "image/jpeg" } }),
            );
          },
        },
      }),
      null,
    );
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("batch: two workers stamp alive, dead and inconclusive answers and isolate errors", async () => {
  let active = 0, peak = 0;
  const recorded: string[] = [];
  const counts = await checkBatch(
    Array.from({ length: 4 }, (_, n) => ({ ...image, id: String(n) })),
    {
      async check(row) {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return row.id === "2" ? null : row.id === "1";
      },
      record(row, dead) {
        if (row.id === "3") throw new Error("DB");
        recorded.push(`${row.id}:${dead}`);
        return Promise.resolve();
      },
    },
    Date.now() + 1000,
  );
  assertEquals(peak, 2);
  assertEquals(counts, {
    checked: 3,
    dead: 1,
    alive: 1,
    skipped: 0,
    errors: 1,
  });
  assertEquals(recorded.sort(), ["0:false", "1:true", "2:null"]);
});

Deno.test("run history: no work opens no run; work finishes with counts including unaddressable row", async () => {
  let began = 0, finished = 0;
  const recorded: (boolean | null)[] = [];
  const steps = {
    begin() {
      began++;
      return Promise.resolve(42);
    },
    async check(row: LibraryImage) {
      return await checkLibraryImage(row, "https://local.example");
    },
    record(_row: LibraryImage, dead: boolean | null) {
      recorded.push(dead);
      return Promise.resolve();
    },
    finish(id: number, counts: unknown) {
      finished++;
      assertEquals(id, 42);
      assertEquals(counts, {
        checked: 1,
        dead: 1,
        alive: 0,
        skipped: 0,
        errors: 0,
      });
      return Promise.resolve();
    },
  };
  assertEquals(await runChecks([], steps, Date.now() + 1000), {
    checked: 0,
    dead: 0,
    alive: 0,
    skipped: 0,
    errors: 0,
  });
  assertEquals(began, 0);
  await runChecks([{ ...image, url: " " }], steps, Date.now() + 1000);
  assertEquals(recorded, [true]);
  assertEquals(began, 1);
  assertEquals(finished, 1);
});

Deno.test("batch: expired run leaves unstarted rows due", async () => {
  assertEquals(
    await checkBatch([image], {
      check: () => {
        throw new Error("must not start");
      },
      record: () => {
        throw new Error("must not record");
      },
    }, Date.now() - 1),
    { checked: 0, dead: 0, alive: 0, skipped: 1, errors: 0 },
  );
});
