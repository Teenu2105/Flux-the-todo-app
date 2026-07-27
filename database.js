// =====================================================================
// DATABASE SERVICE LAYER
// All Supabase queries live here. app.js never talks to Supabase
// directly — it only calls the functions below. Every function
// returns { data, error } so the caller can decide how to react.
// =====================================================================

const TASKS_TABLE = "tasks";
const SUBTASKS_TABLE = "subtasks";

/**
 * Fetch every task (Phase 1 = single personal user, so no filtering by
 * user_id is needed beyond what RLS already enforces). Subtasks are
 * fetched separately and merged in app.js for simpler caching.
 */
async function fetchTasks() {
  try {
    const { data, error } = await supabaseClient
      .from(TASKS_TABLE)
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("fetchTasks failed:", error);
    return { data: null, error };
  }
}

async function fetchSubtasks() {
  try {
    const { data, error } = await supabaseClient
      .from(SUBTASKS_TABLE)
      .select("*")
      .order("position", { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("fetchSubtasks failed:", error);
    return { data: null, error };
  }
}

/**
 * Create a task, then create any subtasks that came with it.
 * @param {object} task - { title, description, category, priority, due_date, due_time, important, pinned, tags }
 * @param {string[]} subtaskTitles
 */
async function createTask(task, subtaskTitles = []) {
  try {
    const { data, error } = await supabaseClient
      .from(TASKS_TABLE)
      .insert([task])
      .select()
      .single();
    if (error) throw error;

    if (subtaskTitles.length > 0) {
      const rows = subtaskTitles.map((title, i) => ({
        task_id: data.id,
        title,
        position: i,
      }));
      const { error: subError } = await supabaseClient.from(SUBTASKS_TABLE).insert(rows);
      if (subError) throw subError;
    }
    return { data, error: null };
  } catch (error) {
    console.error("createTask failed:", error);
    return { data: null, error };
  }
}

async function updateTask(id, updates) {
  try {
    const { data, error } = await supabaseClient
      .from(TASKS_TABLE)
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("updateTask failed:", error);
    return { data: null, error };
  }
}

async function deleteTask(id) {
  try {
    // subtasks are removed automatically via ON DELETE CASCADE
    const { error } = await supabaseClient.from(TASKS_TABLE).delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error("deleteTask failed:", error);
    return { error };
  }
}

async function toggleTaskCompletion(id, completed) {
  return updateTask(id, { completed });
}

async function createSubtask(taskId, title, position = 0) {
  try {
    const { data, error } = await supabaseClient
      .from(SUBTASKS_TABLE)
      .insert([{ task_id: taskId, title, position }])
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("createSubtask failed:", error);
    return { data: null, error };
  }
}

async function updateSubtask(id, updates) {
  try {
    const { data, error } = await supabaseClient
      .from(SUBTASKS_TABLE)
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("updateSubtask failed:", error);
    return { data: null, error };
  }
}

async function deleteSubtask(id) {
  try {
    const { error } = await supabaseClient.from(SUBTASKS_TABLE).delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error("deleteSubtask failed:", error);
    return { error };
  }
}
