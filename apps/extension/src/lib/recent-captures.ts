/** U1 — a lightweight session history of recent captures, in chrome.storage.local. */
const KEY = 'recent_captures_v1';
const CAP = 50;

export interface RecentCapture {
  productId: string;
  name: string;
  thumbnail: string | null;
  capturedAt: string;
  target: 'library' | 'inbox' | 'decision' | 'update';
}

export function getRecent(): Promise<RecentCapture[]> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(KEY, (r) => resolve((r?.[KEY] as RecentCapture[]) ?? []));
    } catch {
      resolve([]);
    }
  });
}

export async function addRecent(entry: RecentCapture): Promise<void> {
  const list = await getRecent();
  const next = [entry, ...list.filter((e) => e.productId !== entry.productId)].slice(0, CAP);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [KEY]: next }, () => resolve());
    } catch {
      resolve();
    }
  });
}
