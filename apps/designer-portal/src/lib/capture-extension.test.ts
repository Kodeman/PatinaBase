import { getCaptureExtensionConfig } from "./capture-extension";

const MODE_KEY = "NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE";
const URL_KEY = "NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL";

describe("getCaptureExtensionConfig", () => {
  const originalMode = process.env[MODE_KEY];
  const originalUrl = process.env[URL_KEY];

  afterEach(() => {
    if (originalMode === undefined) delete process.env[MODE_KEY];
    else process.env[MODE_KEY] = originalMode;

    if (originalUrl === undefined) delete process.env[URL_KEY];
    else process.env[URL_KEY] = originalUrl;
  });

  it("accepts an honest under-review state without an install artifact", () => {
    process.env[MODE_KEY] = "under_review";
    delete process.env[URL_KEY];

    expect(getCaptureExtensionConfig()).toEqual({
      mode: "under_review",
      installUrl: null,
      isConfigured: true,
    });
  });

  it("accepts a configured Web Store release", () => {
    process.env[MODE_KEY] = "webstore";
    process.env[URL_KEY] =
      "https://chromewebstore.google.com/detail/patina/abcdefghijklmnopabcdefghijklmnop";

    expect(getCaptureExtensionConfig()).toEqual({
      mode: "webstore",
      installUrl: "https://chromewebstore.google.com/detail/patina/abcdefghijklmnopabcdefghijklmnop",
      isConfigured: true,
    });
  });

  it.each([
    ["unknown", "https://example.com/extension.zip"],
    ["unpacked", "https://example.com/extension.zip"],
    ["webstore", "not-a-url"],
    ["webstore", "https://example.com/detail/patina/example"],
    ["webstore", "https://chromewebstore.google.com.evil.example/detail/patina/example"],
    ["webstore", "https://chromewebstore.google.com/webstore/category/extensions"],
    ["webstore", "https://chromewebstore.google.com/detail/patina/example"],
    ["webstore", "https://chromewebstore.google.com/detail/patina/abcdefghijklmnopabcdefghijklmnop?hl=en"],
    ["webstore", "https://chromewebstore.google.com/detail/patina/abcdefghijklmnopabcdefghijklmnop#reviews"],
    ["webstore", "https://chromewebstore.google.com/detail/patina/qrstuvwxyzqrstuvwxyzqrstuvwxyzqr"],
  ])("fails closed for mode %s and URL %s", (mode, url) => {
    process.env[MODE_KEY] = mode;
    process.env[URL_KEY] = url;

    expect(getCaptureExtensionConfig().isConfigured).toBe(false);
  });
});
