import * as SQLite from "expo-sqlite";

let dbPromise;

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("planview.db");
  }
  return dbPromise;
}

export async function initStorage() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY NOT NULL,
      ended_at TEXT NOT NULL,
      record_json TEXT NOT NULL
    );
  `);
}

export async function getActiveSession() {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM kv WHERE key = ?", ["active_session"]);
  return parseJson(row?.value, null);
}

export async function saveActiveSession(session) {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
    "active_session",
    JSON.stringify(session)
  ]);
}

export async function getHistory() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT record_json FROM history ORDER BY ended_at DESC");
  return rows.map((row) => parseJson(row.record_json, null)).filter(Boolean);
}

export async function completeSessionTransaction(record, nextTasks) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const current = await transaction.getFirstAsync("SELECT value FROM kv WHERE key = ?", ["active_session"]);
    if (parseJson(current?.value, null)?.id !== record.sessionId) {
      throw new Error("這輪已儲存或不再是目前的專注。");
    }
    await transaction.runAsync("INSERT INTO history (id, ended_at, record_json) VALUES (?, ?, ?)", [
      record.sessionId,
      record.endedAt,
      JSON.stringify(record)
    ]);
    await transaction.runAsync("DELETE FROM kv WHERE key = ?", ["active_session"]);
    await transaction.runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      "task_pool",
      JSON.stringify(nextTasks)
    ]);
  });
}

export async function getTaskPool() {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM kv WHERE key = ?", ["task_pool"]);
  return parseJson(row?.value, []);
}

export async function saveTaskPool(tasks) {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
    "task_pool",
    JSON.stringify(tasks)
  ]);
}
