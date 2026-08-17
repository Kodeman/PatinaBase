import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findBrokenMarkdownPaths } from "./check-markdown-paths.mjs";

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "patina-markdown-paths-"));
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content);
  }
  return root;
}

test("checks relative and repository-root Markdown link targets", async () => {
  const root = await fixture({
    "docs/current/index.md": [
      "[relative](./exists.md#section)",
      "[root](/scripts/check.mjs)",
      "[external](https://example.com/missing)",
      "[anchor](#local)",
    ].join("\n"),
    "docs/current/exists.md": "present\n",
    "scripts/check.mjs": "export {};\n",
  });

  assert.deepEqual(
    findBrokenMarkdownPaths(root, ["docs/current/index.md"]),
    [],
  );
});

test("reports missing documents, missing targets, and repository escapes", async () => {
  const root = await fixture({
    "docs/index.md": "[missing](./absent.md)\n[escape](../../outside.md)\n",
  });

  const findings = findBrokenMarkdownPaths(root, [
    "docs/index.md",
    "docs/not-present.md",
  ]);
  assert.equal(findings.length, 3);
  assert.ok(findings.some((finding) => finding.includes("absent.md")));
  assert.ok(findings.some((finding) => finding.includes("escapes repository")));
  assert.ok(findings.some((finding) => finding.includes("not-present.md")));
});
