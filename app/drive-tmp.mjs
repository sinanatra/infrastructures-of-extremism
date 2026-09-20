import { chromium } from "playwright";

const url = "http://localhost:5173/afdjugendbw";
const shotDir = "/private/tmp/claude-501/-Users-giacomonanni-Documents-Development-infrastructures-of-extremism/25502b73-7d28-4af0-93d9-e432ee0666be/scratchpad";

const browser = await chromium.launch({
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

// Wait for the network canvas + controls to mount.
await page.waitForSelector("canvas", { timeout: 20000 });
await page.waitForTimeout(1500); // let trailer/intro settle

// Dismiss trailer overlay if present (look for common close/skip affordances).
const trailerBtn = page.locator("button", { hasText: /skip|close|enter|start/i }).first();
if (await trailerBtn.count()) {
  try { await trailerBtn.click({ timeout: 3000 }); } catch {}
}
await page.waitForTimeout(500);

await page.screenshot({ path: `${shotDir}/01-loaded.png` });

const recordBtn = page.locator('button:has-text("record 4K")');
const beforeCount = await recordBtn.count();

if (beforeCount === 0) {
  console.log("RESULT: record button not found");
  console.log(JSON.stringify({ consoleErrors }, null, 2));
  await browser.close();
  process.exit(0);
}

const downloadPromise = page.waitForEvent("download", { timeout: 240000 }).catch((e) => null);

await recordBtn.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${shotDir}/02-recording-start.png` });

await page.waitForTimeout(1500);
await page.screenshot({ path: `${shotDir}/03-recording-mid.png` });

// Poll button text for progress every ~10s up to the download timeout.
for (let i = 0; i < 20; i++) {
  const text = await recordBtn.textContent().catch(() => "");
  console.log("progress check:", text);
  if (!/recording/i.test(text || "")) break;
  await page.waitForTimeout(10000);
}

const download = await downloadPromise;
if (download) {
  const savePath = `${shotDir}/recorded-${Date.now()}.mp4`;
  await download.saveAs(savePath);
  console.log("DOWNLOAD_SAVED:", savePath, "suggestedFilename:", download.suggestedFilename());
} else {
  console.log("DOWNLOAD: none within timeout");
}

await page.screenshot({ path: `${shotDir}/04-after.png` });

console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors, null, 2));

await browser.close();
