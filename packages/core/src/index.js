const SESSION_STATUS = Object.freeze({
  PLANNED: "planned",
  ACTIVE: "active",
  PAUSED: "paused",
  EXPIRED: "expired",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
});

const TODO_STATUS = Object.freeze({
  DONE: "done",
  PARTIAL: "partial",
  BLOCKED: "blocked"
});

const OUTCOME_REASON = Object.freeze({
  UNDERESTIMATED: "underestimated",
  INTERRUPTED: "interrupted",
  UNCLEAR_NEXT_STEP: "unclear_next_step",
  AVOIDED: "avoided",
  URGENT_INSERT: "urgent_insert",
  OTHER: "other"
});

function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : String(tags || "").split(",");
  const seen = new Set();
  const normalized = [];

  for (const rawTag of values) {
    const tag = String(rawTag || "").trim().replace(/^#/, "");
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }

  return normalized;
}

function normalizeTodos(todos) {
  if (!Array.isArray(todos)) return [];

  return todos
    .map((todo, index) => ({
      id: todo.id || `${Date.now()}-${index}`,
      title: String(todo.title || "").trim(),
      tags: normalizeTags(todo.tags),
      estimateMinutes: clampMinutes(todo.estimateMinutes || todo.durationMinutes || 25),
      sortOrder: Number.isFinite(todo.sortOrder) ? todo.sortOrder : index
    }))
    .filter((todo) => todo.title.length > 0);
}

function clampMinutes(value, fallback = 25) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  return Math.min(480, Math.max(1, Math.round(minutes)));
}

function createSession(payload, now = new Date()) {
  const durationMinutes = clampMinutes(payload?.durationMinutes);
  const inputs = Array.isArray(payload?.todos) ? payload.todos.filter((todo) => String(todo.title || "").trim()) : [];
  const todos = normalizeTodos(inputs.map((todo) => ({
    ...todo, estimateMinutes: todo.estimateMinutes || todo.durationMinutes || durationMinutes / inputs.length
  })));

  if (!todos.length) {
    throw new Error("At least one todo is required.");
  }

  const startedAt = payload?.startedAt ? new Date(payload.startedAt) : now;
  const endAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

  return {
    id: payload?.id || `${startedAt.getTime()}`,
    status: SESSION_STATUS.ACTIVE,
    startedAt: startedAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes,
    intention: String(payload?.intention || "推進").trim(),
    todos
  };
}

function getRemainingMs(session, now = new Date()) {
  if (!session?.endAt) return 0;
  if (session.stoppedAt) return 0;
  if (session.status === SESSION_STATUS.PAUSED) {
    return Math.max(0, Number(session.remainingMsAtPause || 0));
  }
  return Math.max(0, new Date(session.endAt).getTime() - now.getTime());
}

function isSessionExpired(session, now = new Date()) {
  return Boolean(session?.endAt) && session.status !== SESSION_STATUS.PAUSED && getRemainingMs(session, now) <= 0;
}

function pauseSession(session, now = new Date()) {
  if (!session) {
    throw new Error("Session is required.");
  }
  if (session.stoppedAt || session.status === SESSION_STATUS.PAUSED) {
    return session;
  }

  return {
    ...session,
    status: SESSION_STATUS.PAUSED,
    pausedAt: now.toISOString(),
    remainingMsAtPause: getRemainingMs(session, now)
  };
}

function resumeSession(session, now = new Date()) {
  if (!session) {
    throw new Error("Session is required.");
  }
  if (session.stoppedAt || session.status !== SESSION_STATUS.PAUSED) {
    return session;
  }

  const remainingMs = Math.max(0, Number(session.remainingMsAtPause || 0));
  const pausedMs = session.pausedAt ? Math.max(0, now.getTime() - new Date(session.pausedAt).getTime()) : 0;
  return {
    ...session,
    status: SESSION_STATUS.ACTIVE,
    pausedAt: "",
    remainingMsAtPause: 0,
    totalPausedMs: Number(session.totalPausedMs || 0) + pausedMs,
    endAt: new Date(now.getTime() + remainingMs).toISOString()
  };
}

function formatRemaining(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Freeze the focus boundary before the user spends time writing a reflection.
function endSession(session, now = new Date()) {
  if (!session) throw new Error("Session is required.");
  if (session.stoppedAt) return session;
  const stoppedAt = session.status === SESSION_STATUS.PAUSED
    ? new Date(session.pausedAt)
    : new Date(Math.min(now.getTime(), new Date(session.endAt).getTime()));
  return { ...session, status: SESSION_STATUS.EXPIRED, stoppedAt: stoppedAt.toISOString() };
}

function getElapsedMs(session, now = new Date()) {
  if (!session) return 0;
  const boundary = session.stoppedAt ||
    (session.status === SESSION_STATUS.PAUSED ? session.pausedAt : null);
  const endedAt = boundary ? new Date(boundary).getTime() : Math.min(now.getTime(), new Date(session.endAt).getTime());
  return Math.max(0, endedAt - new Date(session.startedAt).getTime() - Number(session.totalPausedMs || 0));
}

function completeSession(session, payload = {}, now = new Date()) {
  if (!session) {
    throw new Error("Session is required.");
  }

  const submittedItems = Array.isArray(payload.items) ? payload.items : [];
  const activeElapsedMs = getElapsedMs(session, now);
  const defaultActualMinutes = Math.max(1, Math.round(activeElapsedMs / 60000));
  const totalEstimate = session.todos.reduce((sum, todo) => sum + Number(todo.estimateMinutes || session.durationMinutes), 0);
  const items = (session.todos || []).map((todo) => {
    const found = submittedItems.find((item) => item.todoId === todo.id || item.id === todo.id) || {};
    return {
      todoId: todo.id,
      title: todo.title,
      tags: normalizeTags(todo.tags),
      estimateMinutes: clampMinutes(todo.estimateMinutes || session.durationMinutes),
      actualMinutes: Number.isFinite(Number(found.actualMinutes)) && Number(found.actualMinutes) >= 0
        ? Number(found.actualMinutes)
        : Number((defaultActualMinutes * Number(todo.estimateMinutes || session.durationMinutes) / totalEstimate).toFixed(2)),
      status: normalizeTodoStatus(found.status || payload.status),
      note: String(found.note || "").trim(),
      reason: normalizeReason(found.reason || payload.reason)
    };
  });

  return {
    sessionId: session.id,
    status: SESSION_STATUS.COMPLETED,
    startedAt: session.startedAt,
    endedAt: now.toISOString(),
    endAt: session.endAt,
    durationMinutes: session.durationMinutes,
    actualMinutes: defaultActualMinutes,
    stoppedAt: session.stoppedAt || endSession(session, now).stoppedAt,
    intention: session.intention || "推進",
    outcome: payload.status ? normalizeTodoStatus(payload.status) :
      items.every((item) => item.status === TODO_STATUS.DONE) ? TODO_STATUS.DONE :
      items.every((item) => item.status === TODO_STATUS.BLOCKED) ? TODO_STATUS.BLOCKED : TODO_STATUS.PARTIAL,
    reason: normalizeReason(payload.reason),
    reflection: String(payload.reflection || "").trim(),
    nextAction: String(payload.nextAction || "").trim(),
    items
  };
}

function normalizeTodoStatus(status) {
  if (Object.values(TODO_STATUS).includes(status)) return status;
  return TODO_STATUS.PARTIAL;
}

function normalizeReason(reason) {
  if (Object.values(OUTCOME_REASON).includes(reason)) return reason;
  return "";
}

function aggregateTags(history) {
  const map = new Map();

  for (const session of history || []) {
    for (const item of session.items || []) {
      for (const tag of normalizeTags(item.tags)) {
        const key = tag.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            tag,
            total: 0,
            done: 0,
            partial: 0,
            blocked: 0,
            estimateMinutes: 0,
            actualMinutes: 0
          });
        }
        const row = map.get(key);
        row.total += 1;
        row.estimateMinutes += Number(item.estimateMinutes || 0);
        row.actualMinutes += Number(item.actualMinutes || session.durationMinutes || 0);
        if (item.status === TODO_STATUS.DONE) row.done += 1;
        if (item.status === TODO_STATUS.PARTIAL) row.partial += 1;
        if (item.status === TODO_STATUS.BLOCKED) row.blocked += 1;
      }
    }
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      completionRate: row.total ? Math.round((row.done / row.total) * 100) : 0,
      estimateDeltaMinutes: row.actualMinutes - row.estimateMinutes
    }))
    .sort((a, b) => b.actualMinutes - a.actualMinutes || a.tag.localeCompare(b.tag));
}

function buildDailySummary(history, now = new Date()) {
  const localDateKey = (value) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const todayKey = localDateKey(now);
  const todayRecords = (history || []).filter((record) => localDateKey(record.stoppedAt || record.endedAt || record.startedAt) === todayKey);
  const totalMinutes = todayRecords.reduce((sum, record) => sum + Number(record.actualMinutes ?? record.durationMinutes ?? 0), 0);
  const completedItems = todayRecords.flatMap((record) => record.items || []).filter((item) => item.status === TODO_STATUS.DONE).length;
  const blockedItems = todayRecords.flatMap((record) => record.items || []).filter((item) => item.status === TODO_STATUS.BLOCKED).length;

  return {
    date: todayKey,
    sessions: todayRecords.length,
    totalMinutes,
    completedItems,
    blockedItems
  };
}

function buildInsights(history) {
  const tags = aggregateTags(history);
  const biggestUnderestimate = tags
    .filter((tag) => tag.estimateDeltaMinutes > 0)
    .sort((a, b) => b.estimateDeltaMinutes - a.estimateDeltaMinutes)[0];
  const mostUsedTag = tags[0];

  return {
    tags,
    headline: buildInsightHeadline(mostUsedTag, biggestUnderestimate)
  };
}

function buildInsightHeadline(mostUsedTag, biggestUnderestimate) {
  if (biggestUnderestimate) {
    return `#${biggestUnderestimate.tag} 平均比預估多 ${Math.round(biggestUnderestimate.estimateDeltaMinutes / biggestUnderestimate.total)} 分鐘。`;
  }
  if (mostUsedTag) {
    return `#${mostUsedTag.tag} 是目前投入最多的時間類型。`;
  }
  return "完成幾輪後，這裡會開始校準你的預估。";
}

module.exports = {
  SESSION_STATUS,
  TODO_STATUS,
  OUTCOME_REASON,
  normalizeTags,
  normalizeTodos,
  clampMinutes,
  createSession,
  completeSession,
  endSession,
  getElapsedMs,
  getRemainingMs,
  isSessionExpired,
  pauseSession,
  resumeSession,
  formatRemaining,
  aggregateTags,
  buildDailySummary,
  buildInsights
};
