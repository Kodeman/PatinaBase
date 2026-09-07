import { browser, ctx, signInDesigner, shot, HERE } from './lib.mjs';

const email = process.argv[2] ?? 'designer@patina.dev';
const out = process.argv[3] ?? `${HERE}/state-designer.json`;

const b = await browser();
const c = await ctx(b);
const page = await c.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 300));
});
await signInDesigner(page, 'http://localhost:3000', email);
console.log('landed at', page.url());
await shot(page, `login-${email.split('@')[0]}`);
await c.storageState({ path: out });
console.log('storage saved', out);
await b.close();
