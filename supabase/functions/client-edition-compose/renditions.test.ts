import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { FactsAsset } from "./prompts.ts";
import { mediaWorker, noMedia, readRendition, RENDITION_MAX_BYTES, renditionPath, toBase64 } from "./renditions.ts";

const PROJECT = "0b7d3c1e-0000-4000-8000-000000000004";
const SHA = "a".repeat(64);

const asset = (widths?: number[]) =>
  ({ id: "a-sofa", sha256: SHA, sourceKind: "upload", width: 3000, height: 2000, ...(widths ? { crops: { piece: { rect: [0, 0, 3000, 2000], widths } } } : {}) }) as unknown as FactsAsset;

function webp(size = 32): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size).map((_, i) => (i * 7) % 256);
  bytes.set(new TextEncoder().encode("RIFF"));
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  return bytes;
}

const served = (body: BodyInit | null, type = "image/webp", status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": type, ...headers } });

Deno.test("renditionPath: perception prefers 768, the hero pick 512; either falls back; none without a piece", () => {
  assertEquals(renditionPath(PROJECT, asset([256, 512, 768]), "perceive"), `/plates/${PROJECT}/${SHA}/piece-768.webp`);
  assertEquals(renditionPath(PROJECT, asset([256, 512, 768]), "hero"), `/plates/${PROJECT}/${SHA}/piece-512.webp`);
  assertEquals(renditionPath(PROJECT, asset([256, 512]), "perceive"), `/plates/${PROJECT}/${SHA}/piece-512.webp`);
  assertEquals(renditionPath(PROJECT, asset([768]), "hero"), `/plates/${PROJECT}/${SHA}/piece-768.webp`);
  assertEquals(renditionPath(PROJECT, asset([256]), "hero"), null, "a width the worker does not serve");
  assertEquals(renditionPath(PROJECT, asset(), "perceive"), null);
});

Deno.test("readRendition: a served WebP comes back as its own bytes in base64, read within the budget given", async () => {
  const bytes = webp();
  const asked: [string, number][] = [];
  const media = (path: string, timeoutMs: number) => {
    asked.push([path, timeoutMs]);
    return Promise.resolve(served(bytes));
  };
  assertEquals(await readRendition(media, PROJECT, asset([512, 768]), "perceive", 5_000), toBase64(bytes));
  assertEquals(asked, [[`/plates/${PROJECT}/${SHA}/piece-768.webp`, 5_000]]);
});

Deno.test("readRendition: anything but a small WebP is no picture, and nothing throws", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const stream = () =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 3; i += 1) controller.enqueue(new Uint8Array(1_000_000));
        controller.close();
      },
    });
  const cases: [string, () => Promise<Response>][] = [
    ["missing", () => Promise.resolve(served(null, "text/plain", 404))],
    ["unauthorized", () => Promise.resolve(served(null, "text/plain", 401))],
    ["another type", () => Promise.resolve(served(webp(), "image/jpeg"))],
    ["not WebP bytes", () => Promise.resolve(served(jpeg))],
    ["declared too large", () => Promise.resolve(served(webp(), "image/webp", 200, { "content-length": String(RENDITION_MAX_BYTES + 1) }))],
    ["streams past the cap", () => Promise.resolve(served(stream()))],
    ["empty", () => Promise.resolve(served(new Uint8Array(0)))],
    ["throws", () => Promise.reject(new Error("aborted"))],
  ];
  for (const [name, reply] of cases) {
    assertEquals(await readRendition(reply, PROJECT, asset([768]), "hero", 5_000), null, name);
  }
  let called = false;
  const media = () => {
    called = true;
    return Promise.resolve(served(webp()));
  };
  assertEquals(await readRendition(media, PROJECT, asset([768]), "hero", 0), null);
  assertEquals(await readRendition(media, PROJECT, asset(), "hero", 5_000), null);
  assert(!called, "no request without time or a path");
});

Deno.test("mediaWorker sends the plate bearer to the worker's origin with a timeout; noMedia serves nothing", async () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const fetcher = ((url: string, init?: RequestInit) => {
    sent.push({ url, init });
    return Promise.resolve(served(webp()));
  }) as typeof fetch;
  const media = mediaWorker("https://media.example/", "plate-secret", fetcher);
  await media(`/plates/${PROJECT}/${SHA}/piece-512.webp`, 4_000);
  assertEquals(sent[0].url, `https://media.example/plates/${PROJECT}/${SHA}/piece-512.webp`);
  assertEquals(sent[0].init?.headers, { authorization: "Bearer plate-secret" });
  assert(sent[0].init?.signal instanceof AbortSignal);
  assertEquals((await noMedia("/plates/x", 1_000)).status, 404);
});

Deno.test("toBase64 matches btoa across its chunk boundary", () => {
  const bytes = new Uint8Array(0x8000 * 2 + 5).map((_, i) => (i * 31) % 256);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  assertEquals(toBase64(bytes), btoa(binary));
});
