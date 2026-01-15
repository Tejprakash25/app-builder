// app.js – Core logic for ColorfulTodo
// ------------------------------------------------------------
// Todo model definition
// ------------------------------------------------------------
/**
 * Represents a single todo item.
 * @typedef {Object} Todo
 * @property {string} id        - Unique identifier (UUID).
 * @property {string} title     - Short title.
 * @property {string} description - Optional longer description.
 * @property {boolean} completed - Completion flag.
 * @property {number} order     - Position order used for sorting.
 */

/** Generate a UUID – uses crypto.randomUUID when available. */
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback – simple random string (not RFC‑4122 compliant but sufficient).
  return "xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ------------------------------------------------------------
// In‑memory store & persistence
// ------------------------------------------------------------
/** @type {Todo[]} */
let todos = [];

/** Load todos from localStorage, parse them and sort by order. */
function loadTodos() {
  const raw = localStorage.getItem("todos");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Ensure each item has the expected shape – fallback defaults if missing.
      todos = parsed.map((t) => ({
        id: t.id ?? generateId(),
        title: t.title ?? "",
        description: t.description ?? "",
        completed: !!t.completed,
        order: typeof t.order === "number" ? t.order : 0,
      }));
    } catch (e) {
      console.error("Failed to parse stored todos:", e);
      todos = [];
    }
  } else {
    todos = [];
  }
  // Sort by order (ascending). If order values collide, fallback to insertion order.
  todos.sort((a, b) => a.order - b.order);
}

/** Persist the current todos array into localStorage. */
function saveTodos() {
  localStorage.setItem("todos", JSON.stringify(todos));
}

// ------------------------------------------------------------
// Rendering pipeline
// ------------------------------------------------------------
/** Current filter – "all", "active" or "completed". */
let currentFilter = "all";

/**
 * Render the todo list according to the supplied filter.
 * @param {string} [filter=currentFilter] - Filter mode.
 */
function renderTodos(filter = currentFilter) {
  const listEl = document.getElementById("todo-list");
  if (!listEl) return;
  // Clear existing items.
  listEl.innerHTML = "";

  const template = document.getElementById("todo-item-template");
  if (!template) {
    console.error("Todo item template not found");
    return;
  }

  // Apply filter.
  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true; // "all"
  });

  filtered.forEach((todo) => {
    const clone = template.content.firstElementChild.cloneNode(true);
    // Set data-id for later reference.
    clone.dataset.id = todo.id;

    // Populate fields.
    const titleEl = clone.querySelector(".todo-title");
    if (titleEl) titleEl.textContent = todo.title;
    const descEl = clone.querySelector(".todo-desc");
    if (descEl) descEl.textContent = todo.description;

    // Checkbox handling.
    const checkbox = clone.querySelector(".todo-checkbox");
    if (checkbox) {
      checkbox.checked = todo.completed;
      checkbox.addEventListener("change", () => toggleComplete(todo.id));
    }

    // Completed visual state.
    if (todo.completed) clone.classList.add("completed");

    // Edit button.
    const editBtn = clone.querySelector(".edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        const newTitle = prompt("Edit title", todo.title) ?? todo.title;
        const newDesc = prompt("Edit description", todo.description) ?? todo.description;
        editTodo(todo.id, newTitle, newDesc);
      });
    }

    // Delete button.
    const delBtn = clone.querySelector(".delete-btn");
    if (delBtn) {
      delBtn.addEventListener("click", () => deleteTodo(todo.id));
    }

    // Drag‑and‑drop listeners.
    clone.addEventListener("dragstart", onDragStart);
    clone.addEventListener("dragover", onDragOver);
    clone.addEventListener("drop", onDrop);
    clone.addEventListener("dragend", onDragEnd);

    listEl.appendChild(clone);
  });
}

// ------------------------------------------------------------
// CRUD operations
// ------------------------------------------------------------
/** Add a new todo to the list. */
function addTodo(title, description = "") {
  const newTodo = {
    id: generateId(),
    title: title.trim(),
    description: description.trim(),
    completed: false,
    order: todos.length ? Math.max(...todos.map((t) => t.order)) + 1 : 0,
  };
  todos.push(newTodo);
  saveTodos();
  renderTodos();
}

/** Edit an existing todo identified by id. */
function editTodo(id, newTitle, newDesc) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  todo.title = newTitle.trim();
  todo.description = newDesc.trim();
  saveTodos();
  renderTodos();
}

/** Toggle the completed flag of a todo. */
function toggleComplete(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  todo.completed = !todo.completed;
  saveTodos();
  renderTodos();
}

/** Delete a todo from the list. */
function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  // Re‑assign order to keep a clean sequence.
  todos.forEach((t, idx) => (t.order = idx));
  saveTodos();
  renderTodos();
}

// ------------------------------------------------------------
// Filtering helpers
// ------------------------------------------------------------
function setFilter(filter) {
  currentFilter = filter;
  // Update UI – mark the active button.
  const buttons = document.querySelectorAll("#filter-bar button");
  buttons.forEach((btn) => {
    const isActive = btn.dataset.filter === filter;
    btn.setAttribute("aria-pressed", isActive);
    btn.classList.toggle("active", isActive);
  });
  renderTodos();
}

// ------------------------------------------------------------
// Drag‑and‑drop implementation
// ------------------------------------------------------------
let draggedId = null;

function onDragStart(event) {
  const li = event.currentTarget;
  draggedId = li.dataset.id;
  // Transfer plain text data – required for Firefox.
  event.dataTransfer.setData("text/plain", draggedId);
  event.dataTransfer.effectAllowed = "move";
  li.classList.add("dragging");
}

function onDragOver(event) {
  event.preventDefault(); // Necessary to allow drop.
  const li = event.currentTarget;
  li.classList.add("drag-over");
  event.dataTransfer.dropEffect = "move";
}

function onDrop(event) {
  event.preventDefault();
  const targetLi = event.currentTarget;
  targetLi.classList.remove("drag-over");
  const targetId = targetLi.dataset.id;
  if (!draggedId || draggedId === targetId) return;

  // Locate indices.
  const fromIdx = todos.findIndex((t) => t.id === draggedId);
  const toIdx = todos.findIndex((t) => t.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return;

  // Remove the dragged item.
  const [moved] = todos.splice(fromIdx, 1);
  // Insert before the target index (if dragging downwards, adjust index after removal).
  const insertIdx = fromIdx < toIdx ? toIdx : toIdx;
  todos.splice(insertIdx, 0, moved);

  // Re‑assign order based on new positions.
  todos.forEach((t, i) => (t.order = i));
  saveTodos();
  renderTodos();
}

function onDragEnd(event) {
  const li = event.currentTarget;
  li.classList.remove("dragging", "drag-over");
  draggedId = null;
}

// ------------------------------------------------------------
// Initialization & event binding
// ------------------------------------------------------------
function init() {
  loadTodos();
  renderTodos();

  // Bind add‑todo button.
  const addBtn = document.getElementById("add-todo-btn");
  const input = document.getElementById("new-todo");
  if (addBtn && input) {
    addBtn.addEventListener("click", () => {
      const title = input.value.trim();
      if (title) {
        addTodo(title);
        input.value = "";
      }
    });
    // Also allow Enter key in the input.
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addBtn.click();
      }
    });
  }

  // Filter buttons.
  const filterBar = document.getElementById("filter-bar");
  if (filterBar) {
    filterBar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      setFilter(btn.dataset.filter);
    });
  }
}

document.addEventListener("DOMContentLoaded", init);

// ------------------------------------------------------------
// Export helpers for external testing (attached to window)
// ------------------------------------------------------------
window.todoApp = {
  addTodo,
  editTodo,
  toggleComplete,
  deleteTodo,
  setFilter,
  loadTodos,
  saveTodos,
  renderTodos,
  getTodos: () => todos,
};
