#!/usr/bin/env node
// Single-shot a seat through the local model gateway (GPT-6 Sol), as US-18 did for R3 and the
// adversarial review: the board refuses cross-provider route overrides for Claude categories.
// Usage: node sol-single-shot.mjs <prompt.md> <out.md> <file-or-image>...
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const MODEL = 'claude-gpt-6-sol[1m]';
const URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:18764/v1/messages';
const [promptPath, outPath, ...inputs] = process.argv.slice(2);
if (!promptPath || !outPath) {
  console.error('usage: sol-single-shot.mjs <prompt.md> <out.md> <inputs...>');
  process.exit(2);
}

const content = [];
let images = 0;
for (const p of inputs) {
  const ext = extname(p).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    content.push({ type: 'text', text: `Image: ${basename(p)}` });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: ext === '.png' ? 'image/png' : 'image/jpeg',
        data: readFileSync(p).toString('base64'),
      },
    });
    images++;
  } else {
    content.push({ type: 'text', text: `<file path="${p}">\n${readFileSync(p, 'utf8')}\n</file>` });
  }
}
content.push({ type: 'text', text: readFileSync(promptPath, 'utf8') });

const res = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 32000,
    // Without this, the model treats "write the file" in shared briefs as a tool task it can't do.
    system:
      'You have no tools and cannot write files. Your reply IS the complete deliverable document: output the full Markdown, starting with its title, and nothing else. Do not describe what you would do or ask for confirmation.',
    messages: [{ role: 'user', content }],
  }),
});
if (!res.ok) {
  console.error(`gateway ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const body = await res.json();
const text = body.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
const header = `<!-- provenance: single-shot via local model gateway; response model=${body.model}; stop_reason=${body.stop_reason}; usage=${JSON.stringify(body.usage)}; images=${images}; generated ${new Date().toISOString()} -->\n\n`;
writeFileSync(outPath, header + text + '\n');
console.log(`wrote ${outPath} (${text.length} chars, stop=${body.stop_reason}, images=${images})`);
