import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto("http://localhost:3400/auth/signin?callbackUrl=%2Fdesk",{waitUntil:"networkidle",timeout:60000});
await p.screenshot({path:"/private/tmp/claude-501/-Users-kody-Code-patina-merged/a9d6d2d8-91d1-4fbe-836d-9aebe777da59/scratchpad/m.png"});
console.log(await p.$$eval("button",e=>e.map(x=>x.innerText.trim()+"|"+x.getAttribute("aria-label")).join("\n")));
await b.close();
