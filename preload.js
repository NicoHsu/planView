const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusPlanner", {
  startSession: (payload) => ipcRenderer.invoke("session:start", payload),
  getCurrentSession: () => ipcRenderer.invoke("session:getCurrent"),
  pauseResumeSession: () => ipcRenderer.invoke("session:pauseResume"),
  endSession: () => ipcRenderer.invoke("session:end"),
  moveToBackground: () => ipcRenderer.invoke("session:background"),
  submitProgress: (payload) => ipcRenderer.invoke("progress:submit", payload),
  getTagSummary: () => ipcRenderer.invoke("history:tagSummary"),
  getDailySummary: () => ipcRenderer.invoke("history:dailySummary"),
  getInsights: () => ipcRenderer.invoke("history:insights"),
  onTimerTick: (callback) => {
    ipcRenderer.on("timer:tick", (_, data) => callback(data));
  },
  onTimeUp: (callback) => {
    ipcRenderer.on("session:timeup", (_, data) => callback(data));
  },
  onSessionReset: (callback) => {
    ipcRenderer.on("session:reset", () => callback());
  }
});
