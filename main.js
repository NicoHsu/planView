const path = require("path");
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, dialog } = require("electron");
const { createDesktopStore } = require("./desktop-store");
const {
  aggregateTags,
  buildDailySummary,
  buildInsights,
  completeSession,
  createSession,
  endSession,
  formatRemaining,
  getRemainingMs: getCoreRemainingMs,
  isSessionExpired,
  pauseSession,
  resumeSession
} = require("./packages/core");

let mainWindow = null;
let progressWindow = null;
let tray = null;
let timerInterval = null;
let currentSession = null;
let store;
let isQuitting = false;
const explicitUserData = app.commandLine.getSwitchValue("user-data-dir");
if (explicitUserData) app.setPath("userData", path.resolve(explicitUserData));

function readHistory() {
  return store.getHistory();
}

function readActiveSession() {
  return store.getActive();
}

function writeActiveSession(session) {
  store.saveActive(session);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.on("close", (event) => {
    if (currentSession && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  if (tray) {
    return tray;
  }

  const icon = nativeImage
    .createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAK0lEQVR42mNggIKGhoYGIyMjQxFjY2Px//8/GhhYWCqGDCv4j6GJQYABAFHACrdaRhLfAAAAAElFTkSuQmCC"
    )
    .resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip("PlanView Focus Planner");
  tray.on("click", () => {
    if (!mainWindow) {
      return;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  refreshTrayMenu();
  return tray;
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  const remaining = getRemainingMs();
  const remainingLabel = currentSession
    ? `剩餘時間：${formatRemaining(remaining)}`
    : "目前沒有進行中的計時";

  const contextMenu = Menu.buildFromTemplate([
    { label: remainingLabel, enabled: false },
    {
      label: "顯示主視窗",
      click: () => {
        if (!mainWindow) {
          return;
        }
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: "提前結束本輪",
      enabled: Boolean(currentSession),
      click: () => {
        if (!currentSession) {
          return;
        }
        completeSessionByTimeout();
      }
    },
    { type: "separator" },
    {
      label: "離開",
      click: () => {
        app.exit(0);
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  if (process.platform === "darwin") {
    tray.setTitle(currentSession ? formatRemaining(remaining) : "");
  } else {
    tray.setToolTip(currentSession ? `剩餘 ${formatRemaining(remaining)}` : "PlanView Focus Planner");
  }
}

function getRemainingMs() {
  if (!currentSession) {
    return 0;
  }
  return getCoreRemainingMs(currentSession);
}

function broadcastTimerTick() {
  const remaining = getRemainingMs();
  if (mainWindow) {
    mainWindow.webContents.send("timer:tick", {
      remainingMs: Math.max(0, remaining),
      formatted: formatRemaining(remaining),
      sessionId: currentSession?.id ?? null
    });
  }
  refreshTrayMenu();
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    const remaining = getRemainingMs();
    if (remaining <= 0) {
      completeSessionByTimeout();
      return;
    }
    broadcastTimerTick();
  }, 1000);
  broadcastTimerTick();
}

function createProgressWindow() {
  if (progressWindow) {
    progressWindow.focus();
    return;
  }

  progressWindow = new BrowserWindow({
    width: 860,
    height: 680,
    modal: true,
    alwaysOnTop: true,
    parent: mainWindow ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  progressWindow.loadFile(path.join(__dirname, "src", "progress.html"));
  progressWindow.on("closed", () => {
    progressWindow = null;
  });
}

function completeSessionByTimeout() {
  if (!currentSession) {
    return;
  }

  stopTimer();
  currentSession = endSession(currentSession);
  writeActiveSession(currentSession);
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("session:timeup", {
      sessionId: currentSession.id
    });
  }

  createTray();
  refreshTrayMenu();

  if (Notification.isSupported()) {
    new Notification({
      title: "時間到",
      body: "請更新這輪任務完成進度，然後規劃下一輪。"
    }).show();
  }

  createProgressWindow();
}

ipcMain.handle("session:start", (_, payload) => {
  const durationMinutes = Number(payload?.durationMinutes ?? 0);
  const todos = Array.isArray(payload?.todos) ? payload.todos : [];
  const autoBackground = Boolean(payload?.autoBackground);

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 480 || !todos.length) {
    throw new Error("請輸入有效時間與至少一個待辦。");
  }
  if (currentSession) {
    throw new Error("目前已有進行中的 session，請先完成或回報。");
  }

  const session = createSession({
    durationMinutes,
    todos,
    intention: payload?.intention
  });
  writeActiveSession(session);
  currentSession = session;

  createTray();
  startTimer();

  if (autoBackground && mainWindow) {
    mainWindow.hide();
  }

  return { ok: true, session: currentSession };
});

ipcMain.handle("session:getCurrent", () => currentSession);
ipcMain.handle("session:end", () => {
  completeSessionByTimeout();
  return { ok: true };
});

ipcMain.handle("session:pauseResume", () => {
  if (!currentSession) {
    throw new Error("目前沒有進行中的 session。");
  }
  if (currentSession.stoppedAt || isSessionExpired(currentSession)) {
    completeSessionByTimeout();
    return { ok: true, session: currentSession };
  }

  currentSession =
    currentSession.status === "paused" ? resumeSession(currentSession) : pauseSession(currentSession);
  writeActiveSession(currentSession);
  if (currentSession.status === "paused") {
    stopTimer();
    broadcastTimerTick();
  } else {
    startTimer();
  }
  return { ok: true, session: currentSession };
});

ipcMain.handle("session:background", () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  createTray();
  refreshTrayMenu();
  return { ok: true };
});

ipcMain.handle("progress:submit", (_, payload) => {
  if (!currentSession) {
    throw new Error("目前沒有進行中的 session。");
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const reflection = String(payload?.reflection ?? "").trim();

  const record = completeSession(currentSession, {
    items,
    reflection,
    status: payload?.status,
    reason: payload?.reason,
    nextAction: payload?.nextAction
  });

  store.complete(record);
  stopTimer();
  currentSession = null;
  refreshTrayMenu();
  if (progressWindow) {
    progressWindow.close();
    progressWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("session:reset");
  }
  return { ok: true };
});

ipcMain.handle("history:tagSummary", () => aggregateTags(readHistory()));
ipcMain.handle("history:dailySummary", () => buildDailySummary(readHistory()));
ipcMain.handle("history:insights", () => buildInsights(readHistory()));

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  mainWindow?.show();
  mainWindow?.focus();
});

app.whenReady().then(() => {
  store = createDesktopStore(app.getPath("userData"));
  currentSession = readActiveSession();
  createMainWindow();
  createTray();
  if (currentSession) {
    if (currentSession.stoppedAt || isSessionExpired(currentSession)) {
      completeSessionByTimeout();
    } else if (currentSession.status !== "paused") {
      startTimer();
    } else {
      broadcastTimerTick();
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
}).catch((error) => {
  dialog.showErrorBox("PlanView 無法啟動", `${error.message}\n本機資料未清除，請聯絡 nicohsu000@gmail.com。`);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => { isQuitting = true; stopTimer(); });
