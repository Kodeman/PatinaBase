import { resolveSource } from "../client-plate-copy/lib.ts";
import {
  assertHostResolvesSafe,
  assertSafeUrl,
} from "../_shared/product-page/ssrf.ts";

export interface LibraryImage {
  id: string;
  project_id: string;
  url: string;
}

export function isDeadLink(
  status: number,
  contentType: string | null,
  timedOut = false,
): boolean {
  return timedOut || status < 200 || status >= 400 ||
    !/^image\/[a-z0-9.+-]+(?:\s*;|\s*$)/i.test(contentType ?? "");
}

export function libraryAddress(
  image: LibraryImage,
  supabaseUrl: string,
): string {
  const source = resolveSource({
    id: image.id,
    project_id: image.project_id,
    source_kind: "maker",
    source_ref: { table: "project_ffe_item_images", id: image.id },
    source_url: image.url,
    lease_token: "",
  }, supabaseUrl);
  if (source?.kind !== "direct") {
    throw new Error("library source has no public URL");
  }
  return source.url;
}

export interface LinkDependencies {
  fetch: typeof fetch;
  validate: (url: URL, timeoutMs: number) => Promise<unknown>;
}

const liveDependencies: LinkDependencies = {
  fetch,
  validate: (url, timeoutMs) =>
    assertHostResolvesSafe(url.hostname, undefined, timeoutMs),
};

async function requestLink(
  address: string,
  method: "HEAD" | "GET",
  signal: AbortSignal,
  deadline: number,
  deps: LinkDependencies,
): Promise<Response> {
  let url = assertSafeUrl(address);
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted();
    await deps.validate(url, Math.max(1, deadline - Date.now()));
    signal.throwIfAborted();
    const response = await deps.fetch(url, {
      method,
      redirect: "manual",
      signal,
      headers: method === "GET"
        ? { Accept: "image/*", Range: "bytes=0-0" }
        : { Accept: "image/*" },
    });
    // Never buffer a body, even if a host ignores Range and sends the original.
    await response.body?.cancel();
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || hop === 3) {
      throw new Error("invalid or excessive redirect");
    }
    url = assertSafeUrl(new URL(location, url).href);
  }
  throw new Error("redirect limit");
}

export async function checkLibraryLink(
  address: string,
  deps: LinkDependencies = liveDependencies,
  timeoutMs = 5_000,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const deadline = Date.now() + timeoutMs;
  try {
    let response = await requestLink(
      address,
      "HEAD",
      controller.signal,
      deadline,
      deps,
    );
    if (response.status === 405) {
      response = await requestLink(
        address,
        "GET",
        controller.signal,
        deadline,
        deps,
      );
    }
    return isDeadLink(
      response.status,
      response.headers.get("content-type"),
      controller.signal.aborted,
    );
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
  }
}

export interface CheckSteps {
  check: (image: LibraryImage) => Promise<boolean>;
  record: (image: LibraryImage, dead: boolean) => Promise<void>;
}

// Two in-flight checks. Leave unstarted rows due for the next night rather
// than outliving the edge invocation when every host uses the full timeout.
export async function checkBatch(
  images: LibraryImage[],
  steps: CheckSteps,
  deadline: number,
) {
  const counts = { checked: 0, dead: 0, errors: 0, deferred: images.length };
  let next = 0;
  async function worker() {
    while (next < images.length && Date.now() < deadline) {
      const image = images[next++];
      counts.deferred--;
      try {
        const dead = await steps.check(image);
        await steps.record(image, dead);
        counts.checked++;
        if (dead) counts.dead++;
      } catch {
        counts.errors++;
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return counts;
}
