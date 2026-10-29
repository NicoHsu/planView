const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const babel = require("@babel/core");

function loadStorage(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  let failTaskWrite = false;
  const adapter = {
    execAsync: async (sql) => database.exec(sql),
    getFirstAsync: async (sql, params = []) => database.prepare(sql).get(...params),
    getAllAsync: async (sql, params = []) => database.prepare(sql).all(...params),
    runAsync: async (sql, params = []) => {
      if (failTaskWrite && params[0] === "task_pool") throw new Error("simulated write failure");
      return database.prepare(sql).run(...params);
    },
    withExclusiveTransactionAsync: async (action) => {
      database.exec("BEGIN IMMEDIATE");
      try { await action(adapter); database.exec("COMMIT"); }
      catch (error) { database.exec("ROLLBACK"); throw error; }
    }
  };
  const filename = require.resolve("../src/storage.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, configFile: false, babelrc: false, plugins: ["@babel/plugin-transform-modules-commonjs"]
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => {
      assert.equal(name, "expo-sqlite");
      return { openDatabaseAsync: async () => adapter };
    }
  });
  return { storage: module.exports, failWrites: () => { failTaskWrite = true; } };
}

test("SQLite transaction rolls back history and session removal if task update fails", async (t) => {
  const { storage, failWrites } = loadStorage(t);
  await storage.initStorage();
  await storage.saveTaskPool([{ id: "task" }]);
  await storage.saveActiveSession({ id: "session" });
  failWrites();
  await assert.rejects(storage.completeSessionTransaction({ sessionId: "session", endedAt: "2026-10-29" }, []), /simulated/);
  assert.equal((await storage.getActiveSession()).id, "session");
  assert.equal((await storage.getTaskPool()).length, 1);
  assert.equal((await storage.getHistory()).length, 0);
});

test("SQLite commits a session only once and preserves the first reflection", async (t) => {
  const { storage } = loadStorage(t);
  await storage.initStorage();
  await storage.saveActiveSession({ id: "session" });
  await storage.completeSessionTransaction({ sessionId: "session", endedAt: "2026-10-29", reflection: "first" }, []);
  await assert.rejects(storage.completeSessionTransaction({ sessionId: "session", endedAt: "2026-10-29", reflection: "second" }, []), /已儲存/);
  assert.equal(await storage.getActiveSession(), null);
  assert.equal((await storage.getHistory())[0].reflection, "first");
});
