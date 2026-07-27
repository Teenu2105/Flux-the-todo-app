// =====================================================================
// APP.JS — UI logic, state, and event wiring.
// Talks to the database ONLY through the functions in database.js.
// =====================================================================

// ------------------------- STATE -------------------------
let allTasks = [];        // raw task rows from Supabase
let allSubtasks = [];     // raw subtask rows from Supabase
let currentView = "all";
let searchTerm = "";
let priorityFilter = "";
let categoryFilter = "";
let sortMode = "newest";
let pendingDeleteId = null;
let editingSubtasksDraft = []; // subtasks currently being built/edited in the modal

const PRIORITY_WEIGHT = { Urgent: 4, High: 3, Medium: 2, Low: 1 };

// ------------------------- DOM SHORTCUTS -------------------------
const $ = (id) => document.getElementById(id);

// ------------------------- INIT -------------------------
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  initTheme();
  bindGlobalEvents();
  loadTasks();
});

// =====================================================================
// THEME (persisted in localStorage — UI preference only, not task data)
// =====================================================================
function initTheme() {
  const saved = localStorage.getItem("flux-theme") || "dark";
  applyTheme(saved);
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  localStorage.setItem("flux-theme", theme);
  $("themeIconMoon").hidden = theme === "dark" ? false : true;
  $("themeIconSun").hidden = theme === "dark" ? true : false;
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "light" ? "dark" : "light");
}

// =====================================================================
// LOAD DATA
// =====================================================================
async function loadTasks() {
  showLoading(true);
  const [{ data: tasks, error: taskErr }, { data: subtasks, error: subErr }] = await Promise.all([
    fetchTasks(),
    fetchSubtasks(),
  ]);
  showLoading(false);

  if (taskErr || subErr) {
    showToast("Couldn't load tasks. Check your connection.", "error");
    return;
  }

  allTasks = tasks || [];
  allSubtasks = subtasks || [];
  populateCategoryFilter();
  render();
}

function showLoading(isLoading) {
  $("loadingState").hidden = !isLoading;
  $("taskList").hidden = isLoading;
  if (isLoading) $("emptyState").hidden = true;
}

// =====================================================================
// DERIVED HELPERS
// =====================================================================
function subtasksFor(taskId) {
  return allSubtasks.filter((s) => s.task_id === taskId);
}

function isOverdue(task) {
  if (!task.due_date || task.completed) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date + "T" + (task.due_time || "23:59:59"));
  return due < new Date();
}

function isDueToday(task) {
  if (!task.due_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return task.due_date === today;
}

function isUpcoming(task) {
  if (!task.due_date || task.completed) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date + "T00:00:00");
  return due > today;
}

// =====================================================================
// FILTER + SORT + VIEW PIPELINE
// =====================================================================
function getVisibleTasks() {
  let list = [...allTasks];

  // View
  switch (currentView) {
    case "today": list = list.filter(isDueToday); break;
    case "upcoming": list = list.filter(isUpcoming); break;
    case "pending": list = list.filter((t) => !t.completed); break;
    case "completed": list = list.filter((t) => t.completed); break;
    case "overdue": list = list.filter(isOverdue); break;
    case "important": list = list.filter((t) => t.important); break;
    case "pinned": list = list.filter((t) => t.pinned); break;
    default: break; // "all"
  }

  // Search
  if (searchTerm.trim()) {
    const q = searchTerm.trim().toLowerCase();
    list = list.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q) ||
      (t.category || "").toLowerCase().includes(q) ||
      (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
  }

  // Filters
  if (priorityFilter) list = list.filter((t) => t.priority === priorityFilter);
  if (categoryFilter) list = list.filter((t) => t.category === categoryFilter);

  // Sort (pinned tasks always float to top, already ordered in fetch, but re-sort within)
  const pinned = list.filter((t) => t.pinned);
  const rest = list.filter((t) => !t.pinned);
  const sorter = getSortFn(sortMode);
  pinned.sort(sorter);
  rest.sort(sorter);

  return [...pinned, ...rest];
}

function getSortFn(mode) {
  switch (mode) {
    case "oldest": return (a, b) => new Date(a.created_at) - new Date(b.created_at);
    case "due_date": return (a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date + "T" + (a.due_time || "00:00")) - new Date(b.due_date + "T" + (b.due_time || "00:00"));
    };
    case "priority": return (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    case "alphabetical": return (a, b) => a.title.localeCompare(b.title);
    case "updated": return (a, b) => new Date(b.updated_at) - new Date(a.updated_at);
    default: return (a, b) => new Date(b.created_at) - new Date(a.created_at); // newest
  }
}

// =====================================================================
// RENDER
// =====================================================================
function render() {
  renderDashboard();
  renderTaskList();
  updateActiveNav();
}

function renderDashboard() {
  const total = allTasks.length;
  const completed = allTasks.filter((t) => t.completed).length;
  const pending = total - completed;
  const dueToday = allTasks.filter(isDueToday).length;
  const overdue = allTasks.filter(isOverdue).length;
  const highPriority = allTasks.filter((t) => !t.completed && (t.priority === "High" || t.priority === "Urgent")).length;

  $("statTotal").textContent = total;
  $("statCompleted").textContent = completed;
  $("statPending").textContent = pending;
  $("statDueToday").textContent = dueToday;
  $("statOverdue").textContent = overdue;
  $("statHighPriority").textContent = highPriority;

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  $("progressLabel").textContent = `${completed} / ${total} tasks completed`;
  $("progressPercent").textContent = `${pct}%`;
  $("progressFill").style.width = `${pct}%`;
}

function renderTaskList() {
  const list = getVisibleTasks();
  const taskListEl = $("taskList");
  const emptyEl = $("emptyState");

  if (list.length === 0) {
    taskListEl.innerHTML = "";
    emptyEl.hidden = false;
    setEmptyStateCopy();
    return;
  }
  emptyEl.hidden = true;

  taskListEl.innerHTML = list.map(renderTaskCard).join("");
  lucide.createIcons();
}

function setEmptyStateCopy() {
  const hasFilters = searchTerm || priorityFilter || categoryFilter;
  let title = "No tasks yet";
  let sub = "Create your first task to get started.";

  if (hasFilters) { title = "No results found"; sub = "Try adjusting your search or filters."; }
  else if (currentView === "completed") { title = "Nothing completed yet"; sub = "Finish a task and it'll show up here."; }
  else if (currentView === "overdue") { title = "No overdue tasks"; sub = "You're all caught up. Nice work."; }
  else if (currentView === "important") { title = "No important tasks"; sub = "Mark a task important to pin it here."; }
  else if (currentView === "pinned") { title = "Nothing pinned"; sub = "Pin a task to keep it at the top."; }
  else if (currentView === "today") { title = "Nothing due today"; sub = "Enjoy the breathing room."; }
  else if (currentView === "upcoming") { title = "No upcoming tasks"; sub = "Your schedule is clear for now."; }
  else if (currentView === "pending" && allTasks.length > 0) { title = "Everything is completed 🎉"; sub = "Every task is checked off."; }

  $("emptyTitle").textContent = title;
  $("emptySubtitle").textContent = sub;
}

function renderTaskCard(task) {
  const subs = subtasksFor(task.id);
  const subsDone = subs.filter((s) => s.completed).length;
  const subsPct = subs.length ? Math.round((subsDone / subs.length) * 100) : 0;
  const overdue = isOverdue(task);

  const dueBadge = task.due_date
    ? `<span class="badge ${overdue ? "badge-overdue" : ""}"><i data-lucide="calendar"></i>${formatDate(task.due_date)}${task.due_time ? " · " + formatTime(task.due_time) : ""}${overdue ? " · Overdue" : ""}</span>`
    : "";

  const tagBadges = (task.tags || [])
    .map((tag) => `<span class="badge badge-tag"><i data-lucide="tag"></i>${escapeHtml(tag)}</span>`)
    .join("");

  const subtaskProgress = subs.length
    ? `<div class="subtask-progress">
         <i data-lucide="list-checks" style="width:13px;height:13px;"></i>
         ${subsDone} / ${subs.length} subtasks
         <div class="mini-track"><div class="mini-fill" style="width:${subsPct}%"></div></div>
       </div>
       <ul class="subtask-list-view">
         ${subs.map((s) => `
           <li class="subtask-row ${s.completed ? "done" : ""}">
             <button type="button" class="${s.completed ? "done" : ""}" data-action="toggle-subtask" data-subtask-id="${s.id}">
               ${s.completed ? '<i data-lucide="check"></i>' : ""}
             </button>
             ${escapeHtml(s.title)}
           </li>`).join("")}
       </ul>`
    : "";

  return `
    <li class="task-card glass priority-${task.priority} ${task.completed ? "is-completed" : ""}" data-task-id="${task.id}">
      <div class="task-top">
        <button class="check-btn ${task.completed ? "is-checked" : ""}" data-action="toggle-complete" aria-label="Mark task ${task.completed ? "incomplete" : "complete"}">
          ${task.completed ? '<i data-lucide="check"></i>' : ""}
        </button>
        <div class="task-main">
          <div class="task-title-row">
            <span class="task-title">${escapeHtml(task.title)}</span>
            ${task.important ? '<i data-lucide="star" class="task-flag important" aria-label="Important"></i>' : ""}
            ${task.pinned ? '<i data-lucide="pin" class="task-flag pinned" aria-label="Pinned"></i>' : ""}
          </div>
          ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ""}
          <div class="task-meta">
            <span class="badge badge-priority-${task.priority}"><i data-lucide="flag"></i>${task.priority}</span>
            <span class="badge"><i data-lucide="folder"></i>${escapeHtml(task.category)}</span>
            ${dueBadge}
            ${tagBadges}
          </div>
          ${subtaskProgress}
        </div>
      </div>
      <div class="task-actions">
        <button class="mini-btn ${task.important ? "is-active-star" : ""}" data-action="toggle-important" aria-label="Toggle important"><i data-lucide="star"></i></button>
        <button class="mini-btn ${task.pinned ? "is-active-pin" : ""}" data-action="toggle-pinned" aria-label="Toggle pinned"><i data-lucide="pin"></i></button>
        <button class="mini-btn" data-action="edit" aria-label="Edit task"><i data-lucide="pencil"></i></button>
        <button class="mini-btn" data-action="duplicate" aria-label="Duplicate task"><i data-lucide="copy"></i></button>
        <button class="mini-btn" data-action="delete" aria-label="Delete task"><i data-lucide="trash-2"></i></button>
      </div>
    </li>
  `;
}

function updateActiveNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === currentView);
  });
}

function populateCategoryFilter() {
  const select = $("categoryFilter");
  const current = select.value;
  const categories = [...new Set(allTasks.map((t) => t.category).filter(Boolean))].sort();
  select.innerHTML = `<option value="">All Categories</option>` +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  select.value = current;
}

// =====================================================================
// UTILITIES
// =====================================================================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatTime(timeStr) {
  const [h, m] = timeStr.split(":");
  const d = new Date(); d.setHours(+h, +m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// =====================================================================
// TOASTS
// =====================================================================
function showToast(message, type = "info") {
  const icons = { success: "check-circle-2", error: "alert-circle", info: "info" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i data-lucide="${icons[type] || "info"}"></i><span>${escapeHtml(message)}</span>`;
  $("toastContainer").appendChild(toast);
  lucide.createIcons();
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// =====================================================================
// TASK MODAL (create / edit)
// =====================================================================
function openTaskModal(task = null) {
  editingSubtasksDraft = task ? subtasksFor(task.id).map((s) => ({ id: s.id, title: s.title, completed: s.completed })) : [];

  $("taskModalTitle").textContent = task ? "Edit Task" : "New Task";
  $("taskId").value = task ? task.id : "";
  $("taskTitle").value = task ? task.title : "";
  $("taskDescription").value = task ? (task.description || "") : "";
  $("taskCategory").value = task ? task.category : "Personal";
  $("taskPriority").value = task ? task.priority : "Medium";
  $("taskDueDate").value = task ? (task.due_date || "") : "";
  $("taskDueTime").value = task ? (task.due_time || "") : "";
  $("taskTags").value = task ? (task.tags || []).join(", ") : "";
  $("taskImportant").checked = task ? task.important : false;
  $("taskPinned").checked = task ? task.pinned : false;
  $("titleError").hidden = true;

  renderSubtaskDraft();
  $("taskModalOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("taskTitle").focus(), 50);
}

function closeTaskModal() {
  $("taskModalOverlay").hidden = true;
  document.body.style.overflow = "";
  $("taskForm").reset();
  editingSubtasksDraft = [];
}

function renderSubtaskDraft() {
  const container = $("subtaskEditList");
  if (editingSubtasksDraft.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = editingSubtasksDraft.map((s, i) => `
    <div class="subtask-edit-row">
      <span>${escapeHtml(s.title)}</span>
      <button type="button" data-remove-draft-index="${i}" aria-label="Remove subtask"><i data-lucide="x"></i></button>
    </div>
  `).join("");
  lucide.createIcons();
}

async function handleTaskFormSubmit(e) {
  e.preventDefault();
  const title = $("taskTitle").value.trim();
  if (!title) {
    $("titleError").hidden = false;
    $("taskTitle").focus();
    return;
  }
  $("titleError").hidden = true;

  const id = $("taskId").value;
  const tags = $("taskTags").value.split(",").map((t) => t.trim()).filter(Boolean);

  const payload = {
    title,
    description: $("taskDescription").value.trim() || null,
    category: $("taskCategory").value,
    priority: $("taskPriority").value,
    due_date: $("taskDueDate").value || null,
    due_time: $("taskDueTime").value || null,
    tags,
    important: $("taskImportant").checked,
    pinned: $("taskPinned").checked,
  };

  $("saveTaskBtn").disabled = true;
  $("saveTaskBtn").textContent = "Saving…";

  try {
    if (id) {
      // ---- EDIT existing task ----
      const { error } = await updateTask(id, payload);
      if (error) throw error;

      // Reconcile subtasks: existing ones already saved individually via toggle/add UI;
      // here we only need to persist any brand-new (no id) drafted subtasks and removals.
      const existingSubIds = subtasksFor(id).map((s) => s.id);
      const draftIds = editingSubtasksDraft.filter((s) => s.id).map((s) => s.id);
      const removed = existingSubIds.filter((sid) => !draftIds.includes(sid));
      for (const rid of removed) await deleteSubtask(rid);

      const newOnes = editingSubtasksDraft.filter((s) => !s.id);
      for (let i = 0; i < newOnes.length; i++) {
        await createSubtask(id, newOnes[i].title, existingSubIds.length + i);
      }

      showToast("Task updated", "success");
    } else {
      // ---- CREATE new task ----
      const subtaskTitles = editingSubtasksDraft.map((s) => s.title);
      const { error } = await createTask(payload, subtaskTitles);
      if (error) throw error;
      showToast("Task created", "success");
    }
    closeTaskModal();
    await loadTasks();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving the task.", "error");
  } finally {
    $("saveTaskBtn").disabled = false;
    $("saveTaskBtn").textContent = "Save Task";
  }
}

// =====================================================================
// DELETE MODAL
// =====================================================================
function openDeleteModal(taskId) {
  pendingDeleteId = taskId;
  $("deleteModalOverlay").hidden = false;
}
function closeDeleteModal() {
  $("deleteModalOverlay").hidden = true;
  pendingDeleteId = null;
}
async function confirmDelete() {
  if (!pendingDeleteId) return;
  const { error } = await deleteTask(pendingDeleteId);
  if (error) {
    showToast("Couldn't delete the task.", "error");
  } else {
    showToast("Task deleted", "success");
    await loadTasks();
  }
  closeDeleteModal();
}

// =====================================================================
// TASK ACTIONS (delegated click handling)
// =====================================================================
async function handleTaskListClick(e) {
  const subtaskBtn = e.target.closest("[data-action='toggle-subtask']");
  if (subtaskBtn) {
    const subId = subtaskBtn.dataset.subtaskId;
    const sub = allSubtasks.find((s) => s.id === subId);
    if (!sub) return;
    const { error } = await updateSubtask(subId, { completed: !sub.completed });
    if (!error) await loadTasks(); else showToast("Couldn't update subtask.", "error");
    return;
  }

  const actionBtn = e.target.closest("[data-action]");
  if (!actionBtn) return;
  const card = e.target.closest(".task-card");
  const taskId = card?.dataset.taskId;
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;

  const action = actionBtn.dataset.action;

  if (action === "toggle-complete") {
    const { error } = await toggleTaskCompletion(taskId, !task.completed);
    if (!error) { showToast(task.completed ? "Marked incomplete" : "Task completed 🎉", "success"); await loadTasks(); }
    else showToast("Couldn't update task.", "error");
  }
  else if (action === "toggle-important") {
    const { error } = await updateTask(taskId, { important: !task.important });
    if (!error) await loadTasks(); else showToast("Couldn't update task.", "error");
  }
  else if (action === "toggle-pinned") {
    const { error } = await updateTask(taskId, { pinned: !task.pinned });
    if (!error) await loadTasks(); else showToast("Couldn't update task.", "error");
  }
  else if (action === "edit") {
    openTaskModal(task);
  }
  else if (action === "duplicate") {
    const dupPayload = {
      title: task.title + " (copy)",
      description: task.description,
      category: task.category,
      priority: task.priority,
      due_date: task.due_date,
      due_time: task.due_time,
      tags: task.tags,
      important: task.important,
      pinned: false,
    };
    const subTitles = subtasksFor(taskId).map((s) => s.title);
    const { error } = await createTask(dupPayload, subTitles);
    if (!error) { showToast("Task duplicated", "success"); await loadTasks(); }
    else showToast("Couldn't duplicate task.", "error");
  }
  else if (action === "delete") {
    openDeleteModal(taskId);
  }
}

// =====================================================================
// EVENT BINDING
// =====================================================================
function bindGlobalEvents() {
  // Theme
  $("themeToggle").addEventListener("click", toggleTheme);

  // Nav / views
  $("navList").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    currentView = btn.dataset.view;
    render();
  });

  // Search (debounced)
  let searchDebounce;
  $("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchTerm = e.target.value;
      $("clearSearchBtn").hidden = !searchTerm;
      renderTaskList();
    }, 180);
  });
  $("clearSearchBtn").addEventListener("click", () => {
    $("searchInput").value = "";
    searchTerm = "";
    $("clearSearchBtn").hidden = true;
    renderTaskList();
  });

  // Priority chips
  $("filterChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    priorityFilter = chip.dataset.filterPriority;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    renderTaskList();
  });

  // Category + sort
  $("categoryFilter").addEventListener("change", (e) => { categoryFilter = e.target.value; renderTaskList(); });
  $("sortSelect").addEventListener("change", (e) => { sortMode = e.target.value; renderTaskList(); });

  // Clear filters
  $("clearFiltersBtn").addEventListener("click", () => {
    priorityFilter = ""; categoryFilter = ""; searchTerm = ""; sortMode = "newest";
    $("searchInput").value = ""; $("clearSearchBtn").hidden = true;
    $("categoryFilter").value = ""; $("sortSelect").value = "newest";
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.filterPriority === ""));
    renderTaskList();
  });

  // Task list delegated actions
  $("taskList").addEventListener("click", handleTaskListClick);

  // FAB + modal open/close
  $("fabAddTask").addEventListener("click", () => openTaskModal());
  $("closeTaskModal").addEventListener("click", closeTaskModal);
  $("cancelTaskModal").addEventListener("click", closeTaskModal);
  $("taskModalOverlay").addEventListener("click", (e) => { if (e.target === $("taskModalOverlay")) closeTaskModal(); });
  $("taskForm").addEventListener("submit", handleTaskFormSubmit);

  // Subtask draft add/remove within modal
  $("addSubtaskBtn").addEventListener("click", addDraftSubtask);
  $("newSubtaskInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addDraftSubtask(); }
  });
  $("subtaskEditList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-draft-index]");
    if (!btn) return;
    const idx = Number(btn.dataset.removeDraftIndex);
    editingSubtasksDraft.splice(idx, 1);
    renderSubtaskDraft();
  });

  // Delete modal
  $("cancelDeleteBtn").addEventListener("click", closeDeleteModal);
  $("confirmDeleteBtn").addEventListener("click", confirmDelete);
  $("deleteModalOverlay").addEventListener("click", (e) => { if (e.target === $("deleteModalOverlay")) closeDeleteModal(); });

  // Escape key closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("taskModalOverlay").hidden) closeTaskModal();
      if (!$("deleteModalOverlay").hidden) closeDeleteModal();
    }
  });
}

function addDraftSubtask() {
  const input = $("newSubtaskInput");
  const title = input.value.trim();
  if (!title) return;
  editingSubtasksDraft.push({ title, completed: false });
  input.value = "";
  renderSubtaskDraft();
}
