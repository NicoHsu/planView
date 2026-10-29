const { test, expect, _electron: electron } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSession, pauseSession } = require("../packages/core");

let app;
let directory;
const root = path.resolve(__dirname, "..");
async function launch() {
  app = await electron.launch({ args: [root, `--user-data-dir=${directory}`] });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return page;
}
test.beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "planview-e2e-")); });
test.afterEach(async () => {
  await app?.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("plan, start, pause, restart, resume, and complete without duplicate history", async () => {
  let page = await launch();
  await page.locator('#todoList [data-role="title"]').first().fill("Release QA");
  await page.locator('#todoList [data-role="delete"]').last().click();
  await page.locator("#durationInput").fill("15");
  await page.locator("#autoBackgroundInput").uncheck();
  await page.locator("#startBtn").click();
  await expect(page.locator("#activeSection")).toBeVisible();
  await expect(page.locator("#activeTodos")).toContainText("Release QA");
  await page.locator("#pauseBtn").click();
  await expect(page.locator("#pauseBtn")).toHaveText("繼續");
  await app.close();
  page = await launch();
  await expect(page.locator("#pauseBtn")).toHaveText("繼續");
  await expect(page.locator("#activeTimer")).not.toHaveText("00:00");
  await page.locator("#pauseBtn").click();
  await expect(page.locator("#pauseBtn")).toHaveText("暫停");
  await page.locator("#finishBtn").click();
  await expect.poll(async () => app.windows().some((window) => window.url().endsWith("progress.html"))).toBe(true);
  const reflection = app.windows().find((window) => window.url().endsWith("progress.html"));
  await reflection.locator('[data-role="status"]').selectOption("done");
  await reflection.locator("#submitBtn").click();
  await expect(page.locator("#planningSection")).toBeVisible();
  await expect(page.locator("#dailySummary")).toContainText("1");
  await expect(page.locator("#statsList")).toContainText("完成率 100%");
  const result = await page.evaluate(() => window.focusPlanner.submitProgress({}).then(() => "unexpected", () => "rejected"));
  expect(result).toBe("rejected");
  const state = JSON.parse(fs.readFileSync(path.join(directory, "planner-state.json"), "utf8"));
  expect(state.history).toHaveLength(1);
  expect(state.active).toBeNull();
  await page.screenshot({ path: "test-results/desktop-completed.png" });
});

test("expired restart opens reflection and disables timer resume", async () => {
  const session = createSession({ durationMinutes: 1, todos: [{ title: "Expired block", tags: ["QA"] }] }, new Date(Date.now() - 120000));
  fs.writeFileSync(path.join(directory, "planner-state.json"), JSON.stringify({ active: session, history: [] }));
  const page = await launch();
  await expect.poll(async () => app.windows().find((window) => window.url().endsWith("progress.html"))?.url()).toBeTruthy();
  const reflection = app.windows().find((window) => window.url().endsWith("progress.html"));
  await expect(reflection.locator("h2")).toHaveText("Expired block");
  await expect(page.locator("#pauseBtn")).toBeDisabled();
  await reflection.locator('[data-role="status"]').selectOption("done");
  await reflection.locator("#submitBtn").click();
  await expect(page.locator("#planningSection")).toBeVisible();
  const state = JSON.parse(fs.readFileSync(path.join(directory, "planner-state.json"), "utf8"));
  expect(state.history[0].actualMinutes).toBe(1);
});

test("paused restart retains remaining time", async () => {
  const now = new Date();
  const session = createSession({ durationMinutes: 25, todos: [{ title: "Paused block" }] }, new Date(now.getTime() - 5 * 60000));
  const paused = pauseSession(session, now);
  fs.writeFileSync(path.join(directory, "planner-state.json"), JSON.stringify({ active: paused, history: [] }));
  const page = await launch();
  await expect(page.locator("#pauseBtn")).toHaveText("繼續");
  await expect(page.locator("#activeTimer")).toHaveText("20:00");
});
