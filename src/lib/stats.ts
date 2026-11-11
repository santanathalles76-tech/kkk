import { addDays, endOfMonth, rangeKeys, startOfMonth, startOfWeek, todayKey } from "./dates";
import { occurrencesBetween, ONCE_KEY } from "./tasks";
import type { Task } from "./types";

export type Period = "dia" | "semana" | "mes";

export interface DayStat {
  date: string;
  planned: number;
  done: number;
}

export interface PeriodStats {
  start: string;
  end: string;
  planned: number;
  done: number;
  rate: number;
  days: DayStat[];
  /** concluídas sem data (contadas pelo dia em que foram concluídas) */
  undatedDone: number;
  byPriority: Record<"alta" | "media" | "baixa", { planned: number; done: number }>;
}

export function periodRange(period: Period, anchor: string, weekStartsOn: 0 | 1): [string, string] {
  if (period === "dia") return [anchor, anchor];
  if (period === "semana") {
    const s = startOfWeek(anchor, weekStartsOn);
    return [s, addDays(s, 6)];
  }
  return [startOfMonth(anchor), endOfMonth(anchor)];
}

export function computeStats(tasks: Task[], start: string, end: string): PeriodStats {
  const occ = occurrencesBetween(tasks, start, end);
  const days: DayStat[] = rangeKeys(start, end).map((date) => ({ date, planned: 0, done: 0 }));
  const idx = new Map(days.map((d, i) => [d.date, i]));
  const byPriority = { alta: { planned: 0, done: 0 }, media: { planned: 0, done: 0 }, baixa: { planned: 0, done: 0 } };
  let done = 0;
  for (const o of occ) {
    const d = days[idx.get(o.date as string)!];
    d.planned++;
    byPriority[o.task.priority].planned++;
    if (o.done) {
      d.done++;
      done++;
      byPriority[o.task.priority].done++;
    }
  }
  let undatedDone = 0;
  for (const t of tasks) {
    if (t.date) continue;
    const at = t.completions[ONCE_KEY];
    if (!at) continue;
    const k = isoToLocalKey(at);
    if (k >= start && k <= end) undatedDone++;
  }
  const planned = occ.length;
  return { start, end, planned, done, rate: planned ? Math.round((done / planned) * 100) : 0, days, undatedDone, byPriority };
}

export function isoToLocalKey(iso: string): string {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Dias seguidos (até hoje) em que todas as tarefas planejadas foram concluídas, ignorando dias sem tarefas */
export function streak(tasks: Task[]): number {
  const today = todayKey();
  const start = addDays(today, -365);
  const s = computeStats(tasks, start, today);
  let n = 0;
  for (let i = s.days.length - 1; i >= 0; i--) {
    const d = s.days[i];
    if (d.planned === 0) continue;
    if (d.done === d.planned) n++;
    else if (d.date === today) continue; // hoje ainda não acabou
    else break;
  }
  return n;
}

/** Histórico: taxa de conclusão de cada uma das últimas N semanas */
export function weeklyHistory(tasks: Task[], weeks: number, weekStartsOn: 0 | 1) {
  const cur = startOfWeek(todayKey(), weekStartsOn);
  const out: { start: string; planned: number; done: number; rate: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const s = addDays(cur, -7 * i);
    const st = computeStats(tasks, s, addDays(s, 6));
    out.push({ start: s, planned: st.planned, done: st.done, rate: st.rate });
  }
  return out;
}
