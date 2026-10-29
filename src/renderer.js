const planningSection = document.getElementById("planningSection");
const activeSection = document.getElementById("activeSection");
const durationInput = document.getElementById("durationInput");
const addTodoBtn = document.getElementById("addTodoBtn");
const todoList = document.getElementById("todoList");
const startBtn = document.getElementById("startBtn");
const planningError = document.getElementById("planningError");
const autoBackgroundInput = document.getElementById("autoBackgroundInput");
const activeTimer = document.getElementById("activeTimer");
const activeTodos = document.getElementById("activeTodos");
const pauseBtn = document.getElementById("pauseBtn");
const finishBtn = document.getElementById("finishBtn");
const backgroundBtn = document.getElementById("backgroundBtn");
const dailySummary = document.getElementById("dailySummary");
const insightHeadline = document.getElementById("insightHeadline");
const statsList = document.getElementById("statsList");
const refreshStatsBtn = document.getElementById("refreshStatsBtn");
const todoRowTemplate = document.getElementById("todoRowTemplate");

let session = null;

function addTodoRow(value = { title: "", tags: "" }) {
  const row = todoRowTemplate.content.cloneNode(true);
  const wrapper = row.querySelector(".todo-row");
  const titleInput = row.querySelector('[data-role="title"]');
  const tagsInput = row.querySelector('[data-role="tags"]');
  const deleteBtn = row.querySelector('[data-role="delete"]');

  titleInput.value = value.title;
  tagsInput.value = value.tags;

  deleteBtn.addEventListener("click", () => {
    wrapper.remove();
  });

  todoList.appendChild(row);
}

function collectTodos() {
  const rows = [...todoList.querySelectorAll(".todo-row")];
  return rows
    .map((row) => {
      const title = row.querySelector('[data-role="title"]').value.trim();
      const tagsRaw = row.querySelector('[data-role="tags"]').value.trim();
      const tags = tagsRaw
        ? [...new Set(tagsRaw.split(",").map((tag) => tag.trim()).filter(Boolean))]
        : [];
      return { title, tags };
    })
    .filter((todo) => todo.title.length > 0);
}

function renderSessionTodos(todos) {
  activeTodos.innerHTML = "";
  for (const todo of todos) {
    const block = document.createElement("article");
    block.className = "active-todo";
    const title = document.createElement("h3");
    title.textContent = todo.title;
    const tagWrap = document.createElement("div");
    tagWrap.className = "tag-wrap";
    const tags = todo.tags?.length ? todo.tags : ["未設定標籤"];
    for (const tag of tags) {
      const pill = document.createElement("span");
      pill.className = todo.tags?.length ? "tag" : "tag muted";
      pill.textContent = tag;
      tagWrap.appendChild(pill);
    }
    block.append(title, tagWrap);
    activeTodos.appendChild(block);
  }
}

function setPlanningError(message) {
  if (!message) {
    planningError.hidden = true;
    planningError.textContent = "";
    return;
  }
  planningError.hidden = false;
  planningError.textContent = message;
}

function showActiveState(nextSession) {
  session = nextSession;
  planningSection.hidden = true;
  activeSection.hidden = false;
  renderSessionTodos(nextSession.todos);
  const remainingMs = nextSession.stoppedAt ? 0 : nextSession.status === "paused"
    ? nextSession.remainingMsAtPause : Math.max(0, new Date(nextSession.endAt).getTime() - Date.now());
  const seconds = Math.floor(remainingMs / 1000);
  activeTimer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  pauseBtn.disabled = Boolean(nextSession.stoppedAt);
}

function showPlanningState() {
  session = null;
  planningSection.hidden = false;
  activeSection.hidden = true;
  activeTimer.textContent = "00:00";
}

async function refreshTagSummary() {
  const [rows, summary, insights] = await Promise.all([
    window.focusPlanner.getTagSummary(),
    window.focusPlanner.getDailySummary(),
    window.focusPlanner.getInsights()
  ]);

  dailySummary.innerHTML = `
    <article><strong>${summary.sessions}</strong><span>今日輪次</span></article>
    <article><strong>${summary.totalMinutes}m</strong><span>今日投入</span></article>
    <article><strong>${summary.completedItems}</strong><span>完成項目</span></article>
    <article><strong>${summary.blockedItems}</strong><span>卡住項目</span></article>
  `;
  insightHeadline.textContent = insights.headline;

  if (!rows.length) {
    statsList.innerHTML = "<p class='hint'>尚無資料，完成幾輪後會在這裡看到標籤統計。</p>";
    return;
  }

  statsList.innerHTML = "";
  for (const row of rows) {
    const ratio = row.total ? Math.round((row.done / row.total) * 100) : 0;
    const article = document.createElement("article");
    article.className = "stat-row";
    const title = document.createElement("h3");
    title.textContent = `#${row.tag}`;
    const text = document.createElement("p");
    text.textContent = `總次數 ${row.total} ｜ 完成 ${row.done} ｜ 部分 ${row.partial} ｜ 卡住 ${row.blocked} ｜ 完成率 ${ratio}% ｜ 預估偏差 ${row.estimateDeltaMinutes >= 0 ? "+" : ""}${row.estimateDeltaMinutes}m`;
    article.append(title, text);
    statsList.appendChild(article);
  }
}

addTodoBtn.addEventListener("click", () => addTodoRow());
refreshStatsBtn.addEventListener("click", refreshTagSummary);

backgroundBtn.addEventListener("click", async () => {
  await window.focusPlanner.moveToBackground();
});

finishBtn.addEventListener("click", async () => {
  finishBtn.disabled = true;
  try { await window.focusPlanner.endSession(); }
  catch (error) { activeTimer.textContent = error.message; }
  finally { finishBtn.disabled = false; }
});

pauseBtn.addEventListener("click", async () => {
  pauseBtn.disabled = true;
  try {
    const result = await window.focusPlanner.pauseResumeSession();
    showActiveState(result.session);
    pauseBtn.textContent = session.status === "paused" ? "繼續" : "暫停";
  } catch (error) {
    activeTimer.textContent = error.message;
  } finally {
    pauseBtn.disabled = Boolean(session?.stoppedAt);
  }
});

startBtn.addEventListener("click", async () => {
  setPlanningError("");
  const durationMinutes = Number(durationInput.value);
  const todos = collectTodos();
  if (!durationMinutes || durationMinutes <= 0) {
    setPlanningError("請輸入有效的倒數時間。");
    return;
  }
  if (!todos.length) {
    setPlanningError("請至少新增一個任務。");
    return;
  }

  try {
    const result = await window.focusPlanner.startSession({
      durationMinutes,
      todos,
      autoBackground: autoBackgroundInput.checked
    });
    showActiveState(result.session);
    pauseBtn.textContent = "暫停";
  } catch (error) {
    setPlanningError(error?.message || "啟動失敗，請再試一次。");
  }
});

window.focusPlanner.onTimerTick((data) => {
  if (session && data.sessionId === session.id) {
    activeTimer.textContent = data.formatted;
  }
});

window.focusPlanner.onTimeUp(() => {
  activeTimer.textContent = "00:00";
  pauseBtn.disabled = true;
});

window.focusPlanner.onSessionReset(async () => {
  showPlanningState();
  addTodoRow();
  await refreshTagSummary();
});

async function bootstrap() {
  const current = await window.focusPlanner.getCurrentSession();
  if (current) {
    showActiveState(current);
    pauseBtn.textContent = current.status === "paused" ? "繼續" : "暫停";
  } else {
    addTodoRow({ title: "code review", tags: "engineering,review" });
    addTodoRow({ title: "文件規格開發", tags: "spec,docs" });
  }
  await refreshTagSummary();
}

bootstrap();
