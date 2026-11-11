import { addDays, addMonths, diffDays, fromKey, todayKey } from "./dates";
import { PRIORITY_RANK, type Occurrence, type Task } from "./types";

export const ONCE_KEY = "unica";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** A tarefa acontece nesta data? */
export function occursOn(task: Task, key: string): boolean {
  if (!task.date) return false;
  if (task.skipped.includes(key)) return false;
  if (key < task.date) return false;
  if (task.until && key > task.until) return false;
  switch (task.recurrence) {
    case "nenhuma":
      return key === task.date;
    case "diaria":
      return true;
    case "dias-uteis": {
      const wd = fromKey(key).getDay();
      return wd !== 0 && wd !== 6;
    }
    case "semanal":
      return diffDays(task.date, key) % 7 === 0;
    case "mensal": {
      const start = fromKey(task.date);
      const d = fromKey(key);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(start.getDate(), last);
    }
  }
}

export function occurrenceKey(task: Task, date: string | null): string {
  return task.date && date ? date : ONCE_KEY;
}

export function makeOccurrence(task: Task, date: string | null): Occurrence {
  const key = occurrenceKey(task, date);
  const completedAt = task.completions[key] ?? null;
  return { task, key, date: task.date ? date : null, done: completedAt !== null, completedAt };
}

/** Ocorrências de todas as tarefas em uma data */
export function occurrencesOn(tasks: Task[], key: string): Occurrence[] {
  return tasks.filter((t) => occursOn(t, key)).map((t) => makeOccurrence(t, key));
}

/** Ocorrências em um intervalo (inclusivo) */
export function occurrencesBetween(tasks: Task[], start: string, end: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const t of tasks) {
    if (!t.date) continue;
    if (t.recurrence === "nenhuma") {
      if (t.date >= start && t.date <= end && !t.skipped.includes(t.date)) out.push(makeOccurrence(t, t.date));
      continue;
    }
    const from = t.date > start ? t.date : start;
    const to = t.until && t.until < end ? t.until : end;
    for (let k = from; k <= to; k = addDays(k, 1)) if (occursOn(t, k)) out.push(makeOccurrence(t, k));
  }
  return out;
}

/** Próxima ocorrência a partir de uma data (para listas e lembretes) */
export function nextOccurrence(task: Task, fromKeyDate: string): string | null {
  if (!task.date) return null;
  if (task.recurrence === "nenhuma") return task.date >= fromKeyDate ? task.date : null;
  let k = task.date > fromKeyDate ? task.date : fromKeyDate;
  const limit = addMonths(k, 14);
  while (k <= limit) {
    if (task.until && k > task.until) return null;
    if (occursOn(task, k) && !task.completions[k]) return k;
    k = addDays(k, 1);
  }
  return null;
}

/**
 * A ocorrência que representa a tarefa na lista geral:
 * tarefa simples = ela mesma; recorrente = a ocorrência pendente mais antiga até hoje, ou a próxima.
 */
export function representative(task: Task, today = todayKey()): Occurrence {
  if (!task.date) return makeOccurrence(task, null);
  if (task.recurrence === "nenhuma") return makeOccurrence(task, task.date);
  const lookback = addDays(today, -60);
  const start = task.date > lookback ? task.date : lookback;
  for (let k = start; k < today; k = addDays(k, 1)) {
    if (occursOn(task, k) && !task.completions[k]) return makeOccurrence(task, k);
  }
  const next = nextOccurrence(task, today);
  if (next) return makeOccurrence(task, next);
  // série encerrada e toda concluída: mostra a última ocorrência
  const last = task.until ?? today;
  for (let k = last; k >= task.date; k = addDays(k, -1)) if (occursOn(task, k)) return makeOccurrence(task, k);
  return makeOccurrence(task, task.date);
}

export function isOverdue(o: Occurrence, today = todayKey()): boolean {
  return !o.done && !!o.date && o.date < today;
}

export type SortMode = "data" | "prioridade";

export function compareOccurrences(a: Occurrence, b: Occurrence, mode: SortMode): number {
  const byDate = () => {
    const da = a.date ?? "9999-99-99", db = b.date ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.task.time ?? "99:99", tb = b.task.time ?? "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return 0;
  };
  const byPriority = () => PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority];
  const r = mode === "data" ? byDate() || byPriority() : byPriority() || byDate();
  return r || a.task.title.localeCompare(b.task.title, "pt-BR");
}

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Garante que um objeto vindo de backup ou do banco tenha todos os campos válidos */
export function sanitizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.title !== "string" || !r.title.trim()) return null;
  const dateOk = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const now = new Date().toISOString();
  const prio = r.priority === "alta" || r.priority === "media" || r.priority === "baixa" ? r.priority : "media";
  const rec = ["nenhuma", "diaria", "dias-uteis", "semanal", "mensal"].includes(r.recurrence as string)
    ? (r.recurrence as Task["recurrence"])
    : "nenhuma";
  const completions: Record<string, string> = {};
  if (r.completions && typeof r.completions === "object") {
    for (const [k, v] of Object.entries(r.completions as Record<string, unknown>)) if (typeof v === "string") completions[k] = v;
  }
  return {
    id: r.id,
    title: r.title.trim().slice(0, 140),
    description: typeof r.description === "string" ? r.description.slice(0, 2000) : "",
    date: dateOk(r.date) ? (r.date as string) : null,
    time: typeof r.time === "string" && /^\d{2}:\d{2}$/.test(r.time) ? r.time : null,
    priority: prio,
    categoryId: typeof r.categoryId === "string" ? r.categoryId : null,
    recurrence: dateOk(r.date) ? rec : "nenhuma",
    until: dateOk(r.until) ? (r.until as string) : null,
    reminder: typeof r.reminder === "number" && r.reminder >= 0 ? r.reminder : null,
    completions,
    skipped: Array.isArray(r.skipped) ? (r.skipped as unknown[]).filter(dateOk) as string[] : [],
    createdAt: typeof r.createdAt === "string" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : now
  };
}
