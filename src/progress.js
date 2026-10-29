const todoProgressList = document.getElementById("todoProgressList");
const submitBtn = document.getElementById("submitBtn");
const errorText = document.getElementById("errorText");
const reflectionInput = document.getElementById("reflectionInput");
const todoProgressTemplate = document.getElementById("todoProgressTemplate");

let session = null;

function setError(message) {
  if (!message) {
    errorText.hidden = true;
    errorText.textContent = "";
    return;
  }
  errorText.hidden = false;
  errorText.textContent = message;
}

function renderSessionTodos(todos) {
  todoProgressList.innerHTML = "";
  for (const todo of todos) {
    const row = todoProgressTemplate.content.cloneNode(true);
    const wrapper = row.querySelector(".item");
    wrapper.dataset.todoId = todo.id;
    row.querySelector('[data-role="title"]').textContent = todo.title;
    row.querySelector('[data-role="tags"]').textContent = todo.tags?.length
      ? `#${todo.tags.join("  #")}`
      : "未設定標籤";
    todoProgressList.appendChild(row);
  }
}

function collectProgressItems() {
  return [...todoProgressList.querySelectorAll(".item")].map((item) => {
    return {
      todoId: item.dataset.todoId,
      status: item.querySelector('[data-role="status"]').value,
      note: item.querySelector('[data-role="note"]').value.trim()
    };
  });
}

submitBtn.addEventListener("click", async () => {
  if (!session) {
    setError("找不到本輪資料。");
    return;
  }
  setError("");
  submitBtn.disabled = true;
  try {
    await window.focusPlanner.submitProgress({
      items: collectProgressItems(),
      reflection: reflectionInput.value.trim()
    });
  } catch (error) {
    setError(error?.message || "送出失敗，請稍後再試。");
    submitBtn.disabled = false;
  }
});

async function bootstrap() {
  session = await window.focusPlanner.getCurrentSession();
  if (!session) {
    setError("目前沒有可更新的 session。");
    submitBtn.disabled = true;
    return;
  }
  renderSessionTodos(session.todos);
}

bootstrap();
