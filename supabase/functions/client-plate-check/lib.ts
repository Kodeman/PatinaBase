import { resolveSource } from "../client-plate-copy/lib.ts";
import {
  assertHostResolvesSafe,
  assertSafeUrl,
  denoPinnedHttpTransport,
  type SafeFetchDependencies,
} from "../_shared/product-page/ssrf.ts";

export interface LibraryImage {
  id: string;
  project_id: string;
  url: string;
}

// null means inconclusive: leave the row due, not checked or dead.
export function isDeadLink(
  status: number,
  contentType: string | null,
): boolean | null {
  if ([404, 410].includes(status)) return true;
  if (!/^2\d\d$/.test(String(status))) return null;
  const type = (contentType ?? "").split(";", 1)[0].trim().toLowerCase();
  if (["", "binary/octet-stream"].includes(type)) return null;
  return !/^image\//i.test(type);
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

function redirectUrl(response: Response, url: URL, hop: number): URL {
  const location = response.headers.get("location");
  if (!location || hop === 3) throw new Error("invalid or excessive redirect");
  return assertSafeUrl(new URL(location, url).href);
}

export async function checkLibraryLink(
  address: string,
  deps: SafeFetchDependencies = {},
  timeoutMs = 5_000,
): Promise<boolean | null> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new Error("link check deadline");
    return ms;
  };
  try {
    let url = assertSafeUrl(address);
    for (let hop = 0; hop <= 3; hop++) {
      const addresses = await assertHostResolvesSafe(
        url.hostname,
        deps.resolver,
        remaining(),
      );
      const response = await (deps.transport ?? denoPinnedHttpTransport)
        .request(
          url,
          addresses[0],
          {
            headers: { Accept: "image/*", Range: "bytes=0-0" },
            timeoutMs: remaining(),
            maxBytes: 65_536,
            truncate: true,
          },
        );
      await response.body?.cancel();
      remaining();
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return isDeadLink(
          response.status,
          response.headers.get("content-type"),
        );
      }
      url = redirectUrl(response, url, hop);
    }
  } catch {
    // DNS, transport and policy failures are not proof of a dead source.
  }
  return null;
}

export async function checkLibraryImage(
  image: LibraryImage,
  supabaseUrl: string,
): Promise<boolean | null> {
  let address: string;
  try {
    address = libraryAddress(image, supabaseUrl);
  } catch {
    // An unaddressable row cannot recover through network retries.
    return true;
  }
  return await checkLibraryLink(address);
}

export interface CheckSteps {
  check: (image: LibraryImage) => Promise<boolean | null>;
  record: (image: LibraryImage, dead: boolean) => Promise<void>;
}

export interface CheckCounts {
  checked: number;
  dead: number;
  alive: number;
  skipped: number;
  errors: number;
}

// Two in-flight checks. Leave unstarted/inconclusive rows due next night.
export async function checkBatch(
  images: LibraryImage[],
  steps: CheckSteps,
  deadline: number,
): Promise<CheckCounts> {
  const counts = {
    checked: 0,
    dead: 0,
    alive: 0,
    skipped: images.length,
    errors: 0,
  };
  let next = 0;
  async function worker() {
    while (next < images.length && Date.now() < deadline) {
      const image = images[next++];
      try {
        const dead = await steps.check(image);
        if (dead === null) continue;
        await steps.record(image, dead);
        counts.skipped--;
        counts.checked++;
        counts.dead += Number(dead);
        counts.alive += Number(!dead);
      } catch {
        counts.skipped--;
        counts.errors++;
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return counts;
}

export interface RunSteps extends CheckSteps {
  begin: () => Promise<number>;
  finish: (runId: number, counts: CheckCounts) => Promise<void>;
}

export async function runChecks(
  images: LibraryImage[],
  steps: RunSteps,
  deadline: number,
): Promise<CheckCounts> {
  if (!images.length) {
    return { checked: 0, dead: 0, alive: 0, skipped: 0, errors: 0 };
  }
  const runId = await steps.begin();
  const counts = await checkBatch(images, steps, deadline);
  await steps.finish(runId, counts);
  return counts;
}
