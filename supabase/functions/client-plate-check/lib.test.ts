import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkBatch,
  checkLibraryLink,
  isDeadLink,
  libraryAddress,
  type LibraryImage,
  type LinkDependencies,
} from "./lib.ts";

Deno.test("classifier: images are live, errors, timeout and non-images are dead", () => {
  for (const status of [200, 206]) {
    assertEquals(isDeadLink(status, "image/jpeg"), false);
  }
  assertEquals(isDeadLink(200, "IMAGE/WEBP; charset=binary"), false);
  for (const status of [400, 403, 404, 410, 500, 503]) {
    assertEquals(isDeadLink(status, "image/jpeg"), true);
  }
  for (
    const type of [null, "", "text/html", "application/octet-stream", "image/"]
  ) assertEquals(isDeadLink(200, type), true);
  assertEquals(isDeadLink(200, "image/png", true), true);
});

const image: LibraryImage = {
  id: "image",
  project_id: "project",
  url: "https://maker.example/chair.jpg",
};
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

function deps(fetcher: typeof fetch): LinkDependencies {
  return { fetch: fetcher, validate: () => Promise.resolve([]) };
}

Deno.test("HEAD success never downloads a GET", async () => {
  const methods: string[] = [];
  const dead = await checkLibraryLink(
    image.url,
    deps((_url, init) => {
      methods.push(init!.method!);
      return Promise.resolve(
        new Response(null, { headers: { "content-type": "image/png" } }),
      );
    }),
  );
  assertEquals(dead, false);
  assertEquals(methods, ["HEAD"]);
});

Deno.test("HEAD 405 falls back to one-byte ranged GET and cancels ignored-range body", async () => {
  const methods: string[] = [];
  let cancelled = false;
  const dead = await checkLibraryLink(
    image.url,
    deps((_url, init) => {
      methods.push(init!.method!);
      if (init!.method === "HEAD") {
        return Promise.resolve(new Response(null, { status: 405 }));
      }
      assertEquals(new Headers(init!.headers).get("range"), "bytes=0-0");
      return Promise.resolve(
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          {
            status: 206,
            headers: { "content-type": "image/jpeg" },
          },
        ),
      );
    }),
  );
  assertEquals(dead, false);
  assertEquals(methods, ["HEAD", "GET"]);
  assertEquals(cancelled, true);
});

Deno.test("GET fallback still classifies dead status and content type", async () => {
  for (
    const [status, contentType] of [[404, "image/png"], [
      200,
      "text/html",
    ]] as const
  ) {
    assertEquals(
      await checkLibraryLink(
        image.url,
        deps((_url, init) =>
          Promise.resolve(
            init!.method === "HEAD"
              ? new Response(null, { status: 405 })
              : new Response(null, {
                status,
                headers: { "content-type": contentType },
              }),
          )
        ),
      ),
      true,
    );
  }
});

Deno.test("403 is dead without GET fallback", async () => {
  let calls = 0;
  assertEquals(
    await checkLibraryLink(
      image.url,
      deps(() => {
        calls++;
        return Promise.resolve(new Response(null, { status: 403 }));
      }),
    ),
    true,
  );
  assertEquals(calls, 1);
});

Deno.test("timeout and network errors are dead", async () => {
  assertEquals(
    await checkLibraryLink(
      image.url,
      deps((_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("timed out", "AbortError")),
            { once: true },
          );
        })
      ),
      10,
    ),
    true,
  );
  assertEquals(
    await checkLibraryLink(
      image.url,
      deps(() => Promise.reject(new Error("network"))),
    ),
    true,
  );
});

Deno.test("redirect targets revalidate; private URL never fetches", async () => {
  let calls = 0;
  const fetcher: typeof fetch = () => {
    calls++;
    return Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
    );
  };
  assertEquals(await checkLibraryLink(image.url, deps(fetcher)), true);
  assertEquals(calls, 1);
  assertEquals(
    await checkLibraryLink("http://169.254.169.254/", deps(fetcher)),
    true,
  );
  assertEquals(calls, 1);
});

Deno.test("safe redirects are followed as HEAD; DNS refusal is dead", async () => {
  const urls: string[] = [];
  const dependencies = deps((url) => {
    urls.push(String(url));
    return Promise.resolve(
      urls.length === 1
        ? new Response(null, { status: 301, headers: { location: "/new.jpg" } })
        : new Response(null, { headers: { "content-type": "image/jpeg" } }),
    );
  });
  assertEquals(await checkLibraryLink(image.url, dependencies), false);
  assertEquals(urls, [image.url, "https://maker.example/new.jpg"]);
  dependencies.validate = () => Promise.reject(new Error("blocked_host"));
  assertEquals(await checkLibraryLink(image.url, dependencies), true);
  assertEquals(urls.length, 2);
});

Deno.test("redirect limit is three hops; every hop validates with no credentials", async () => {
  let calls = 0;
  let validated = 0;
  assertEquals(
    await checkLibraryLink(image.url, {
      validate: () => {
        validated++;
        return Promise.resolve([]);
      },
      fetch: (_url, init) => {
        calls++;
        assertEquals(new Headers(init!.headers).get("authorization"), null);
        assertEquals(new Headers(init!.headers).get("cookie"), null);
        assertEquals(init!.redirect, "manual");
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: `/hop-${calls}` },
          }),
        );
      },
    }),
    true,
  );
  assertEquals(calls, 4);
  assertEquals(validated, 4);
});

Deno.test("batch: records classifications with two workers; failures stay due", async () => {
  const images = Array.from(
    { length: 5 },
    (_, n) => ({ ...image, id: String(n) }),
  );
  const records: string[] = [];
  let active = 0;
  let peak = 0;
  const counts = await checkBatch(images, {
    async check(row) {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return row.id === "1";
    },
    record(row, dead) {
      if (row.id === "2") {
        return Promise.reject(new Error("database unavailable"));
      }
      records.push(`${row.id}:${dead}`);
      return Promise.resolve();
    },
  }, Date.now() + 1_000);
  assertEquals(peak, 2);
  assertEquals(counts, { checked: 4, dead: 1, errors: 1, deferred: 0 });
  assertEquals(records.includes("1:true"), true);
});

Deno.test("batch: expired run leaves unstarted rows due", async () => {
  const counts = await checkBatch([image], {
    check: () => Promise.reject(new Error("must not start")),
    record: () => Promise.reject(new Error("must not record")),
  }, Date.now() - 1);
  assertEquals(counts, { checked: 0, dead: 0, errors: 0, deferred: 1 });
});
