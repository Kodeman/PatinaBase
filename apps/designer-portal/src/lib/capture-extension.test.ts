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

  it("accepts a configured unpacked beta", () => {
    process.env[MODE_KEY] = "unpacked";
    process.env[URL_KEY] = "https://example.com/patina-capture.zip";

    expect(getCaptureExtensionConfig()).toEqual({
      mode: "unpacked",
      installUrl: "https://example.com/patina-capture.zip",
      isConfigured: true,
    });
  });

  it("accepts a configured Web Store beta", () => {
    process.env[MODE_KEY] = "webstore";
    process.env[URL_KEY] =
      "https://chromewebstore.google.com/detail/patina/example";

    expect(getCaptureExtensionConfig()).toEqual({
      mode: "webstore",
      installUrl: "https://chromewebstore.google.com/detail/patina/example",
      isConfigured: true,
    });
  });

  it.each([
    ["unknown", "https://example.com/extension.zip"],
    ["unpacked", "http://example.com/extension.zip"],
    ["webstore", "not-a-url"],
  ])("fails closed for mode %s and URL %s", (mode, url) => {
    process.env[MODE_KEY] = mode;
    process.env[URL_KEY] = url;

    expect(getCaptureExtensionConfig().isConfigured).toBe(false);
  });
});
