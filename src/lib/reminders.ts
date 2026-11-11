/*
 * Lembretes do DUDA, dentro do que o iPhone realmente permite para apps web:
 *
 * - No iOS 16.4 ou superior, notificações web só existem com o DUDA instalado na Tela de Início
 *   e com a permissão concedida pela usuária.
 * - Não existe agendamento local de notificações para apps web (a API "Notification Triggers" não
 *   chegou a nenhum navegador). Notificação com o app fechado exige um servidor de Web Push,
 *   o que tornaria o DUDA dependente de um serviço externo.
 * - Por isso: com o DUDA aberto (ou recém-minimizado e ainda ativo), os lembretes disparam como
 *   notificação de verdade. Para lembretes garantidos com o app fechado, o DUDA exporta a tarefa
 *   para o app Calendário do iPhone (.ics com alarme), que avisa mesmo com tudo fechado.
 */
import { addDays, pad, todayKey } from "./dates";
import { occurrencesBetween } from "./tasks";
import { RECURRENCE_LABEL, type Task } from "./types";

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type NotifState = "indisponivel" | "precisa-instalar" | "negada" | "permitida" | "nao-pedida";

export function notificationState(): NotifState {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return isIos() && !isStandalone() ? "precisa-instalar" : "indisponivel";
  }
  if (Notification.permission === "granted") return "permitida";
  if (Notification.permission === "denied") return "negada";
  return "nao-pedida";
}

export async function askPermission(): Promise<NotifState> {
  if (!("Notification" in window)) return notificationState();
  try {
    await Notification.requestPermission();
  } catch {
    /* Safari antigo usa callback; ignoramos */
  }
  return notificationState();
}

const FIRED_KEY = "duda:lembretes-disparados";

function firedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function markFired(id: string) {
  try {
    const list = [...firedSet(), id].slice(-300);
    localStorage.setItem(FIRED_KEY, JSON.stringify(list));
  } catch {
    /* sem armazenamento: pode repetir, mas não quebra */
  }
}

async function show(title: string, body: string, tag: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
    else new Notification(title, { body, tag, icon: "/icons/icon-192.png" });
  } catch (e) {
    console.warn("DUDA: notificação não exibida", e);
  }
}

function at(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}

/** Agenda os lembretes das próximas 24 horas enquanto o app está aberto. Retorna a função de limpeza. */
export function scheduleReminders(tasks: Task[]): () => void {
  if (notificationState() !== "permitida") return () => {};
  const timers: number[] = [];
  const now = Date.now();
  const today = todayKey();
  const fired = firedSet();
  for (const o of occurrencesBetween(tasks, today, addDays(today, 1))) {
    const t = o.task;
    if (o.done || t.reminder === null || !t.time || !o.date) continue;
    const due = at(o.date, t.time).getTime() - t.reminder * 60000;
    const id = t.id + "@" + o.date + "@" + t.time + "@" + t.reminder;
    if (fired.has(id)) continue;
    const delay = due - now;
    if (delay < -10 * 60000 || delay > 24 * 3600000) continue; // perdido há mais de 10 min, ou distante
    const body = (t.reminder === 0 ? "Agora" : "Em " + t.reminder + " min") + " · " + t.time + (t.description ? " · " + t.description.slice(0, 80) : "");
    timers.push(
      window.setTimeout(() => {
        markFired(id);
        void show(t.title, body, id);
      }, Math.max(0, delay))
    );
  }
  return () => timers.forEach(clearTimeout);
}

/* ---------- Exportação para o Calendário do iPhone (.ics) ---------- */

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(date: string, time: string | null): string {
  const d = date.replace(/-/g, "");
  return time ? d + "T" + time.replace(":", "") + "00" : d;
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

function vevent(t: Task): string[] {
  if (!t.date) return [];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VEVENT", "UID:" + t.id + "@duda", "DTSTAMP:" + stamp, "SUMMARY:" + icsText(t.title)];
  if (t.time) {
    lines.push("DTSTART:" + icsDate(t.date, t.time));
    const [h, m] = t.time.split(":").map(Number);
    const end = h * 60 + m + 30;
    const endDate = end >= 1440 ? addDays(t.date, 1) : t.date;
    lines.push("DTEND:" + icsDate(endDate, pad(Math.floor((end % 1440) / 60)) + ":" + pad(end % 60)));
  } else {
    lines.push("DTSTART;VALUE=DATE:" + icsDate(t.date, null));
    lines.push("DTEND;VALUE=DATE:" + icsDate(addDays(t.date, 1), null));
  }
  if (t.description) lines.push("DESCRIPTION:" + icsText(t.description));
  const until = t.until ? ";UNTIL=" + icsDate(t.until, null) + (t.time ? "T235959" : "") : "";
  const rule: Record<Task["recurrence"], string> = {
    nenhuma: "",
    diaria: "FREQ=DAILY",
    "dias-uteis": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    semanal: "FREQ=WEEKLY",
    mensal: "FREQ=MONTHLY"
  };
  if (rule[t.recurrence]) lines.push("RRULE:" + rule[t.recurrence] + until);
  for (const d of t.skipped) lines.push(t.time ? "EXDATE:" + icsDate(d, t.time) : "EXDATE;VALUE=DATE:" + icsDate(d, null));
  if (t.reminder !== null) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText(t.title), "TRIGGER:-PT" + t.reminder + "M", "END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(tasks: Task[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DUDA//Tarefas//PT-BR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:DUDA"];
  for (const t of tasks) lines.push(...vevent(t));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function recurrenceText(t: Task): string {
  return RECURRENCE_LABEL[t.recurrence];
}
