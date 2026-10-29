const {
  completeSession, createSession, endSession, getRemainingMs,
  isSessionExpired, normalizeTags, pauseSession, resumeSession, OUTCOME_REASON
} = require("@planview/core");

// One queue owns all state changes, including foreground reloads. UI render timing
// must not decide whether two starts or two reflection submissions can race.
function createFocusService({ storage, notifications, now = () => new Date(), onWarning = () => {} }) {
  let queue = Promise.resolve();
  const serial = (action) => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  async function snapshot() {
    const [tasks, history, session] = await Promise.all([
      storage.getTaskPool(), storage.getHistory(), storage.getActiveSession()
    ]);
    return { tasks, history, session };
  }
  async function cancel(session) {
    if (!session?.notificationId) return;
    try {
      await notifications.cancelScheduledNotificationAsync(session.notificationId);
    } catch {
      onWarning("無法取消提醒，原定時間可能仍會出現通知。");
    }
  }
  async function schedule(session) {
    try {
      let permission = await notifications.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain !== false) {
        permission = await notifications.requestPermissionsAsync();
      }
      if (!permission.granted) {
        onWarning("通知尚未開啟；計時仍會繼續，請回到 App 查看進度。可在系統設定開啟提醒。");
        return "";
      }
      return await notifications.scheduleNotificationAsync({
        content: { title: "時間到", body: `${session.todos[0].title} 結束了，回來記錄進度。` },
        trigger: { type: "timeInterval", seconds: Math.max(1, Math.ceil(getRemainingMs(session, now()) / 1000)) }
      });
    } catch {
      onWarning("暫時無法設定提醒；計時已保留，請回到 App 查看進度。");
      return "";
    }
  }
  async function beginReflection() {
    const session = await storage.getActiveSession();
    if (!session) throw new Error("目前沒有進行中的專注。");
    const stopped = endSession(session, now());
    await storage.saveActiveSession(stopped);
    await cancel(stopped);
    return snapshot();
  }
  return {
    reload: () => serial(async () => {
      const session = await storage.getActiveSession();
      if (session && !session.stoppedAt && isSessionExpired(session, now())) return beginReflection();
      return snapshot();
    }),
    addTask: (draft) => serial(async () => {
      const title = String(draft.title || "").trim();
      if (!title) throw new Error("請輸入任務名稱。");
      const tasks = await storage.getTaskPool();
      const task = {
        id: `${now().getTime()}-${Math.random().toString(36).slice(2, 10)}`,
        title, tags: normalizeTags(draft.tags), estimateMinutes: draft.duration,
        intention: draft.intention || "推進", sortOrder: tasks.length
      };
      await storage.saveTaskPool([...tasks, task]);
      return snapshot();
    }),
    start: (task, duration) => serial(async () => {
      if (await storage.getActiveSession()) throw new Error("已有進行中的專注，請先回報目前這輪。");
      const tasks = await storage.getTaskPool();
      const storedTask = tasks.find((item) => item.id === task?.id);
      if (!storedTask) throw new Error("請先新增或選擇任務。");
      const session = createSession({
        id: `${now().getTime()}-${Math.random().toString(36).slice(2, 10)}`,
        durationMinutes: duration || storedTask.estimateMinutes,
        intention: storedTask.intention,
        todos: [storedTask]
      }, now());
      // Persist before requesting permission: opening Settings may background the app.
      await storage.saveActiveSession(session);
      const notificationId = await schedule(session);
      try {
        await storage.saveActiveSession({ ...session, notificationId });
      } catch (error) {
        await cancel({ notificationId });
        throw error;
      }
      return snapshot();
    }),
    togglePause: () => serial(async () => {
      const session = await storage.getActiveSession();
      if (!session) throw new Error("目前沒有進行中的專注。");
      if (session.stoppedAt || isSessionExpired(session, now())) return beginReflection();
      if (session.status === "paused") {
        const resumed = resumeSession(session, now());
        await storage.saveActiveSession(resumed);
        const notificationId = await schedule(resumed);
        try {
          await storage.saveActiveSession({ ...resumed, notificationId });
        } catch (error) {
          await cancel({ notificationId });
          throw error;
        }
      } else {
        await storage.saveActiveSession({ ...pauseSession(session, now()), notificationId: "" });
        await cancel(session);
      }
      return snapshot();
    }),
    reflect: () => serial(beginReflection),
    complete: (sessionId, payload) => serial(async () => {
      const session = await storage.getActiveSession();
      if (!session || session.id !== sessionId) throw new Error("這輪已儲存，請勿重複回報。");
      if (!["done", "partial", "blocked"].includes(payload.status)) throw new Error("請選擇完成狀態。");
      if (payload.status !== "done" && !Object.values(OUTCOME_REASON).includes(payload.reason)) {
        throw new Error("請選擇主要原因。");
      }
      if (payload.status !== "done" && !["continue", "defer", "drop"].includes(payload.nextAction)) {
        throw new Error("請選擇下一步。");
      }
      const record = completeSession(endSession(session, now()), {
        ...payload, reason: payload.status === "done" ? "" : payload.reason
      }, now());
      const tasks = await storage.getTaskPool();
      const activeIds = new Set(session.todos.map((todo) => todo.id));
      let nextTasks = tasks;
      if (payload.status === "done" || payload.nextAction === "drop") {
        nextTasks = tasks.filter((task) => !activeIds.has(task.id));
      } else if (payload.nextAction === "defer") {
        nextTasks = [...tasks.filter((task) => !activeIds.has(task.id)), ...tasks.filter((task) => activeIds.has(task.id))];
      }
      await storage.completeSessionTransaction(record, nextTasks);
      await cancel(session);
      return snapshot();
    })
  };
}

module.exports = { createFocusService };
