export type TodoStatus = "done" | "partial" | "blocked";
export type SessionStatus = "planned" | "active" | "paused" | "expired" | "completed" | "cancelled";

export interface TodoInput {
  id?: string;
  title: string;
  tags?: string[] | string;
  estimateMinutes?: number;
  durationMinutes?: number;
  sortOrder?: number;
}

export interface FocusSession {
  id: string;
  status: SessionStatus;
  startedAt: string;
  endAt: string;
  durationMinutes: number;
  intention: string;
  pausedAt?: string;
  remainingMsAtPause?: number;
  totalPausedMs?: number;
  stoppedAt?: string;
  todos: Array<{
    id: string;
    title: string;
    tags: string[];
    estimateMinutes: number;
    sortOrder: number;
  }>;
}

export interface HistoryRecord {
  sessionId: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string;
  endAt: string;
  durationMinutes: number;
  actualMinutes?: number;
  stoppedAt?: string;
  intention: string;
  outcome: TodoStatus;
  reason: string;
  reflection: string;
  nextAction: string;
  items: Array<{
    todoId: string;
    title: string;
    tags: string[];
    estimateMinutes: number;
    actualMinutes: number;
    status: TodoStatus;
    note: string;
    reason: string;
  }>;
}

export const SESSION_STATUS: Record<string, SessionStatus>;
export const TODO_STATUS: Record<string, TodoStatus>;
export const OUTCOME_REASON: Record<string, string>;

export function normalizeTags(tags: string[] | string): string[];
export function normalizeTodos(todos: TodoInput[]): FocusSession["todos"];
export function clampMinutes(value: number, fallback?: number): number;
export function createSession(payload: { id?: string; durationMinutes: number; todos: TodoInput[]; intention?: string; startedAt?: string }, now?: Date): FocusSession;
export function completeSession(session: FocusSession, payload?: Record<string, unknown>, now?: Date): HistoryRecord;
export function endSession(session: FocusSession, now?: Date): FocusSession;
export function getElapsedMs(session: FocusSession, now?: Date): number;
export function getRemainingMs(session: FocusSession, now?: Date): number;
export function isSessionExpired(session: FocusSession, now?: Date): boolean;
export function pauseSession(session: FocusSession, now?: Date): FocusSession;
export function resumeSession(session: FocusSession, now?: Date): FocusSession;
export function formatRemaining(ms: number): string;
export function aggregateTags(history: HistoryRecord[]): Array<Record<string, number | string>>;
export function buildDailySummary(history: HistoryRecord[], now?: Date): Record<string, number | string>;
export function buildInsights(history: HistoryRecord[]): { tags: Array<Record<string, number | string>>; headline: string };
