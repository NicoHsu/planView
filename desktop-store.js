const fs = require("node:fs");
const path = require("node:path");

function createDesktopStore(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "planner-state.json");
  function readJson(target, fallback) {
    if (!fs.existsSync(target)) return fallback;
    return JSON.parse(fs.readFileSync(target, "utf8"));
  }
  function read() {
    const state = readJson(file, null);
    if (state) {
      if (!Array.isArray(state.history)) throw new Error("歷史資料格式錯誤，請保留資料檔並聯絡支援。");
      return state;
    }
    const history = readJson(path.join(directory, "history.json"), []);
    if (!Array.isArray(history)) throw new Error("歷史資料格式錯誤。");
    const active = readJson(path.join(directory, "active-session.json"), null);
    return { history, active: history.some((record) => record.sessionId === active?.id) ? null : active };
  }
  function write(state) {
    const temporary = `${file}.tmp`;
    const fd = fs.openSync(temporary, "w", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(state, null, 2), "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
  }
  return {
    getHistory: () => read().history,
    getActive: () => read().active,
    saveActive: (session) => write({ ...read(), active: session }),
    complete: (record) => {
      const state = read();
      if (state.active?.id !== record.sessionId || state.history.some((item) => item.sessionId === record.sessionId)) {
        throw new Error("這輪已回報或不是目前的專注。");
      }
      // One atomic rename commits history and clears active together.
      write({ history: [...state.history, record], active: null });
    }
  };
}

module.exports = { createDesktopStore };
