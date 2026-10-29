const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createDesktopStore } = require("../desktop-store");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "planview-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, store: createDesktopStore(directory) };
}

test("completion atomically persists history and clears active across restarts", (t) => {
  const { directory, store } = fixture(t);
  store.saveActive({ id: "one", status: "paused", remainingMsAtPause: 120000 });
  assert.equal(createDesktopStore(directory).getActive().remainingMsAtPause, 120000);
  store.complete({ sessionId: "one" });
  const restarted = createDesktopStore(directory);
  assert.equal(restarted.getActive(), null);
  assert.equal(restarted.getHistory().length, 1);
  assert.throws(() => restarted.complete({ sessionId: "one" }), /回報/);
});

test("legacy JSON migrates without reactivating an already completed session", (t) => {
  const { directory, store } = fixture(t);
  fs.writeFileSync(path.join(directory, "history.json"), JSON.stringify([{ sessionId: "old" }]));
  fs.writeFileSync(path.join(directory, "active-session.json"), JSON.stringify({ id: "old" }));
  assert.equal(store.getHistory().length, 1);
  assert.equal(store.getActive(), null);
  store.saveActive({ id: "new" });
  assert.equal(createDesktopStore(directory).getActive().id, "new");
  assert.ok(fs.existsSync(path.join(directory, "history.json")));
});

test("corrupt history is reported instead of silently overwritten", (t) => {
  const { directory, store } = fixture(t);
  fs.writeFileSync(path.join(directory, "history.json"), "broken");
  assert.throws(() => store.saveActive({ id: "new" }), SyntaxError);
  assert.equal(fs.readFileSync(path.join(directory, "history.json"), "utf8"), "broken");
});
