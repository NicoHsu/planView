const test = require("node:test");
const assert = require("node:assert/strict");
const {
  aggregateTags,
  buildDailySummary,
  completeSession,
  createSession,
  endSession,
  getElapsedMs,
  formatRemaining,
  getRemainingMs,
  isSessionExpired,
  pauseSession,
  resumeSession
} = require("../src");

test("creates an endAt-based focus session", () => {
  const now = new Date("2026-06-07T01:00:00.000Z");
  const session = createSession(
    {
      durationMinutes: 25,
      todos: [{ title: "Code review", tags: "Code, review, code" }]
    },
    now
  );

  assert.equal(session.durationMinutes, 25);
  assert.equal(session.endAt, "2026-06-07T01:25:00.000Z");
  assert.deepEqual(session.todos[0].tags, ["Code", "review"]);
});

test("remaining time is derived from endAt", () => {
  const session = createSession(
    { durationMinutes: 25, todos: [{ title: "Spec" }] },
    new Date("2026-06-07T01:00:00.000Z")
  );

  assert.equal(getRemainingMs(session, new Date("2026-06-07T01:10:00.000Z")), 15 * 60 * 1000);
  assert.equal(formatRemaining(15 * 60 * 1000), "15:00");
  assert.equal(isSessionExpired(session, new Date("2026-06-07T01:26:00.000Z")), true);
});

test("pause and resume preserve remaining time", () => {
  const session = createSession(
    { durationMinutes: 30, todos: [{ title: "Write docs" }] },
    new Date("2026-06-07T01:00:00.000Z")
  );
  const paused = pauseSession(session, new Date("2026-06-07T01:10:00.000Z"));
  const resumed = resumeSession(paused, new Date("2026-06-07T02:00:00.000Z"));

  assert.equal(paused.status, "paused");
  assert.equal(paused.remainingMsAtPause, 20 * 60 * 1000);
  assert.equal(resumed.status, "active");
  assert.equal(resumed.endAt, "2026-06-07T02:20:00.000Z");
});

test("complete session records actual minutes and tag analytics", () => {
  const session = createSession(
    { durationMinutes: 25, todos: [{ title: "Review PR", tags: ["code"], estimateMinutes: 15 }] },
    new Date("2026-06-07T01:00:00.000Z")
  );
  const record = completeSession(
    session,
    { status: "done", items: [{ todoId: session.todos[0].id, status: "done" }] },
    new Date("2026-06-07T01:25:00.000Z")
  );
  const [tag] = aggregateTags([record]);

  assert.equal(record.items[0].actualMinutes, 25);
  assert.equal(tag.tag, "code");
  assert.equal(tag.completionRate, 100);
  assert.equal(tag.estimateDeltaMinutes, 10);
});

test("complete paused session excludes paused elapsed time", () => {
  const session = createSession(
    { durationMinutes: 30, todos: [{ title: "Draft spec", tags: ["spec"] }] },
    new Date("2026-06-07T01:00:00.000Z")
  );
  const paused = pauseSession(session, new Date("2026-06-07T01:10:00.000Z"));
  const record = completeSession(
    paused,
    { status: "partial", reason: "interrupted" },
    new Date("2026-06-07T02:10:00.000Z")
  );

  assert.equal(record.items[0].actualMinutes, 10);
});

test("reflection time and an overnight recovery do not inflate focus time", () => {
  const started = new Date("2026-06-07T01:00:00Z");
  const session = createSession({ durationMinutes: 25, todos: [{ title: "Write" }] }, started);
  const stopped = endSession(session, new Date("2026-06-07T01:08:00Z"));
  const record = completeSession(stopped, { status: "done" }, new Date("2026-06-08T01:00:00Z"));
  assert.equal(record.actualMinutes, 8);
  assert.equal(getRemainingMs(stopped), 0);
  assert.equal(resumeSession(stopped), stopped);
  assert.equal(completeSession(session, {}, new Date("2026-06-08T01:00:00Z")).actualMinutes, 25);
});

test("ending while paused freezes the active elapsed time", () => {
  const session = createSession({ durationMinutes: 25, todos: [{ title: "Write" }] }, new Date("2026-06-07T01:00:00Z"));
  const paused = pauseSession(session, new Date("2026-06-07T01:05:00Z"));
  const stopped = endSession(paused, new Date("2026-06-07T02:00:00Z"));
  assert.equal(getElapsedMs(stopped), 5 * 60000);
  assert.equal(endSession(stopped), stopped);
});

test("multiple todos share elapsed time and report the aggregate outcome", () => {
  const session = createSession({ durationMinutes: 30, todos: [
    { title: "A", estimateMinutes: 10 }, { title: "B", estimateMinutes: 20 }
  ] }, new Date("2026-06-07T01:00:00Z"));
  const record = completeSession(session, { items: session.todos.map((todo) => ({ todoId: todo.id, status: "done" })) }, new Date("2026-06-07T01:30:00Z"));
  assert.equal(record.outcome, "done");
  assert.deepEqual(record.items.map((item) => item.actualMinutes), [10, 20]);
  assert.equal(record.actualMinutes, 30);
});

test("daily summary uses local calendar dates and actual rather than planned time", () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = "Asia/Taipei";
  try {
    const summary = buildDailySummary([
      { endedAt: "2026-06-06T17:00:00Z", durationMinutes: 25, actualMinutes: 8, items: [] },
      { endedAt: "2026-06-06T15:00:00Z", durationMinutes: 25, items: [] }
    ], new Date("2026-06-07T03:00:00Z"));
    assert.equal(summary.date, "2026-06-07");
    assert.equal(summary.sessions, 1);
    assert.equal(summary.totalMinutes, 8);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test("a next-day reflection remains attributed to the day focus ended", () => {
  const record = { stoppedAt: new Date(2026, 5, 7, 23, 50).toISOString(),
    endedAt: new Date(2026, 5, 8, 0, 10).toISOString(), actualMinutes: 15, items: [] };
  assert.equal(buildDailySummary([record], new Date(2026, 5, 7, 23, 55)).totalMinutes, 15);
  assert.equal(buildDailySummary([record], new Date(2026, 5, 8, 0, 15)).sessions, 0);
});
