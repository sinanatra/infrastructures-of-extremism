import { chromium } from "playwright";

const url = "http://localhost:5174/afdjugendbw";
const shotDir = "/private/tmp/claude-501/-Users-giacomonanni-Documents-Development-infrastructures-of-extremism/25502b73-7d28-4af0-93d9-e432ee0666be/scratchpad";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

const logs = [];
page.on("console", (msg) => {
  const line = `[${msg.type()}] ${msg.text()}`;
  logs.push(line);
  console.log("CONSOLE:", line);
});
page.on("pageerror", (err) => {
  logs.push("PAGEERROR: " + err.message);
  console.log("PAGEERROR:", err.message, err.stack);
});
page.on("crash", () => { logs.push("PAGE CRASHED"); console.log("PAGE CRASHED"); });

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 20000 });
await page.waitForTimeout(1500);

const trailerBtn = page.locator("button", { hasText: /skip|close|enter|start/i }).first();
if (await trailerBtn.count()) {
  try { await trailerBtn.click({ timeout: 3000 }); } catch {}
}
await page.waitForTimeout(500);

const recordBtn = page.locator('button.tbtn-record');
await recordBtn.click();
console.log("clicked record, polling responsiveness + progress...");

let lastText = "";
let stallCount = 0;
for (let i = 0; i < 40; i++) {
  const start = Date.now();
  // A round-trip eval proves the page's JS thread is not fully blocked.
  let evalOk = true;
  try {
    await page.evaluate(() => document.title, null);
  } catch (e) {
    evalOk = false;
  }
  const evalMs = Date.now() - start;
  const text = await recordBtn.textContent().catch((e) => "<error:" + e.message.slice(0,120) + ">");
  const btnCount = await recordBtn.count().catch(() => -1);
  console.log(`t+${i * 3}s progress="${text}" btnCount=${btnCount} evalOk=${evalOk} evalMs=${evalMs}`);
  if (text === lastText) stallCount += 1; else stallCount = 0;
  lastText = text;
  if (stallCount >= 5) {
    console.log("STALLED: progress text unchanged for 15s+");
    break;
  }
  if (!/recording/i.test(text || "")) {
    console.log("Recording finished or button reset.");
    break;
  }
  await page.waitForTimeout(3000);
}

console.log("---BROWSER LOGS (last 60)---");
console.log(logs.slice(-60).join("\n"));

await browser.close();
