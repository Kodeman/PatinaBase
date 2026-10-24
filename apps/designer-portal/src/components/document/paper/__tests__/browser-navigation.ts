/**
 * The Navigation API as Chromium and WebKit keep it, over jsdom's history:
 * keyed, indexed entries; a traverse `navigate` event fired first, which is
 * not cancelable (no user activation, so the popstate fallback runs); and
 * the current entry already moved when popstate fires. A push drops the
 * entries ahead of it; a replace keeps the key.
 */
export function browserNavigation() {
  const original = {
    push: window.history.pushState.bind(window.history),
    replace: window.history.replaceState.bind(window.history),
    go: window.history.go.bind(window.history),
  };
  let made = 0;
  const entry = (url: string) => ({ key: `k${(made += 1)}`, url, index: 0 });
  let entries = [entry(window.location.href)];
  let current = 0;
  let pending: number | null = null;
  const reindex = () => entries.forEach((e, index) => (e.index = index));
  const navigation = Object.defineProperties(new EventTarget(), {
    currentEntry: { get: () => entries[current] },
    entries: { value: () => entries },
  });
  Object.defineProperty(window, "navigation", {
    value: navigation,
    configurable: true,
  });
  const resolve = (url?: string | URL | null) =>
    url == null ? window.location.href : new URL(url, window.location.href).href;
  jest
    .spyOn(window.history, "pushState")
    .mockImplementation((state, unused, url) => {
      entries = [...entries.slice(0, current + 1), entry(resolve(url))];
      current = entries.length - 1;
      reindex();
      original.push(state, unused, url);
    });
  jest
    .spyOn(window.history, "replaceState")
    .mockImplementation((state, unused, url) => {
      entries[current] = { ...entries[current], url: resolve(url) };
      original.replace(state, unused, url);
    });
  const traverse = (delta: number) => {
    const target = entries[current + delta];
    if (!target) return;
    pending = current + delta;
    navigation.dispatchEvent(
      Object.assign(new Event("navigate", { cancelable: false }), {
        navigationType: "traverse",
        destination: { url: target.url, index: target.index, key: target.key },
      }),
    );
    original.go(delta);
  };
  jest.spyOn(window.history, "go").mockImplementation((delta = 0) => traverse(delta));
  jest.spyOn(window.history, "back").mockImplementation(() => traverse(-1));
  jest.spyOn(window.history, "forward").mockImplementation(() => traverse(1));
  // Registered before the sheet's listener, so the entry moves first. It
  // counts every popstate, the ones the sheet stops included (jsdom moves the
  // URL a task before it fires popstate, so the URL alone is no signal).
  let pops = 0;
  const onPop = () => {
    if (pending !== null) current = pending;
    pending = null;
    pops += 1;
  };
  window.addEventListener("popstate", onPop, { capture: true });
  return {
    keys: () => entries.map((e) => e.key),
    pops: () => pops,
    restore() {
      window.removeEventListener("popstate", onPop, { capture: true });
      delete (window as { navigation?: unknown }).navigation;
    },
  };
}

