const test = require("node:test");
const assert = require("node:assert/strict");
const { createFocusService } = require("../src/focus-service");

function fixture(options = {}) {
  let time = new Date("2026-10-29T01:00:00Z");
  let active = null;
  let tasks = [{ id: "a", title: "Draft", tags: ["work"], estimateMinutes: 25, intention: "學習" },
    { id: "b", title: "Review", estimateMinutes: 15 }];
  let history = [];
  const scheduled = new Map();
  const warnings = [];
  const storage = {
    getTaskPool: async () => structuredClone(tasks),
    getHistory: async () => structuredClone(history),
    getActiveSession: async () => structuredClone(active),
    saveActiveSession: async (session) => { active = structuredClone(session); },
    saveTaskPool: async (next) => { tasks = structuredClone(next); },
    completeSessionTransaction: async (record, next) => {
      if (options.failTransaction) throw new Error("disk full");
      history.push(record); tasks = next; active = null;
    }
  };
  let counter = 0;
  const notifications = {
    getPermissionsAsync: async () => ({ granted: !options.denied, canAskAgain: false }),
    requestPermissionsAsync: async () => ({ granted: false }),
    scheduleNotificationAsync: async (payload) => {
      if (options.failSchedule) throw new Error("unavailable");
      const id = `n${++counter}`; scheduled.set(id, payload); return id;
    },
    cancelScheduledNotificationAsync: async (id) => {
      if (options.failCancel) throw new Error("unavailable");
      scheduled.delete(id);
    }
  };
  const service = createFocusService({ storage, notifications, now: () => time, onWarning: (message) => warnings.push(message) });
  return { service, storage, notifications, scheduled, warnings, options,
    task: tasks[0], advance: (minutes) => { time = new Date(time.getTime() + minutes * 60000); } };
}

test("concurrent starts create only one session and notification", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.service.start(f.task), f.service.start(f.task)]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(f.scheduled.size, 1);
  assert.equal((await f.service.reload()).session.intention, "學習");
});

for (const option of ["denied", "failSchedule"]) {
  test(`${option}: timer still starts and persists without a notification`, async () => {
    const f = fixture({ [option]: true });
    const { session } = await f.service.start(f.task);
    assert.ok(session.id);
    assert.equal(session.notificationId, "");
    assert.equal(f.warnings.length, 1);
    assert.equal((await f.service.reload()).session.id, session.id);
  });
}

test("pause cancels the reminder, restart preserves time, resume reschedules it", async () => {
  const f = fixture();
  await f.service.start(f.task);
  f.advance(5);
  await f.service.togglePause();
  assert.equal(f.scheduled.size, 0);
  f.advance(60);
  const restarted = createFocusService({ storage: f.storage, notifications: f.notifications });
  assert.equal((await restarted.reload()).session.remainingMsAtPause, 20 * 60000);
  const resumed = await f.service.togglePause();
  assert.equal(resumed.session.status, "active");
  assert.equal([...f.scheduled.values()][0].trigger.seconds, 20 * 60);
});

test("expired session recovery freezes duration and cancels outstanding notification", async () => {
  const f = fixture();
  await f.service.start(f.task);
  f.advance(1440);
  const { session } = await f.service.reload();
  assert.ok(session.stoppedAt);
  assert.equal(f.scheduled.size, 0);
  const result = await f.service.complete(session.id, { status: "done" });
  assert.equal(result.history[0].actualMinutes, 25);
  assert.equal(result.session, null);
});

test("double reflection submission commits once and preserves later tasks", async () => {
  const f = fixture();
  const { session } = await f.service.start(f.task);
  f.advance(8);
  await f.service.reflect();
  f.advance(20);
  await f.service.addTask({ title: "New task", duration: 15 });
  const results = await Promise.allSettled([
    f.service.complete(session.id, { status: "done" }),
    f.service.complete(session.id, { status: "done" })
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  const result = await f.service.reload();
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].actualMinutes, 8);
  assert.deepEqual(result.tasks.map((task) => task.title), ["Review", "New task"]);
});

test("transaction failure leaves the session and task pool available for retry", async () => {
  const f = fixture({ failTransaction: true });
  const { session } = await f.service.start(f.task);
  await assert.rejects(f.service.complete(session.id, { status: "done" }), /disk full/);
  assert.equal((await f.service.reload()).session.id, session.id);
  f.options.failTransaction = false;
  assert.equal((await f.service.complete(session.id, { status: "done" })).history.length, 1);
});

test("notification cancellation failure after commit does not reopen a completed session", async () => {
  const f = fixture({ failCancel: true });
  const { session } = await f.service.start(f.task);
  const result = await f.service.complete(session.id, { status: "done" });
  assert.equal(result.session, null);
  assert.equal(result.history.length, 1);
  assert.equal(f.warnings.length, 1);
});

for (const [action, ids] of [["continue", ["a", "b"]], ["defer", ["b", "a"]], ["drop", ["b"]]]) {
  test(`partial result ${action} updates the task pool`, async () => {
    const f = fixture();
    const { session } = await f.service.start(f.task);
    await assert.rejects(f.service.complete(session.id, { status: "partial", nextAction: action }), /原因/);
    const result = await f.service.complete(session.id, { status: "partial", reason: "interrupted", nextAction: action });
    assert.deepEqual(result.tasks.map((task) => task.id), ids);
  });
}
